import { DateTime } from "luxon";
import { TZ } from "./time";

/**
 * A weekly recurring window during which a spot can be booked, in Swedish
 * local wall-clock time. weekday is ISO (1 = Monday … 7 = Sunday) and the
 * window covers [startMinute, endMinute) where endMinute may be 1440
 * (midnight at the end of the day).
 */
export type AvailabilityWindow = {
  weekday: number;
  startMinute: number;
  endMinute: number;
};

export const WEEKDAYS = [
  { iso: 1, short: "mån", long: "Måndag" },
  { iso: 2, short: "tis", long: "Tisdag" },
  { iso: 3, short: "ons", long: "Onsdag" },
  { iso: 4, short: "tors", long: "Torsdag" },
  { iso: 5, short: "fre", long: "Fredag" },
  { iso: 6, short: "lör", long: "Lördag" },
  { iso: 7, short: "sön", long: "Söndag" },
] as const;

/** Merge overlapping or touching windows per weekday. */
export function normalizeWindows(windows: AvailabilityWindow[]): AvailabilityWindow[] {
  const out: AvailabilityWindow[] = [];
  for (let day = 1; day <= 7; day++) {
    const sorted = windows
      .filter((w) => w.weekday === day && w.endMinute > w.startMinute)
      .sort((a, b) => a.startMinute - b.startMinute);
    let current: AvailabilityWindow | null = null;
    for (const w of sorted) {
      if (current && w.startMinute <= current.endMinute) {
        current.endMinute = Math.max(current.endMinute, w.endMinute);
      } else {
        if (current) out.push(current);
        current = { ...w };
      }
    }
    if (current) out.push(current);
  }
  return out;
}

/**
 * Build windows from a daily "from–to" range applied to the given weekdays.
 * If `to` is earlier than or equal to `from` the range runs overnight and is
 * split across midnight into the following day.
 */
export function windowsFromRange(weekdays: number[], from: number, to: number): AvailabilityWindow[] {
  const result: AvailabilityWindow[] = [];
  for (const d of weekdays) {
    if (to > from) {
      result.push({ weekday: d, startMinute: from, endMinute: to });
    } else {
      result.push({ weekday: d, startMinute: from, endMinute: 1440 });
      if (to > 0) result.push({ weekday: (d % 7) + 1, startMinute: 0, endMinute: to });
    }
  }
  return normalizeWindows(result);
}

export const PRESETS = {
  always: {
    label: "Dygnet runt, alla dagar",
    windows: () => windowsFromRange([1, 2, 3, 4, 5, 6, 7], 0, 1440),
  },
  weekdaysDaytime: {
    label: "Vardagar 07–18 (t.ex. när du själv är på jobbet)",
    windows: () => windowsFromRange([1, 2, 3, 4, 5], 7 * 60, 18 * 60),
  },
  eveningsWeekends: {
    label: "Kvällar, nätter och helger (t.ex. en kontorsplats)",
    windows: () =>
      normalizeWindows([
        ...windowsFromRange([1, 2, 3, 4], 18 * 60, 7 * 60),
        { weekday: 5, startMinute: 18 * 60, endMinute: 1440 },
        ...windowsFromRange([6, 7], 0, 1440),
        { weekday: 1, startMinute: 0, endMinute: 7 * 60 },
      ]),
  },
} as const;

export type PresetKey = keyof typeof PRESETS;

/**
 * True if the whole interval [start, end) lies within the spot's weekly
 * windows. Walks the interval one local calendar day at a time so that
 * multi-day bookings and DST transitions are handled correctly.
 */
export function isWithinWindows(windows: AvailabilityWindow[], start: Date, end: Date): boolean {
  if (end <= start) return false;
  const merged = normalizeWindows(windows);
  let cursor = DateTime.fromJSDate(start, { zone: TZ });
  const last = DateTime.fromJSDate(end, { zone: TZ });

  while (cursor < last) {
    const nextMidnight = cursor.startOf("day").plus({ days: 1 });
    const segEnd = last < nextMidnight ? last : nextMidnight;
    const fromMin = cursor.hour * 60 + cursor.minute;
    const toMin = segEnd.equals(nextMidnight) ? 1440 : segEnd.hour * 60 + segEnd.minute;
    const covered = merged.some(
      (w) => w.weekday === cursor.weekday && w.startMinute <= fromMin && w.endMinute >= toMin,
    );
    if (!covered) return false;
    cursor = segEnd;
  }
  return true;
}

/** Compact Swedish summary, e.g. "mån–fre 07:00–18:00 · lör–sön dygnet runt". */
export function describeWindows(windows: AvailabilityWindow[]): string {
  const merged = normalizeWindows(windows);
  if (merged.length === 0) return "Inga tider angivna";
  const byDay = new Map<number, string>();
  for (let d = 1; d <= 7; d++) {
    const ws = merged.filter((w) => w.weekday === d);
    byDay.set(
      d,
      ws
        .map((w) =>
          w.startMinute === 0 && w.endMinute === 1440 ? "dygnet runt" : `${label(w.startMinute)}–${label(w.endMinute)}`,
        )
        .join(", "),
    );
  }
  // Group consecutive days with identical schedules.
  const groups: { from: number; to: number; text: string }[] = [];
  for (let d = 1; d <= 7; d++) {
    const text = byDay.get(d)!;
    const g = groups[groups.length - 1];
    if (g && g.text === text && g.to === d - 1) g.to = d;
    else groups.push({ from: d, to: d, text });
  }
  const parts = groups
    .filter((g) => g.text)
    .map((g) => {
      const days =
        g.from === g.to ? WEEKDAYS[g.from - 1].short : `${WEEKDAYS[g.from - 1].short}–${WEEKDAYS[g.to - 1].short}`;
      return `${days} ${g.text}`;
    });
  if (parts.length === 1 && parts[0] === "mån–sön dygnet runt") return "Dygnet runt, alla dagar";
  return parts.join(" · ");
}

function label(m: number) {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
