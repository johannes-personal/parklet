import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { api, cols, embed, must, names, parse } from "@/db/api";
import { hostAccounts, mailOutbox } from "@/db/schema";
import { Unavailable } from "@/components/unavailable";
import { requireAdmin } from "@/lib/auth/session";
import { mailKindLabel } from "@/lib/labels";
import { formatDateTime } from "@/lib/time";

export const metadata: Metadata = { title: "Mejl – administration", robots: { index: false } };

type P = PageProps<"/admin/epost/[id]">;

export default function MailPage(props: P) {
  return (
    <div className="mx-auto w-full max-w-3xl py-8">
      <Suspense fallback={<div className="card h-96 animate-pulse" />}>
        <Content {...props} />
      </Suspense>
    </div>
  );
}

async function Content({ params }: P) {
  await requireAdmin();
  const { id } = await params;
  const row = /^\d{1,12}$/.test(id)
    ? must(
        await api()
          .from("mail_outbox")
          .select(`${cols(mailOutbox)},${embed("account", hostAccounts, ["name"])}`)
          .eq(names(mailOutbox).id, Number(id))
          .maybeSingle(),
        "MailPage",
      )
    : null;
  if (!row) {
    return (
      <Unavailable title="Mejlet finns inte" actions={[{ href: "/admin/epost", label: "All e-post" }]}>
        <p>Mejlet har tagits bort, eller så är länken fel.</p>
      </Unavailable>
    );
  }
  const m = parse(mailOutbox, row);
  const accountName = (row as { account: { name: string } | null }).account?.name;

  return (
    <div className="space-y-6">
      <Link href="/admin/epost" className="link text-sm">
        ← All e-post
      </Link>
      <div>
        <h1 className="text-2xl font-bold">{m.subject}</h1>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Till</dt>
          <dd className="break-all">{m.to}</dd>
          <dt className="text-muted">Typ</dt>
          <dd>{mailKindLabel(m.kind)}</dd>
          {m.hostAccountId ? (
            <>
              <dt className="text-muted">Organisation</dt>
              <dd>
                <Link href={`/admin/konton/${m.hostAccountId}`} className="link">
                  {accountName}
                </Link>
              </dd>
            </>
          ) : null}
          <dt className="text-muted">Skickat</dt>
          <dd>{formatDateTime(m.createdAt)}</dd>
        </dl>
      </div>
      {m.html ? (
        // Sandboxed: the mail's HTML can't run scripts or reach this page. Its links open in a
        // new tab, as in a mail program (inside the frame Parklet's pages refuse to load).
        <iframe
          title={`Mejl: ${m.subject}`}
          srcDoc={inNewTab(m.html)}
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          className="h-[720px] w-full rounded-lg border border-line bg-white"
        />
      ) : null}
      <details className="card p-4" open={!m.html}>
        <summary className="cursor-pointer text-sm font-medium">Som text</summary>
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
      </details>
    </div>
  );
}

/** The mail's HTML with every link opening in a new tab. */
function inNewTab(html: string) {
  const base = '<base target="_blank">';
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (head) => head + base) : base + html;
}
