import type { CSSProperties } from "react";
import { BackdropPointer } from "./backdrop-pointer";

/**
 * The dark Stockholm map behind every page, as on parklet.se. Static images
 * rendered by scripts/render-map-background.mts, so no map library or tiles
 * are loaded. The map drifts with scrolling (CSS scroll-driven animation) and
 * leans slightly away from the mouse; see `.backdrop` in globals.css.
 */
export function MapBackdrop() {
  return (
    <div aria-hidden className="backdrop">
      <div className="backdrop-layer backdrop-map" style={{ "--depth": 1.5 } as CSSProperties}>
        <picture>
          <source media="(orientation: portrait)" srcSet="/map/stockholm-tall.webp" type="image/webp" />
          <img src="/map/stockholm-wide.webp" alt="" decoding="async" fetchPriority="low" />
        </picture>
      </div>
      <div className="backdrop-shade" />
      <BackdropPointer />
    </div>
  );
}

// Percentages of the first screen and a bit, kept to the edges so they stay clear of the hero text and search card.
const NEAR = [
  { x: 6, y: 20, label: "P" },
  { x: 93, y: 44, label: "30 kr/h" },
  { x: 54, y: 84, label: "P" },
  { x: 18, y: 92, label: "40 kr/h" },
];
const FAR = [
  { x: 42, y: 8, label: "25 kr/h" },
  { x: 86, y: 14, label: "P" },
  { x: 3, y: 60, label: "18 kr/h" },
  { x: 78, y: 80, label: "P" },
  { x: 33, y: 52, label: "P" },
];

/**
 * Parking pins floating above the map on the home page. They sit at two
 * depths: near pins rush past faster than the page scrolls, far ones lag
 * behind it, and both fade out as the hero leaves the screen.
 */
export function BackdropPins() {
  return (
    <div aria-hidden className="backdrop-pins">
      {[
        { depth: "near", pins: NEAR, lean: 5 },
        { depth: "far", pins: FAR, lean: 2.5 },
      ].map((group) => (
        <div key={group.depth} className={`backdrop-layer backdrop-pins-${group.depth}`} style={{ "--depth": group.lean } as CSSProperties}>
          {group.pins.map((p, i) => (
            <span
              key={i}
              className={p.label === "P" ? "backdrop-pin is-p" : "backdrop-pin"}
              style={{ left: `${p.x}%`, top: `${p.y}%`, animationDelay: `${i * -1.7}s` }}
            >
              {p.label}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
