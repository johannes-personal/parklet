"use client";

import { useId } from "react";

/**
 * Unique element ids per form instance. With Cache Components, previously
 * visited routes stay mounted (hidden) via <Activity>, so two pages with an
 * `id="from"` input would otherwise coexist and labels would point at the
 * hidden one.
 */
export function useFieldIds() {
  const base = useId();
  return (name: string) => `${base}${name}`;
}
