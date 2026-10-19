import { describe, expect, it } from "vitest";
import { dayOptions, joinLocal, parseLocalDateTime, roundToStep, splitLocal, toLocalInputValue } from "@/lib/time";

describe("picker helpers", () => {
  it("rounds to five minutes in Stockholm time", () => {
    const t = parseLocalDateTime("2026-10-19T14:03")!;
    expect(toLocalInputValue(roundToStep(t))).toBe("2026-10-19T14:00");
    expect(toLocalInputValue(roundToStep(t, "up"))).toBe("2026-10-19T14:05");
    expect(toLocalInputValue(roundToStep(parseLocalDateTime("2026-10-19T23:58")!, "up"))).toBe("2026-10-20T00:00");
    expect(toLocalInputValue(roundToStep(parseLocalDateTime("2026-10-19T14:05")!, "up"))).toBe("2026-10-19T14:05");
  });

  it("splits and joins local values", () => {
    expect(splitLocal("2026-10-16T08:05")).toEqual({ date: "2026-10-16", hour: 8, minute: 5 });
    expect(splitLocal("garbage")).toBeNull();
    expect(joinLocal({ date: "2026-10-16", hour: 8, minute: 5 })).toBe("2026-10-16T08:05");
  });

  it("labels today and tomorrow in Swedish", () => {
    const days = dayOptions(parseLocalDateTime("2026-10-19T23:30")!, 3);
    expect(days.map((d) => d.value)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21"]);
    expect(days[0].label).toMatch(/^Idag, mån 19 okt/);
    expect(days[1].label).toMatch(/^Imorgon, tis 20 okt/);
  });
});
