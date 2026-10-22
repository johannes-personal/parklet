import Link from "next/link";
import { mailKindLabel } from "@/lib/labels";
import { formatDateTime } from "@/lib/time";
import type { LoggedMail } from "@/server/mail-log";

/** A sent mail as its recipient saw it, with its facts and the plain-text version. */
export function MailView({ mail: m, back, accountHref }: { mail: LoggedMail; back: { href: string; label: string }; accountHref?: string }) {
  return (
    <div className="space-y-6">
      <Link href={back.href} className="link text-sm">
        ← {back.label}
      </Link>
      <div>
        <h1 className="text-2xl font-bold">{m.subject}</h1>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Till</dt>
          <dd className="break-all">{m.to}</dd>
          <dt className="text-muted">Typ</dt>
          <dd>{mailKindLabel(m.kind)}</dd>
          {m.accountName ? (
            <>
              <dt className="text-muted">Organisation</dt>
              <dd>
                {accountHref ? (
                  <Link href={accountHref} className="link">
                    {m.accountName}
                  </Link>
                ) : (
                  m.accountName
                )}
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
