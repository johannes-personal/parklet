"use client";

import { useEffect } from "react";

/**
 * Feeds the mouse position to the map backdrop as --backdrop-x/--backdrop-y
 * (-1…1 from the centre of the window). Mouse and trackpad only; touch
 * screens and reduced motion keep the map still.
 */
export function BackdropPointer() {
  useEffect(() => {
    const motion = window.matchMedia("(pointer: fine) and (prefers-reduced-motion: no-preference)");
    if (!motion.matches) return;
    const root = document.documentElement;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        root.style.setProperty("--backdrop-x", ((e.clientX / window.innerWidth) * 2 - 1).toFixed(3));
        root.style.setProperty("--backdrop-y", ((e.clientY / window.innerHeight) * 2 - 1).toFixed(3));
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      root.style.removeProperty("--backdrop-x");
      root.style.removeProperty("--backdrop-y");
    };
  }, []);
  return null;
}
