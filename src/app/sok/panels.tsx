"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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
export function SpotPanel({ title, closeHref, shareHref, children }: { title: string; closeHref: string; shareHref?: string; children: React.ReactNode }) {
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
        <span className="ml-auto" />
        {shareHref ? <ShareButton href={shareHref} title={title} /> : null}
        <Link href={closeHref} scroll={false} className="-mr-2 rounded-md px-2 py-1 text-2xl leading-none text-muted hover:bg-canvas hover:text-ink">
          <span aria-hidden>×</span>
          <span className="sr-only">Stäng</span>
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">{children}</div>
    </aside>
  );
}

/**
 * Share a spot's own page. Phones get the system share sheet; elsewhere the
 * link is copied, with a short confirmation. The link carries the times now
 * chosen in the panel's booking form, which may differ from the search's.
 */
function ShareButton({ href, title }: { href: string; title: string }) {
  const button = useRef<HTMLButtonElement>(null);
  const [share, setShare] = useState(false);
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- only known in the browser
    setShare(typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches);
  }, []);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 2500);
    return () => clearTimeout(t);
  }, [copied]);

  async function onClick() {
    const link = new URL(href, window.location.origin);
    const form = button.current?.closest("[data-spot-panel]")?.querySelector<HTMLFormElement>('form[aria-label="Boka platsen"]');
    const from = form?.querySelector<HTMLInputElement>('input[name="from"]')?.value;
    const to = form?.querySelector<HTMLInputElement>('input[name="to"]')?.value;
    if (from && to) {
      link.searchParams.set("from", from);
      link.searchParams.set("to", to);
    }
    const url = link.toString();
    if (share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-ink-soft hover:bg-canvas hover:text-ink"
      >
        <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
        {copied === "ok" ? "Kopierad!" : share ? "Dela" : "Kopiera länk"}
      </button>
      <span role="status" className="sr-only">
        {copied === "ok" ? "Länken är kopierad" : copied === "fail" ? "Kunde inte kopiera länken" : ""}
      </span>
    </>
  );
}
