import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SpotMap } from "@/components/map/spot-map";
import { loadSpotForViewer, SpotBooking, SpotFacts, SpotHeading } from "@/components/spot/spot-details";
import { formatSek } from "@/lib/money";

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
  const data = await loadSpotForViewer(id);
  if (!data) notFound();
  const { spot } = data;
  const from = typeof sp.from === "string" ? sp.from : undefined;
  const to = typeof sp.to === "string" ? sp.to : undefined;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      {!data.bookable ? (
        <p role="status" className="mb-6 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm font-medium text-warn">
          Förhandsvisning: platsen är inte bokningsbar ännu (granskning, verifiering eller utbetalningskonto saknas, eller så är den pausad).
        </p>
      ) : null}
      <div className="grid gap-8 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          <div>
            <p className="mb-1 text-sm text-muted">
              <Link href={`/sok?q=${encodeURIComponent(spot.city)}&lat=${spot.lat}&lng=${spot.lng}`} className="hover:underline">
                Parkering
              </Link>{" "}
              › {spot.city}
            </p>
            <SpotHeading spot={spot} />
          </div>

          <div className="h-64 overflow-hidden rounded-[var(--radius-card)] border border-line">
            <SpotMap spots={[{ id: spot.id, lat: spot.lat, lng: spot.lng, label: `${formatSek(spot.pricePerHourOre)}/h`, title: spot.title, href: "" }]} />
          </div>

          <SpotFacts spot={spot} account={data.account} busy={data.busy} />
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="card p-5 shadow-sm">
            <SpotBooking data={data} from={from} to={to} returnTo={`/plats/${spot.id}`} />
          </div>
        </aside>
      </div>
    </div>
  );
}
