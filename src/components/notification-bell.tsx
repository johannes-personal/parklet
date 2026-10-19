"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { bellDataAction, markNotificationsReadAction } from "@/app/notification-actions";
import type { BellData } from "@/server/notifications";

const ago = new Intl.RelativeTimeFormat("sv-SE", { numeric: "auto" });
function timeAgo(iso: string) {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return ago.format(minutes, "minute");
  if (Math.abs(minutes) < 1440) return ago.format(Math.round(minutes / 60), "hour");
  return ago.format(Math.round(minutes / 1440), "day");
}

/**
 * The bell in the header. "Att göra" lists open tasks (they stay until done);
 * "Händelser" lists what happened. The red number counts unread events and
 * clears when the bell is opened; open tasks alone show a dot. The header
 * isn't re-rendered on client-side navigation, so the bell refreshes itself.
 */
export function NotificationBell({ initial }: { initial: BellData }) {
  const [data, setData] = useState(initial);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const pathname = usePathname();

  // Close and refresh after navigating (e.g. after doing one of the tasks), and when coming back to the tab.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    let current = true;
    const refresh = () =>
      bellDataAction().then((d) => {
        if (current && d) setData(d);
      });
    void refresh();
    window.addEventListener("focus", refresh);
    return () => {
      current = false;
      window.removeEventListener("focus", refresh);
    };
  }, [pathname]);

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
    if (next && data.unread > 0) {
      // Clear the number now; the items stay bold until the panel is closed.
      setData((d) => ({ ...d, unread: 0 }));
      void markNotificationsReadAction();
    } else if (!next) {
      setData((d) => ({ ...d, items: d.items.map((i) => ({ ...i, read: true })) }));
    }
  }

  const { todos, items, unread } = data;
  const label = unread > 0 ? `Notiser, ${unread} nya` : todos.length > 0 ? `Notiser, ${todos.length} att göra` : "Notiser";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={label}
        className="relative inline-flex size-8 items-center justify-center rounded-md transition-colors hover:bg-white/10"
      >
        <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-[18px]">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 ? (
          <span aria-hidden className="absolute -top-0.5 -right-0.5 grid min-w-[18px] place-items-center rounded-full bg-red-500 px-1 text-[11px] leading-[18px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : todos.length > 0 ? (
          <span aria-hidden className="absolute top-0.5 right-0.5 size-2.5 rounded-full bg-amber-400 ring-2 ring-black" />
        ) : null}
      </button>
      {open ? (
        <div id={panelId} className="card absolute top-11 -right-14 z-10 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden text-sm shadow-xl sm:right-0">
          {todos.length > 0 ? (
            <section aria-label="Att göra" className="border-b border-line">
              <h2 className="px-4 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">Att göra</h2>
              <ul>
                {todos.map((t) => (
                  <li key={t.key}>
                    <Link href={t.href} onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2.5 font-medium hover:bg-canvas">
                      <span aria-hidden className="size-2 shrink-0 rounded-full bg-amber-400" />
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
                    <Link href={n.href} onClick={() => setOpen(false)} className="block px-4 py-2.5 hover:bg-canvas">
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
