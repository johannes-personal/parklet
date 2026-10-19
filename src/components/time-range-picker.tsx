"use client";

import { useId, useSyncExternalStore } from "react";
import {
  addMinutes,
  dayOptions,
  formatDateTime,
  formatDuration,
  joinLocal,
  parseLocalDateTime,
  roundToStep,
  splitLocal,
  STEP_MINUTES,
  toLocalInputValue,
  type LocalParts,
} from "@/lib/time";

const noop = () => () => {};
/** The current minute, in the browser only (null while prerendering), so options never differ between server and client. */
export function useNow(): number | null {
  return useSyncExternalStore(
    noop,
    () => Math.floor(Date.now() / 60_000) * 60_000,
    () => null,
  );
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MINUTES = Array.from({ length: 60 / STEP_MINUTES }, (_, i) => i * STEP_MINUTES);
const pad = (n: number) => String(n).padStart(2, "0");
export const DEFAULT_DURATIONS = [60, 120, 180, 240, 480, 1440];
const DEFAULT_LENGTH = 120;

type Props = {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  /** Spots that need notice can't start before now + notice. */
  minNoticeMinutes?: number;
  /** Render hidden inputs with these names, for plain form posts. */
  names?: { from: string; to: string };
  durations?: number[];
  /** How far ahead a booking can start. */
  days?: number;
};

/**
 * Start and end of a parking period. Instead of the browser's datetime input
 * (whose calendar and error messages follow the browser's language and accept
 * minutes the booking rules don't), it offers only valid values: five-minute
 * steps, nothing in the past, the end always after the start. "Nu" starts
 * now, and the length buttons set the end.
 */
export function TimeRangePicker({ from, to, onChange, minNoticeMinutes = 0, names, durations = DEFAULT_DURATIONS, days = 60 }: Props) {
  const id = useId();
  const now = useNow();
  const start = parseLocalDateTime(from);
  const end = parseLocalDateTime(to);
  const earliest = now == null ? null : minNoticeMinutes > 0 ? roundToStep(addMinutes(new Date(now), minNoticeMinutes), "up") : roundToStep(new Date(now));
  const length = start && end && end > start ? Math.round((end.getTime() - start.getTime()) / 60_000) : null;

  function setStart(next: Date) {
    // Moving the start keeps the chosen length, like a calendar does.
    const keep = length ?? DEFAULT_LENGTH;
    onChange(toLocalInputValue(next), toLocalInputValue(addMinutes(next, keep)));
  }
  function setLength(minutes: number) {
    const s = start ?? earliest;
    if (!s) return;
    onChange(toLocalInputValue(s), toLocalInputValue(addMinutes(s, minutes)));
  }
  function setEnd(next: Date) {
    onChange(from || (earliest ? toLocalInputValue(earliest) : ""), toLocalInputValue(next));
  }

  const startAtEarliest = start && earliest && start.getTime() === earliest.getTime();
  return (
    <div className="space-y-3">
      {names ? (
        <>
          <input type="hidden" name={names.from} value={from} />
          <input type="hidden" name={names.to} value={to} />
        </>
      ) : null}

      <fieldset>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <legend className="text-sm font-medium text-ink">Start</legend>
          {earliest ? (
            <button
              type="button"
              onClick={() => setStart(earliest)}
              aria-pressed={Boolean(startAtEarliest)}
              className="rounded-full border border-line-strong px-3 py-0.5 text-sm font-semibold hover:bg-canvas aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-surface"
            >
              {minNoticeMinutes > 0 ? `Tidigast möjligt (${formatDateTime(earliest)})` : "Nu"}
            </button>
          ) : null}
        </div>
        <DateTimeSelects
          id={`${id}-start`}
          label="Start"
          value={from}
          days={now == null ? [] : dayOptions(new Date(now), days)}
          isAllowed={(d) => !earliest || d >= earliest}
          fallback={(date) => (earliest && date === toLocalInputValue(earliest).slice(0, 10) ? earliest : parseLocalDateTime(`${date}T08:00`)!)}
          onPick={setStart}
        />
      </fieldset>

      <div role="group" aria-label="Hur länge?" className="flex flex-wrap gap-1.5">
        {durations.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setLength(m)}
            aria-pressed={length === m}
            className="rounded-full border border-line px-3 py-0.5 text-sm hover:bg-canvas aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:font-semibold aria-pressed:text-surface"
          >
            {m % 1440 === 0 ? `${m / 1440} dygn` : `${m / 60} tim`}
          </button>
        ))}
      </div>

      <fieldset>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <legend className="text-sm font-medium text-ink">Slut</legend>
          {length ? <span className="text-sm text-muted">{formatDuration(length)}</span> : null}
        </div>
        <DateTimeSelects
          id={`${id}-end`}
          label="Slut"
          value={to}
          days={now == null ? [] : dayOptions(new Date(now), days + 31).filter((d) => !start || d.value >= from.slice(0, 10))}
          isAllowed={(d) => (start ? d > start : !earliest || d > earliest)}
          fallback={(date) => {
            const base = start ?? earliest;
            const candidate = parseLocalDateTime(`${date}T${base ? toLocalInputValue(base).slice(11) : "10:00"}`)!;
            return base && candidate <= base ? addMinutes(base, DEFAULT_LENGTH) : candidate;
          }}
          onPick={setEnd}
        />
      </fieldset>
    </div>
  );
}

