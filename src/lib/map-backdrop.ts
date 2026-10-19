/**
 * The view rendered into public/map/*.webp by scripts/render-map-background.mts,
 * shared with the backdrop so the parking pins can be placed on real streets.
 */

// Strömmen, between Norrmalm and Gamla stan – the same view as parklet.se.
export const MAP_CENTER = { lat: 59.3285, lng: 18.0705 };

/** Size in CSS pixels and MapLibre zoom (512 px tiles) of each image. */
export const MAP_VARIANTS = {
  wide: { file: "stockholm-wide", width: 1920, height: 1200, zoom: 14.1 },
  tall: { file: "stockholm-tall", width: 1000, height: 1600, zoom: 13.9 },
} as const;

export type MapVariant = keyof typeof MAP_VARIANTS;

/**
 * Decorative pins on the home page, all on streets. Pins that would cover the
 * hero text or search card at the current window size are hidden in the browser.
 */
export const MAP_PINS = [
  { lat: 59.3395, lng: 18.056, label: "20 kr/h" }, // Vasastan
  { lat: 59.336, lng: 18.062, label: "25 kr/h" }, // Kungsgatan
  { lat: 59.3365, lng: 18.05, label: "P" }, // Vasastan
  { lat: 59.34, lng: 18.085, label: "P" }, // Östermalm
  { lat: 59.335, lng: 18.0785, label: "35 kr/h" }, // Östermalmstorg
  { lat: 59.3365, lng: 18.099, label: "30 kr/h" }, // Storgatan, Östermalm
  { lat: 59.3345, lng: 18.0985, label: "P" }, // Östermalm
  { lat: 59.327, lng: 18.099, label: "P" }, // Djurgården
  { lat: 59.3315, lng: 18.043, label: "18 kr/h" }, // Kungsholmen
  { lat: 59.3305, lng: 18.035, label: "P" }, // Kungsholmen
  { lat: 59.3262, lng: 18.069, label: "P" }, // Gamla stan
  { lat: 59.3255, lng: 18.084, label: "P" }, // Skeppsholmen
  { lat: 59.319, lng: 18.063, label: "40 kr/h" }, // Södermalm
  { lat: 59.3185, lng: 18.08, label: "28 kr/h" }, // Katarina, Södermalm
  { lat: 59.317, lng: 18.072, label: "P" }, // Götgatan
] as const;

function mercator(lat: number, lng: number, zoom: number) {
  const size = 512 * 2 ** zoom;
  const phi = (lat * Math.PI) / 180;
  return {
    x: ((lng + 180) / 360) * size,
    y: ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * size,
  };
}

/** Where a coordinate falls in a rendered image, as percentages of its width and height. */
export function mapPosition(variant: MapVariant, lat: number, lng: number) {
  const v = MAP_VARIANTS[variant];
  const point = mercator(lat, lng, v.zoom);
  const center = mercator(MAP_CENTER.lat, MAP_CENTER.lng, v.zoom);
  return { x: 50 + ((point.x - center.x) / v.width) * 100, y: 50 + ((point.y - center.y) / v.height) * 100 };
}
