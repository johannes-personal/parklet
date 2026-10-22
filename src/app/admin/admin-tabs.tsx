"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { demoResetEnabled } from "@/lib/demo";

const TABS = [
  { href: "/admin", label: "Att granska", exact: true },
  { href: "/admin/platser", label: "Parkeringsplatser" },
  { href: "/admin/konton", label: "Uthyrare" },
  { href: "/admin/bokningar", label: "Bokningar" },
  { href: "/admin/epost", label: "E-post" },
  ...(demoResetEnabled() ? [{ href: "/admin/testdata", label: "Testdata" }] : []),
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Administration" className="flex gap-1 overflow-x-auto rounded-xl bg-white/5 p-1 ring-1 ring-white/10">
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className="shrink-0 rounded-lg px-4 py-2 text-sm font-semibold text-ink-soft transition-colors hover:text-ink aria-[current=page]:bg-white aria-[current=page]:text-black"
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
