import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CancelButton } from "@/app/booking-buttons";
import { markRegisteredAction } from "@/app/bokning-actions";
import { BookingStatusBadge } from "@/components/status-badge";
import { BookingUnavailable } from "@/components/booking-unavailable";
import { requireUser } from "@/lib/auth/session";
import { formatSek } from "@/lib/money";
import { formatDateTime, formatRange } from "@/lib/time";
import { driverCancellationDeadline, getBookingForUser } from "@/server/bookings";

export const metadata: Metadata = { title: "Bokning", robots: { index: false } };

export default function BookingPage(props: PageProps<"/bokning/[id]">) {
  return (
    <Suspense fallback={<div className="mx-auto h-96 w-full max-w-2xl animate-pulse" />}>
      <BookingDetails {...props} />
    </Suspense>
  );
}

async function BookingDetails({ params, searchParams }: PageProps<"/bokning/[id]">) {
  const { id } = await params;
  const { bekraftad, behandlas } = await searchParams;
  const user = await requireUser(`/bokning/${id}`);
  const b = await getBookingForUser(id, user.id);
  if (!b) return <BookingUnavailable email={user.email} returnTo={`/bokning/${id}`} />;
  const isDriver = b.driverId === user.id;
  const active = b.status === "confirmed" && b.endsAt > new Date();
  const deadline = driverCancellationDeadline(b, b.spot.cancellationHours);
  const waitingForHost = b.vehicleRegistration === "pending";
  const canCancelFree = isDriver && active && (waitingForHost || new Date() < deadline);
  const maps = `https://www.google.com/maps/dir/?api=1&destination=${b.spot.lat},${b.spot.lng}`;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      {bekraftad && b.status === "confirmed" ? (
        <p role="status" className="mb-6 rounded-xl border border-ok/20 bg-ok-soft px-4 py-3 font-medium text-ok">
          Klart! Din parkering är bokad och betald. Ett kvitto har skickats till din e-post.
        </p>
      ) : null}
      {behandlas && b.status === "pending_payment" ? (
        <p role="status" className="mb-6 rounded-xl border border-line bg-surface px-4 py-3 text-ink-soft">
          Betalningen behandlas. Du får en bokningsbekräftelse så snart den är klar.
        </p>
      ) : null}
      {b.status === "expired" && b.paymentStatus === "refunded" ? (
        <p role="status" className="mb-6 rounded-xl border border-line bg-surface px-4 py-3 text-ink-soft">
          Betalningen kom fram efter att reservationen hade gått ut, och platsen hann bokas av någon annan. Hela beloppet, {formatSek(b.totalOre)}, återbetalas
          till {isDriver ? "ditt" : "förarens"} betalsätt inom några bankdagar.
        </p>
      ) : null}
      {b.status === "cancelled" ? (
        <p role="status" className="mb-6 rounded-xl border border-line bg-surface px-4 py-3 text-ink-soft">
          Bokningen är avbokad{b.cancelledBy === "host" ? " av uthyraren" : ""}
          {b.cancelledAt ? ` ${formatDateTime(b.cancelledAt)}` : ""}.
          {b.paymentStatus === "refunded" ? ` ${formatSek(b.totalOre)} återbetalas till ${isDriver ? "ditt" : "förarens"} betalsätt inom några bankdagar.` : ""}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{b.spot.title}</h1>
        <BookingStatusBadge status={b.status} endsAt={b.endsAt} />
      </div>
      <p className="mt-1 text-ink-soft">
        {b.spot.address}, {b.spot.city}
      </p>

      <dl className="card mt-6 divide-y divide-line">
        <Item label="Tid">{formatRange(b.startsAt, b.endsAt)}</Item>
        <Item label="Bil">{b.vehicleReg}</Item>
        {b.vehicleRegistration !== "not_required" ? (
          <Item label="Registrering hos föreningen">
            {b.vehicleRegistration === "done" ? (
              <span className="font-medium text-ok">Registrerad {b.vehicleRegisteredAt ? formatDateTime(b.vehicleRegisteredAt) : ""}</span>
            ) : (
              <span className="font-medium text-warn">
                Väntar på att uthyraren registrerar bilen
                {isDriver && b.startsAt <= new Date() ? " – parkera inte förrän den är registrerad, annars riskerar du en kontrollavgift" : ""}
              </span>
            )}
            {b.spot.vehicleRegistrationNote ? <span className="block text-sm text-muted">{b.spot.vehicleRegistrationNote}</span> : null}
            {b.viewerIsHost && b.vehicleRegistration === "pending" && b.status === "confirmed" ? (
              <form action={markRegisteredAction} className="mt-2">
                <input type="hidden" name="bookingId" value={b.id} />
                <button className="btn-primary py-1.5">Markera {b.vehicleReg} som registrerad</button>
              </form>
            ) : null}
          </Item>
        ) : null}
        {!isDriver ? <Item label="Förare">{b.driverName}</Item> : null}
        <Item label="Betalt">
          {formatSek(b.totalOre)}
          {b.paymentStatus === "refunded" ? <span className="ml-2 text-sm text-ok">Återbetalt</span> : null}
          {b.viewerIsHost ? <span className="block text-sm text-muted">Din intäkt: {formatSek(b.baseOre)}</span> : null}
        </Item>
        <Item label="Boknings-id">
          <span className="font-mono text-sm">{b.id.slice(0, 8).toUpperCase()}</span>
        </Item>
        <Item label="Bokad">{formatDateTime(b.confirmedAt ?? b.createdAt)}</Item>
        {b.cancelledAt ? <Item label="Avbokad">{formatDateTime(b.cancelledAt)}</Item> : null}
      </dl>

      {b.status === "confirmed" ? (
        <section className="card mt-6 p-5">
          <h2 className="font-semibold">Hitta och ta dig in</h2>
          <p className="mt-2 whitespace-pre-line text-ink-soft">{b.spot.accessInstructions || "Uthyraren har inte lagt till några instruktioner."}</p>
          <a href={maps} target="_blank" rel="noreferrer" className="btn-secondary mt-4">
            Vägbeskrivning
          </a>
        </section>
      ) : null}

      {b.status === "pending_payment" && isDriver ? (
        <Link href={`/betala/${b.id}`} className="btn-primary mt-6">
          Slutför betalningen
        </Link>
      ) : null}

      {active ? (
        <section className="mt-6">
          {canCancelFree ? (
            <>
              <p className="mb-3 text-sm text-ink-soft">
                {waitingForHost && new Date() >= deadline
                  ? "Bilen är inte registrerad än, så du kan avboka kostnadsfritt tills uthyraren har registrerat den."
                  : `Kostnadsfri avbokning fram till ${formatDateTime(deadline)}${waitingForHost ? ", och så länge bilen inte är registrerad" : ""}.`}
              </p>
              <CancelButton bookingId={b.id} />
            </>
          ) : b.viewerIsHost ? (
            <>
              <p className="mb-3 text-sm text-ink-soft">Som uthyrare kan du avboka. Föraren får då hela beloppet tillbaka.</p>
              <CancelButton bookingId={b.id} label="Avboka som uthyrare" />
            </>
          ) : (
            <p className="text-sm text-ink-soft">
              Avbokningsfristen gick ut {formatDateTime(deadline)}. Har något hänt?{" "}
              <Link href="/hjalp#kontakt" className="link">
                Kontakta supporten
              </Link>
              .
            </p>
          )}
        </section>
      ) : null}

      <p className="mt-8 text-sm">
        <Link href={isDriver ? "/mina-bokningar" : "/uthyrare"} className="link">
          ← {isDriver ? "Alla mina bokningar" : "Till uthyrning"}
        </Link>
      </p>
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr]">
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
