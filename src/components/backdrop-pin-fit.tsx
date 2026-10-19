"use client";

import { useEffect } from "react";

const CONTENT = "header, main :is(h1, h2, h3, p, a, li, .card)";
const MARGIN = 16;

/**
 * The map's parking pins sit on fixed streets, so where they land relative to
 * the page depends on the window size. Hide the ones that would sit under or
 * peek out from behind text and cards, and show the pins once that is done.
 */
export function BackdropPinFit() {
  useEffect(() => {
    const groups = document.querySelectorAll<HTMLElement>(".backdrop-pins");

    const fit = () => {
      const content = [...document.querySelectorAll(CONTENT)]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0);
      for (const pin of document.querySelectorAll<HTMLElement>(".backdrop-pin")) {
        const p = pin.getBoundingClientRect();
        const covered = content.some(
          (r) => p.right + MARGIN > r.left && p.left - MARGIN < r.right && p.bottom + MARGIN > r.top && p.top - MARGIN < r.bottom,
        );
        pin.toggleAttribute("data-covered", covered);
      }
      groups.forEach((g) => g.setAttribute("data-fitted", ""));
    };

    // Measure at the top of the page, where the pins are shown, and again once the map has settled in.
    const atTop = () => {
      if (window.scrollY < 40) fit();
    };
    atTop();
    const canvas = document.querySelector(".backdrop-canvas");
    canvas?.addEventListener("animationend", atTop);
    window.addEventListener("resize", atTop);
    window.addEventListener("scroll", atTop, { passive: true });
    void document.fonts?.ready.then(atTop);
    if (window.scrollY >= 40) fit();
    return () => {
      canvas?.removeEventListener("animationend", atTop);
      window.removeEventListener("resize", atTop);
      window.removeEventListener("scroll", atTop);
    };
  }, []);
  return null;
}
