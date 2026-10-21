import { afterAll, expect, test, vi } from "vitest";
import { geocode } from "@/server/geocode";

// Photon's answer for a named place and for a plain street address.
const features = [
  { geometry: { coordinates: [12.9773, 55.5652] }, properties: { countrycode: "SE", name: "Malmö Arena", street: "Hyllie Stationstorg", housenumber: "2", postcode: "215 32", city: "Malmö" } },
  { geometry: { coordinates: [11.9532, 57.6994] }, properties: { countrycode: "SE", street: "Vegagatan", housenumber: "12", postcode: "413 11", city: "Göteborg" } },
  { geometry: { coordinates: [11.9746, 57.7089] }, properties: { countrycode: "SE", name: "Göteborg", city: "Göteborg" } },
];
vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ features }), { status: 200, headers: { "content-type": "application/json" } }));
afterAll(() => {
  vi.unstubAllGlobals();
});

test("a place has its street and its whole address, with postnummer and postort", async () => {
  const [arena, street, city] = await geocode("malmö arena");
  expect(arena).toMatchObject({ label: "Malmö Arena", street: "Hyllie Stationstorg 2", full: "Malmö Arena, Hyllie Stationstorg 2, 215 32 Malmö", city: "Malmö" });
  expect(street).toMatchObject({ label: "Vegagatan 12", street: "Vegagatan 12", full: "Vegagatan 12, 413 11 Göteborg" });
  // A town isn't repeated: "Göteborg", not "Göteborg, Göteborg".
  expect(city).toMatchObject({ label: "Göteborg", street: null, full: "Göteborg" });
});
