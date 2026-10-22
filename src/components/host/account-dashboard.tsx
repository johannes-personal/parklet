import Link from "next/link";
import { connectPayoutsAction, payoutDashboardAction } from "@/app/uthyrare/actions";
import { DeleteForm } from "@/components/host/admin-forms";
import { DocumentUploader, SubmitAccountForm } from "@/components/host/forms";
import { HostTabs } from "@/components/host/host-tabs";
import type { CurrentUser } from "@/lib/auth/session";
import { ACCOUNT_DOC_OPTIONS, DOCUMENT_KIND_LABEL } from "@/lib/labels";
import { formatSek } from "@/lib/money";
import { listAccountBookings } from "@/server/bookings";
import { type AccountWithRole, HOST_KIND_LABEL, listAccountDocuments } from "@/server/host-accounts";
import { paymentProviderName } from "@/server/payments";
import { isStripeAccountRef, refreshPendingPayouts } from "@/server/payouts";
import { listAccountSpots } from "@/server/spots";

/** What the dashboard says after the owner comes back from Stripe (?utbetalning=<status>). */
const PAYOUT_NOTICE: Record<string, { ok: boolean; text: string }> = {
  active: { ok: true, text: "Utbetalningskontot är kopplat." },
  pending: { ok: true, text: "Tack! Stripe kontrollerar uppgifterna. Det brukar gå på några minuter, ibland ett par bankdagar. Vi meddelar dig när kontot är klart." },
  onboarding: { ok: false, text: "Registreringen hos Stripe är inte klar. Fortsätt där du slutade när du vill." },
  restricted: { ok: false, text: "Stripe behöver fler uppgifter innan utbetalningar kan kopplas." },
  fel: { ok: false, text: "Vi kunde inte nå Stripe just nu. Försök igen om en stund." },
};

function Tile({ href, label, value, detail, warn = false }: { href: string; label: string; value: number; detail: string; warn?: boolean }) {
  return (
    <Link href={href} className={`card block p-4 hover:shadow-md ${warn ? "border-warn/40" : ""}`}>
      <span className="block text-sm text-muted">{label}</span>
      <span className={`block text-3xl font-bold ${warn ? "text-warn" : ""}`}>{value}</span>
      <span className="block text-sm text-ink-soft">{detail}</span>
    </Link>
  );
}

