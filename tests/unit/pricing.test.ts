import { describe, expect, it } from "vitest";
import { calculatePrice } from "@/lib/pricing";

const t = (iso: string) => new Date(iso);

describe("calculatePrice", () => {
  it("bills started 15-minute blocks", () => {
    const p = calculatePrice({
      start: t("2026-10-16T08:00:00Z"),
      end: t("2026-10-16T09:05:00Z"),
      pricePerHourOre: 2000,
    });
    expect(p.durationMinutes).toBe(65);
    expect(p.billableMinutes).toBe(75);
    expect(p.baseOre).toBe(2500);
  });

  it("caps each 24h period at the daily price", () => {
    const p = calculatePrice({
      start: t("2026-10-16T08:00:00Z"),
      end: t("2026-10-18T10:00:00Z"), // 2 days + 2 hours
      pricePerHourOre: 2000,
      pricePerDayOre: 15000,
    });
    expect(p.baseOre).toBe(2 * 15000 + 2 * 2000);
  });

  it("caps a partial day at the daily price too", () => {
    const p = calculatePrice({
      start: t("2026-10-16T00:00:00Z"),
      end: t("2026-10-16T20:00:00Z"),
      pricePerHourOre: 2000,
      pricePerDayOre: 15000,
    });
    expect(p.baseOre).toBe(15000);
  });

  it("adds a 10% service fee with a 5 kr minimum", () => {
    const small = calculatePrice({ start: t("2026-10-16T08:00:00Z"), end: t("2026-10-16T09:00:00Z"), pricePerHourOre: 1500 });
    expect(small.feeOre).toBe(500);
    expect(small.totalOre).toBe(2000);

    const large = calculatePrice({ start: t("2026-10-16T08:00:00Z"), end: t("2026-10-16T18:00:00Z"), pricePerHourOre: 2500 });
    expect(large.baseOre).toBe(25000);
    expect(large.feeOre).toBe(2500);
    expect(large.totalOre).toBe(27500);
  });

  it("rejects empty or negative ranges", () => {
    expect(() =>
      calculatePrice({ start: t("2026-10-16T08:00:00Z"), end: t("2026-10-16T08:00:00Z"), pricePerHourOre: 100 }),
    ).toThrow();
  });
});
