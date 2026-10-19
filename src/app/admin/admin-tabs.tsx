"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Att granska", exact: true },
  { href: "/admin/platser", label: "Platser" },
  { href: "/admin/konton", label: "Uthyrare" },
  { href: "/admin/epost", label: "E-post" },
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

/** A GET form whose selects apply as soon as they change; the text search applies on Enter or "Sök". */
export function FilterForm({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <form
      method="get"
      role="search"
      className={className}
      onChange={(e) => {
        if (e.target instanceof HTMLSelectElement) e.currentTarget.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}
