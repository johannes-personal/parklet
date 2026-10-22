import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/session";
import { demoResetEnabled } from "@/lib/demo";
import { DEMO_PASSWORD, DEMO_USERS } from "@/server/demo-data";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Testdata", robots: { index: false } };

// The reset is a few dozen requests to the database; this is room to spare.
export const maxDuration = 60;

export default function TestDataPage() {
  return (
    <div className="mx-auto w-full max-w-3xl py-8">
      <h1 className="text-2xl font-bold">Återställ testdata</h1>
      <Suspense fallback={<div className="card mt-6 h-40 animate-pulse" />}>
        <Reset />
      </Suspense>
    </div>
  );
}

async function Reset() {
  await requireAdmin();
  if (!demoResetEnabled()) {
    return <p className="mt-1 text-ink-soft">Återställning av testdata är avstängd: den finns bara i demon och under utveckling.</p>;
  }
  return (
    <>
      <p className="mt-1 text-ink-soft">
        Tar bort all data och lägger in demon som den var från början: användare, uthyrarkonton, parkeringsplatser, bokningar, dokument, notiser och
        e-postutkorgen. Administratörer med en riktig e-postadress får vara kvar med sitt lösenord och sin BankID-legitimering, men allt de lagt in
        tas bort och de loggas ut överallt utom här.
      </p>
      <h2 className="mt-8 text-lg font-semibold">Demokontona</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Alla har lösenordet <code className="font-mono text-ink">{DEMO_PASSWORD}</code>. Adresserna tar aldrig emot mejl; det som skickas till dem
        finns under E-post.
      </p>
      <ul className="card mt-3 divide-y divide-line">
        {DEMO_USERS.map((u) => (
          <li key={u.email} className="px-4 py-3">
            <span className="font-medium">{u.email}</span>
            <span className="block text-sm text-muted">
              {u.name} · {u.role}
            </span>
          </li>
        ))}
      </ul>
      <ResetForm />
    </>
  );
}
