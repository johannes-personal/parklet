"use client";

import { useState } from "react";
import { describeWindows, PRESETS, WEEKDAYS, type PresetKey } from "@/lib/availability";
import { scheduleToWindows, type Schedule } from "@/lib/schedule";
import { minuteOfDayLabel } from "@/lib/time";

type Row = { enabled: boolean; from: number; to: number };
const TIMES = Array.from({ length: 49 }, (_, i) => i * 30); // 00:00 … 24:00

function rowsFrom(s: Schedule): Row[] {
  return WEEKDAYS.map((d) => {
    const day = s.mode === "custom" ? s.days.find((x) => x.weekday === d.iso) : undefined;
    return day ? { enabled: true, from: day.from, to: day.to } : { enabled: s.mode !== "custom" && d.iso <= 5, from: 7 * 60, to: 18 * 60 };
  });
}

export function AvailabilityEditor({ defaultValue, error }: { defaultValue: Schedule; error?: string }) {
  const [mode, setMode] = useState<Schedule["mode"]>(defaultValue.mode);
  const [rows, setRows] = useState<Row[]>(() => rowsFrom(defaultValue));

  const schedule: Schedule =
    mode === "custom"
      ? { mode: "custom", days: rows.flatMap((r, i) => (r.enabled ? [{ weekday: i + 1, from: r.from, to: r.to }] : [])) }
      : { mode };
  const summary = describeWindows(scheduleToWindows(schedule));

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <fieldset>
      <legend className="label">När kan platsen bokas?</legend>
      <input type="hidden" name="schedule" value={JSON.stringify(schedule)} />
      <div className="space-y-2">
        {(Object.keys(PRESETS) as PresetKey[]).map((k) => (
          <label key={k} className="flex cursor-pointer items-center gap-3 rounded-xl border border-line px-4 py-3 has-checked:border-brand has-checked:bg-brand-soft">
            <input type="radio" name="scheduleMode" className="accent-brand" checked={mode === k} onChange={() => setMode(k)} />
            <span>{PRESETS[k].label}</span>
          </label>
        ))}
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line px-4 py-3 has-checked:border-brand has-checked:bg-brand-soft">
          <input type="radio" name="scheduleMode" className="accent-brand" checked={mode === "custom"} onChange={() => setMode("custom")} />
          <span>Egna tider per veckodag</span>
        </label>
      </div>

      {mode === "custom" ? (
        <div className="mt-3 rounded-xl border border-line p-3">
          <p className="mb-2 text-sm text-muted">Om sluttiden är före starttiden gäller tiden över natten till nästa dag.</p>
          <ul className="space-y-2">
            {WEEKDAYS.map((d, i) => (
              <li key={d.iso} className="grid grid-cols-[7rem_1fr_1fr] items-center gap-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" className="accent-brand" checked={rows[i].enabled} onChange={(e) => update(i, { enabled: e.target.checked })} />
                  {d.long}
                </label>
                <select
                  aria-label={`${d.long} från`}
                  className="input py-1.5"
                  disabled={!rows[i].enabled}
                  value={rows[i].from}
                  onChange={(e) => update(i, { from: Number(e.target.value) })}
                >
                  {TIMES.slice(0, -1).map((t) => (
                    <option key={t} value={t}>
                      {minuteOfDayLabel(t)}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={`${d.long} till`}
                  className="input py-1.5"
                  disabled={!rows[i].enabled}
                  value={rows[i].to}
                  onChange={(e) => update(i, { to: Number(e.target.value) })}
                >
                  {TIMES.slice(1).map((t) => (
                    <option key={t} value={t}>
                      {minuteOfDayLabel(t)}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="hint" aria-live="polite">
        Bokningsbar: <strong className="text-ink">{summary}</strong>
      </p>
      {error ? <p className="field-error">{error}</p> : null}
    </fieldset>
  );
}
