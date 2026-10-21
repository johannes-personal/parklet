import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BookingUnavailable } from "@/components/booking-unavailable";
import { Suspense } from "react";
import { PayButton } from "@/app/booking-buttons";
import { requireUser } from "@/lib/auth/session";
import { formatSek } from "@/lib/money";
import { formatRange, formatTime } from "@/lib/time";
import { getBookingForUser } from "@/server/bookings";
import { isStripeTestMode } from "@/server/stripe";

export const metadata: Metadata = { title: "Betala", robots: { index: false } };

export default function CheckoutPage(props: PageProps<"/betala/[id]">) {
  return (
    <Suspense fallback={<div className="mx-auto h-96 w-full max-w-lg animate-pulse" />}>
      <Checkout {...props} />
    </Suspense>
  );
}

async function Checkout({ params, searchParams }: PageProps<"/betala/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser(`/betala/${id}`);
  const b = await getBookingForUser(id, user.id);
  if (!b || b.driverId !== user.id) return <BookingUnavailable email={user.email} returnTo={`/betala/${id}`} />;
  if (b.status === "confirmed") redirect(`/bokning/${b.id}`);
  const expired = b.status !== "pending_payment" || !b.holdExpiresAt || b.holdExpiresAt < new Date();
  const stripe = b.paymentProvider === "stripe";
  const testMode = !stripe || isStripeTestMode();

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
          {sp.avbruten ? (
            <p role="status" className="text-sm font-medium">
              Betalningen avbröts. Ingen betalning har dragits, och platsen är fortfarande reserverad åt dig.
            </p>
          ) : null}
          {sp.fel ? (
            <p role="alert" className="text-sm font-medium text-danger">
              Vi kunde inte bekräfta betalningen. Har den dragits bekräftas bokningen automatiskt inom några minuter; annars kan du försöka igen.
            </p>
          ) : null}
          <p className="text-sm text-ink-soft">Platsen är reserverad åt dig till kl. {formatTime(b.holdExpiresAt!)}.</p>
          {stripe ? (
            <p className="text-sm text-ink-soft">
              Du betalar på Stripes säkra betalsida, med kort, Apple Pay, Google Pay eller andra betalsätt som visas där. Parklet ser aldrig dina kortuppgifter.
            </p>
          ) : null}
          {testMode ? (
            <div className="rounded-xl border border-dashed border-warn/50 bg-warn-soft p-4 text-sm text-warn">
              {stripe ? (
                <>
                  <strong>Testläge.</strong> Betala med Stripes testkort 4242 4242 4242 4242, ett datum framåt i tiden och valfri CVC. Inga riktiga pengar dras.
                </>
              ) : (
                <>
                  <strong>Testläge.</strong> I produktion visas här betalleverantörens säkra betalformulär (kort, Apple Pay, Google Pay, Swish, Klarna)
                  med 3-D Secure. Inga riktiga pengar dras.
                </>
              )}
            </div>
          ) : null}
          <PayButton bookingId={b.id} provider={b.paymentProvider} label={`Betala ${formatSek(b.totalOre)}${testMode ? " (testläge)" : ""}`} />
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
