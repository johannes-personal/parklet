import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { PayButton } from "@/app/booking-buttons";
import { requireUser } from "@/lib/auth/session";
import { formatSek } from "@/lib/money";
import { formatRange, formatTime } from "@/lib/time";
import { getBookingForUser } from "@/server/bookings";

export const metadata: Metadata = { title: "Betala", robots: { index: false } };

export default function CheckoutPage({ params }: PageProps<"/betala/[id]">) {
  return (
    <Suspense fallback={<div className="mx-auto h-96 w-full max-w-lg animate-pulse" />}>
      <Checkout params={params} />
    </Suspense>
  );
}

async function Checkout({ params }: { params: PageProps<"/betala/[id]">["params"] }) {
  const { id } = await params;
  const user = await requireUser(`/betala/${id}`);
  const b = await getBookingForUser(id, user.id);
  if (!b || b.driverId !== user.id) notFound();
  if (b.status === "confirmed") redirect(`/bokning/${b.id}`);
  const expired = b.status !== "pending_payment" || !b.holdExpiresAt || b.holdExpiresAt < new Date();

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10">
      <h1 className="text-2xl font-bold">Betala bokningen</h1>
      <div className="card mt-6 p-5">
        <h2 className="font-semibold">{b.spot.title}</h2>
        <p className="text-sm text-ink-soft">
          {b.spot.address}, {b.spot.city}
        </p>
        <p className="mt-2 text-sm">{formatRange(b.startsAt, b.endsAt)}</p>
        <p className="text-sm text-ink-soft">Bil: {b.vehicleReg}</p>
        <dl className="mt-4 space-y-1 border-t border-line pt-4 text-sm">
          <div className="flex justify-between">
            <dt>Parkering</dt>
            <dd>{formatSek(b.baseOre)}</dd>
          </div>
          <div className="flex justify-between text-ink-soft">
            <dt>Serviceavgift (inkl. moms)</dt>
            <dd>{formatSek(b.feeOre)}</dd>
          </div>
          <div className="flex justify-between pt-2 text-base font-bold">
            <dt>Att betala</dt>
            <dd>{formatSek(b.totalOre)}</dd>
          </div>
        </dl>
      </div>

      {expired ? (
        <div className="card mt-6 p-5">
          <p className="font-medium text-danger">Reservationen har gått ut. Ingen betalning har dragits.</p>
          <Link href={`/plats/${b.spot.id}`} className="btn-primary mt-4">
            Boka igen
          </Link>
        </div>
      ) : (
        <div className="card mt-6 space-y-4 p-5">
          <p className="text-sm text-ink-soft">Platsen är reserverad åt dig till kl. {formatTime(b.holdExpiresAt!)}.</p>
          <div className="rounded-xl border border-dashed border-warn/50 bg-warn-soft p-4 text-sm text-warn">
            <strong>Testläge.</strong> I produktion visas här betalleverantörens säkra betalformulär (kort, Apple Pay, Google Pay, Swish, Klarna)
            med 3-D Secure. Inga riktiga pengar dras.
          </div>
          <PayButton bookingId={b.id} label={`Betala ${formatSek(b.totalOre)} (testläge)`} />
          <p className="text-xs text-muted">
            Genom att betala godkänner du{" "}
            <Link href="/villkor" className="link">
              villkoren
            </Link>{" "}
            och platsens avbokningsregler.
          </p>
        </div>
      )}
    </div>
  );
}
