import { DateTime } from "luxon";

/** All wall-clock times in the product are Swedish local time. */
export const TZ = "Europe/Stockholm";
export const LOCALE = "sv-SE";

/**
 * Parse the value of an `<input type="datetime-local">` ("2026-10-16T08:00")
 * as Stockholm local time. Returns null for anything unparseable.
 */
export function parseLocalDateTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const dt = DateTime.fromISO(value, { zone: TZ });
  return dt.isValid ? dt.toJSDate() : null;
}

/** Format a Date for an `<input type="datetime-local">` value in Stockholm time. */
export function toLocalInputValue(date: Date): string {
  return DateTime.fromJSDate(date, { zone: TZ }).toFormat("yyyy-MM-dd'T'HH:mm");
}

/** "tors 16 okt, 08:00" */
export function formatDateTime(date: Date): string {
  return DateTime.fromJSDate(date, { zone: TZ }).setLocale(LOCALE).toFormat("ccc d LLL, HH:mm");
}

/** "08:00" */
export function formatTime(date: Date): string {
  return DateTime.fromJSDate(date, { zone: TZ }).toFormat("HH:mm");
}

/** "tors 16 okt 08:00 – 17:00" or "tors 16 okt 08:00 – fre 17 okt 10:00" */
export function formatRange(start: Date, end: Date): string {
  const s = DateTime.fromJSDate(start, { zone: TZ }).setLocale(LOCALE);
  const e = DateTime.fromJSDate(end, { zone: TZ }).setLocale(LOCALE);
  const sameDay = s.hasSame(e, "day");
  return `${s.toFormat("ccc d LLL HH:mm")} – ${sameDay ? e.toFormat("HH:mm") : e.toFormat("ccc d LLL HH:mm")}`;
}

/** Human duration in Swedish: "2 tim 30 min", "3 dygn 4 tim". */
export function formatDuration(minutes: number): string {
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} dygn`);
  if (hours) parts.push(`${hours} tim`);
  if (mins) parts.push(`${mins} min`);
  return parts.join(" ") || "0 min";
}

/** The next quarter hour from `now`, in Stockholm time. */
export function nextQuarterHour(now: Date = new Date()): Date {
  const dt = DateTime.fromJSDate(now, { zone: TZ }).startOf("minute");
  const add = 15 - (dt.minute % 15);
  return dt.plus({ minutes: add }).toJSDate();
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/** "08:00" for a minute-of-day value (1440 renders as "24:00"). */
export function minuteOfDayLabel(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Parse "08:30" into minute-of-day. "24:00" is allowed and returns 1440. */
export function parseMinuteOfDay(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (mm > 59 || h > 24 || (h === 24 && mm !== 0)) return null;
  return h * 60 + mm;
}
