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
import { MAP_CENTER, MAP_VARIANTS } from "../src/lib/map-backdrop";
import { darkMapStyle, MAP_STYLE_URL } from "../src/lib/map-style";

const MAPLIBRE = "https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.js";
const CENTER: [number, number] = [MAP_CENTER.lng, MAP_CENTER.lat];
const PIXEL_RATIO = 1.5;
const VARIANTS = Object.values(MAP_VARIANTS).map((v) => ({ ...v, name: v.file }));

const outDir = new URL("../public/map/", import.meta.url);
await mkdir(outDir, { recursive: true });

const style = darkMapStyle(await (await fetch(MAP_STYLE_URL)).json());

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  for (const v of VARIANTS) {
    const page = await browser.newPage({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><style>html,body,#map{margin:0;width:100%;height:100%}</style><div id="map"></div><script src="${MAPLIBRE}"></script>`);
    await page.waitForFunction(() => "maplibregl" in window);
    const dataUrl = await page.evaluate(
      async ({ style, center, zoom, pixelRatio }) => {
        type MapLike = { once(event: "idle", cb: () => void): void; getCanvas(): HTMLCanvasElement };
        const maplibregl = (window as unknown as { maplibregl: { Map: new (options: object) => MapLike } }).maplibregl;
        const map = new maplibregl.Map({
          container: "map",
          style,
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
      { style, center: CENTER, zoom: v.zoom, pixelRatio: PIXEL_RATIO },
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
