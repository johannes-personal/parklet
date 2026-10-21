import { appUrl } from "@/lib/app-url";
import type { MetadataRoute } from "next";
import { CITIES } from "@/lib/geo";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = appUrl();
  const pages = ["", "/sok", "/uthyrare", "/hjalp", "/om", "/villkor", "/integritet"].map((p) => ({ url: `${base}${p}` }));
  const cities = CITIES.map((c) => ({ url: `${base}/sok?q=${encodeURIComponent(c.name)}&lat=${c.lat}&lng=${c.lng}` }));
  return [...pages, ...cities];
}
