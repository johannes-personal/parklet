/**
 * Renders the dark Stockholm map behind the site (public/map/*.webp).
 *
 * The map is drawn once with MapLibre GL from OpenFreeMap's OpenStreetMap
 * vector tiles and saved as static images, so visitors download two small
 * WebP files instead of a map library and hundreds of tiles.
 *
 *   node --import tsx scripts/render-map-background.mts
 *
 * Needs network access to unpkg.com and tiles.openfreemap.org.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const MAPLIBRE = "https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.js";
const STYLE = "https://tiles.openfreemap.org/styles/dark";
// Strömmen, between Norrmalm and Gamla stan – the same view as parklet.se.
const CENTER: [number, number] = [18.0705, 59.3285];
const PIXEL_RATIO = 1.5;

const VARIANTS = [
  { name: "stockholm-wide", width: 1920, height: 1200, zoom: 14.1 },
  { name: "stockholm-tall", width: 1000, height: 1600, zoom: 13.9 },
];

// Palette sampled from parklet.se's Mapbox dark map.
const COLORS = {
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

const outDir = new URL("../public/map/", import.meta.url);
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  for (const v of VARIANTS) {
    const page = await browser.newPage({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><style>html,body,#map{margin:0;width:100%;height:100%}</style><div id="map"></div><script src="${MAPLIBRE}"></script>`);
    await page.waitForFunction(() => "maplibregl" in window);
    const dataUrl = await page.evaluate(
      async ({ style, center, zoom, colors, pixelRatio }) => {
        const s = await (await fetch(style)).json();
        const paint: Record<string, Record<string, unknown>> = {
          background: { "background-color": colors.land },
          water: { "fill-color": colors.water },
          landuse_park: { "fill-color": colors.park, "fill-opacity": 1 },
          landcover_wood: { "fill-color": colors.park, "fill-opacity": 1 },
          landuse_residential: { "fill-color": colors.land, "fill-opacity": 0 },
          waterway: { "line-color": colors.water },
          building: { "fill-color": colors.building, "fill-outline-color": colors.building },
          highway_path: { "line-color": colors.road },
          highway_minor: { "line-color": colors.road },
          highway_major_casing: { "line-color": colors.land },
          highway_major_inner: { "line-color": colors.roadMajor },
          highway_major_subtle: { "line-color": colors.roadMajor },
          highway_motorway_casing: { "line-color": colors.land },
          highway_motorway_inner: { "line-color": colors.roadMajor },
          highway_motorway_subtle: { "line-color": colors.roadMajor },
          railway: { "line-color": colors.rail },
          railway_transit: { "line-color": colors.rail },
          railway_minor: { "line-color": colors.rail },
        };
        const hidden = /oneway|boundary|aeroway|dashline|country|state|ice|glacier/;
        s.layers = s.layers
          .filter((l: { id: string }) => !hidden.test(l.id))
          .map((l: { id: string; type: string; filter?: unknown; paint?: object; layout?: object }) => {
            const p = { ...l.paint, ...paint[l.id] };
            if (l.type !== "symbol") return { ...l, paint: p };
            Object.assign(p, { "text-color": colors.label, "text-halo-color": colors.labelHalo, "text-halo-width": 1.2 });
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
        type MapLike = { once(event: "idle", cb: () => void): void; getCanvas(): HTMLCanvasElement };
        const maplibregl = (window as unknown as { maplibregl: { Map: new (options: object) => MapLike } }).maplibregl;
        const map = new maplibregl.Map({
          container: "map",
          style: s,
          center,
          zoom,
          pixelRatio,
          interactive: false,
          attributionControl: false,
          fadeDuration: 0,
          canvasContextAttributes: { preserveDrawingBuffer: true },
        });
        await new Promise<void>((resolve) => map.once("idle", () => resolve()));
        return map.getCanvas().toDataURL("image/webp", 0.82);
      },
      { style: STYLE, center: CENTER, zoom: v.zoom, colors: COLORS, pixelRatio: PIXEL_RATIO },
    );
    const file = new URL(`${v.name}.webp`, outDir);
    const bytes = Buffer.from(dataUrl.split(",")[1], "base64");
    await writeFile(file, bytes);
    console.log(`${file.pathname} ${Math.round(bytes.length / 1024)} kB`);
    await page.close();
  }
} finally {
  await browser.close();
}
