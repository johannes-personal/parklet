import "server-only";
import { SWEDEN_BBOX, type LatLng } from "@/lib/geo";

export type Place = { label: string; detail: string; lat: number; lng: number; city: string | null };

const base = () => process.env.GEOCODER_URL ?? "https://photon.komoot.io";

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | undefined>;
};

function toPlace(f: PhotonFeature): Place {
  const p = f.properties;
  const street = p.street ? `${p.street}${p.housenumber ? " " + p.housenumber : ""}` : null;
  const label = p.name && p.name !== p.street ? p.name : (street ?? p.city ?? p.name ?? "Okänd plats");
  const city = p.city ?? p.town ?? p.village ?? p.county ?? null;
  const detail = [street && street !== label ? street : null, p.postcode, city].filter(Boolean).join(", ");
  return { label, detail, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], city };
}

/** Forward geocoding restricted to Sweden. Never throws: returns [] if the geocoder is unavailable. */
export async function geocode(query: string, near?: LatLng): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = new URL("/api/", base());
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "6");
  url.searchParams.set("bbox", `${SWEDEN_BBOX.minLng},${SWEDEN_BBOX.minLat},${SWEDEN_BBOX.maxLng},${SWEDEN_BBOX.maxLat}`);
  if (near) {
    url.searchParams.set("lat", String(near.lat));
    url.searchParams.set("lon", String(near.lng));
  }
  return fetchPlaces(url);
}

export async function reverseGeocode({ lat, lng }: LatLng): Promise<Place | null> {
  const url = new URL("/reverse", base());
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("limit", "1");
  return (await fetchPlaces(url))[0] ?? null;
}

async function fetchPlaces(url: URL): Promise<Place[]> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "parklet-mvp (+https://www.parklet.se)" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { features?: PhotonFeature[] };
    return (json.features ?? []).filter((f) => f.properties.countrycode === "SE" || !f.properties.countrycode).map(toPlace);
  } catch {
    return [];
  }
}
