import { describe, expect, it } from "vitest";
import { describeWindows, isWithinWindows, normalizeWindows, PRESETS, windowsFromRange } from "@/lib/availability";
import { parseLocalDateTime } from "@/lib/time";
import { scheduleToWindows } from "@/lib/schedule";

const local = (s: string) => parseLocalDateTime(s)!;

describe("windowsFromRange", () => {
  it("splits overnight ranges across midnight", () => {
    const w = windowsFromRange([5], 18 * 60, 7 * 60); // Friday 18–07
    expect(w).toEqual([
      { weekday: 5, startMinute: 1080, endMinute: 1440 },
      { weekday: 6, startMinute: 0, endMinute: 420 },
    ]);
  });

  it("wraps Sunday night into Monday", () => {
    const w = windowsFromRange([7], 22 * 60, 6 * 60);
    expect(w).toContainEqual({ weekday: 1, startMinute: 0, endMinute: 360 });
  });
});

describe("normalizeWindows", () => {
  it("merges overlapping and touching windows", () => {
    expect(
      normalizeWindows([
        { weekday: 1, startMinute: 600, endMinute: 720 },
        { weekday: 1, startMinute: 480, endMinute: 600 },
        { weekday: 1, startMinute: 700, endMinute: 900 },
      ]),
    ).toEqual([{ weekday: 1, startMinute: 480, endMinute: 900 }]);
  });
});

describe("isWithinWindows", () => {
  const weekdays = PRESETS.weekdaysDaytime.windows();
  const always = PRESETS.always.windows();
  const eveningsWeekends = PRESETS.eveningsWeekends.windows();

  it("accepts a booking inside a weekday window", () => {
    // 2026-10-16 is a Friday
    expect(isWithinWindows(weekdays, local("2026-10-16T08:00"), local("2026-10-16T17:00"))).toBe(true);
  });

  it("rejects a booking that runs past the window", () => {
    expect(isWithinWindows(weekdays, local("2026-10-16T08:00"), local("2026-10-16T19:00"))).toBe(false);
  });

  it("rejects weekends for a weekday-only spot", () => {
    expect(isWithinWindows(weekdays, local("2026-10-17T10:00"), local("2026-10-17T11:00"))).toBe(false);
  });

  it("accepts multi-day bookings when every day is fully covered", () => {
    expect(isWithinWindows(always, local("2026-10-16T08:00"), local("2026-10-20T08:00"))).toBe(true);
  });

  it("accepts an overnight booking that spans windows on two days", () => {
    // Friday 20:00 → Saturday 10:00 for an evenings + weekends spot
    expect(isWithinWindows(eveningsWeekends, local("2026-10-16T20:00"), local("2026-10-17T10:00"))).toBe(true);
    // Monday 06:00 → 08:00 crosses the end of the Sunday-night window
    expect(isWithinWindows(eveningsWeekends, local("2026-10-19T06:00"), local("2026-10-19T08:00"))).toBe(false);
  });

  it("handles the DST change in October (25-hour day)", () => {
    // Clocks go back 2026-10-25 03:00 → 02:00 in Sweden.
    expect(isWithinWindows(always, local("2026-10-24T22:00"), local("2026-10-25T05:00"))).toBe(true);
    const nightOnly = windowsFromRange([1, 2, 3, 4, 5, 6, 7], 0, 6 * 60);
    expect(isWithinWindows(nightOnly, local("2026-10-25T01:00"), local("2026-10-25T05:00"))).toBe(true);
  });

  it("handles the DST change in March (23-hour day)", () => {
    // Clocks go forward 2026-03-29 02:00 → 03:00.
    expect(isWithinWindows(always, local("2026-03-28T22:00"), local("2026-03-29T06:00"))).toBe(true);
  });
});

describe("describeWindows", () => {
  it("summarises common schedules in Swedish", () => {
    expect(describeWindows(PRESETS.always.windows())).toBe("Dygnet runt, alla dagar");
    expect(describeWindows(PRESETS.weekdaysDaytime.windows())).toBe("mån–fre 07:00–18:00");
  });
});

describe("scheduleToWindows", () => {
  it("expands presets", () => {
    expect(scheduleToWindows({ mode: "always" })).toHaveLength(7);
  });
  it("supports custom overnight rows and full days", () => {
    const w = scheduleToWindows({
      mode: "custom",
      days: [
        { weekday: 5, from: 18 * 60, to: 7 * 60 },
        { weekday: 6, from: 0, to: 1440 },
      ],
    });
    expect(w).toEqual([
      { weekday: 5, startMinute: 1080, endMinute: 1440 },
      { weekday: 6, startMinute: 0, endMinute: 1440 },
    ]);
  });
});
