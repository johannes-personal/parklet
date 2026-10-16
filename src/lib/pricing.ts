/**
 * Pricing rules (shared by the server and the live price preview in the
 * browser, so the number a driver sees is the number they are charged):
 *
 * - Time is billed in started 15-minute blocks.
 * - Each started 24h period is capped at the spot's daily price (if set).
 * - The driver pays a transparent service fee on top of the host's price.
 */

export const BILLING_BLOCK_MINUTES = 15;
export const SERVICE_FEE_RATE = 0.1;
export const MIN_SERVICE_FEE_ORE = 500; // 5 kr

export type PriceInput = {
  start: Date;
  end: Date;
  pricePerHourOre: number;
  pricePerDayOre?: number | null;
};

export type PriceBreakdown = {
  durationMinutes: number;
  billableMinutes: number;
  /** What the host earns. */
  baseOre: number;
  /** Platform service fee paid by the driver. */
  feeOre: number;
  /** What the driver pays. */
  totalOre: number;
};

export function durationMinutes(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 60_000);
}

export function calculatePrice({ start, end, pricePerHourOre, pricePerDayOre }: PriceInput): PriceBreakdown {
  const minutes = durationMinutes(start, end);
  if (minutes <= 0) throw new Error("End must be after start");

  const billable = Math.ceil(minutes / BILLING_BLOCK_MINUTES) * BILLING_BLOCK_MINUTES;
  const dayCap = pricePerDayOre ?? Number.POSITIVE_INFINITY;

  const fullDays = Math.floor(billable / 1440);
  const remainder = billable % 1440;
  const perDay = Math.min(pricePerHourOre * 24, dayCap);
  const remainderCost = Math.min(Math.round((remainder * pricePerHourOre) / 60), dayCap);

  const baseOre = fullDays * perDay + remainderCost;
  const feeOre = baseOre === 0 ? 0 : Math.max(MIN_SERVICE_FEE_ORE, Math.round(baseOre * SERVICE_FEE_RATE));

  return {
    durationMinutes: minutes,
    billableMinutes: billable,
    baseOre,
    feeOre,
    totalOre: baseOre + feeOre,
  };
}
