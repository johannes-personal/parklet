"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { logoutAction } from "@/app/(auth)/actions";

type Props = { user: { name: string; isAdmin: boolean; isHost: boolean } | null };

/** Full-height side menu, like the original's hamburger menu. A modal <dialog> handles focus and Escape. */
export function MenuDrawer({ user }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();

  // Close after navigating (links inside the drawer, or back/forward).
  useEffect(() => {
    ref.current?.close();
  }, [pathname]);

  // Grouped by what you are doing: parking, renting out, or reviewing.
  const groups = [
    {
      title: "Parkera",
      links: [
        { href: "/sok", label: "Hitta parkering" },
        ...(user
          ? [
              { href: "/mina-bokningar", label: "Mina bokningar" },
              { href: "/fordon", label: "Mina fordon" },
            ]
          : []),
      ],
    },
    {
      title: "Hyr ut",
      // Hosts go to their dashboard; everyone else is shown how hosting works.
      links: [user?.isHost ? { href: "/uthyrare", label: "Uthyrning" } : { href: "/hyr-ut", label: "Hyr ut parkeringsplats" }],
    },
    ...(user?.isAdmin
      ? [
          {
            title: "Administration",
            links: [
              { href: "/admin", label: "Granskning" },
              { href: "/admin/platser", label: "Platser och uthyrare" },
            ],
          },
        ]
      : []),
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        aria-haspopup="dialog"
        className="inline-flex size-8 items-center justify-center rounded-md transition-colors hover:bg-white/10"
      >
        <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        <span className="sr-only">Meny</span>
      </button>
      <dialog
        ref={ref}
        aria-label="Meny"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="theme-dark m-0 ml-auto h-dvh max-h-none w-full max-w-[480px] bg-black text-white backdrop:bg-black/60 open:flex open:flex-col"
      >
        <div className="flex flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-8">
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="mb-8 ml-auto block text-3xl leading-none text-white/80 transition-colors hover:text-white"
          >
            <span aria-hidden>×</span>
            <span className="sr-only">Stäng menyn</span>
          </button>
          <nav aria-label="Meny" className="space-y-6">
            {groups.map((g, i) => (
              <section key={g.title} aria-labelledby={`meny-${i}`}>
                <h2 id={`meny-${i}`} className="px-4 pb-1 text-xs font-semibold tracking-[0.12em] text-white/45 uppercase">
                  {g.title}
                </h2>
                <ul>
                  {g.links.map((l) => (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        onClick={() => ref.current?.close()}
                        className="block rounded-2xl px-4 py-2.5 text-[1.625rem] font-medium tracking-[-0.03em] text-white/85 transition-colors hover:bg-white/8 hover:text-white"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </nav>
          <div className="mt-8 flex flex-wrap gap-3 px-4">
            {user ? (
              <form action={logoutAction}>
                <button className="btn-secondary">Logga ut</button>
              </form>
            ) : (
              <>
                <Link href="/registrera" onClick={() => ref.current?.close()} className="btn-primary">
                  Skapa konto
                </Link>
                <Link href="/logga-in" onClick={() => ref.current?.close()} className="btn-secondary">
                  Logga in
                </Link>
              </>
            )}
          </div>
        </div>
        <div className="border-t border-white/10 px-8 py-8 text-sm">
          <Link href="/hjalp" className="text-zinc-300 hover:text-white">
            Hjälp och kontakt
          </Link>
          <p className="mt-6 text-xl font-semibold text-zinc-400">Parklet</p>
          <p className="mt-1 font-light text-zinc-500">Parkering, delad</p>
        </div>
      </dialog>
    </>
  );
}
