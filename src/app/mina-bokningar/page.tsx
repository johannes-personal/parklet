import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BookingStatusBadge } from "@/components/status-badge";
import { requireUser, type CurrentUser } from "@/lib/auth/session";
import { formatSek } from "@/lib/money";
import { formatRange } from "@/lib/time";
import { listDriverBookings, type BookingWithSpot } from "@/server/bookings";
import { HOST_KIND_LABEL, listAccountsForUser } from "@/server/host-accounts";
import { DeleteAccountForm } from "./delete-account-form";

export const metadata: Metadata = { title: "Mina bokningar" };

export default function MyBookingsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">Mina bokningar</h1>
      <Suspense fallback={<div className="card mt-6 h-40 animate-pulse" />}>
        <List />
      </Suspense>
      <Suspense fallback={<div className="card mt-10 h-40 animate-pulse" />}>
        <Account />
      </Suspense>
    </div>
  );
}

async function List() {
  const user = await requireUser("/mina-bokningar");
  const all = await listDriverBookings(user.id);
  const now = new Date();
  const upcoming = all.filter((b) => b.status !== "cancelled" && b.endsAt > now).reverse();
  const past = all.filter((b) => !(b.status !== "cancelled" && b.endsAt > now));

  if (all.length === 0) {
    return (
      <div className="card mt-6 p-6 text-ink-soft">
        Du har inga bokningar än.{" "}
        <Link href="/sok" className="link">
          Hitta parkering
        </Link>
      </div>
    );
  }
  return (
    <>
      <Section title="Kommande" items={upcoming} empty="Inga kommande bokningar." />
      <Section title="Tidigare och avbokade" items={past} empty="Inga tidigare bokningar." />
    </>
  );
}

function Section({ title, items, empty }: { title: string; items: BookingWithSpot[]; empty: string }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.map((b) => (
            <li key={b.id}>
              <Link href={`/bokning/${b.id}`} className="card flex items-center justify-between gap-4 p-4 hover:shadow-md">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{b.spot.title}</p>
                  <p className="text-sm text-ink-soft">{formatRange(b.startsAt, b.endsAt)}</p>
                  <p className="text-sm text-muted">{b.vehicleReg}</p>
                </div>
                <div className="shrink-0 text-right">
                  <BookingStatusBadge status={b.status} endsAt={b.endsAt} />
                  <p className="mt-1 text-sm font-medium">{formatSek(b.totalOre)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Who is signed in, what kind of account it is, and what can be done with it. */
async function Account() {
  const user: CurrentUser = await requireUser("/mina-bokningar");
  const hostAccounts = await listAccountsForUser(user.id);
  return (
    <section className="card mt-10 p-5 sm:p-6" aria-labelledby="konto">
      <h2 id="konto" className="text-lg font-semibold">
        Ditt konto
      </h2>
      <dl className="mt-3 divide-y divide-line text-sm">
        <Row label="Namn">{user.name}</Row>
        <Row label="E-post">{user.email}</Row>
        <Row label="Kontotyp">
          {hostAccounts.length === 0 ? (
            "Förare"
          ) : (
            <>
              Förare och uthyrare
              <ul className="mt-1 space-y-0.5">
                {hostAccounts.map((a) => (
                  <li key={a.id}>
                    <Link href={`/uthyrare/${a.id}`} className="link">
                      {a.name}
                    </Link>{" "}
                    <span className="text-muted">
                      – {HOST_KIND_LABEL[a.kind]}, {a.role === "owner" ? "ägare" : "administratör"}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {user.isAdmin ? <span className="block text-muted">Administratör hos Parklet</span> : null}
        </Row>
        <Row label="BankID">{user.identityVerified ? "Legitimerad" : "Inte legitimerad (behövs bara för att hyra ut)"}</Row>
      </dl>

      <div className="mt-5 space-y-4 text-sm">
        <div>
          <Link href="/fordon" className="font-semibold link">
            Mina fordon
          </Link>
          <p className="text-ink-soft">Spara bilarnas registreringsnummer, så väljer du bil med ett klick när du bokar.</p>
        </div>
        <div>
          <Link href="/uthyrare/nytt" className="font-semibold link">
            {hostAccounts.length ? "Skapa ett till uthyrarkonto" : "Bli uthyrare"}
          </Link>
          <p className="text-ink-soft">
            {hostAccounts.length
              ? "Ett uthyrarkonto byter inte typ, eftersom privatpersoner, föreningar och företag verifieras på olika sätt. Hyr du ut för en förening eller ett företag skapar du ett konto av den typen."
              : "Hyr ut din egen plats som privatperson, eller platser för en bostadsrättsförening eller ett företag."}
          </p>
        </div>
        <details className="rounded-xl border border-line p-4">
          <summary className="cursor-pointer font-semibold text-danger">Ta bort kontot</summary>
          <DeleteAccountForm />
        </details>
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-2 sm:grid-cols-[8rem_1fr]">
      <dt className="text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