function Step({ done, title, children }: { done: boolean; title: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3 py-4">
      <span
        aria-hidden
        className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${done ? "bg-ok text-white" : "border-2 border-line"}`}
      >
        {done ? "✓" : ""}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {title}
          <span className="sr-only">{done ? " (klart)" : " (ej klart)"}</span>
        </p>
        {children ? <div className="mt-2 text-sm text-ink-soft">{children}</div> : null}
      </div>
    </li>
  );
}

/**
 * A host account's dashboard: what's left before it can take bookings, its spots,
 * bookings and administrators. Shown at /uthyrare/<id>, and at /uthyrare itself for
 * someone with a single account (rendered there rather than redirected to, so a
 * cached redirect can't send the next user who signs in on the device to it).
 */
export async function AccountDashboard({
  user,
  account: loaded,
  payoutNotice,
  tabs = false,
}: {
  user: CurrentUser;
  account: AccountWithRole;
  payoutNotice?: string;
  /** On /uthyrare, outside the account's own pages (whose layout has the tabs). */
  tabs?: boolean;
}) {
  // Stripe may have finished verifying since the last webhook: look again while it's pending.
  const account = { ...loaded, payoutStatus: await refreshPendingPayouts(loaded) };
  const accountId = account.id;
  const notice = payoutNotice ? PAYOUT_NOTICE[payoutNotice] : undefined;
  const viaStripe = paymentProviderName() === "stripe";
  const owner = account.role === "owner";
  const isOrg = account.kind !== "household";
  const [spots, bookings, docs] = await Promise.all([
    listAccountSpots(accountId),
    listAccountBookings(accountId),
    isOrg ? listAccountDocuments(accountId) : Promise.resolve([]),
  ]);
  const now = new Date();
  const upcoming = bookings.filter((b) => b.status === "confirmed" && b.endsAt > now);
  const regTasks = upcoming.filter((b) => b.vehicleRegistration === "pending");
  const toReview =
    regTasks.length + spots.filter((s) => s.review === "rejected" || (s.review === "draft" && s.landlordApproval !== "requested" && s.landlordApproval !== "declined")).length;
  const verified = account.verificationStatus === "verified";
  const payouts = account.payoutStatus === "active";
  const anyApproved = spots.some((s) => s.review === "approved");
  const ready = verified && payouts && anyApproved;
  // A household whose approval was removed identifies again to be reviewed again.
  const identified = user.identityVerified && !(account.kind === "household" && account.verificationStatus === "rejected");
  // Why an approved spot still can't be booked.
  const blocked = !verified ? "kontot är inte godkänt" : !payouts ? "utbetalningskonto saknas" : null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8">
      {tabs ? <HostTabs accountId={accountId} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{HOST_KIND_LABEL[account.kind]}</p>
          <h1 className="text-2xl font-bold">{account.name}</h1>
          {account.orgNumber ? <p className="text-sm text-muted">Org.nr {account.orgNumber}</p> : null}
        </div>
        <Link href={`/uthyrare/${accountId}/platser/ny`} className="btn-primary">
          Lägg upp {isOrg ? "parkeringsplatser" : "en parkeringsplats"}
        </Link>
      </div>

      {notice ? (
        <p
          role="status"
          className={`rounded-xl border px-4 py-3 font-medium ${notice.ok ? "border-ok/20 bg-ok-soft text-ok" : "border-warn/40 bg-warn-soft text-warn"}`}
        >
          {notice.text}
        </p>
      ) : null}

      {!ready ? (
        <section className="card p-5 sm:p-6" aria-labelledby="setup">
          <h2 id="setup" className="text-lg font-semibold">
            Innan du kan ta emot bokningar
          </h2>
          <ol className="divide-y divide-line">
            <Step done={identified} title="Legitimera dig med BankID">
              {!identified ? (
                <Link href={`/konto/verifiera?next=/uthyrare/${accountId}`} className="btn-secondary">
                  {user.identityVerified ? "Legitimera dig igen" : "Legitimera dig"}
                </Link>
              ) : null}
            </Step>
            {/* A household is approved by its owner's BankID; Parklet only reviews it after a rejection. */}
            {!isOrg && (account.verificationStatus === "pending" || account.verificationStatus === "rejected") ? (
              <Step done={false} title="Parklet godkänner kontot">
                {account.verificationStatus === "pending" ? (
                  <p>Kontot granskas av Parklet, oftast inom en arbetsdag.</p>
                ) : (
                  <div className="space-y-1">
                    <p className="font-medium text-danger">Ej godkänt: {account.reviewNote ?? "Kontakta supporten."}</p>
                    <p>Legitimera dig med BankID igen, så granskar vi kontot på nytt. Dina parkeringsplatser behöver sedan skickas in för granskning igen.</p>
                  </div>
                )}
              </Step>
            ) : null}
            {isOrg ? (
              <Step done={verified} title="Verifiera organisationen">
                {account.verificationStatus === "pending" ? (
                  <p>Underlagen granskas av Parklet.</p>
                ) : verified ? null : (
                  <div className="space-y-3">
                    {account.verificationStatus === "rejected" ? (
                      <p className="font-medium text-danger">Ej godkänd: {account.reviewNote ?? "Kontakta supporten."}</p>
                    ) : null}
                    <p>Ladda upp bevis på att organisationen finns (registreringsbevis eller utdrag från Bolagsverket) och att du får företräda den (styrelseprotokoll eller firmatecknarbevis).</p>
                    <DocList docs={docs} />
                    <DocumentUploader accountId={accountId} kinds={ACCOUNT_DOC_OPTIONS} />
                    <SubmitAccountForm accountId={accountId} />
                  </div>
                )}
              </Step>
            ) : null}
            <Step done={payouts} title="Koppla konto för utbetalningar">
              {!payouts ? <PayoutStep account={account} user={user} viaStripe={viaStripe} /> : null}
            </Step>
            <Step done={anyApproved} title="Lägg upp en plats med underlag och få den godkänd">
              {spots.length === 0 ? (
                <Link href={`/uthyrare/${accountId}/platser/ny`} className="btn-secondary">
                  Lägg upp en plats
                </Link>
              ) : !anyApproved ? (
                <p>
                  Öppna platsen under{" "}
                  <Link href={`/uthyrare/${accountId}/platser`} className="link">
                    Parkeringsplatser
                  </Link>{" "}
                  för att ladda upp underlag och skicka in den för granskning.
                </p>
              ) : null}
            </Step>
          </ol>
        </section>
      ) : null}

      {payouts && viaStripe && owner && isStripeAccountRef(account.payoutAccountRef) ? (
        <section className="card flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6" aria-labelledby="payouts">
          <div>
            <h2 id="payouts" className="text-lg font-semibold">
              Utbetalningar
            </h2>
            <p className="mt-1 text-sm text-ink-soft">Stripe betalar ut intäkterna till {isOrg ? "ert" : "ditt"} bankkonto. Där ser du utbetalningar och kan byta bankkonto.</p>
          </div>
          <form action={payoutDashboardAction}>
            <input type="hidden" name="accountId" value={accountId} />
            <button className="btn-secondary">Öppna Stripe</button>
          </form>
        </section>
      ) : null}

      <section aria-label="Sammanfattning" className="grid gap-3 sm:grid-cols-3">
        <Tile
          href={`/uthyrare/${accountId}/granska`}
          label="Att granska"
          value={toReview}
          detail={regTasks.length ? `${regTasks.length} ${regTasks.length === 1 ? "bil" : "bilar"} att registrera` : toReview ? "Parkeringsplatser att slutföra" : "Inget just nu"}
          warn={regTasks.length > 0}
        />
        <Tile
          href={`/uthyrare/${accountId}/platser`}
          label="Parkeringsplatser"
          value={spots.length}
          detail={`${spots.filter((s) => s.review === "approved" && s.status === "active").length} uthyrda${blocked && anyApproved ? `, men ${blocked}` : ""}`}
        />
        <Tile
          href={`/uthyrare/${accountId}/bokningar`}
          label="Kommande bokningar"
          value={upcoming.length}
          detail={`Intjänat totalt ${formatSek(spots.reduce((sum, s) => sum + s.earnedOre, 0))}`}
        />
      </section>

      {owner ? (
        <details className="card p-5 sm:p-6">
          <summary className="cursor-pointer font-semibold text-danger">Ta bort uthyrarkontot</summary>
          <p className="mt-2 text-sm text-ink-soft">
            Kontot försvinner tillsammans med {isOrg ? "administratörer, inbjudningar, " : ""}parkeringsplatser och underlag. Bokningar som redan har gjorts
            sparas för bokföringen. Kommande bokningar behöver avbokas först. Har du inget annat uthyrarkonto är du sedan förare igen.
          </p>
          <DeleteForm kind="account" accountId={accountId} confirmLabel="Jag förstår att uthyrarkontot tas bort och inte går att återställa." button="Ta bort uthyrarkontot" />
        </details>
      ) : (
        <p className="text-sm text-muted">Bara kontots ägare kan ta bort det. Vill du sluta administrera kontot lämnar du det under Administratörer.</p>
      )}

      {/* With one account /uthyrare shows this dashboard, so this is the way to a second one. */}
      <p className="text-sm text-muted">
        Hyr du också ut för en förening eller ett företag?{" "}
        <Link href="/uthyrare/nytt" className="link">
          Skapa ett till uthyrarkonto
        </Link>
      </p>
    </div>
  );
}

/** The payout step while it isn't done: what Stripe is waiting for, and the owner's button. */
function PayoutStep({ account, user, viaStripe }: { account: AccountWithRole; user: CurrentUser; viaStripe: boolean }) {
  const owner = account.role === "owner";
  const status = account.payoutStatus;
  const explanation: Record<string, string> = {
    onboarding: "Registreringen hos Stripe är påbörjad men inte klar.",
    pending: "Stripe kontrollerar uppgifterna. Det brukar gå på några minuter, ibland ett par bankdagar. Vi meddelar dig när kontot är klart.",
    restricted: "Stripe behöver fler uppgifter innan utbetalningar kan göras.",
  };
  const button = status === "onboarding" ? "Fortsätt hos Stripe" : status === "restricted" ? "Komplettera hos Stripe" : viaStripe ? "Koppla utbetalningskonto" : "Koppla utbetalningskonto (testläge)";
  return (
    <div className="space-y-2">
      {explanation[status] ? <p className={status === "restricted" ? "font-medium text-warn" : undefined}>{explanation[status]}</p> : null}
      {status === "pending" ? null : !owner ? (
        <p>Kontots ägare kopplar utbetalningskontot.</p>
      ) : !user.identityVerified ? (
        <p>Legitimera dig först.</p>
      ) : (
        <form action={connectPayoutsAction} className="space-y-2">
          <input type="hidden" name="accountId" value={account.id} />
          {status === "not_connected" ? (
            <p>
              Utbetalningar sköts av vår licensierade betalpartner{viaStripe ? " Stripe" : ""}, som kontrollerar identitet och bankkonto enligt penningtvättsreglerna.
            </p>
          ) : null}
          <button className="btn-secondary">{button}</button>
        </form>
      )}
    </div>
  );
}

function DocList({ docs }: { docs: { id: string; kind: string; filename: string }[] }) {
  if (!docs.length) return null;
  return (
    <ul className="space-y-1">
      {docs.map((d) => (
        <li key={d.id}>
          <a href={`/api/dokument/${d.id}`} className="link" target="_blank" rel="noreferrer">
            {d.filename}
          </a>{" "}
          <span className="text-muted">– {DOCUMENT_KIND_LABEL[d.kind]}</span>
        </li>
      ))}
    </ul>
  );
}
