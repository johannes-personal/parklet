import "server-only";
import type Stripe from "stripe";
import { api, must, names, toDb } from "@/db/api";
import { hostAccounts, users, type HostAccount, type PayoutStatus } from "@/db/schema";
import { notifyAccount } from "./notifications";
import { returnBase } from "./request-origin";
import { getStripe } from "./stripe";

/**
 * Payouts to hosts through Stripe Connect: each host account gets an Express
 * connected account. Stripe hosts the onboarding (identity, bank account, AML
 * checks) and the hosts' own dashboard, and is the one that decides when the
 * account can be paid: `payout_status` is only `active` while Stripe reports both
 * charges and payouts enabled. The status follows `account.updated` webhooks and is
 * also checked again when the host comes back from Stripe and when the dashboard
 * shows a pending account, so a missed webhook only delays it.
 *
 * Only the account's owner connects payouts (the account's money goes to them, or to
 * the organisation they represent).
 */

const A = names(hostAccounts);

/** What Stripe's account object means for Parklet. */
export function payoutStatusOf(account: Pick<Stripe.Account, "charges_enabled" | "payouts_enabled" | "details_submitted" | "requirements">): PayoutStatus {
  if (account.charges_enabled && account.payouts_enabled) return "active";
  if (!account.details_submitted) return "onboarding";
  const req = account.requirements;
  const due = [...(req?.currently_due ?? []), ...(req?.past_due ?? [])];
  // Stripe is still verifying what was sent in; anything else needs the host.
  const verifying = !req?.disabled_reason || req.disabled_reason === "requirements.pending_verification" || req.disabled_reason === "under_review";
  return due.length === 0 && verifying ? "pending" : "restricted";
}

/** A real connected account (the mock and the seed use "acct_mock_…"). */
export const isStripeAccountRef = (ref: string | null): ref is string => !!ref && ref.startsWith("acct_") && !ref.startsWith("acct_mock_");

const BUSINESS_TYPE: Record<HostAccount["kind"], Stripe.AccountCreateParams.BusinessType> = {
  household: "individual",
  // A BRF is an economic association without owners, run by its board: Stripe's
  // non-profit asks for exactly that (directors, no beneficial owners). The board can
  // change it in Stripe's onboarding.
  association: "non_profit",
  company: "company",
};

async function createConnectedAccount(account: HostAccount, owner: { id: string; email: string }): Promise<string> {
  const U = names(users);
  const person = must<{ name: string; identityName: string | null } | null>(
    await api().from("users").select(`name,identityName:${U.identityName}`).eq(U.id, owner.id).maybeSingle(),
    "createConnectedAccount",
  );
  const created = await getStripe().accounts.create(
    // The name as BankID states it, when known.
    connectedAccountParams(account, owner.email, person?.identityName || person?.name || ""),
    // Two quick clicks create one account.
    { idempotencyKey: `connect-account:${account.id}` },
  );
  return created.id;
}

/** A host account's Express account: Swedish, in SEK, prefilled with what Parklet knows. */
export function connectedAccountParams(account: Pick<HostAccount, "id" | "kind" | "name" | "orgNumber">, email: string, personName: string): Stripe.AccountCreateParams {
  const [firstName, ...rest] = personName.trim().split(/\s+/);
  return {
    country: "SE",
    default_currency: "sek",
    email,
    // Express: Stripe collects the details and gives the host its Express dashboard;
    // Parklet pays Stripe's fees and carries losses (refunds, disputes) on its charges.
    controller: {
      stripe_dashboard: { type: "express" },
      fees: { payer: "application" },
      losses: { payments: "application" },
      requirement_collection: "stripe",
    },
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    business_type: BUSINESS_TYPE[account.kind],
    business_profile: {
      // 7523: parking lots and garages.
      mcc: "7523",
      product_description: "Uthyrning av parkeringsplats via Parklet",
    },
    ...(account.kind === "household"
      ? { individual: { email, first_name: firstName || undefined, last_name: rest.join(" ") || undefined } }
      : { company: { name: account.name, ...(account.orgNumber ? { tax_id: account.orgNumber.replace(/\D/g, "") } : {}) } }),
    metadata: { host_account_id: account.id },
  };
}

/**
 * The owner's "Koppla utbetalningskonto": a Stripe onboarding link, creating the
 * connected account the first time. Stripe sends the owner back to
 * /uthyrare/<id>/utbetalningar/klar, or to …/ny-lank if the link has expired.
 */
