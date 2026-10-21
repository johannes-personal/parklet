"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CITIES } from "@/lib/geo";

export type PickedPlace = { label: string; lat: number; lng: number; city?: string | null; detail?: string; street?: string | null; full?: string };
type Suggestion = PickedPlace & { detail: string };

/**
 * Accessible address combobox (WAI-ARIA 1.2 pattern). Shows popular cities
 * before the user types, so search works even if the geocoder is down.
 */
export function PlaceSearch({
  id,
  label,
  defaultValue = "",
  placeholder = "Adress, område eller stad",
  onPick,
  showNearMe = true,
  showFullAddress = false,
}: {
  id: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  onPick: (p: PickedPlace | null) => void;
  showNearMe?: boolean;
  /** After a pick, show the whole address (street, postnummer and postort) rather than just its name. */
  showFullAddress?: boolean;
}) {
  const listId = useId();
  const [query, setQuery] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [status, setStatus] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);

  const fallback: Suggestion[] = CITIES.map((c) => ({ label: c.name, detail: "Stad", lat: c.lat, lng: c.lng, city: c.name }));
  const options = query.trim().length >= 2 ? suggestions : fallback;

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || q === defaultValue) return;
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const json = (await res.json()) as { places: Suggestion[] };
        setSuggestions(json.places);
        setStatus(json.places.length ? `${json.places.length} förslag` : "Inga träffar. Prova att lägga till ort.");
      } catch {
        /* aborted or offline */
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, defaultValue]);

  function pick(s: Suggestion | PickedPlace) {
    setQuery(showFullAddress && s.full ? s.full : s.label);
    setOpen(false);
    setActive(-1);
    onPick(s);
  }

  function nearMe() {
    if (!navigator.geolocation) {
      setStatus("Din webbläsare kan inte dela position.");
      return;
    }
    setStatus("Hämtar din position…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        pick({ label: "Min position", lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus("");
      },
      () => setStatus("Vi fick inte tillgång till din position. Sök på en adress i stället."),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    );
  }

  return (
    <div className="relative">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          className="input"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(-1);
            onPick(null);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, options.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && open && active >= 0 && options[active]) {
              e.preventDefault();
              pick(options[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {showNearMe ? (
          <button type="button" onClick={nearMe} className="btn-secondary shrink-0 px-3" title="Använd min position">
            <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            </svg>
            <span className="sr-only sm:not-sr-only">Nära mig</span>
          </button>
        ) : null}
      </div>
      <p className="sr-only" aria-live="polite">
        {status}
      </p>
      {status && !open ? <p className="hint">{status}</p> : null}
      {open && options.length > 0 ? (
        <ul id={listId} role="listbox" className="card absolute z-[600] mt-2 max-h-80 w-full overflow-auto p-1 shadow-lg">
          {query.trim().length < 2 ? <li className="px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">Populära städer</li> : null}
          {options.map((s, i) => (
            <li
              key={`${s.lat},${s.lng},${i}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`cursor-pointer rounded-lg px-3 py-2 ${i === active ? "bg-brand-soft" : "hover:bg-canvas"}`}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
            >
              <span className="block font-medium">{s.label}</span>
              {s.detail ? <span className="block text-sm text-muted">{s.detail}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
