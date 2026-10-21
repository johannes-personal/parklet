import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, db } from "./direct-db";
import { hostAccounts, users } from "@/db/schema";
import { appUrl } from "@/lib/app-url";
import { createHostAccount, getAccountForMember } from "@/server/host-accounts";
import { hostTodos } from "@/server/notifications";
import { payoutDashboardUrl, payoutStatusOf, refreshPendingPayouts, startPayoutOnboarding, syncPayoutAccount } from "@/server/payouts";
import { makeUser, notificationsOf, resetDb } from "./helpers";
import { deliver, withFakeStripe } from "./stripe-helpers";

const stripe = withFakeStripe();
beforeEach(resetDb);
afterAll(async () => {
  await closeDb();
});

/* eslint-disable @typescript-eslint/no-explicit-any -- the fake's state is untyped JavaScript */
const state = () => stripe.fake.state as any;
const accountRow = async (id: string) => (await db.select().from(hostAccounts).where(eq(hostAccounts.id, id)))[0];

async function owner(kind: "household" | "association" | "company" = "household") {
  const user = await makeUser("Lisa Lindgren");
  await db.update(users).set({ identityName: "Lisa Maria Lindgren" }).where(eq(users.id, user.id));
  const accountId = await createHostAccount({
    userId: user.id,
    kind,
    name: kind === "household" ? user.name : "Brf Testgården",
    orgNumber: kind === "household" ? null : "769600-1234",
    signatoryRole: kind === "household" ? null : "Ordförande",
    identityVerified: true,
  });
  const account = (await getAccountForMember(accountId, user.id))!;
  return { user, account };
}

describe("payout status from Stripe's account", () => {
  const base = { charges_enabled: false, payouts_enabled: false, details_submitted: false, requirements: null };
  const req = (over: object) => ({ currently_due: [], eventually_due: [], past_due: [], disabled_reason: null, ...over }) as any;
  it.each([
    ["not submitted", base, "onboarding"],
    ["submitted, being verified", { ...base, details_submitted: true, requirements: req({ disabled_reason: "requirements.pending_verification" }) }, "pending"],
    ["submitted, under review", { ...base, details_submitted: true, requirements: req({ disabled_reason: "under_review" }) }, "pending"],
    ["submitted, more needed", { ...base, details_submitted: true, requirements: req({ currently_due: ["external_account"] }) }, "restricted"],
    ["overdue", { ...base, details_submitted: true, requirements: req({ past_due: ["individual.id_number"], disabled_reason: "requirements.past_due" }) }, "restricted"],
    ["rejected", { ...base, details_submitted: true, requirements: req({ disabled_reason: "rejected.fraud" }) }, "restricted"],
    ["charges but no payouts", { ...base, details_submitted: true, charges_enabled: true, requirements: req({}) }, "pending"],
    ["charges and payouts", { ...base, details_submitted: true, charges_enabled: true, payouts_enabled: true, requirements: req({ eventually_due: ["x"] }) }, "active"],
  ])("%s", (_name, account, expected) => {
    expect(payoutStatusOf(account as any)).toBe(expected);
  });
});

