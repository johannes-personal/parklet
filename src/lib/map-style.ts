/**
 * Parklet's dark map: OpenFreeMap's "dark" style (OpenStreetMap data, free,
 * no key, commercial use allowed) recoloured to match parklet.se's Mapbox map.
 * Used by the interactive maps and by scripts/render-map-background.mts.
 */

export const MAP_STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/dark";

// Palette sampled from parklet.se's Mapbox dark map.
export const MAP_COLORS = {
  land: "#292929",
  water: "#1e1e1e",
  park: "#2c2f2c",
  building: "#303030",
  road: "#3b3b3b",
  roadMajor: "#444444",
  rail: "#353535",
  label: "#8a8a8a",
  labelHalo: "#1e1e1e",
};

type Layer = { id: string; type: string; filter?: unknown; paint?: Record<string, unknown>; layout?: Record<string, unknown> };
type Style = { layers: Layer[] } & Record<string, unknown>;

/** Recolour a fetched style. `labelColor` lets the interactive maps use brighter labels than the background. */
export function darkMapStyle<S extends Style>(style: S, { labelColor = MAP_COLORS.label } = {}): S {
  const c = MAP_COLORS;
  const paint: Record<string, Record<string, unknown>> = {
    background: { "background-color": c.land },
    water: { "fill-color": c.water },
    landuse_park: { "fill-color": c.park, "fill-opacity": 1 },
    landcover_wood: { "fill-color": c.park, "fill-opacity": 1 },
    landuse_residential: { "fill-color": c.land, "fill-opacity": 0 },
    waterway: { "line-color": c.water },
    building: { "fill-color": c.building, "fill-outline-color": c.building },
    highway_path: { "line-color": c.road },
    highway_minor: { "line-color": c.road },
    highway_major_casing: { "line-color": c.land },
    highway_major_inner: { "line-color": c.roadMajor },
    highway_major_subtle: { "line-color": c.roadMajor },
    highway_motorway_casing: { "line-color": c.land },
    highway_motorway_inner: { "line-color": c.roadMajor },
    highway_motorway_subtle: { "line-color": c.roadMajor },
    railway: { "line-color": c.rail },
    railway_transit: { "line-color": c.rail },
    railway_minor: { "line-color": c.rail },
  };
  const hidden = /oneway|boundary|aeroway|dashline|country|state|ice|glacier/;
  const layers = style.layers
    .filter((l) => !hidden.test(l.id))
    .map((l) => {
      const p = { ...l.paint, ...paint[l.id] };
      if (l.type !== "symbol") return { ...l, paint: p };
      Object.assign(p, { "text-color": labelColor, "text-halo-color": c.labelHalo, "text-halo-width": 1.2 });
      // Swedish names, mixed case for streets and italic for water, as on the original.
      const layout: Record<string, unknown> = { ...l.layout, "text-field": ["get", "name"] };
      let filter = l.filter;
      if (l.id === "highway_name_other") {
        layout["text-transform"] = "none";
        filter = ["all", filter, ["!=", ["get", "class"], "ferry"]];
      }
      if (l.id === "water_name") layout["text-font"] = ["Noto Sans Italic"];
      return { ...l, filter, layout, paint: p };
    });
  return { ...style, layers };
}
