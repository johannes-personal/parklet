import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { Suspense } from "react";
import { db } from "@/db";
import { mailOutbox } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/time";

export const metadata: Metadata = { title: "Utkorg för e-post", robots: { index: false } };

export default function OutboxPage() {
  return (
    <div className="mx-auto w-full max-w-3xl py-8">
      <h1 className="text-2xl font-bold">Utkorg för e-post</h1>
      <p className="mt-1 text-ink-soft">
        Alla mejl Parklet skickar, även till demokontonas påhittade adresser (@parklet.test), som aldrig skickas på riktigt. Länkar för godkännande,
        inbjudningar och lösenord kan följas härifrån.
      </p>
      <Suspense fallback={<div className="card mt-6 h-40 animate-pulse" />}>
        <Mails />
      </Suspense>
    </div>
  );
}

async function Mails() {
  await requireAdmin();
  const mails = await db.select().from(mailOutbox).orderBy(desc(mailOutbox.id)).limit(50);
  if (mails.length === 0) return <p className="mt-6 text-sm text-muted">Inga mejl ännu.</p>;
  return (
    <ul className="mt-6 space-y-3">
      {mails.map((m) => (
        <li key={m.id} className="card p-4">
          <p className="text-sm text-muted">
            {formatDateTime(m.createdAt)} · till {m.to}
          </p>
          <p className="font-semibold">{m.subject}</p>
          <pre className="mt-2 overflow-x-auto font-sans text-sm whitespace-pre-wrap text-ink-soft">
            {m.text.split(/(https?:\/\/\S+)/).map((part, i) =>
              /^https?:\/\//.test(part) ? (
                <a key={i} href={part} className="link">
                  {part}
                </a>
              ) : (
                part
              ),
            )}
          </pre>
          {m.html ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium">Visa som mejl</summary>
              {/* Sandboxed: the mail's HTML can't run scripts or reach this page. */}
              <iframe title={`Mejl: ${m.subject}`} srcDoc={m.html} sandbox="" className="mt-2 h-[640px] w-full rounded-lg border border-line" />
            </details>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
