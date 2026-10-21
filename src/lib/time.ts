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

/* ------------------------------------------------- date and time picker */

/** Bookings start and end on whole five minutes. */
export const STEP_MINUTES = 5;

/** `date` rounded down (or up) to the five-minute step, in Stockholm time. */
export function roundToStep(date: Date, direction: "down" | "up" = "down"): Date {
  const dt = DateTime.fromJSDate(date, { zone: TZ }).startOf("minute");
  const rest = dt.minute % STEP_MINUTES;
  if (rest === 0) return dt.toJSDate();
  return dt.plus({ minutes: direction === "down" ? -rest : STEP_MINUTES - rest }).toJSDate();
}

export type LocalParts = { date: string; hour: number; minute: number };

/** "2026-10-16T08:05" → { date: "2026-10-16", hour: 8, minute: 5 } */
export function splitLocal(value: string | null | undefined): LocalParts | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value ?? "");
  return m ? { date: m[1], hour: Number(m[2]), minute: Number(m[3]) } : null;
}

export function joinLocal({ date, hour, minute }: LocalParts): string {
  return `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Days to choose from, starting today: "Idag, mån 19 okt", "Imorgon, tis 20 okt", "ons 21 okt", … */
export function dayOptions(now: Date, count: number): { value: string; label: string }[] {
  const today = DateTime.fromJSDate(now, { zone: TZ }).setLocale(LOCALE).startOf("day");
  return Array.from({ length: count }, (_, i) => {
    const d = today.plus({ days: i });
    const label = d.toFormat("ccc d LLL");
    return { value: d.toFormat("yyyy-MM-dd"), label: i === 0 ? `Idag, ${label}` : i === 1 ? `Imorgon, ${label}` : label };
  });
}

/** Has this time already passed (allowing a few minutes for someone who just picked "now")? */
export function isPast(d: Date, graceMinutes = 5): boolean {
  return d.getTime() < Date.now() - graceMinutes * 60_000;
}
