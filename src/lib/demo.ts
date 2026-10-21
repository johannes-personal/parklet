/**
 * Whether the admin's "Återställ testdata" (/admin/testdata) is available: on
 * the demo deployment (NEXT_PUBLIC_DEMO=1) and outside production. A real
 * launch has neither. Shared by the page, its action and the admin tabs.
 */
export function demoResetEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEMO === "1" || process.env.NODE_ENV !== "production";
}
