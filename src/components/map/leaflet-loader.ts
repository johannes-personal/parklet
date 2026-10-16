"use client";

import type * as Leaflet from "leaflet";

let promise: Promise<typeof Leaflet> | null = null;

/** Leaflet touches `window` on import, so load it lazily in the browser only. */
export function loadLeaflet(): Promise<typeof Leaflet> {
  promise ??= import("leaflet").then((m) => (m.default ?? m) as typeof Leaflet);
  return promise;
}

export const tileUrl = process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const tileAttribution = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ?? "&copy; OpenStreetMap contributors";
