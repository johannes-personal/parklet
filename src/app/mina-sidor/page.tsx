import type { Metadata } from "next";
import Link from "next/link";
import { DateTime } from "luxon";
import { Suspense } from "react";
import { FilterForm, Select } from "@/components/filter-form";
import { BookingStatusBadge } from "@/components/status-badge";
import { requireUser, type CurrentUser } from "@/lib/auth/session";
import { formatSek } from "@/lib/money";
import { formatRange, TZ } from "@/lib/time";
import { listDriverBookings, type BookingWithSpot } from "@/server/bookings";
import { HOST_KIND_LABEL, listAccountsForUser } from "@/server/host-accounts";
import { DeleteAccountForm } from "./delete-account-form";

export const metadata: Metadata = { title: "Mina sidor" };

type SP = Awaited<PageProps<"/mina-sidor">["searchParams"]>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const date = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const SHOW = { kommande: "Kommande", tidigare: "Tidigare", avbokade: "Avbokade" } as const;
type Show = keyof typeof SHOW;

/** The driver's own page: the account, then the bookings, which can be filtered by date and status. */
export default function MyPage({ searchParams }: PageProps<"/mina-sidor">) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">Mina sidor</h1>
      <Suspense fallback={<div className="card mt-6 h-40 animate-pulse" />}>
        <Account />
      </Suspense>
      <section className="mt-10" aria-labelledby="bokningar">
        <h2 id="bokningar" className="text-xl font-bold">
          Mina bokningar
        </h2>
        <Suspense fallback={<div className="card mt-4 h-40 animate-pulse" />}>
          <List searchParams={searchParams} />
        </Suspense>
      </section>
    </div>
  );
}

const day = (d: Date) => DateTime.fromJSDate(d, { zone: TZ }).toISODate()!;

async function List({ searchParams }: { searchParams: PageProps<"/mina-sidor">["searchParams"] }) {
  const user = await requireUser("/mina-sidor");
  const sp: SP = await searchParams;
  const show = one(sp.visa) as Show | undefined;
  const f = { show: show && show in SHOW ? show : undefined, from: date(one(sp.fran)), to: date(one(sp.till)) };
  const all = await listDriverBookings(user.id);

  if (all.length === 0) {
    return (
      <div className="card mt-4 p-6 text-ink-soft">
        Du har inga bokningar än.{" "}
        <Link href="/sok" className="link">
          Hitta parkering
        </Link>
      </div>
    );
  }
  const now = new Date();
  const isUpcoming = (b: BookingWithSpot) => b.status !== "cancelled" && b.endsAt > now;
  // Bookings that are on some day from–to (Swedish dates).
  const inRange = (b: BookingWithSpot) => (!f.from || day(b.endsAt) >= f.from) && (!f.to || day(b.startsAt) <= f.to);
  const matches = all.filter(
    (b) =>
      inRange(b) &&
      (f.show === "kommande" ? isUpcoming(b) : f.show === "tidigare" ? !isUpcoming(b) && b.status !== "cancelled" : f.show === "avbokade" ? b.status === "cancelled" : true),
  );
  const filtered = f.show || f.from || f.to;

  return (
    <>
      <FilterForm className="card mt-4 grid gap-3 p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <Select label="Visa" name="visa" value={f.show} options={Object.entries(SHOW)} all="Alla" />
        <div>
          <label htmlFor="f-fran" className="label">
            Från
          </label>
          <input id="f-fran" name="fran" type="date" defaultValue={f.from} className="input" />
        </div>
        <div>
          <label htmlFor="f-till" className="label">
            Till
          </label>
          <input id="f-till" name="till" type="date" defaultValue={f.to} className="input" />
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-secondary">Filtrera</button>
          {filtered ? (
            <Link href="/mina-sidor#bokningar" className="text-sm text-muted underline-offset-2 hover:underline">
              Rensa
            </Link>
          ) : null}
        </div>
      </FilterForm>
      {filtered ? (
        <Section title={`${matches.length} ${matches.length === 1 ? "bokning" : "bokningar"}`} items={matches} empty="Inga bokningar matchar." />
      ) : (
        <>
          <Section title="Kommande" items={matches.filter(isUpcoming).reverse()} empty="Inga kommande bokningar." />
          <Section title="Tidigare och avbokade" items={matches.filter((b) => !isUpcoming(b))} empty="Inga tidigare bokningar." />
        </>
      )}
    </>
  );
}

function Section({ title, items, empty }: { title: string; items: BookingWithSpot[]; empty: string }) {
  return (
    <section className="mt-6">
      <h3 className="text-lg font-semibold">{title}</h3>
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
  const user: CurrentUser = await requireUser("/mina-sidor");
  const hostAccounts = await listAccountsForUser(user.id);
  return (
    <section className="card mt-6 p-5 sm:p-6" aria-labelledby="konto">
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
