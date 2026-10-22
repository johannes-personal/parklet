/**
 * A spot's link: the search map around it, with the spot open in the side panel. Spots
 * have no pages of their own; /plats/<id> (old links, e-mails) redirects here.
 */
export function spotHref(spot: { id: string; lat: number; lng: number; city: string }, times?: { from?: string; to?: string }) {
  const p = new URLSearchParams({ q: spot.city, lat: String(spot.lat), lng: String(spot.lng) });
  if (times?.from && times.to) {
    p.set("from", times.from);
    p.set("to", times.to);
  }
  p.set("plats", spot.id);
  return `/sok?${p}`;
}