/** Day, hour and minute as three selects; options that aren't allowed are disabled, and a change never produces an invalid time. */
function DateTimeSelects({
  id,
  label,
  value,
  days,
  isAllowed,
  fallback,
  onPick,
}: {
  id: string;
  label: string;
  value: string;
  days: { value: string; label: string }[];
  isAllowed: (d: Date) => boolean;
  /** What to pick when the day changes and the current time doesn't work on it (or there is no time yet). */
  fallback: (date: string) => Date;
  onPick: (d: Date) => void;
}) {
  const parts = splitLocal(value);
  const at = (p: LocalParts) => parseLocalDateTime(joinLocal(p))!;
  const dayAllowed = (date: string) => isAllowed(parseLocalDateTime(`${date}T23:55`)!);
  const hourAllowed = (hour: number) => parts != null && isAllowed(at({ ...parts, hour, minute: 55 }));
  const minuteAllowed = (minute: number) => parts != null && isAllowed(at({ ...parts, minute }));

  const firstDay = days.find((d) => dayAllowed(d.value))?.value;

  function pick(next: LocalParts) {
    const d = at(next);
    if (isAllowed(d)) return onPick(d);
    // Same day, first allowed minute in the hour, else the fallback for that day.
    const minute = MINUTES.find((m) => isAllowed(at({ ...next, minute: m })));
    onPick(minute != null ? at({ ...next, minute }) : fallback(next.date));
  }

  const cls = "input w-[4.5rem] shrink-0 px-2";
  return (
    <div className="flex gap-2">
      <label htmlFor={`${id}-day`} className="sr-only">
        {label}, dag
      </label>
      <select
        id={`${id}-day`}
        className="input min-w-0 flex-1 px-2.5"
        value={parts?.date ?? ""}
        onChange={(e) => (parts ? pick({ ...parts, date: e.target.value }) : onPick(fallback(e.target.value)))}
      >
        {parts ? null : <option value="">Välj dag</option>}
        {days.map((d) => (
          <option key={d.value} value={d.value} disabled={!dayAllowed(d.value)}>
            {d.label}
          </option>
        ))}
      </select>
      <label htmlFor={`${id}-hour`} className="sr-only">
        {label}, timme
      </label>
      <select
        id={`${id}-hour`}
        className={cls}
        value={parts ? parts.hour : ""}
        onChange={(e) => (parts ? pick({ ...parts, hour: Number(e.target.value) }) : firstDay && pick({ date: firstDay, hour: Number(e.target.value), minute: 0 }))}
      >
        {parts ? null : <option value="">tt</option>}
        {HOURS.map((h) => (
          <option key={h} value={h} disabled={parts != null && !hourAllowed(h)}>
            {pad(h)}
          </option>
        ))}
      </select>
      <span aria-hidden className="self-center font-semibold text-muted">
        :
      </span>
      <label htmlFor={`${id}-minute`} className="sr-only">
        {label}, minut
      </label>
      <select
        id={`${id}-minute`}
        className={cls}
        value={parts ? parts.minute : ""}
        onChange={(e) => (parts ? pick({ ...parts, minute: Number(e.target.value) }) : firstDay && onPick(fallback(firstDay)))}
      >
        {parts ? null : <option value="">mm</option>}
        {MINUTES.map((m) => (
          <option key={m} value={m} disabled={parts != null && !minuteAllowed(m)}>
            {pad(m)}
          </option>
        ))}
      </select>
    </div>
  );
}
