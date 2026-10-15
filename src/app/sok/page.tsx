import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { SearchForm } from "@/components/search-form";
import { SpotMap, type MapSpot } from "@/components/map/spot-map";
import { formatDistance } from "@/lib/geo";
import { spotFeatures } from "@/lib/labels";
import { formatSek } from "@/lib/money";
import { formatDuration, formatRange, parseLocalDateTime } from "@/lib/time";
import { geocode } from "@/server/geocode";
import { searchSpots } from "@/server/search";

export const metadata: Metadata = { title: "Hitta parkering" };

type SP = PageProps<"/sok">["searchParams"];

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default function SearchPage({ searchParams }: PageProps<"/sok">) {
  return (
    <Suspense fallback={<ResultsSkeleton />}>
      <Results searchParams={searchParams} />
    </Suspense>
  );
}

async function Results({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  // Availability depends on the current time and live bookings.
  await connection();
  const q = one(sp.q)?.slice(0, 120);
  const fromRaw = one(sp.from);
  const toRaw = one(sp.to);
  let lat = Number(one(sp.lat));
  let lng = Number(one(sp.lng));
  let center = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && one(sp.lat) ? { lat, lng } : null;
  if (!center && q) {
    const [hit] = await geocode(q);
    if (hit) {
      lat = hit.lat;
      lng = hit.lng;
      center = { lat, lng };
    }
  }
  const start = parseLocalDateTime(fromRaw);
  const end = parseLocalDateTime(toRaw);
  const timed = Boolean(start && end && end > start);
  const outcome = await searchSpots({ center, start: timed ? start : null, end: timed ? end : null });
  const qs = timed ? `?from=${encodeURIComponent(fromRaw!)}&to=${encodeURIComponent(toRaw!)}` : "";

  const mapSpots: MapSpot[] = outcome.results.map((r) => ({
    id: r.id,
    lat: r.lat,
    lng: r.lng,
    title: r.title,
    href: `/plats/${r.id}${qs}`,
    label: r.price ? formatSek(r.price.totalOre) : `${formatSek(r.pricePerHourOre)}/h`,
  }));

  return (
    <div className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-[minmax(0,1fr)] gap-6 px-4 py-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <div className="space-y-5">
        <details className="card p-4 lg:open:p-5" open={!center && !timed}>
          <summary className="cursor-pointer font-semibold">
            {q ? q : "Alla platser"}
            {timed ? <span className="block text-sm font-normal text-muted">{formatRange(start!, end!)}</span> : null}
            <span className="mt-1 block text-sm font-normal text-brand">Ändra sökning</span>
          </summary>
          <div className="mt-4">
            <SearchForm compact initial={{ q, lat: center?.lat, lng: center?.lng, from: timed ? fromRaw : undefined, to: timed ? toRaw : undefined }} />
          </div>
        </details>

        <div aria-live="polite">
          <h1 className="text-lg font-bold">
            {outcome.results.length === 0
              ? "Inga lediga platser hittades"
              : `${outcome.results.length} ${outcome.results.length === 1 ? "plats" : "platser"}${timed ? " lediga hela tiden" : ""}`}
          </h1>
          {outcome.widened && outcome.results.length > 0 ? (
            <p className="mt-1 text-sm text-warn">Inga platser inom 3 km – visar platser inom {outcome.radiusM! / 1000} km.</p>
          ) : null}
          {!timed ? <p className="mt-1 text-sm text-muted">Välj tid för att bara se platser som är lediga då och få totalpriset.</p> : null}
          {timed ? <p className="mt-1 text-sm text-muted">Pris för {formatDuration(Math.round((end!.getTime() - start!.getTime()) / 60000))}, inklusive serviceavgift.</p> : null}
        </div>

        {outcome.results.length === 0 ? (
          <div className="card p-5 text-ink-soft">
            <p>Prova en annan tid, ett större område eller en närliggande stad.</p>
            <p className="mt-2">
              Har du själv en plats här?{" "}
              <Link href="/hyr-ut" className="link">
                Hyr ut den på Parklet
              </Link>
              .
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {outcome.results.map((r) => (
              <li key={r.id}>
                <Link href={`/plats/${r.id}${qs}`} className="card block p-4 transition-shadow hover:shadow-md" data-testid="search-result">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate font-semibold">{r.title}</h2>
                      <p className="truncate text-sm text-ink-soft">
                        {r.address}, {r.city}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      {r.price ? (
                        <>
                          <p className="font-bold">{formatSek(r.price.totalOre)}</p>
                          <p className="text-xs text-muted">totalt</p>
                        </>
                      ) : (
                        <>
                          <p className="font-bold">{formatSek(r.pricePerHourOre)}</p>
                          <p className="text-xs text-muted">per timme</p>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                    {r.distanceM != null ? <span className="font-medium text-ink-soft">{formatDistance(r.distanceM)} bort</span> : null}
                    {spotFeatures(r).map((f) => (
                      <span key={f}>{f}</span>
                    ))}
                    {r.pricePerDayOre ? <span>Max {formatSek(r.pricePerDayOre)}/dygn</span> : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="order-first h-72 overflow-hidden rounded-[var(--radius-card)] border border-line lg:sticky lg:top-20 lg:order-none lg:h-[calc(100vh-7rem)]">
        <SpotMap spots={mapSpots} center={center} />
      </div>
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[26rem_1fr]" aria-busy>
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card h-24 animate-pulse" />
        ))}
      </div>
      <div className="card h-72 animate-pulse lg:h-[calc(100vh-7rem)]" />
    </div>
  );
}
