import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Pager } from "@/app/admin/list-controls";
import { FilterForm, Select } from "@/components/filter-form";
import { HostHeading, loadHostAccount } from "@/components/host/host-page";
import { MAIL_KIND_LABEL, mailKindLabel } from "@/lib/labels";
import { formatDateTime } from "@/lib/time";
import { searchMail } from "@/server/admin-search";

export const metadata: Metadata = { title: "E-post – uthyrarkonto", robots: { index: false } };

type P = PageProps<"/uthyrare/[accountId]/epost">;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const pick = <T extends string>(v: string | undefined, allowed: readonly T[]) => (allowed.includes(v as T) ? (v as T) : undefined);

/** The mail Parklet sent about the account to its administrators, and on their behalf. */
export default function HostMailListPage(props: P) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <Suspense fallback={<div className="card h-96 animate-pulse" />}>
        <Content {...props} />
      </Suspense>
    </div>
  );
}

async function Content({ params, searchParams }: P) {
  const { accountId } = await params;
  const loaded = await loadHostAccount(accountId, `/uthyrare/${accountId}/epost`);
  if ("denied" in loaded) return loaded.denied;
  const { account } = loaded;
  const sp = await searchParams;
  const kind = one(sp.typ);
  const f = {
    account: accountId,
    hostView: true,
    q: one(sp.q)?.slice(0, 100),
    kind: kind && kind in MAIL_KIND_LABEL ? kind : undefined,
    sort: pick(one(sp.sortera), ["to", "kind"] as const),
    page: Number(one(sp.sida)) || 1,
  };
  const { rows, total, page, byKind } = await searchMail(f);
  const base = `/uthyrare/${accountId}/epost`;
  const href = (change: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string | undefined> = { q: f.q, typ: f.kind, sortera: f.sort, ...change };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    return `${base}${p.size ? `?${p}` : ""}`;
  };
  const kinds = Object.entries(byKind)
    .filter(([k]) => k)
    .map(([k, n]) => [k, `${mailKindLabel(k)} (${n})`] as [string, string])
    .sort((a, b) => a[1].localeCompare(b[1], "sv"));
  const filtered = f.q || f.kind || f.sort;

  return (
    <div className="space-y-4">
      <HostHeading account={account} title="E-post" />
      <p className="max-w-3xl text-ink-soft">
        Mejlen Parklet har skickat om kontot till {account.kind === "household" ? "dig" : "kontots administratörer"}, och de som gått ut för{" "}
        {account.kind === "household" ? "din" : "er"} räkning: förfrågningar till föreningen eller hyresvärden och inbjudningar.
      </p>
      <FilterForm className="card space-y-3 p-4">
        <div className="flex gap-2">
          <label htmlFor="q" className="sr-only">
            Sök
          </label>
          <input id="q" name="q" type="search" defaultValue={f.q} placeholder="Sök mottagare eller ämne" className="input" />
          <button className="btn-primary shrink-0">Sök</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Typ" name="typ" value={f.kind} options={kinds} />
          <Select label="Sortera" name="sortera" value={f.sort} all="Senast skickat" options={[["to", "Mottagare A–Ö"], ["kind", "Typ"]]} />
        </div>
        {filtered ? (
          <Link href={base} className="inline-block text-sm text-muted underline-offset-2 hover:underline">
            Rensa
          </Link>
        ) : null}
      </FilterForm>

      {rows.length === 0 ? (
        <p className="card p-6 text-ink-soft">{filtered ? "Inga mejl matchar." : "Inga mejl ännu."}</p>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="hidden border-b border-line bg-canvas text-xs tracking-wide text-muted uppercase md:table-header-group">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Ämne</th>
                <th className="px-4 py-2.5 font-semibold">Typ</th>
                <th className="px-4 py-2.5 font-semibold">Mottagare</th>
                <th className="px-4 py-2.5 font-semibold">Skickat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((m) => (
                <tr key={m.id} className="relative grid gap-1 px-4 py-3 hover:bg-canvas md:table-row md:p-0">
                  <td className="md:px-4 md:py-3">
                    <Link href={`${base}/${m.id}`} className="font-semibold after:absolute after:inset-0">
                      {m.subject}
                    </Link>
                  </td>
                  <td className="text-ink-soft md:px-4 md:py-3">{mailKindLabel(m.kind)}</td>
                  <td className="break-all text-ink-soft md:px-4 md:py-3">{m.to}</td>
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
