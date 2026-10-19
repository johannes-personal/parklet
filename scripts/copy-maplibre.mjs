// MapLibre starts its web worker from a URL next to its own module file, which
// bundlers can't follow. So the browser loads MapLibre from /maplibre/ instead
// of from the bundle: the map and its worker then share one download of
// maplibre-gl-shared.mjs. Runs after `npm install`.
import { copyFile, mkdir } from "node:fs/promises";

const from = new URL("../node_modules/maplibre-gl/dist/", import.meta.url);
const to = new URL("../public/maplibre/", import.meta.url);
await mkdir(to, { recursive: true });
for (const file of ["maplibre-gl.mjs", "maplibre-gl-shared.mjs", "maplibre-gl-worker.mjs"]) {
  await copyFile(new URL(file, from), new URL(file, to));
}
