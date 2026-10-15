"use client";

import Link from "next/link";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-20 text-center">
      <h1 className="text-3xl font-bold">Något gick fel</h1>
      <p className="mt-3 text-ink-soft">Det är vårt fel, inte ditt. Försök igen om en stund.</p>
      {error.digest ? <p className="mt-2 font-mono text-xs text-muted">Felkod: {error.digest}</p> : null}
      <div className="mt-6 flex justify-center gap-3">
        <button onClick={reset} className="btn-primary">
          Försök igen
        </button>
        <Link href="/hjalp#kontakt" className="btn-secondary">
          Kontakta supporten
        </Link>
      </div>
    </div>
  );
}
