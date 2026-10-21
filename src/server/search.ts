import "server-only";
import { api, cols, embed, must, names, rpc } from "@/db/api";
import { hostAccounts, spots, type Spot } from "@/db/schema";
import { isWithinWindows, type AvailabilityWindow } from "@/lib/availability";
import { boundingBox, distanceMeters, type LatLng } from "@/lib/geo";
import { calculatePrice, type PriceBreakdown } from "@/lib/pricing";
import { BOOKABLE_FILTERS } from "./spots";

const S = names(spots);
const CANDIDATE_KEYS = [
  "id",
  "title",
  "address",
  "city",
  "lat",
  "lng",
  "spotType",
  "covered",
  "evCharging",
  "pricePerHourOre",
  "pricePerDayOre",
  "minDurationMinutes",
  "minNoticeMinutes",
] as const;
type Candidate = Pick<Spot, (typeof CANDIDATE_KEYS)[number]>;

export const DEFAULT_RADIUS_M = 3000;
/** Wider and wider circles when nothing is found nearby; null means anywhere (the closest spots). */
const WIDER_RADII_M = [15_000, 100_000, null] as const;
/** How many spots "the closest" shows when there are none in the wider circles. */
const NEAREST_ANYWHERE = 10;
const MAX_RESULTS = 100;

export type SearchResult = Pick<
  Spot,
  "id" | "title" | "address" | "city" | "lat" | "lng" | "spotType" | "covered" | "evCharging" | "pricePerHourOre" | "pricePerDayOre"
> & {
  distanceM: number | null;
  /** Only set when a time range was searched. */
  price: PriceBreakdown | null;
};

export type SearchOutcome = {
  results: SearchResult[];
  /** The circle the results come from: null without a centre, or when they are simply the closest spots. */
  radiusM: number | null;
  /** True when nothing was found within DEFAULT_RADIUS_M and the search looked further. */
  widened: boolean;
};

export async function searchSpots(opts: { center: LatLng | null; start: Date | null; end: Date | null }): Promise<SearchOutcome> {
  const { center, start, end } = opts;
  if (!center) {
    return { results: await runSearch(null, null, start, end), radiusM: null, widened: false };
  }
  const near = await runSearch(center, DEFAULT_RADIUS_M, start, end);
  if (near.length > 0) return { results: near, radiusM: DEFAULT_RADIUS_M, widened: false };
  // Nothing close: look further, and in the end show the closest spots wherever they are,
  // so a town without spots still gets an answer.
  for (const radiusM of WIDER_RADII_M) {
    const results = await runSearch(center, radiusM, start, end);
    if (results.length > 0) return { results: radiusM ? results : results.slice(0, NEAREST_ANYWHERE), radiusM, widened: true };
  }
  return { results: [], radiusM: null, widened: true };
}

async function runSearch(center: LatLng | null, radiusM: number | null, start: Date | null, end: Date | null) {
  let query = api()
    .from("spots")
    .select(`${cols(spots, CANDIDATE_KEYS)},${embed("account", hostAccounts, ["id"], { inner: true })}`)
    .eq(S.visibility, "public");
  for (const [column, value] of BOOKABLE_FILTERS) query = query.eq(column, value);
  if (center && radiusM) {
    const box = boundingBox(center, radiusM);
    query = query.gte(S.lat, box.minLat).lte(S.lat, box.maxLat).gte(S.lng, box.minLng).lte(S.lng, box.maxLng);
  }
  const candidates = must<(Candidate & { account?: unknown })[]>(await query.order(S.createdAt, { ascending: false }).limit(500), "searchSpots");

  let rows = candidates.map(({ account, ...c }) => (void account, { ...c, distanceM: center ? distanceMeters(center, c) : null }));
  if (center && radiusM) rows = rows.filter((r) => r.distanceM! <= radiusM);

  if (start && end && end > start && rows.length) {
    // One call for all candidates: their opening hours and which are taken in the period.
    const availability = await rpc<{ windows: { spot_id: string; weekday: number; start_minute: number; end_minute: number }[]; busy: string[] }>(
      "parklet_search_availability",
      { p_spot_ids: rows.map((r) => r.id), p_start: start.toISOString(), p_end: end.toISOString() },
    );
    const busyIds = new Set(availability.busy);
    const bySpot = new Map<string, AvailabilityWindow[]>();
    for (const w of availability.windows) {
      bySpot.set(w.spot_id, [...(bySpot.get(w.spot_id) ?? []), { weekday: w.weekday, startMinute: w.start_minute, endMinute: w.end_minute }]);
    }
    const minutes = (end.getTime() - start.getTime()) / 60_000;
    const now = Date.now();
    rows = rows.filter(
      (r) =>
        !busyIds.has(r.id) &&
        minutes >= r.minDurationMinutes &&
        start.getTime() >= now + r.minNoticeMinutes * 60_000 - 10 * 60_000 &&
        isWithinWindows(bySpot.get(r.id) ?? [], start, end),
    );
  }

  if (center) rows.sort((a, b) => a.distanceM! - b.distanceM!);
  return rows.slice(0, MAX_RESULTS).map((r) => ({
    id: r.id,
    title: r.title,
    address: r.address,
    city: r.city,
    lat: r.lat,
    lng: r.lng,
    spotType: r.spotType,
    covered: r.covered,
    evCharging: r.evCharging,
    pricePerHourOre: r.pricePerHourOre,
    pricePerDayOre: r.pricePerDayOre,
    distanceM: r.distanceM,
    price:
      start && end && end > start
        ? calculatePrice({ start, end, pricePerHourOre: r.pricePerHourOre, pricePerDayOre: r.pricePerDayOre })
        : null,
  }));
}

