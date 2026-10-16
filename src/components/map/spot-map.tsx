"use client";

import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { useEffect, useRef } from "react";
import { loadLeaflet, tileAttribution, tileUrl } from "./leaflet-loader";

export type MapSpot = { id: string; lat: number; lng: number; label: string; href: string; title: string };

/** Map with price pins. Purely presentational: the list next to it is the accessible source of truth. */
export function SpotMap({
  spots,
  center,
  activeId,
  className = "",
}: {
  spots: MapSpot[];
  center?: { lat: number; lng: number } | null;
  activeId?: string | null;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const markers = useRef(new Map<string, Leaflet.Marker>());

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled || !el.current) return;
      if (!map.current) {
        map.current = L.map(el.current, { zoomControl: true, scrollWheelZoom: false });
        L.tileLayer(tileUrl, { attribution: tileAttribution, maxZoom: 19 }).addTo(map.current);
      }
      const m = map.current;
      markers.current.forEach((mk) => mk.remove());
      markers.current.clear();
      for (const s of spots) {
        const icon = L.divIcon({ className: "", html: `<span class="price-pin">${escapeHtml(s.label)}</span>`, iconSize: [0, 0] });
        const mk = L.marker([s.lat, s.lng], { icon, title: s.title, keyboard: false })
          .addTo(m)
          .on("click", () => {
            window.location.href = s.href;
          });
        markers.current.set(s.id, mk);
      }
      if (center) {
        L.circleMarker([center.lat, center.lng], { radius: 7, color: "#ffffff", fillColor: "#93c5fd", fillOpacity: 0.9, weight: 3 }).addTo(m);
      }
      const points = spots.map((s) => L.latLng(s.lat, s.lng));
      if (center) points.push(L.latLng(center.lat, center.lng));
      if (points.length > 1) m.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16 });
      else if (points.length === 1) m.setView(points[0], 15);
      else m.setView([62, 15], 5); // Sweden
      // The container may have been laid out after init (e.g. sticky panels).
      setTimeout(() => m.invalidateSize(), 0);
    });
    return () => {
      cancelled = true;
    };
  }, [spots, center]);

  useEffect(() => {
    markers.current.forEach((mk, id) => {
      const node = mk.getElement()?.querySelector(".price-pin");
      node?.classList.toggle("is-active", id === activeId);
      if (id === activeId) mk.setZIndexOffset(1000);
      else mk.setZIndexOffset(0);
    });
  }, [activeId, spots]);

  useEffect(
    () => () => {
      map.current?.remove();
      map.current = null;
    },
    [],
  );

  return <div ref={el} className={`z-0 h-full min-h-72 w-full bg-canvas ${className}`} aria-label="Karta över parkeringsplatser" role="region" />;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
