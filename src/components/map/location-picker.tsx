"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { createMap, loadMap, type MapLibre } from "./maplibre";

/**
 * Lets a host place a pin on the exact spot. Writes `lat`/`lng` hidden inputs
 * for the surrounding form. Moving `target` (from an address search) jumps the
 * map there. Zooming needs Ctrl/⌘ + scroll, so scrolling the form isn't captured.
 */
export function LocationPicker({
  defaultValue,
  target,
  invalid,
}: {
  defaultValue?: { lat: number; lng: number } | null;
  target?: { lat: number; lng: number } | null;
  invalid?: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre.Map | null>(null);
  const place = useRef<((lng: number, lat: number) => void) | null>(null);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(defaultValue ?? null);

  useEffect(() => {
    let cancelled = false;
    loadMap().then(({ maplibregl, style }) => {
      if (cancelled || !el.current || map.current) return;
      const start = defaultValue ?? { lat: 62, lng: 15 };
      const m = createMap(maplibregl, {
        container: el.current,
        style,
        center: [start.lng, start.lat],
        zoom: defaultValue ? 16.5 : 4,
        cooperativeGestures: true,
        locale: { "CooperativeGesturesHandler.WindowsHelpText": "Håll Ctrl och scrolla för att zooma", "CooperativeGesturesHandler.MacHelpText": "Håll ⌘ och scrolla för att zooma", "CooperativeGesturesHandler.MobileHelpText": "Använd två fingrar för att flytta kartan" },
      });
      if (!m) return;
      map.current = m;
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
      let marker: MapLibre.Marker | null = null;
      place.current = (lng, lat) => {
        if (!marker) {
          const node = document.createElement("span");
          node.className = "price-pin is-active";
          node.textContent = "P";
          marker = new maplibregl.Marker({ element: node, draggable: true }).setLngLat([lng, lat]).addTo(m);
          marker.on("dragend", () => {
            const p = marker!.getLngLat();
            setPos({ lat: p.lat, lng: p.lng });
          });
        } else marker.setLngLat([lng, lat]);
        setPos({ lat, lng });
      };
      if (defaultValue) place.current(defaultValue.lng, defaultValue.lat);
      m.on("click", (e) => place.current?.(e.lngLat.lng, e.lngLat.lat));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!target || !map.current) return;
    map.current.jumpTo({ center: [target.lng, target.lat], zoom: 17.5 });
    place.current?.(target.lng, target.lat);
  }, [target]);

  useEffect(
    () => () => {
      map.current?.remove();
      map.current = null;
    },
    [],
  );

  return (
    <div>
      <div
        ref={el}
        data-testid="location-picker"
        className={`z-0 h-72 w-full overflow-hidden rounded-xl border bg-[#292929] ${invalid ? "border-danger" : "border-line"}`}
        role="application"
        aria-label="Karta: klicka för att placera platsen"
      />
      <input type="hidden" name="lat" value={pos ? pos.lat.toFixed(6) : ""} />
      <input type="hidden" name="lng" value={pos ? pos.lng.toFixed(6) : ""} />
      <p className="hint">{pos ? "Dra nålen om den inte står exakt på platsen." : "Sök adressen ovan eller klicka på kartan där platsen ligger."}</p>
    </div>
  );
}
