"use client";

import { useFieldIds } from "@/components/use-field-ids";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { addMinutes, nextQuarterHour, toLocalInputValue } from "@/lib/time";
import { PlaceSearch, type PickedPlace } from "./place-search";
import { useNowMin } from "@/components/use-now-min";

export function SearchForm({
  initial,
  compact = false,
}: {
  initial?: { q?: string; lat?: number; lng?: number; from?: string; to?: string };
  compact?: boolean;
}) {
  const f = useFieldIds();
  const router = useRouter();
  const [place, setPlace] = useState<PickedPlace | null>(
    initial?.lat != null && initial?.lng != null ? { label: initial.q ?? "", lat: initial.lat, lng: initial.lng } : null,
  );
  const [from, setFrom] = useState(initial?.from ?? "");
  const [to, setTo] = useState(initial?.to ?? "");
  const [error, setError] = useState("");
  const minValue = useNowMin();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if ((from && !to) || (!from && to)) {
      setError("Ange både från och till, eller lämna båda tomma för att se alla platser.");
      return;
    }
    if (from && to && to <= from) {
      setError("Sluttiden måste vara efter starttiden.");
      return;
    }
    setError("");
    const params = new URLSearchParams();
    if (place) {
      params.set("q", place.label);
      params.set("lat", place.lat.toFixed(5));
      params.set("lng", place.lng.toFixed(5));
    }
    if (from && to) {
      params.set("from", from);
      params.set("to", to);
    }
    router.push(`/sok?${params.toString()}`);
  }

  function quick(hours: number) {
    const start = nextQuarterHour();
    setFrom(toLocalInputValue(start));
    setTo(toLocalInputValue(addMinutes(start, hours * 60)));
  }

  return (
    <form onSubmit={submit} className={compact ? "space-y-4" : "space-y-5"} aria-label="Sök parkering">
      <PlaceSearch id={f("where")} label="Var vill du parkera?" defaultValue={initial?.q} onPick={setPlace} />
      <fieldset>
        <legend className="label">När?</legend>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={f("from")} className="mb-1 block text-xs font-medium text-muted">
              Från
            </label>
            <input id={f("from")} type="datetime-local" step={900} min={minValue} className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label htmlFor={f("to")} className="mb-1 block text-xs font-medium text-muted">
              Till
            </label>
            <input id={f("to")} type="datetime-local" step={900} min={from || minValue} className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          <span className="text-muted">Snabbval:</span>
          {[1, 2, 4, 8].map((h) => (
            <button key={h} type="button" onClick={() => quick(h)} className="rounded-full border border-line px-3 py-0.5 hover:bg-canvas">
              {h} tim från nu
            </button>
          ))}
        </div>
      </fieldset>
      {error ? (
        <p role="alert" className="field-error">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn-primary btn-lg w-full">
        Sök parkering
      </button>
    </form>
  );
}
