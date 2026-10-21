import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { SearchForm } from "@/components/search-form";
import { SpotMap, type MapSpot } from "@/components/map/spot-map";
import { loadSpotForViewer, SpotBooking, SpotFacts, SpotHeading } from "@/components/spot/spot-details";
import { formatDistance } from "@/lib/geo";
import { spotFeatures } from "@/lib/labels";
import { formatSek } from "@/lib/money";
import { formatDuration, formatRange, isPast, parseLocalDateTime } from "@/lib/time";
import { geocode } from "@/server/geocode";
import { isUuid } from "@/server/ids";
import { searchSpots } from "@/server/search";
import { ListPanel, SpotPanel } from "./panels";

export const metadata: Metadata = { title: "Hitta parkering" };

type SP = PageProps<"/sok">["searchParams"];

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * The search is a full-size map with the results floating over it. Choosing a
 * spot (in the list or on the map) adds `plats=<id>` to the URL and opens it
 * in a panel over the map, so drivers can compare spots without leaving the
 * page; the link still works on its own and Back closes the panel.
 */
export default function SearchPage({ searchParams }: PageProps<"/sok">) {
  return (
    // Pulled up under the floating header; the footer is hidden on this page (globals.css).
    <div data-map-page className="relative -mt-[4.25rem] h-dvh min-h-[34rem] sm:-mt-[4.5rem]">
      <Suspense fallback={<MapSkeleton />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Results({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  // Availability depends on the current time and live bookings.
  await connection();
  const q = one(sp.q)?.slice(0, 120);
  const fromRaw = one(sp.from);
  const toRaw = one(sp.to);
  const plats = one(sp.plats);
  const selected = plats && isUuid(plats) ? plats : null;
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
  // Times that have already passed (an old or shared link) are ignored, as in the pickers.
  const timed = Boolean(start && end && end > start && !isPast(start));
  const outcome = await searchSpots({ center, start: timed ? start : null, end: timed ? end : null });

  // The search URL with or without a selected spot.
  const base = new URLSearchParams();
  if (q) base.set("q", q);
  if (center) {
    base.set("lat", String(center.lat));
    base.set("lng", String(center.lng));
  }
  if (timed) {
    base.set("from", fromRaw!);
    base.set("to", toRaw!);
  }
  const hrefFor = (id: string | null) => {
    const p = new URLSearchParams(base);
    if (id) p.set("plats", id);
    return `/sok?${p.toString()}`;
  };

  const mapSpots: MapSpot[] = outcome.results.map((r) => ({
    id: r.id,
    lat: r.lat,
    lng: r.lng,
    title: r.title,
    href: hrefFor(r.id),
    label: r.price ? formatSek(r.price.totalOre) : `${formatSek(r.pricePerHourOre)}/h`,
  }));

  const summary = (
    <div aria-live="polite">
      <h1 className="font-bold">
        {outcome.results.length === 0
          ? "Inga lediga platser hittades"
          : `${outcome.results.length} ${outcome.results.length === 1 ? "plats" : "platser"}${timed ? " lediga hela tiden" : ""}`}
      </h1>
      <p className="truncate text-sm text-muted">
        {q ?? "Alla platser"}
        {timed ? ` · ${formatRange(start!, end!)}` : ""}
      </p>
    </div>
  );

  return (
    <>
      <div className="absolute inset-0">
        <SpotMap
          spots={mapSpots}
          center={center}
          activeId={selected}
          // Header and list panel always; the spot panel when one is open (see ./panels.tsx).
          insets={{
            narrow: { top: 72, right: 0, bottom: 130, left: 0 },
            wide: { top: 90, right: selected ? 432 : 0, bottom: 0, left: 410 },
          }}
          className="min-h-0"
        />
      </div>
      <div className="pointer-events-none absolute inset-0">
        <ListPanel summary={summary}>
          <details className="group border-b border-line" open={!center && !timed}>
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-ink hover:bg-canvas [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">Ändra sökning</span>
              <span className="hidden group-open:inline">Dölj sökningen</span>
            </summary>
            <div className="px-4 pb-4">
              <SearchForm compact initial={{ q, lat: center?.lat, lng: center?.lng, from: timed ? fromRaw : undefined, to: timed ? toRaw : undefined }} />
            </div>
          </details>
          <div className="space-y-3 p-3">
            {outcome.widened && outcome.results.length > 0 ? (
              <p className="px-1 text-sm text-warn">
                {outcome.radiusM
                  ? `Inga ${timed ? "lediga " : ""}platser inom 3 km – visar platser inom ${outcome.radiusM / 1000} km.`
                  : `Inga ${timed ? "lediga " : ""}platser i närheten – visar de närmaste.`}
              </p>
            ) : null}
            {!timed ? <p className="px-1 text-sm text-muted">Välj tid för att bara se platser som är lediga då och få totalpriset.</p> : null}
            {timed ? (
              <p className="px-1 text-sm text-muted">Pris för {formatDuration(Math.round((end!.getTime() - start!.getTime()) / 60000))}, inklusive serviceavgift.</p>
            ) : null}
            {outcome.results.length === 0 ? (
              <div className="px-1 text-ink-soft">
                <p>Prova en annan tid, ett större område eller en närliggande stad.</p>
                <p className="mt-2">
                  Har du själv en plats här?{" "}
                  <Link href="/uthyrare" className="link">
                    Hyr ut den på Parklet
                  </Link>
                  .
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {outcome.results.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={hrefFor(r.id)}
                      scroll={false}
                      aria-current={r.id === selected ? "true" : undefined}
                      className="block rounded-xl border border-line p-3 transition-colors hover:border-line-strong hover:bg-canvas aria-[current]:border-ink aria-[current]:bg-canvas"
                      data-testid="search-result"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="truncate font-semibold">{r.title}</h2>
                          <p className="truncate text-sm text-ink-soft">
                            {r.address}, {r.city}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-bold">{formatSek(r.price ? r.price.totalOre : r.pricePerHourOre)}</p>
                          <p className="text-xs text-muted">{r.price ? "totalt" : "per timme"}</p>
                        </div>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
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
        </ListPanel>
        {selected ? (
          <Suspense key={selected} fallback={<SpotPanelSkeleton closeHref={hrefFor(null)} />}>
            <SelectedSpot id={selected} closeHref={hrefFor(null)} returnTo={hrefFor(selected)} from={timed ? fromRaw : undefined} to={timed ? toRaw : undefined} />
          </Suspense>
        ) : null}
      </div>
    </>
  );
}

async function SelectedSpot({ id, closeHref, returnTo, from, to }: { id: string; closeHref: string; returnTo: string; from?: string; to?: string }) {
  const data = await loadSpotForViewer(id);
  if (!data) {
    return (
      <SpotPanel title="Platsen hittades inte" closeHref={closeHref}>
        <p className="text-ink-soft">Platsen finns inte eller kan inte bokas längre.</p>
      </SpotPanel>
    );
  }
  return (
    <SpotPanel title={data.spot.title} closeHref={closeHref} shareHref={`/plats/${id}${from && to ? `?${new URLSearchParams({ from, to })}` : ""}`}>
      <div className="space-y-6">
        <SpotHeading spot={data.spot} level={2} />
        <div className="rounded-2xl border border-line p-4">
          <SpotBooking data={data} from={from} to={to} returnTo={returnTo} />
        </div>
        <SpotFacts spot={data.spot} account={data.account} busy={data.busy} />
        <Link href={`/plats/${id}`} className="link text-sm">
          Öppna platsens egen sida
        </Link>
      </div>
    </SpotPanel>
  );
}

function SpotPanelSkeleton({ closeHref }: { closeHref: string }) {
  return (
    <SpotPanel title="Laddar platsen" closeHref={closeHref}>
      <div className="space-y-4" aria-busy>
        <div className="h-8 w-2/3 animate-pulse rounded bg-canvas" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-canvas" />
        <div className="h-64 animate-pulse rounded-2xl bg-canvas" />
      </div>
    </SpotPanel>
  );
}

function MapSkeleton() {
  return <div className="absolute inset-0 animate-pulse bg-[#1f1f1f]" aria-busy />;
}
