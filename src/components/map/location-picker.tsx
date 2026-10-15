"use client";

import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { useEffect, useRef, useState } from "react";
import { loadLeaflet, tileAttribution, tileUrl } from "./leaflet-loader";

/**
 * Lets a host place a pin on the exact spot. Writes `lat`/`lng` hidden inputs
 * for the surrounding form. Exposes `moveTo` through the `target` prop so an
 * address search can jump the map.
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
  const map = useRef<Leaflet.Map | null>(null);
  const marker = useRef<Leaflet.Marker | null>(null);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(defaultValue ?? null);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled || !el.current || map.current) return;
      const m = L.map(el.current, { scrollWheelZoom: false });
      map.current = m;
      L.tileLayer(tileUrl, { attribution: tileAttribution, maxZoom: 19 }).addTo(m);
      const start = defaultValue ?? { lat: 62, lng: 15 };
      m.setView([start.lat, start.lng], defaultValue ? 17 : 5);
      const icon = L.divIcon({ className: "", html: '<span class="price-pin is-active">P</span>', iconSize: [0, 0] });
      const place = (lat: number, lng: number) => {
        if (!marker.current) {
          marker.current = L.marker([lat, lng], { icon, draggable: true }).addTo(m);
          marker.current.on("dragend", () => {
            const p = marker.current!.getLatLng();
            setPos({ lat: p.lat, lng: p.lng });
          });
        } else marker.current.setLatLng([lat, lng]);
        setPos({ lat, lng });
      };
      if (defaultValue) place(defaultValue.lat, defaultValue.lng);
      m.on("click", (e: Leaflet.LeafletMouseEvent) => place(e.latlng.lat, e.latlng.lng));
      (el.current as HTMLDivElement & { __place?: typeof place }).__place = place;
      setTimeout(() => m.invalidateSize(), 0);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!target || !map.current || !el.current) return;
    map.current.setView([target.lat, target.lng], 18);
    (el.current as HTMLDivElement & { __place?: (a: number, b: number) => void }).__place?.(target.lat, target.lng);
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
        className={`z-0 h-72 w-full overflow-hidden rounded-xl border ${invalid ? "border-danger" : "border-line"}`}
        role="application"
        aria-label="Karta: klicka för att placera platsen"
      />
      <input type="hidden" name="lat" value={pos ? pos.lat.toFixed(6) : ""} />
      <input type="hidden" name="lng" value={pos ? pos.lng.toFixed(6) : ""} />
      <p className="hint">{pos ? "Dra nålen om den inte står exakt på platsen." : "Sök adressen ovan eller klicka på kartan där platsen ligger."}</p>
    </div>
  );
}
