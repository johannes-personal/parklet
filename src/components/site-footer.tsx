import Link from "next/link";
import { Logo } from "./logo";

const groups = [
  {
    title: "Förare",
    links: [
      { href: "/sok", label: "Hitta parkering" },
      { href: "/mina-bokningar", label: "Mina bokningar" },
      { href: "/hjalp#forare", label: "Så fungerar det" },
    ],
  },
  {
    title: "Uthyrare",
    links: [
      { href: "/hyr-ut", label: "Hyr ut din plats" },
      { href: "/hyr-ut#foreningar", label: "För föreningar och fastighetsägare" },
      { href: "/hjalp#uthyrare", label: "Verifiering och utbetalning" },
    ],
  },
  {
    title: "Parklet",
    links: [
      { href: "/om", label: "Om oss" },
      { href: "/hjalp", label: "Hjälp och kontakt" },
      { href: "/villkor", label: "Användarvillkor" },
      { href: "/integritet", label: "Integritetspolicy" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="site-footer mt-16 border-t border-line bg-black">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-muted">Hitta en ledig plats nära dig, eller tjäna pengar på din egen när den står tom.</p>
        </div>
        {groups.map((g) => (
          <nav key={g.title} aria-label={g.title}>
            <h2 className="text-sm font-semibold">{g.title}</h2>
            <ul className="mt-3 space-y-2 text-sm text-ink-soft">
              {g.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="hover:text-ink hover:underline">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-x-6 gap-y-1 px-4 py-4 text-xs text-muted">
          <p>© Parklet. MVP – betalningar och e-legitimation körs i testläge.</p>
          <p>
            Bakgrundskarta:{" "}
            <a href="https://openfreemap.org" className="hover:text-ink hover:underline">
              OpenFreeMap
            </a>{" "}
            ©{" "}
            <a href="https://www.openmaptiles.org/" className="hover:text-ink hover:underline">
              OpenMapTiles
            </a>
            , data ©{" "}
            <a href="https://www.openstreetmap.org/copyright" className="hover:text-ink hover:underline">
              OpenStreetMap-bidragsgivare
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
