import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/lib/auth/rate-limit";
import { geocode, reverseGeocode } from "@/server/geocode";

/** Address search proxy: keeps the geocoder swappable and lets us cache and rate limit in one place. */
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`geocode:${ip}`, 60, 60_000)) return NextResponse.json({ places: [] }, { status: 429 });
  const q = req.nextUrl.searchParams.get("q");
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  const near = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 ? { lat, lng } : undefined;

  if (q) {
    const places = await geocode(q.slice(0, 120), near);
    return NextResponse.json({ places }, { headers: { "Cache-Control": "public, max-age=3600" } });
  }
  if (near) {
    const place = await reverseGeocode(near);
    return NextResponse.json({ places: place ? [place] : [] });
  }
  return NextResponse.json({ places: [] });
}
