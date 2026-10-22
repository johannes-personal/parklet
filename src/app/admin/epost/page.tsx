import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FilterForm, Select } from "@/components/filter-form";
import { Pager } from "@/app/admin/list-controls";
import { requireAdmin } from "@/lib/auth/session";
import { MAIL_KIND_LABEL, mailKindLabel } from "@/lib/labels";
import { formatDateTime } from "@/lib/time";
import { searchMail, type MailFilters } from "@/server/admin-search";
import { isUuid } from "@/server/ids";

export const metadata: Metadata = { title: "E-post – administration", robots: { index: false } };

type SP = Awaited<PageProps<"/admin/epost">["searchParams"]>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const pick = <T extends string>(v: string | undefined, allowed: readonly T[]) => (allowed.includes(v as T) ? (v as T) : undefined);

function filtersFrom(sp: SP): MailFilters {
  const kind = one(sp.typ);
  const account = one(sp.konto);
  return {
    q: one(sp.q)?.slice(0, 100),
    kind: kind === "ovrigt" ? "" : kind && kind in MAIL_KIND_LABEL ? kind : undefined,
    account: account && isUuid(account) ? account : undefined,
    sort: pick(one(sp.sortera), ["to", "account", "kind"] as const),
    page: Number(one(sp.sida)) || 1,
  };
}

/** Every mail Parklet has sent, filtered and sorted like the other admin lists; a row opens the mail. */
export default function OutboxPage({ searchParams }: PageProps<"/admin/epost">) {
  return (
    <div className="py-8">
      <h1 className="text-2xl font-bold">E-post</h1>
      <p className="mt-1 max-w-3xl text-ink-soft">
        Alla mejl Parklet skickar, även till demokontonas påhittade adresser (@parklet.test), som aldrig skickas på riktigt. Länkar för godkännande,
        inbjudningar och lösenord kan följas härifrån.
      </p>
      <Suspense fallback={<div className="card mt-6 h-96 animate-pulse" />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Results({ searchParams }: { searchParams: PageProps<"/admin/epost">["searchParams"] }) {
  await requireAdmin();
  const sp = await searchParams;
  const f = filtersFrom(sp);
  const { rows, total, page, byKind, accounts } = await searchMail(f);
  const kindParam = f.kind === "" ? "ovrigt" : f.kind;
  const href = (change: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string | undefined> = { q: f.q, typ: kindParam, konto: f.account, sortera: f.sort, ...change };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    return `/admin/epost${p.size ? `?${p}` : ""}`;
  };
  const kinds = Object.entries(byKind)
    .map(([k, n]) => [k === "" ? "ovrigt" : k, `${mailKindLabel(k || null)} (${n})`] as [string, string])
    .sort((a, b) => a[1].localeCompare(b[1], "sv"));

  return (
    <div className="mt-4 space-y-4">
      <FilterForm className="card space-y-3 p-4">
        <div className="flex gap-2">
          <label htmlFor="q" className="sr-only">
            Sök
          </label>
          <input id="q" name="q" type="search" defaultValue={f.q} placeholder="Sök mottagare, ämne eller organisation" className="input" />
          <button className="btn-primary shrink-0">Sök</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Select label="Typ" name="typ" value={kindParam} options={kinds} />
          <Select label="Organisation" name="konto" value={f.account} options={accounts.map((a) => [a.id, `${a.name} (${a.n})`])} />
          <Select
            label="Sortera"
            name="sortera"
            value={f.sort}
            all="Senast skickat"
            options={[["to", "Mottagare A–Ö"], ["account", "Organisation A–Ö"], ["kind", "Typ"]]}
          />
        </div>
        {f.q || f.kind !== undefined || f.account || f.sort ? (
          <Link href="/admin/epost" className="inline-block text-sm text-muted underline-offset-2 hover:underline">
            Rensa
          </Link>
        ) : null}
      </FilterForm>

      {rows.length === 0 ? (
        <p className="card p-6 text-ink-soft">{f.q || f.kind !== undefined || f.account ? "Inga mejl matchar." : "Inga mejl ännu."}</p>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="hidden border-b border-line bg-canvas text-xs tracking-wide text-muted uppercase md:table-header-group">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Ämne</th>
                <th className="px-4 py-2.5 font-semibold">Typ</th>
                <th className="px-4 py-2.5 font-semibold">Mottagare</th>
                <th className="px-4 py-2.5 font-semibold">Organisation</th>
                <th className="px-4 py-2.5 font-semibold">Skickat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((m) => (
                <tr key={m.id} className="relative grid gap-1 px-4 py-3 hover:bg-canvas md:table-row md:p-0">
                  <td className="md:px-4 md:py-3">
                    <Link href={`/admin/epost/${m.id}`} className="font-semibold after:absolute after:inset-0">
                      {m.subject}
                    </Link>
                  </td>
                  <td className="text-ink-soft md:px-4 md:py-3">{mailKindLabel(m.kind)}</td>
                  <td className="break-all text-ink-soft md:px-4 md:py-3">{m.to}</td>
                  <td className="text-ink-soft md:px-4 md:py-3">{m.accountName ?? <span className="text-muted">–</span>}</td>
                  <td className="whitespace-nowrap text-muted md:px-4 md:py-3">{formatDateTime(m.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager total={total} page={page} href={(p) => href({ sida: p > 1 ? String(p) : undefined })} />
    </div>
  );
}
