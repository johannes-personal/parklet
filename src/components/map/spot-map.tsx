"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { createMap, loadMap, type MapLibre } from "./maplibre";

export type MapSpot = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  href: string;
  title: string;
  /** False for a pin the view isn't fitted to (a spot far away): it is drawn, but doesn't zoom the map out. */
  fit?: boolean;
};
/** Space covered by panels floating over the map, in pixels, for phones and wider screens. */
export type MapInsets = Record<"narrow" | "wide", { top: number; right: number; bottom: number; left: number }>;

const SWEDEN = { center: [15, 62] as [number, number], zoom: 4 };

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
  const map = useRef<MapLibre.Map | null>(null);
  const markers = useRef(new Map<string, MapLibre.Marker>());
  const centerMarker = useRef<MapLibre.Marker | null>(null);
  const router = useRouter();
  // Only re-fit the view when the set of spots or the search centre changes, not when the
  // page re-renders with the same results (e.g. opening a spot), so the user's pan and zoom stay.
  const fitted = useRef("");
  const viewKey = `${center?.lat},${center?.lng}|${spots.map((s) => s.id).join(",")}`;
  const activeRef = useRef(activeId);
  const insetsRef = useRef(insets);
  useEffect(() => {
    activeRef.current = activeId;
    insetsRef.current = insets;
  }, [activeId, insets]);

  useEffect(() => {
    let cancelled = false;
    loadMap().then(({ maplibregl, style }) => {
      if (cancelled || !el.current) return;
      if (!map.current) {
        const created = createMap(maplibregl, { container: el.current, style, ...SWEDEN });
        if (!created) return;
        map.current = created;
        // Bottom right: the top corners are under the floating header and panels on the search page.
        created.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
        // Panels and sheets change the map's size without a window resize.
        const ro = new ResizeObserver(() => created.resize());
        ro.observe(el.current);
        created.once("remove", () => ro.disconnect());
      }
      const m = map.current;
      markers.current.forEach((mk) => mk.remove());
      markers.current.clear();
      for (const s of spots) {
        const node = document.createElement("span");
        node.className = s.id === activeRef.current ? "price-pin is-active" : "price-pin";
        node.textContent = s.label;
        node.title = s.title;
        node.addEventListener("click", (e) => {
          e.stopPropagation();
          if (s.href) router.push(s.href, { scroll: false });
        });
        markers.current.set(s.id, new maplibregl.Marker({ element: node }).setLngLat([s.lng, s.lat]).addTo(m));
      }
      centerMarker.current?.remove();
      centerMarker.current = null;
      if (center) {
        const dot = document.createElement("span");
        dot.className = "search-center";
        centerMarker.current = new maplibregl.Marker({ element: dot }).setLngLat([center.lng, center.lat]).addTo(m);
      }

      if (fitted.current === viewKey) return;
      fitted.current = viewKey;
      const fit = spots.filter((s) => s.fit !== false);
      const points: [number, number][] = (fit.length ? fit : spots).map((s) => [s.lng, s.lat]);
      if (center) points.push([center.lng, center.lat]);
      if (points.length > 1) {
        const bounds = points.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(points[0], points[0]));
        m.fitBounds(bounds, { padding: padding(el.current, insetsRef.current), maxZoom: 15.5, duration: 0 });
      } else if (points.length === 1) m.jumpTo({ center: points[0], zoom: 14.5 });
      else m.jumpTo(SWEDEN);
    });
    return () => {
      cancelled = true;
    };
  }, [spots, center, viewKey, router]);

  useEffect(() => {
    markers.current.forEach((mk, id) => {
      const node = mk.getElement();
      node.classList.toggle("is-active", id === activeId);
      node.style.zIndex = id === activeId ? "2" : "";
    });
    // Bring the selected spot into view if it is behind a panel or off the map.
    const m = map.current;
    const active = activeId ? markers.current.get(activeId) : null;
    if (!m || !active) return;
    const p = m.project(active.getLngLat());
    const pad = padding(el.current, insets);
    const box = m.getContainer();
    if (p.x < pad.left || p.y < pad.top || p.x > box.clientWidth - pad.right || p.y > box.clientHeight - pad.bottom) {
      m.easeTo({ center: active.getLngLat(), padding: pad, duration: 400 });
    }
  }, [activeId, spots, insets]);

  useEffect(
    () => () => {
      map.current?.remove();
      map.current = null;
    },
    [],
  );

  return <div ref={el} className={`z-0 h-full min-h-72 w-full bg-[#292929] ${className}`} aria-label="Karta över parkeringsplatser" role="region" />;
}

/** Keeps fitted bounds and the selected pin clear of the floating panels. */
function padding(el: HTMLElement | null, insets: MapInsets | undefined): Required<MapLibre.PaddingOptions> {
  const i = insets?.[(el?.clientWidth ?? 0) >= 640 ? "wide" : "narrow"] ?? { top: 0, right: 0, bottom: 0, left: 0 };
  return { top: i.top + 40, right: i.right + 40, bottom: i.bottom + 40, left: i.left + 40 };
}
