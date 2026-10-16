import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SpotMap } from "@/components/map/spot-map";
import { describeWindows } from "@/lib/availability";
import { getCurrentUser } from "@/lib/auth/session";
import { spotFeatures } from "@/lib/labels";
import { formatSek } from "@/lib/money";
import { formatDuration, formatRange } from "@/lib/time";
import { listBusyRanges, listVehicles } from "@/server/bookings";
import { getAccountForMember } from "@/server/host-accounts";
import { getSpotWithAccount, isBookable } from "@/server/spots";
import { BookingForm } from "./booking-form";

export const metadata: Metadata = { title: "Parkeringsplats" };

type P = PageProps<"/plats/[id]">;

export default function SpotPage(props: P) {
  return (
    <Suspense fallback={<div className="mx-auto h-96 w-full max-w-6xl animate-pulse px-4 py-8" />}>
      <SpotDetails {...props} />
    </Suspense>
  );
}

async function SpotDetails({ params, searchParams }: P) {
  const { id } = await params;
  const sp = await searchParams;
  const [row, user] = await Promise.all([getSpotWithAccount(id), getCurrentUser()]);
  if (!row) notFound();
  const { spot, account } = row;
  const bookable = isBookable(spot, account);
  const isHost = user ? Boolean(await getAccountForMember(account.id, user.id)) : false;
  if (!bookable && !isHost && !user?.isAdmin) notFound();

  const [busy, vehicles] = await Promise.all([listBusyRanges(spot.id), user ? listVehicles(user.id) : Promise.resolve([])]);
  const from = typeof sp.from === "string" ? sp.from : undefined;
  const to = typeof sp.to === "string" ? sp.to : undefined;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      {!bookable ? (
        <p role="status" className="mb-6 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm font-medium text-warn">
          Förhandsvisning: platsen är inte bokningsbar ännu (granskning, verifiering eller utbetalningskonto saknas, eller så är den pausad).
        </p>
      ) : null}
      <div className="grid gap-8 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          <div>
            <p className="text-sm text-muted">
              <Link href="/sok" className="hover:underline">
                Parkering
              </Link>{" "}
              › {spot.city}
            </p>
            <h1 className="mt-1 text-3xl font-bold">{spot.title}</h1>
            <p className="mt-1 text-ink-soft">
              {spot.address}, {spot.city}
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {spotFeatures(spot).map((f) => (
                <li key={f} className="rounded-full bg-surface px-3 py-1 text-sm ring-1 ring-line">
                  {f}
                </li>
              ))}
            </ul>
          </div>

          <div className="h-64 overflow-hidden rounded-[var(--radius-card)] border border-line">
            <SpotMap spots={[{ id: spot.id, lat: spot.lat, lng: spot.lng, label: `${formatSek(spot.pricePerHourOre)}/h`, title: spot.title, href: "#" }]} />
          </div>

          {spot.description ? (
            <section>
              <h2 className="text-lg font-semibold">Om platsen</h2>
              <p className="mt-2 whitespace-pre-line text-ink-soft">{spot.description}</p>
            </section>
          ) : null}

          <dl className="card divide-y divide-line">
            <Row label="Pris">
              {formatSek(spot.pricePerHourOre)} per timme{spot.pricePerDayOre ? `, max ${formatSek(spot.pricePerDayOre)} per dygn` : ""}
            </Row>
            <Row label="Tillgänglig">{describeWindows(spot.windows)}</Row>
            <Row label="Minsta bokning">{formatDuration(spot.minDurationMinutes)}</Row>
            {spot.minNoticeMinutes ? <Row label="Boka senast">{formatDuration(spot.minNoticeMinutes)} innan start</Row> : null}
            <Row label="Avbokning">
              {spot.cancellationHours === 0 ? "Kostnadsfri fram till start" : `Kostnadsfri fram till ${spot.cancellationHours} tim innan start`}
            </Row>
            {spot.requiresVehicleRegistration ? (
              <Row label="Registrering av bil">
                Krävs av föreningen. {spot.vehicleRegistrationNote || "Uthyraren registrerar ditt registreringsnummer innan bokningen startar."}
              </Row>
            ) : null}
            <Row label="Uthyrare">
              <span className="inline-flex items-center gap-2">
                {account.kind === "household" ? account.name.split(" ")[0] : account.name}
                {account.verificationStatus === "verified" ? (
                  <span className="rounded-full bg-ok-soft px-2 py-0.5 text-xs font-semibold text-ok">Verifierad</span>
                ) : null}
              </span>
              {spot.review === "approved" ? <span className="block text-sm text-muted">Rätten att hyra ut platsen är kontrollerad av Parklet.</span> : null}
            </Row>
          </dl>

          {busy.length ? (
            <section>
              <h2 className="text-lg font-semibold">Redan bokad</h2>
              <ul className="mt-2 space-y-1 text-sm text-ink-soft">
                {busy.map((b) => (
                  <li key={b.startsAt.toISOString()}>{formatRange(b.startsAt, b.endsAt)}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="card p-5 shadow-sm">
            <p className="text-2xl font-bold">
              {formatSek(spot.pricePerHourOre)} <span className="text-base font-normal text-muted">/ timme</span>
            </p>
            <div className="mt-4">
              {isHost ? (
                <p className="text-sm text-ink-soft">Det här är en plats som ditt uthyrarkonto hyr ut.</p>
              ) : bookable ? (
                <BookingForm
                  // Cache Components preserves client state across navigations; remount when the viewer changes (e.g. after logging in).
                  key={user?.id ?? "anonymous"}
                  spotId={spot.id}
                  pricePerHourOre={spot.pricePerHourOre}
                  pricePerDayOre={spot.pricePerDayOre}
                  minDurationMinutes={spot.minDurationMinutes}
                  minNoticeMinutes={spot.minNoticeMinutes}
                  windows={spot.windows}
                  busy={busy.map((b) => ({ start: b.startsAt.toISOString(), end: b.endsAt.toISOString() }))}
                  vehicles={vehicles.map((v) => ({ id: v.id, reg: v.reg, nickname: v.nickname }))}
                  loggedIn={Boolean(user)}
                  initialFrom={from}
                  initialTo={to}
                  requiresVehicleRegistration={spot.requiresVehicleRegistration}
                />
              ) : (
                <p className="text-sm text-ink-soft">Platsen kan inte bokas just nu.</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr]">
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
