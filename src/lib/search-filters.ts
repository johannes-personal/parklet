import type { SpotType } from "@/db/schema";

/**
 * What a driver can filter the search on: the spot's type and the features shown as
 * tags on each result. In the URL as `typ=garage,carport`, `el=1` and `tak=1`.
 */
export type SearchFilters = { types: SpotType[]; ev: boolean; covered: boolean };

export const SPOT_TYPES: readonly SpotType[] = ["garage", "carport", "driveway", "outdoor"];
export const NO_FILTERS: SearchFilters = { types: [], ev: false, covered: false };

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function filtersFromParams(sp: Params): SearchFilters {
  const types = (one(sp.typ) ?? "")
    .split(",")
    .filter((t): t is SpotType => (SPOT_TYPES as readonly string[]).includes(t));
  return { types: [...new Set(types)], ev: one(sp.el) === "1", covered: one(sp.tak) === "1" };
}

/** Writes the filters into search parameters (removing the ones not set). */
export function setFilterParams(p: URLSearchParams, f: SearchFilters) {
  p.delete("typ");
  p.delete("el");
  p.delete("tak");
  if (f.types.length) p.set("typ", f.types.join(","));
  if (f.ev) p.set("el", "1");
  if (f.covered) p.set("tak", "1");
}

export const hasFilters = (f: SearchFilters) => f.types.length > 0 || f.ev || f.covered;

/** A spot has a roof when it says so, and garages and carports always have one. */
export function matchesFilters(s: { spotType: SpotType; covered: boolean; evCharging: boolean }, f: SearchFilters) {
  if (f.types.length && !f.types.includes(s.spotType)) return false;
  if (f.ev && !s.evCharging) return false;
  if (f.covered && !(s.covered || s.spotType === "garage" || s.spotType === "carport")) return false;
  return true;
}
