"use client";

import { useFieldIds } from "@/components/use-field-ids";
import { useActionState, useMemo, useState } from "react";
import { errProps, FieldError, FormAlert, SubmitButton, type FormState } from "@/components/form";
import { isWithinWindows, type AvailabilityWindow } from "@/lib/availability";
import { formatSek } from "@/lib/money";
import { calculatePrice } from "@/lib/pricing";
import { formatDuration, parseLocalDateTime } from "@/lib/time";
import { bookAction } from "./actions";
import { useNowMin } from "@/components/use-now-min";

type Props = {
  spotId: string;
  pricePerHourOre: number;
  pricePerDayOre: number | null;
  minDurationMinutes: number;
  minNoticeMinutes: number;
  windows: AvailabilityWindow[];
  busy: { start: string; end: string }[];
  vehicles: { id: string; reg: string; nickname: string }[];
  loggedIn: boolean;
  initialFrom?: string;
  initialTo?: string;
  requiresVehicleRegistration: boolean;
};

export function BookingForm(p: Props) {
  const f = useFieldIds();
  const [state, action] = useActionState<FormState, FormData>(bookAction, null);
  const [from, setFrom] = useState(state?.values?.from ?? p.initialFrom ?? "");
  const [to, setTo] = useState(state?.values?.to ?? p.initialTo ?? "");
  const [vehicle, setVehicle] = useState(p.vehicles[0]?.reg ?? "");

  const minValue = useNowMin();
  const preview = useMemo(() => {
    const start = parseLocalDateTime(from);
    const end = parseLocalDateTime(to);
    if (!start || !end) return null;
    if (end <= start) return { error: "Sluttiden måste vara efter starttiden." };
    const minutes = (end.getTime() - start.getTime()) / 60000;
    if (minutes < p.minDurationMinutes) return { error: `Minsta bokningstid är ${formatDuration(p.minDurationMinutes)}.` };
    const now = parseLocalDateTime(minValue)?.getTime();
    if (p.minNoticeMinutes && now != null && start.getTime() < now + p.minNoticeMinutes * 60000) {
      return { error: `Platsen måste bokas minst ${formatDuration(p.minNoticeMinutes)} i förväg.` };
    }
    if (!isWithinWindows(p.windows, start, end)) return { error: "Platsen är inte tillgänglig hela den valda tiden." };
    if (p.busy.some((b) => new Date(b.start) < end && new Date(b.end) > start)) return { error: "Platsen är redan bokad under en del av tiden." };
    return { price: calculatePrice({ start, end, pricePerHourOre: p.pricePerHourOre, pricePerDayOre: p.pricePerDayOre }) };
  }, [from, to, p, minValue]);

  const useNew = vehicle === "" || p.vehicles.length === 0;

  return (
    <form action={action} className="space-y-4" aria-label="Boka platsen">
      <input type="hidden" name="spotId" value={p.spotId} />
      <FormAlert state={state} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={f("from")} className="label">
            Från
          </label>
          <input id={f("from")} name="from" type="datetime-local" step={900} min={minValue} required className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label htmlFor={f("to")} className="label">
            Till
          </label>
          <input id={f("to")} name="to" type="datetime-local" step={900} min={from || minValue} required className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <fieldset>
        <legend className="label">Bil</legend>
        {p.vehicles.length > 0 ? (
          <select name="vehicleReg" className="input" value={vehicle} onChange={(e) => setVehicle(e.target.value)} aria-label="Välj bil">
            {p.vehicles.map((v) => (
              <option key={v.id} value={v.reg}>
                {v.reg}
                {v.nickname ? ` – ${v.nickname}` : ""}
              </option>
            ))}
            <option value="">Annan bil…</option>
          </select>
        ) : null}
        {useNew ? (
          <div className={p.vehicles.length ? "mt-2" : ""}>
            <label htmlFor={f("newReg")} className="sr-only">
              Registreringsnummer
            </label>
            <input
              id={f("newReg")}
              name="newReg"
              className="input uppercase"
              placeholder="Registreringsnummer, t.ex. ABC123"
              autoComplete="off"
              defaultValue={state?.values?.newReg}
              {...errProps(state, "newReg")}
            />
            <FieldError state={state} name="newReg" />
          </div>
        ) : null}
        {p.requiresVehicleRegistration ? (
          <p className="hint">Föreningen kräver att bilen registreras. Uthyraren registrerar ditt registreringsnummer innan bokningen startar.</p>
        ) : null}
      </fieldset>

      <div className="rounded-xl bg-canvas p-4 text-sm" aria-live="polite">
        {!preview ? (
          <p className="text-muted">Välj tid för att se priset.</p>
        ) : "error" in preview ? (
          <p className="font-medium text-danger">{preview.error}</p>
        ) : (
          <dl className="space-y-1">
            <div className="flex justify-between">
              <dt>Parkering, {formatDuration(preview.price!.billableMinutes)}</dt>
              <dd>{formatSek(preview.price!.baseOre)}</dd>
            </div>
            <div className="flex justify-between text-ink-soft">
              <dt>Serviceavgift</dt>
              <dd>{formatSek(preview.price!.feeOre)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-2 text-base font-bold">
              <dt>Totalt</dt>
              <dd data-testid="price-total">{formatSek(preview.price!.totalOre)}</dd>
            </div>
          </dl>
        )}
      </div>

      <SubmitButton className="btn-primary btn-lg w-full" pendingText="Reserverar…">
        {p.loggedIn ? "Fortsätt till betalning" : "Logga in och boka"}
      </SubmitButton>
      <p className="text-center text-xs text-muted">Platsen reserveras i 15 minuter medan du betalar.</p>
    </form>
  );
}
