import { BookingForm } from "@/app/sok/booking-form";
import { describeWindows } from "@/lib/availability";
import { getCurrentUser } from "@/lib/auth/session";
import { spotFeatures } from "@/lib/labels";
import { formatSek } from "@/lib/money";
import { formatDuration, formatRange } from "@/lib/time";
import { listBusyRanges, listVehicles } from "@/server/bookings";
import { getAccountForMember } from "@/server/host-accounts";
import { getSpotWithAccount, isBookable } from "@/server/spots";
import { approvedRegs } from "@/server/vehicle-approvals";

/** A spot as a driver sees it, in the panel over the search map (/sok?plats=…). */
export async function loadSpotForViewer(id: string) {
  const [row, user] = await Promise.all([getSpotWithAccount(id), getCurrentUser()]);
  if (!row) return null;
  const { spot, account } = row;
  const bookable = isBookable(spot, account);
  const isHost = user ? Boolean(await getAccountForMember(account.id, user.id)) : false;
  // Unbookable spots are only previewed by their own hosts and by admins.
  if (!bookable && !isHost && !user?.isAdmin) return null;
  const [busy, vehicles] = await Promise.all([listBusyRanges(spot.id), user ? listVehicles(user.id) : Promise.resolve([])]);
  // The driver's cars the host has already registered for the spot.
  const registered = spot.requiresVehicleRegistration ? await approvedRegs(spot.id, vehicles.map((v) => v.reg)) : new Set<string>();
  return { spot, account, bookable, isHost, user, busy, vehicles, registered };
}

export type ViewerSpot = NonNullable<Awaited<ReturnType<typeof loadSpotForViewer>>>;

export function SpotHeading({ spot, level = 1 }: { spot: ViewerSpot["spot"]; level?: 1 | 2 }) {
  const H = level === 1 ? "h1" : "h2";
  return (
    <div>
      <H className={level === 1 ? "text-3xl font-bold" : "text-2xl font-bold"}>{spot.title}</H>
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
  );
}

export function SpotFacts({ spot, account, busy }: Pick<ViewerSpot, "spot" | "account" | "busy">) {
  return (
    <>
      {spot.description ? (
        <section>
          <h3 className="text-lg font-semibold">Om platsen</h3>
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
            {account.verificationStatus === "verified" ? <span className="rounded-full bg-ok-soft px-2 py-0.5 text-xs font-semibold text-ok">Verifierad</span> : null}
          </span>
          {spot.review === "approved" ? <span className="block text-sm text-muted">Rätten att hyra ut platsen är kontrollerad av Parklet.</span> : null}
        </Row>
      </dl>

      {busy.length ? (
        <section>
          <h3 className="text-lg font-semibold">Redan bokad</h3>
          <ul className="mt-2 space-y-1 text-sm text-ink-soft">
            {busy.map((b) => (
              <li key={b.startsAt.toISOString()}>{formatRange(b.startsAt, b.endsAt)}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

/** Price and booking form. `returnTo` is where a logged-out driver comes back to after logging in. */
export function SpotBooking({ data, from, to, returnTo }: { data: ViewerSpot; from?: string; to?: string; returnTo: string }) {
  const { spot, user, isHost, bookable, busy, vehicles } = data;
  return (
    <>
      <p className="text-2xl font-bold">
        {formatSek(spot.pricePerHourOre)} <span className="text-base font-normal text-muted">/ timme</span>
      </p>
      <div className="mt-4">
        {isHost ? (
          <p className="text-sm text-ink-soft">Det här är en plats som ditt uthyrarkonto hyr ut.</p>
        ) : bookable ? (
          <BookingForm
            // Cache Components preserves client state across navigations; remount when the viewer or spot changes (e.g. after logging in).
            key={`${user?.id ?? "anonymous"}:${spot.id}`}
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
            registeredRegs={[...data.registered]}
            returnTo={returnTo}
          />
        ) : (
          <p className="text-sm text-ink-soft">Platsen kan inte bokas just nu.</p>
        )}
      </div>
    </>
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
