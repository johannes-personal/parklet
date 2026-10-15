import { appUrl } from "@/lib/app-url";
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = appUrl();
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/uthyrare", "/bokning", "/betala", "/mina-bokningar", "/api", "/godkannande", "/inbjudan"] },
    sitemap: `${base}/sitemap.xml`,
  };
}
