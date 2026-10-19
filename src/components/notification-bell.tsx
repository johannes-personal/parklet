"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { markNotificationsReadAction } from "@/app/notification-actions";

type Item = { id: string; title: string; href: string; createdAt: string; read: boolean };
type Props = { todos: { key: string; title: string; href: string }[]; items: Item[]; unread: number };

const ago = new Intl.RelativeTimeFormat("sv-SE", { numeric: "auto" });
function timeAgo(iso: string) {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return ago.format(minutes, "minute");
  if (Math.abs(minutes) < 1440) return ago.format(Math.round(minutes / 60), "hour");
  return ago.format(Math.round(minutes / 1440), "day");
}

/** The bell in the header: things to do first, then recent events. Opening it marks the events read. */
export function NotificationBell({ todos, items, unread: initialUnread }: Props) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const pathname = usePathname();
  const count = todos.length + unread;

  // Follow the server's count after a refresh, and close after navigating.
  const [seen, setSeen] = useState({ initialUnread, pathname });
  if (seen.initialUnread !== initialUnread || seen.pathname !== pathname) {
    setSeen({ initialUnread, pathname });
    setUnread(initialUnread);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setUnread(0);
      startTransition(() => markNotificationsReadAction());
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="relative inline-flex size-8 items-center justify-center rounded-md transition-colors hover:bg-white/10"
      >
        <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-[18px]">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {count > 0 ? (
          <span aria-hidden className="absolute -top-0.5 -right-0.5 grid min-w-[18px] place-items-center rounded-full bg-red-500 px-1 text-[11px] leading-[18px] font-bold text-white">
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
        <span className="sr-only">{count > 0 ? `Notiser, ${count} att se över` : "Notiser"}</span>
      </button>
      {open ? (
        <div
          id={panelId}
          className="card absolute top-11 -right-14 z-10 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden text-sm shadow-xl sm:right-0"
        >
          {todos.length > 0 ? (
            <section aria-label="Att göra" className="border-b border-line">
              <h2 className="px-4 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">Att göra</h2>
              <ul>
                {todos.map((t) => (
                  <li key={t.key}>
                    <Link href={t.href} className="flex items-center gap-3 px-4 py-2.5 font-medium hover:bg-canvas">
                      <span aria-hidden className="size-2 shrink-0 rounded-full bg-red-500" />
                      {t.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section aria-label="Händelser">
            <h2 className="px-4 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">Händelser</h2>
            {items.length === 0 ? (
              <p className="px-4 pt-1 pb-4 text-muted">Inget nytt än.</p>
            ) : (
              <ul className="max-h-80 overflow-y-auto pb-1">
                {items.map((n) => (
                  <li key={n.id}>
                    <Link href={n.href} className="block px-4 py-2.5 hover:bg-canvas">
                      <span className={n.read ? "text-ink-soft" : "font-semibold"}>{n.title}</span>
                      <span className="block text-xs text-muted">{timeAgo(n.createdAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
