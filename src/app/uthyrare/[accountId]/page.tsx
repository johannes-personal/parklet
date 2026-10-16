import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { markRegisteredAction } from "@/app/bokning-actions";
import { connectPayoutsAction, toggleSpotAction } from "@/app/uthyrare/actions";
import { DocumentUploader, InviteForm, SubmitAccountForm } from "@/components/host/forms";
import { Badge, BookingStatusBadge } from "@/components/status-badge";
import { requireUser } from "@/lib/auth/session";
import { ACCOUNT_DOC_OPTIONS, DOCUMENT_KIND_LABEL, REVIEW_LABEL } from "@/lib/labels";
import { formatSek } from "@/lib/money";
import { formatDateTime, formatRange } from "@/lib/time";
import { listAccountBookings } from "@/server/bookings";
import {
  getAccountForMember,
  HOST_KIND_LABEL,
  listAccountDocuments,
  listMembers,
  listPendingInvitations,
} from "@/server/host-accounts";
import { listAccountSpots } from "@/server/spots";

export const metadata: Metadata = { title: "Uthyrarkonto" };

type P = PageProps<"/uthyrare/[accountId]">;

export default function AccountPage(props: P) {
  return (
    <Suspense fallback={<div className="mx-auto h-96 w-full max-w-5xl animate-pulse px-4 py-10" />}>
      <Dashboard {...props} />
    </Suspense>
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

async function Dashboard({ params, searchParams }: P) {
  const { accountId } = await params;
  const sp = await searchParams;
  const user = await requireUser(`/uthyrare/${accountId}`);
  const account = await getAccountForMember(accountId, user.id);
  if (!account) notFound();
  const isOrg = account.kind !== "household";
  const [spots, bookings, docs, members, invites] = await Promise.all([
    listAccountSpots(accountId),
    listAccountBookings(accountId),
    isOrg ? listAccountDocuments(accountId) : Promise.resolve([]),
    isOrg ? listMembers(accountId) : Promise.resolve([]),
    isOrg ? listPendingInvitations(accountId) : Promise.resolve([]),
  ]);
  const now = new Date();
  const upcoming = bookings.filter((b) => b.status === "confirmed" && b.endsAt > now);
  const regTasks = upcoming.filter((b) => b.vehicleRegistration === "pending");
  const verified = account.verificationStatus === "verified";
  const payouts = account.payoutStatus === "active";
  const anyApproved = spots.some((s) => s.review === "approved");
  const ready = verified && payouts && anyApproved;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{HOST_KIND_LABEL[account.kind]}</p>
          <h1 className="text-2xl font-bold">{account.name}</h1>
          {account.orgNumber ? <p className="text-sm text-muted">Org.nr {account.orgNumber}</p> : null}
        </div>
        <Link href={`/uthyrare/${accountId}/platser/ny`} className="btn-primary">
          Lägg upp {isOrg ? "platser" : "en plats"}
        </Link>
      </div>

      {sp.utbetalning ? (
        <p role="status" className="rounded-xl border border-ok/20 bg-ok-soft px-4 py-3 font-medium text-ok">
          Utbetalningskontot är kopplat.
        </p>
      ) : null}

      {!ready ? (
        <section className="card p-5 sm:p-6" aria-labelledby="setup">
          <h2 id="setup" className="text-lg font-semibold">
            Innan du kan ta emot bokningar
          </h2>
          <ol className="divide-y divide-line">
            <Step done={user.identityVerified} title="Legitimera dig med BankID">
              {!user.identityVerified ? (
                <Link href={`/konto/verifiera?next=/uthyrare/${accountId}`} className="btn-secondary">
                  Legitimera dig
                </Link>
              ) : null}
            </Step>
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
              {!payouts ? (
                account.role === "owner" && user.identityVerified ? (
                  <form action={connectPayoutsAction} className="space-y-2">
                    <input type="hidden" name="accountId" value={accountId} />
                    <p>
                      Utbetalningar sköts av vår licensierade betalpartner, som kontrollerar identitet och bankkonto enligt penningtvättsreglerna.
                    </p>
                    <button className="btn-secondary">Koppla utbetalningskonto (testläge)</button>
                  </form>
                ) : (
                  <p>{account.role !== "owner" ? "Kontots ägare kopplar utbetalningskontot." : "Legitimera dig först."}</p>
                )
              ) : null}
            </Step>
            <Step done={anyApproved} title="Lägg upp en plats med underlag och få den godkänd">
              {spots.length === 0 ? (
                <Link href={`/uthyrare/${accountId}/platser/ny`} className="btn-secondary">
                  Lägg upp en plats
                </Link>
              ) : !anyApproved ? (
                <p>Öppna platsen nedan för att ladda upp underlag och skicka in den för granskning.</p>
              ) : null}
            </Step>
          </ol>
        </section>
      ) : null}

      {regTasks.length ? (
        <section className="card border-warn/40 p-5 sm:p-6" aria-labelledby="tasks">
          <h2 id="tasks" className="text-lg font-semibold">
            Bilar att registrera
          </h2>
          <p className="mt-1 text-sm text-ink-soft">Registrera bilarna i föreningens parkeringssystem innan bokningen startar och bocka sedan av här.</p>
          <ul className="mt-3 divide-y divide-line">
            {regTasks.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-mono text-lg font-semibold tracking-wider">{b.vehicleReg}</p>
                  <p className="text-sm text-ink-soft">
                    {b.spot.title} · {formatRange(b.startsAt, b.endsAt)}
                  </p>
                </div>
                <form action={markRegisteredAction}>
                  <input type="hidden" name="bookingId" value={b.id} />
                  <input type="hidden" name="back" value={`/uthyrare/${accountId}`} />
                  <button className="btn-primary py-2">Markera som registrerad</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="spots">
        <h2 id="spots" className="text-lg font-semibold">
          Platser
        </h2>
        {spots.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Inga platser ännu.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {spots.map((s) => {
              const r = REVIEW_LABEL[s.review];
              return (
                <li key={s.id} className="card flex flex-wrap items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <Link href={`/uthyrare/${accountId}/platser/${s.id}`} className="font-semibold hover:underline">
                      {s.title}
                    </Link>
                    <p className="text-sm text-ink-soft">
                      {s.address}, {s.city} · {formatSek(s.pricePerHourOre)}/h
                    </p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <Badge kind={r.kind}>{r.text}</Badge>
                      {s.status === "paused" ? <Badge>Pausad</Badge> : null}
                      {s.visibility === "link" ? <Badge kind="brand">Endast via länk</Badge> : null}
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <p>{s.upcomingBookings} kommande bokningar</p>
                    <p className="text-muted">Intjänat {formatSek(s.earnedOre)}</p>
                    <form action={toggleSpotAction} className="mt-2">
                      <input type="hidden" name="accountId" value={accountId} />
                      <input type="hidden" name="spotId" value={s.id} />
                      <input type="hidden" name="status" value={s.status === "active" ? "paused" : "active"} />
                      <button className="text-sm font-medium text-brand hover:underline">{s.status === "active" ? "Pausa" : "Aktivera"}</button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="bookings">
        <h2 id="bookings" className="text-lg font-semibold">
          Bokningar
        </h2>
        {bookings.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Inga bokningar de senaste sju dagarna eller framåt.</p>
        ) : (
          <ul className="card mt-3 divide-y divide-line">
            {bookings.map((b) => (
              <li key={b.id}>
                <Link href={`/bokning/${b.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-canvas">
                  <span>
                    <span className="block font-medium">{formatRange(b.startsAt, b.endsAt)}</span>
                    <span className="text-sm text-ink-soft">
                      {b.spot.title} · {b.driverName} · {b.vehicleReg}
                    </span>
                  </span>
                  <span className="text-right">
                    <BookingStatusBadge status={b.status} endsAt={b.endsAt} />
                    <span className="block text-sm">{formatSek(b.baseOre)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isOrg ? (
        <section className="card p-5 sm:p-6" aria-labelledby="members">
          <h2 id="members" className="text-lg font-semibold">
            Administratörer
          </h2>
          <ul className="mt-3 divide-y divide-line">
            {members.map((m) => (
              <li key={m.userId} className="flex justify-between py-2 text-sm">
                <span>
                  {m.name} <span className="text-muted">({m.email})</span>
                </span>
                <span className="text-muted">{m.role === "owner" ? "Ägare" : "Administratör"}</span>
              </li>
            ))}
            {invites.map((i) => (
              <li key={i.email} className="flex justify-between py-2 text-sm text-muted">
                <span>{i.email}</span>
                <span>Inbjuden, gäller till {formatDateTime(i.expiresAt)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <InviteForm accountId={accountId} />
          </div>
        </section>
      ) : null}
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
