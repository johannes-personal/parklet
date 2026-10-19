"use client";

import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { loadLeaflet, tileAttribution, tileUrl } from "./leaflet-loader";

export type MapSpot = { id: string; lat: number; lng: number; label: string; href: string; title: string };
/** Space covered by panels floating over the map, in pixels, for phones and wider screens. */
export type MapInsets = Record<"narrow" | "wide", { top: number; right: number; bottom: number; left: number }>;

/**
 * Map with price pins. Purely presentational: the list next to it is the
 * accessible source of truth. Clicking a pin follows its `href` without a
 * full page load (on the search page that opens the spot's overlay). The
 * scroll wheel zooms.
 */
export function SpotMap({
  spots,
  center,
  activeId,
  insets,
  className = "",
}: {
  spots: MapSpot[];
  center?: { lat: number; lng: number } | null;
  activeId?: string | null;
  insets?: MapInsets;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const markers = useRef(new Map<string, Leaflet.Marker>());
  const router = useRouter();
  // Only re-fit the view when the set of spots or the search centre changes, not when the
  // page re-renders with the same results (e.g. opening a spot), so the user's pan and zoom stay.
  const fitted = useRef("");
  const centerMarker = useRef<Leaflet.CircleMarker | null>(null);
  const activeRef = useRef(activeId);
  const insetsRef = useRef(insets);
  // Padding that keeps fitted bounds and the selected pin clear of the floating panels.
  const padding = () => {
    const box = el.current?.getBoundingClientRect();
    const i = insetsRef.current?.[box && box.width >= 640 ? "wide" : "narrow"] ?? { top: 0, right: 0, bottom: 0, left: 0 };
    return { paddingTopLeft: [i.left + 40, i.top + 40] as [number, number], paddingBottomRight: [i.right + 40, i.bottom + 40] as [number, number] };
  };
  useEffect(() => {
    activeRef.current = activeId;
    insetsRef.current = insets;
  }, [activeId, insets]);
  const viewKey = `${center?.lat},${center?.lng}|${spots.map((s) => s.id).join(",")}`;

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled || !el.current) return;
      if (!map.current) {
        map.current = L.map(el.current, { zoomControl: false, scrollWheelZoom: true, wheelPxPerZoomLevel: 90 });
        // Bottom right: the top corners are under the floating header and panels on the search page.
        L.control.zoom({ position: "bottomright", zoomInTitle: "Zooma in", zoomOutTitle: "Zooma ut" }).addTo(map.current);
        L.tileLayer(tileUrl, { attribution: tileAttribution, maxZoom: 19 }).addTo(map.current);
      }
      const m = map.current;
      markers.current.forEach((mk) => mk.remove());
      markers.current.clear();
      for (const s of spots) {
        const active = s.id === activeRef.current;
        const icon = L.divIcon({ className: "", html: `<span class="price-pin${active ? " is-active" : ""}">${escapeHtml(s.label)}</span>`, iconSize: [0, 0] });
        const mk = L.marker([s.lat, s.lng], { icon, title: s.title, keyboard: false, zIndexOffset: active ? 1000 : 0 })
          .addTo(m)
          .on("click", () => {
            if (s.href) router.push(s.href, { scroll: false });
          });
        markers.current.set(s.id, mk);
      }
      centerMarker.current?.remove();
      centerMarker.current = center
        ? L.circleMarker([center.lat, center.lng], { radius: 7, color: "#ffffff", fillColor: "#93c5fd", fillOpacity: 0.9, weight: 3 }).addTo(m)
        : null;
      if (fitted.current === viewKey) return;
      fitted.current = viewKey;
      const points = spots.map((s) => L.latLng(s.lat, s.lng));
      if (center) points.push(L.latLng(center.lat, center.lng));
      m.invalidateSize();
      if (points.length > 1) m.fitBounds(L.latLngBounds(points), { ...padding(), maxZoom: 16 });
      else if (points.length === 1) m.setView(points[0], 15);
      else m.setView([62, 15], 5); // Sweden
    });
    return () => {
      cancelled = true;
    };
  }, [spots, center, viewKey, router]);

  useEffect(() => {
    markers.current.forEach((mk, id) => {
      const node = mk.getElement()?.querySelector(".price-pin");
      node?.classList.toggle("is-active", id === activeId);
      if (id === activeId) mk.setZIndexOffset(1000);
      else mk.setZIndexOffset(0);
    });
    // Bring the selected spot into view if it is off the map.
    const active = activeId ? markers.current.get(activeId) : null;
    if (active && map.current) map.current.panInside(active.getLatLng(), padding());
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
