"use client";

import type * as MapLibre from "maplibre-gl";
import { darkMapStyle, MAP_STYLE_URL } from "@/lib/map-style";

export type { MapLibre };

const MAPLIBRE_URL = "/maplibre/maplibre-gl.mjs";

let promise: Promise<{ maplibregl: typeof MapLibre; style: MapLibre.StyleSpecification | string }> | null = null;

/**
 * MapLibre and Parklet's dark style, loaded once in the browser only. If the
 * style can't be fetched the map still works, as a plain dark background
 * with its pins.
 */
export function loadMap() {
  promise ??= Promise.all([
    // Served from public/ (scripts/copy-maplibre.mjs) so it can find its worker; see there.
    import(/* webpackIgnore: true */ /* turbopackIgnore: true */ MAPLIBRE_URL) as Promise<typeof MapLibre>,
    fetch(MAP_STYLE_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((s) => darkMapStyle(s, { labelColor: "#a3a3a3" }))
      .catch((err) => {
        console.warn("map: style unavailable, showing a plain background", err);
        return { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#292929" } }] };
      }),
  ]).then(([maplibregl, style]) => ({ maplibregl, style: style as MapLibre.StyleSpecification }));
  return promise;
}

/** Create a map, or null where WebGL is unavailable (very old devices, some headless browsers). */
export function createMap(maplibregl: typeof MapLibre, options: MapLibre.MapOptions): MapLibre.Map | null {
  try {
    const map = new maplibregl.Map({ attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false, touchPitch: false, ...options });
    collapseAttribution(map);
    return map;
  } catch (err) {
    console.warn("map: could not start", err);
    return null;
  }
}

/**
 * MapLibre shows the compact credits expanded until the map is first dragged;
 * start with just the (i) button instead. The control fills in its credits when
 * the style and sources load, and its own listeners run before ours.
 */
function collapseAttribution(map: MapLibre.Map) {
  const onData = () => {
    const el = map.getContainer().querySelector(".maplibregl-ctrl-attrib.maplibregl-compact-show");
    if (!el) return;
    el.classList.remove("maplibregl-compact-show");
    map.off("styledata", onData);
    map.off("sourcedata", onData);
  };
  map.on("styledata", onData);
  map.on("sourcedata", onData);
}