describe("connecting payouts", () => {
  it("creates an Express account for a household with what Parklet knows, and links to Stripe's onboarding", async () => {
    const { user, account } = await owner();
    const url = await startPayoutOnboarding(account, user);
    const row = await accountRow(account.id);
    expect(row.payoutStatus).toBe("onboarding");
    const created = state().accounts[row.payoutAccountRef!];
    expect(created).toMatchObject({
      country: "SE",
      default_currency: "sek",
      email: user.email,
      business_type: "individual",
      individual: { first_name: "Lisa", last_name: "Maria Lindgren", email: user.email },
      controller: { stripe_dashboard: { type: "express" }, fees: { payer: "application" }, losses: { payments: "application" } },
      metadata: { host_account_id: account.id },
    });
    expect(Object.keys(created.capabilities).sort()).toEqual(["card_payments", "transfers"]);
    const link = Object.values(state().links as Record<string, any>).at(-1);
    expect(url).toMatch(/\/connect\/onboarding\//);
    expect(link).toMatchObject({
      account: row.payoutAccountRef,
      return_url: `${appUrl()}/uthyrare/${account.id}/utbetalningar/klar`,
      refresh_url: `${appUrl()}/uthyrare/${account.id}/utbetalningar/ny-lank`,
      collection_options: { fields: "eventually_due" },
    });

    // Leaving and starting again continues with the same Stripe account.
    await startPayoutOnboarding((await getAccountForMember(account.id, user.id))!, user);
    expect(Object.keys(state().accounts).filter((id) => state().accounts[id].metadata.host_account_id === account.id)).toHaveLength(1);
  });

  it.each([
    ["association", "non_profit"],
    ["company", "company"],
  ] as const)("creates a %s's account as %s with its name and org number", async (kind, businessType) => {
    const { user, account } = await owner(kind);
    await startPayoutOnboarding(account, user);
    const created = state().accounts[(await accountRow(account.id)).payoutAccountRef!];
    expect(created).toMatchObject({ business_type: businessType, company: { name: "Brf Testgården", tax_id_provided: true } });
    expect(state().requests.find((r: any) => r.path === "/v1/accounts" && r.body.metadata?.host_account_id === account.id).body.company.tax_id).toBe("7696001234");
  });

  it("becomes active only when Stripe enables charges and payouts, following account.updated", async () => {
    const { user, account } = await owner();
    await startPayoutOnboarding(account, user);
    const ref = (await accountRow(account.id)).payoutAccountRef!;
    const update = async (outcome: string) => {
      await stripe.control(`accounts/${ref}/${outcome}`);
      const event = stripe.lastEvent("account.updated");
      expect(event.account).toBe(ref);
      expect((await deliver(event)).status).toBe(200);
      return (await accountRow(account.id)).payoutStatus;
    };
    expect(await update("pending")).toBe("pending");
    expect(await notificationsOf(user.id)).toEqual([]);
    expect(await update("restricted")).toBe("restricted");
    expect((await notificationsOf(user.id)).map((n) => n.kind)).toEqual(["payouts_restricted"]);
    expect(await update("active")).toBe("active");
    expect((await notificationsOf(user.id)).map((n) => n.kind)).toEqual(["payouts_restricted", "payouts_active"]);
    // Stripe takes the payouts away again: spots stop being bookable.
    expect(await update("restricted")).toBe("restricted");
    expect((await notificationsOf(user.id)).at(-1)?.body).toContain("Dina platser kan inte bokas");
  });

  it("asks the owner for something in the bell only when there is something to do", async () => {
    const { user, account } = await owner();
    const me = { id: user.id, name: user.name, email: user.email, isAdmin: false, identityVerified: true };
    const payoutTodos = async () => (await hostTodos(me)).filter((t) => t.key.startsWith("payout:")).map((t) => t.title);
    expect(await payoutTodos()).toEqual(["Koppla utbetalningskonto"]);
    await startPayoutOnboarding(account, user);
    expect(await payoutTodos()).toEqual(["Koppla utbetalningskonto"]);
    const ref = (await accountRow(account.id)).payoutAccountRef!;
    await stripe.control(`accounts/${ref}/pending`);
    await syncPayoutAccount(ref);
    expect(await payoutTodos()).toEqual([]);
    await stripe.control(`accounts/${ref}/restricted`);
    await syncPayoutAccount(ref);
    expect(await payoutTodos()).toEqual(["Komplettera uppgifterna för utbetalningar"]);
  });

  it("goes by Stripe's current account, not the event, so a late event can't undo a newer state", async () => {
    const { user, account } = await owner();
    await startPayoutOnboarding(account, user);
    const ref = (await accountRow(account.id)).payoutAccountRef!;
    await stripe.control(`accounts/${ref}/pending`);
    const stale = stripe.lastEvent("account.updated");
    await stripe.control(`accounts/${ref}/active`);
    await deliver(stripe.lastEvent("account.updated"));
    await deliver(stale);
    expect((await accountRow(account.id)).payoutStatus).toBe("active");
  });

  it("is checked again on return and on the dashboard, so a missed webhook only delays it", async () => {
    const { user, account } = await owner();
    await startPayoutOnboarding(account, user);
    const ref = (await accountRow(account.id)).payoutAccountRef!;
    await stripe.control(`accounts/${ref}/pending`);
    expect(await syncPayoutAccount(ref)).toBe("pending");
    await stripe.control(`accounts/${ref}/active`);
    // No webhook delivered: the dashboard looks again while it's pending.
    expect(await refreshPendingPayouts(await accountRow(account.id))).toBe("active");
    expect((await accountRow(account.id)).payoutStatus).toBe("active");
  });

  it("gives the owner a link to the Express dashboard, but not for a mock account", async () => {
    const { user, account } = await owner();
    expect(await payoutDashboardUrl({ ...account, payoutAccountRef: "acct_mock_seed" })).toBeNull();
    await startPayoutOnboarding(account, user);
    expect(await payoutDashboardUrl(await accountRow(account.id))).toMatch(/\/express\/acct_/);
  });

  it("ignores account.updated for accounts Parklet doesn't know", async () => {
    const event = { id: "evt_other_account", type: "account.updated", account: "acct_unknown", data: { object: { id: "acct_unknown" } } };
    expect((await deliver(event)).status).toBe(200);
    expect(state().requests.filter((r: any) => r.path === "/v1/accounts/acct_unknown")).toEqual([]);
  });
});
