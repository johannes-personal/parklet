/**
 * Money is stored as integer öre (1 SEK = 100 öre) everywhere to avoid
 * floating point rounding. Convert only at the edges (forms and display).
 */

const sekFormatter = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatSek(ore: number): string {
  // Intl uses a narrow no-break space; keep it, it prevents "kr" wrapping alone.
  return sekFormatter.format(ore / 100);
}

/** Parse a user-entered SEK amount ("25", "25,50", "25.5") into öre. */
export function parseSekToOre(value: string | null | undefined): number | null {
  if (value == null) return null;
  const cleaned = value.replace(/\s/g, "").replace(",", ".");
  if (cleaned === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

export function oreToSekInput(ore: number | null | undefined): string {
  if (ore == null) return "";
  const sek = ore / 100;
  return Number.isInteger(sek) ? String(sek) : sek.toFixed(2).replace(".", ",");
}
