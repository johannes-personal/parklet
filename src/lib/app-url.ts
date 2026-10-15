/**
 * Public base URL for links in e-mails, metadata and the sitemap. APP_URL wins;
 * on Vercel it falls back to the production domain (production deployments)
 * or the deployment's own URL (previews), so links work without extra config.
 */
export function appUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