export async function startPayoutOnboarding(account: HostAccount, owner: { id: string; email: string }): Promise<string> {
  let ref = isStripeAccountRef(account.payoutAccountRef) ? account.payoutAccountRef : null;
  if (!ref) {
    ref = await createConnectedAccount(account, owner);
    must(
      await api()
        .from("host_accounts")
        .update(toDb(hostAccounts, { payoutAccountRef: ref, payoutStatus: "onboarding" }))
        .eq(A.id, account.id),
      "startPayoutOnboarding",
    );
  }
  const base = `${await returnBase()}/uthyrare/${account.id}/utbetalningar`;
  const link = await getStripe().accountLinks.create({
    account: ref,
    type: "account_onboarding",
    // Everything Stripe will eventually ask for, so the host isn't asked again later.
    collection_options: { fields: "eventually_due" },
    return_url: `${base}/klar`,
    refresh_url: `${base}/ny-lank`,
  });
  return link.url;
}

/**
 * Brings a host account's payout status in line with its Stripe account and tells
 * the members when that changes something for them. Takes the account from Stripe
 * rather than from a webhook's payload, so events arriving out of order don't matter.
 */
export async function syncPayoutAccount(stripeAccountId: string): Promise<PayoutStatus | null> {
  const previous = must<{ id: string; status: PayoutStatus }[]>(
    await api().from("host_accounts").select(`id,status:${A.payoutStatus}`).eq(A.payoutAccountRef, stripeAccountId),
    "syncPayoutAccount",
  );
  // Not one of Parklet's (or no longer): nothing to do.
  if (previous.length === 0) return null;
  const status = payoutStatusOf(await getStripe().accounts.retrieve(stripeAccountId));
  const changed = must<{ id: string }[]>(
    await api()
      .from("host_accounts")
      .update(toDb(hostAccounts, { payoutStatus: status }))
      .eq(A.payoutAccountRef, stripeAccountId)
      .neq(A.payoutStatus, status)
      .select("id"),
    "syncPayoutAccount",
  );
  for (const { id } of changed) {
    const before = previous.find((p) => p.id === id)?.status;
    if (status === "active" && before !== "active") {
      await notifyAccount(id, {
        kind: "payouts_active",
        title: "Utbetalningskontot är kopplat",
        body: "Stripe har godkänt uppgifterna. Intäkterna från dina bokningar betalas nu ut till ditt bankkonto.",
        href: `/uthyrare/${id}`,
      });
    } else if (status === "restricted" && before !== "restricted") {
      await notifyAccount(id, {
        kind: "payouts_restricted",
        title: "Stripe behöver fler uppgifter för utbetalningar",
        body:
          before === "active"
            ? "Stripe behöver fler uppgifter innan nya bokningar kan betalas ut. Dina parkeringsplatser kan inte bokas förrän uppgifterna är kompletterade."
            : "Stripe behöver fler uppgifter innan utbetalningskontot kan kopplas. Komplettera dem hos Stripe via uthyrarsidan.",
        href: `/uthyrare/${id}`,
        cta: "Komplettera uppgifterna",
      });
    }
  }
  return status;
}

/**
 * A payout account left over from the mock ("acct_mock_…": demo data seeded before
 * PAYMENT_PROVIDER became stripe) can't be paid through Stripe. Under Stripe it is
 * disconnected, so its spots leave search and the owner is asked to connect payouts,
 * instead of every checkout failing on Stripe's "No such destination".
 */
export async function dropMockPayoutAccount(accountId: string): Promise<void> {
  must(
    await api()
      .from("host_accounts")
      .update(toDb(hostAccounts, { payoutStatus: "not_connected", payoutAccountRef: null }))
      .eq(A.id, accountId)
      .like(A.payoutAccountRef, "acct_mock_%"),
    "dropMockPayoutAccount",
  );
}

const isMockAccountRef = (ref: string | null) => !!ref && ref.startsWith("acct_mock_");

/** Re-checks an account Stripe hasn't finished with. Never throws: the page shows the last known status. */
export async function refreshPendingPayouts(account: HostAccount): Promise<PayoutStatus> {
  if (isMockAccountRef(account.payoutAccountRef) && process.env.PAYMENT_PROVIDER === "stripe") {
    try {
      await dropMockPayoutAccount(account.id);
      return "not_connected";
    } catch (err) {
      console.warn("[payouts] could not disconnect the mock payout account", account.id, err instanceof Error ? err.message : err);
      return account.payoutStatus;
    }
  }
  if (!isStripeAccountRef(account.payoutAccountRef) || account.payoutStatus === "active" || account.payoutStatus === "not_connected") return account.payoutStatus;
  try {
    return (await syncPayoutAccount(account.payoutAccountRef)) ?? account.payoutStatus;
  } catch (err) {
    console.warn("[payouts] could not check the Stripe account", account.payoutAccountRef, err instanceof Error ? err.message : err);
    return account.payoutStatus;
  }
}

/** A one-time link into the host's Stripe Express dashboard (payouts, bank account). */
export async function payoutDashboardUrl(account: HostAccount): Promise<string | null> {
  if (!isStripeAccountRef(account.payoutAccountRef)) return null;
  return (await getStripe().accounts.createLoginLink(account.payoutAccountRef)).url;
}
