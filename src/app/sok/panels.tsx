"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * The results list floating over the map. On phones it is a bottom sheet that
 * starts collapsed, so the map stays usable; it opens with one tap.
 */
export function ListPanel({ summary, children }: { summary: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <aside
      aria-label="Sökresultat"
      data-open={open}
      className="card pointer-events-auto absolute inset-x-2 bottom-2 flex max-h-[8.5rem] flex-col overflow-hidden shadow-2xl transition-[max-height] data-[open=true]:max-h-[78dvh] sm:inset-x-auto sm:top-24 sm:bottom-4 sm:left-4 sm:max-h-none sm:w-[24rem] sm:data-[open=true]:max-h-none"
    >
      <div className="relative flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 pt-4 pb-3 sm:pt-3">
        <span aria-hidden className="absolute top-1.5 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-line-strong sm:hidden" />
        <div className="min-w-0">{summary}</div>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="btn-secondary shrink-0 px-3 py-1.5 sm:hidden">
          {open ? "Visa karta" : "Visa lista"}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
    </aside>
  );
}

/** The selected spot, over the map: beside the list on wide screens, over it on phones. Escape closes it. */
export function SpotPanel({ title, closeHref, children }: { title: string; closeHref: string; children: React.ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target instanceof HTMLSelectElement)) router.push(closeHref, { scroll: false });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [closeHref, router]);
  return (
    <aside
      aria-label={title}
      data-spot-panel
      className="card pointer-events-auto absolute inset-x-2 top-20 bottom-2 z-10 flex flex-col overflow-hidden shadow-2xl sm:inset-x-auto sm:top-24 sm:right-4 sm:bottom-4 sm:left-[26rem] lg:left-auto lg:w-[26rem]"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-2">
        <span className="text-sm font-medium text-muted">Parkeringsplats</span>
        <Link href={closeHref} scroll={false} className="-mr-2 rounded-md px-2 py-1 text-2xl leading-none text-muted hover:bg-canvas hover:text-ink">
          <span aria-hidden>×</span>
          <span className="sr-only">Stäng</span>
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">{children}</div>
    </aside>
  );
}
