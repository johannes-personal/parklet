export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_M = 6_371_000;

export function distanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Bounding box around a point, used to hit the (lat, lng) index before exact distance filtering. */
export function boundingBox({ lat, lng }: LatLng, radiusMeters: number) {
  const dLat = (radiusMeters / EARTH_RADIUS_M) * (180 / Math.PI);
  const dLng = dLat / Math.cos((lat * Math.PI) / 180);
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0).replace(".", ",")} km`;
}

/** Rough bounding box of Sweden, used to sanity check coordinates and bias geocoding. */
export const SWEDEN_BBOX = { minLat: 55.0, maxLat: 69.1, minLng: 10.5, maxLng: 24.2 };

export function isInSweden({ lat, lng }: LatLng): boolean {
  return lat >= SWEDEN_BBOX.minLat && lat <= SWEDEN_BBOX.maxLat && lng >= SWEDEN_BBOX.minLng && lng <= SWEDEN_BBOX.maxLng;
}

export const CITIES = [
  { slug: "goteborg", name: "Göteborg", lat: 57.7089, lng: 11.9746 },
  { slug: "stockholm", name: "Stockholm", lat: 59.3293, lng: 18.0686 },
  { slug: "malmo", name: "Malmö", lat: 55.605, lng: 13.0038 },
  { slug: "uppsala", name: "Uppsala", lat: 59.8586, lng: 17.6389 },
] as const;
