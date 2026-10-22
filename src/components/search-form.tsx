"use client";

import { useFieldIds } from "@/components/use-field-ids";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PlaceSearch, type PickedPlace } from "./place-search";
import { TimeRangePicker } from "./time-range-picker";

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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if ((from && !to) || (!from && to)) {
      setError("Ange både från och till, eller lämna båda tomma för att se alla parkeringsplatser.");
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
    // A new place or time keeps the filters chosen on the results.
    const current = new URLSearchParams(window.location.search);
    for (const key of ["typ", "el", "tak"]) {
      const v = current.get(key);
      if (v) params.set(key, v);
    }
    router.push(`/sok?${params.toString()}`);
  }

  return (
    <form onSubmit={submit} className={compact ? "space-y-4" : "space-y-5"} aria-label="Sök parkering">
      <PlaceSearch id={f("where")} label="Var vill du parkera?" defaultValue={initial?.q} onPick={setPlace} />
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <p className="label mb-0">När?</p>
          {from || to ? (
            <button
              type="button"
              onClick={() => {
                setFrom("");
                setTo("");
              }}
              className="text-sm text-muted underline-offset-2 hover:text-ink hover:underline"
            >
              Rensa tid
            </button>
          ) : (
            <span className="text-sm text-muted">Valfritt</span>
          )}
        </div>
        <TimeRangePicker
          from={from}
          to={to}
          onChange={(a, b) => {
            setFrom(a);
            setTo(b);
            setError("");
          }}
        />
      </div>
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
