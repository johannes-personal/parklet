import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Kontot är borttaget", robots: { index: false } };

export default function AccountDeletedPage() {
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-12">
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl font-bold">Ditt konto är borttaget</h1>
        <p className="mt-2 text-ink-soft">
          Dina uppgifter, bilar och notiser är borttagna och du är utloggad. Bokningar du gjort sparas utan ditt namn, eftersom de måste finnas kvar i bokföringen.
        </p>
        <Link href="/" className="btn-primary mt-6">
          Till startsidan
        </Link>
      </div>
    </div>
  );
}
