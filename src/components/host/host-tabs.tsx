"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

/**
 * A host account's pages, as tabs like the admin's. Shown on every page of an account
 * (src/app/uthyrare/[accountId]/layout.tsx), and on /uthyrare for someone with a
 * single account, where the account comes as a prop.
 */
export function HostTabs({ accountId: given }: { accountId?: string }) {
  const params = useParams<{ accountId?: string }>();
  const pathname = usePathname();
  const accountId = given ?? params.accountId;
  if (!accountId) return null;
  const base = `/uthyrare/${accountId}`;
  const tabs = [
    { href: base, label: "Översikt", active: pathname === base || pathname === "/uthyrare" },
    { href: `${base}/granska`, label: "Granska" },
    { href: `${base}/platser`, label: "Parkeringsplatser" },
    { href: `${base}/bokningar`, label: "Bokningar" },
    { href: `${base}/epost`, label: "E-post" },
    { href: `${base}/administratorer`, label: "Administratörer" },
  ];
  return (
    <nav aria-label="Uthyrarkonto" className="flex gap-1 overflow-x-auto rounded-xl bg-white/5 p-1 ring-1 ring-white/10">
      {tabs.map((t) => {
        const active = t.active ?? pathname.startsWith(t.href);
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
