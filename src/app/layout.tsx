import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { SiteFooter } from "@/components/site-footer";
import { AccountNav, AccountNavFallback } from "@/components/account-nav";
import { Logo } from "@/components/logo";
import Link from "next/link";
import "./globals.css";

const appUrl = process.env.APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
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
  themeColor: "#1747d6",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="sv" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[1000] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:shadow"
        >
          Hoppa till innehållet
        </a>
        <header className="sticky top-0 z-[500] border-b border-line bg-surface/95 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
            <Link href="/" aria-label="Parklet, till startsidan" className="shrink-0">
              <Logo />
            </Link>
            <nav aria-label="Huvudmeny" className="flex items-center gap-1 text-sm font-medium sm:gap-2">
              <Link href="/sok" className="hidden rounded-lg px-3 py-2 hover:bg-canvas sm:block">
                Hitta parkering
              </Link>
              <Link href="/hyr-ut" className="rounded-lg px-3 py-2 hover:bg-canvas">
                Hyr ut din plats
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
