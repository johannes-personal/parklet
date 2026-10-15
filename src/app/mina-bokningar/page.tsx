import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BookingStatusBadge } from "@/components/status-badge";
import { requireUser } from "@/lib/auth/session";
import { formatSek } from "@/lib/money";
import { formatRange } from "@/lib/time";
import { listDriverBookings, type BookingWithSpot } from "@/server/bookings";

export const metadata: Metadata = { title: "Mina bokningar" };

export default function MyBookingsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">Mina bokningar</h1>
      <Suspense fallback={<div className="card mt-6 h-40 animate-pulse" />}>
        <List />
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
