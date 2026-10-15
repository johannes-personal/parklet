import "server-only";
import { and, desc, eq, gt, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { availabilityWindows, bookings, hostAccounts, spots, type Spot } from "@/db/schema";
import { isWithinWindows, type AvailabilityWindow } from "@/lib/availability";
import { boundingBox, distanceMeters, type LatLng } from "@/lib/geo";
import { calculatePrice, type PriceBreakdown } from "@/lib/pricing";
import { bookableSql } from "./spots";

export const DEFAULT_RADIUS_M = 3000;
export const WIDE_RADIUS_M = 15000;
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
  radiusM: number | null;
  widened: boolean;
};

export async function searchSpots(opts: { center: LatLng | null; start: Date | null; end: Date | null }): Promise<SearchOutcome> {
  const { center, start, end } = opts;
  if (!center) {
    return { results: await runSearch(null, null, start, end), radiusM: null, widened: false };
  }
  const near = await runSearch(center, DEFAULT_RADIUS_M, start, end);
  if (near.length > 0) return { results: near, radiusM: DEFAULT_RADIUS_M, widened: false };
  return { results: await runSearch(center, WIDE_RADIUS_M, start, end), radiusM: WIDE_RADIUS_M, widened: true };
}

async function runSearch(center: LatLng | null, radiusM: number | null, start: Date | null, end: Date | null) {
  const conditions = [bookableSql, eq(spots.visibility, "public")];
  if (center && radiusM) {
    const box = boundingBox(center, radiusM);
    conditions.push(gte(spots.lat, box.minLat), lte(spots.lat, box.maxLat), gte(spots.lng, box.minLng), lte(spots.lng, box.maxLng));
  }
  const candidates = await db
    .select({
      id: spots.id,
      title: spots.title,
      address: spots.address,
      city: spots.city,
      lat: spots.lat,
      lng: spots.lng,
      spotType: spots.spotType,
      covered: spots.covered,
      evCharging: spots.evCharging,
      pricePerHourOre: spots.pricePerHourOre,
      pricePerDayOre: spots.pricePerDayOre,
      minDurationMinutes: spots.minDurationMinutes,
      minNoticeMinutes: spots.minNoticeMinutes,
    })
    .from(spots)
    .innerJoin(hostAccounts, eq(hostAccounts.id, spots.hostAccountId))
    .where(and(...conditions))
    .orderBy(desc(spots.createdAt))
    .limit(500);

  let rows = candidates.map((c) => ({ ...c, distanceM: center ? distanceMeters(center, c) : null }));
  if (center && radiusM) rows = rows.filter((r) => r.distanceM! <= radiusM);

  if (start && end && end > start && rows.length) {
    const ids = rows.map((r) => r.id);
    const [windows, busy] = await Promise.all([
      db.select().from(availabilityWindows).where(inArray(availabilityWindows.spotId, ids)),
      db
        .selectDistinct({ spotId: bookings.spotId })
        .from(bookings)
        .where(and(inArray(bookings.spotId, ids), inArray(bookings.status, ["confirmed", "pending_payment"]), lt(bookings.startsAt, end), gt(bookings.endsAt, start), sql`(${bookings.status} = 'confirmed' OR ${bookings.holdExpiresAt} > now())`)),
    ]);
    const busyIds = new Set(busy.map((b) => b.spotId));
    const bySpot = new Map<string, AvailabilityWindow[]>();
    for (const w of windows) bySpot.set(w.spotId, [...(bySpot.get(w.spotId) ?? []), w]);
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

