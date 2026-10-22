import { expect, test } from "vitest";
import { filtersFromParams, setFilterParams } from "@/lib/search-filters";

test("search filters round-trip through the URL and ignore junk", () => {
  expect(filtersFromParams({ typ: "garage,carport,boat,garage", el: "1", tak: "0" })).toEqual({ types: ["garage", "carport"], ev: true, covered: false });
  const p = new URLSearchParams("q=Malm%C3%B6&typ=outdoor&plats=x");
  setFilterParams(p, { types: ["carport"], ev: false, covered: true });
  expect(p.toString()).toBe("q=Malm%C3%B6&plats=x&typ=carport&tak=1");
  setFilterParams(p, { types: [], ev: false, covered: false });
  expect(p.toString()).toBe("q=Malm%C3%B6&plats=x");
});
