import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { SiteFooter } from "@/components/site-footer";
import { AccountNav, AccountNavFallback } from "@/components/account-nav";
import { Logo } from "@/components/logo";
import { MapBackdrop } from "@/components/map-backdrop";
import { appUrl } from "@/lib/app-url";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: {
    default: "Parklet – hyr och hyr ut parkeringsplatser",
    template: "%s · Parklet",
  },
  description:
    "Hitta en ledig parkeringsplats nära dig, eller tjäna pengar på din egen när du inte använder den. Boka per timme eller dygn i hela Sverige.",
  applicationName: "Parklet",
  openGraph: { siteName: "Parklet", locale: "sv_SE", type: "website" },
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="sv" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <MapBackdrop />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[1000] focus:rounded-lg focus:bg-white focus:text-black focus:px-4 focus:py-2 focus:shadow"
        >
          Hoppa till innehållet
        </a>
        {process.env.NEXT_PUBLIC_DEMO === "1" ? (
          <p className="bg-zinc-800 px-4 py-2 text-center text-sm font-medium text-zinc-300">
            Det här är en demo. Betalningar och BankID är simulerade – ladda inte upp riktiga dokument eller personuppgifter.
          </p>
        ) : null}
        <header className="sticky top-0 z-[500] px-3 pt-3 sm:px-4 sm:pt-4">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 rounded-2xl bg-black px-4 text-white shadow-lg ring-1 ring-white/10 sm:px-6">
            <Link href="/" aria-label="Parklet, till startsidan" className="flex shrink-0 items-center rounded-md transition-opacity hover:opacity-85">
              <Logo />
            </Link>
            <nav aria-label="Huvudmeny" className="flex items-center gap-4 text-sm sm:gap-6">
              <Link href="/hyr-ut" className="hidden text-zinc-300 transition-colors hover:text-white md:inline-flex">
                Bli uthyrare
              </Link>
              <Suspense fallback={<AccountNavFallback />}>
                <AccountNav />
              </Suspense>
            </nav>
          </div>
        </header>
        <main id="main" className="flex flex-1 flex-col">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
