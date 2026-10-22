import { afterAll, beforeEach, expect, it } from "vitest";
import { searchSpots } from "@/server/search";
import { closeDb } from "./direct-db";
import { makeBookableSpot, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(async () => {
  await closeDb();
});

it("filters the search on the spot's type, a roof and EV charging", async () => {
  const garage = (await makeBookableSpot({ title: "Garaget", spotType: "garage" })).spotId;
  const carportEv = (await makeBookableSpot({ title: "Carporten", spotType: "carport", evCharging: true })).spotId;
  const coveredOutdoor = (await makeBookableSpot({ title: "Taket", spotType: "outdoor", covered: true })).spotId;
  const open = (await makeBookableSpot({ title: "Öppet", spotType: "outdoor" })).spotId;
  const center = { lat: 57.7, lng: 11.97 };
  const ids = async (filters: Parameters<typeof searchSpots>[0]["filters"]) =>
    (await searchSpots({ center, start: null, end: null, filters })).results.map((r) => r.id).sort();

  expect(await ids(undefined)).toEqual([garage, carportEv, coveredOutdoor, open].sort());
  expect(await ids({ types: ["garage"], ev: false, covered: false })).toEqual([garage]);
  expect(await ids({ types: ["garage", "carport"], ev: false, covered: false })).toEqual([garage, carportEv].sort());
  expect(await ids({ types: [], ev: true, covered: false })).toEqual([carportEv]);
  // Garages and carports have a roof whatever the box says.
  expect(await ids({ types: [], ev: false, covered: true })).toEqual([garage, carportEv, coveredOutdoor].sort());
  expect(await ids({ types: ["outdoor"], ev: false, covered: true })).toEqual([coveredOutdoor]);
  // "Andra parkeringsplatser" honour the filters too: nothing further away is an EV garage.
  expect((await searchSpots({ center, start: null, end: null, filters: { types: ["garage"], ev: true, covered: false } })).others).toEqual([]);
});
