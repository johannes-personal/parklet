import type { CSSProperties } from "react";
import { MAP_PINS, MAP_VARIANTS, mapPosition, type MapVariant } from "@/lib/map-backdrop";
import { BackdropPinFit } from "./backdrop-pin-fit";
import { BackdropPointer } from "./backdrop-pointer";

/**
 * The dark Stockholm map behind every page, as on parklet.se. Static images
 * rendered by scripts/render-map-background.mts, so no map library or tiles
 * are loaded. The map drifts with scrolling (CSS scroll-driven animation) and
 * leans slightly away from the mouse; see `.backdrop` in globals.css.
 *
 * On the home page (<ShowMapPins />) parking pins sit on real streets. They
 * are placed inside the map image's own box, so they move with the map.
 */
export function MapBackdrop() {
  return (
    <div aria-hidden className="backdrop">
      <div className="backdrop-layer backdrop-map" style={{ "--depth": 1.5 } as CSSProperties}>
        <div className="backdrop-canvas">
          <picture>
            <source media="(orientation: portrait)" srcSet={`/map/${MAP_VARIANTS.tall.file}.webp`} type="image/webp" />
            <img src={`/map/${MAP_VARIANTS.wide.file}.webp`} alt="" decoding="async" fetchPriority="low" />
          </picture>
          {/* One set of pins per image; CSS shows the one matching the image the browser picked. */}
          {(Object.keys(MAP_VARIANTS) as MapVariant[]).map((variant) => (
            <div key={variant} className={`backdrop-pins is-${variant}`}>
              {MAP_PINS.map((pin) => {
                const { x, y } = mapPosition(variant, pin.lat, pin.lng);
                if (x < 2 || x > 98 || y < 2 || y > 98) return null;
                return (
                  <span
                    key={`${pin.lat},${pin.lng}`}
                    className={pin.label === "P" ? "backdrop-pin is-p" : "backdrop-pin"}
                    style={{ left: `${x}%`, top: `${y}%` }}
                  >
                    {pin.label}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="backdrop-shade" />
      <BackdropPointer />
    </div>
  );
}

/** Rendered by a page to show the parking pins on the map behind it. */
export function ShowMapPins() {
  return (
    <>
      <span hidden data-map-pins />
      <BackdropPinFit />
    </>
  );
}
