import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FilterForm } from "@/app/admin/admin-tabs";
import { Pager, Select } from "@/app/admin/list-controls";
import { Badge } from "@/components/status-badge";
import { requireAdmin } from "@/lib/auth/session";
import { formMatchesKind } from "@/lib/bolagsverket";
import { VERIFICATION_LABEL } from "@/lib/labels";
import { formatDateTime } from "@/lib/time";
import { searchAccounts, type AccountFilters } from "@/server/admin-search";
import { HOST_KIND_LABEL } from "@/server/host-accounts";

export const metadata: Metadata = { title: "Uthyrare – administration", robots: { index: false } };

type SP = Awaited<PageProps<"/admin/konton">["searchParams"]>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const pick = <T extends string>(v: string | undefined, allowed: readonly T[]) => (allowed.includes(v as T) ? (v as T) : undefined);

function filtersFrom(sp: SP): AccountFilters {
  return {
    q: one(sp.q)?.slice(0, 100),
    kind: pick(one(sp.typ), ["household", "association", "company"] as const),
    verification: pick(one(sp.status), ["unverified", "pending", "verified", "rejected"] as const),
    payout: pick(one(sp.utbetalning), ["active", "not_connected"] as const),
    sort: pick(one(sp.sortera), ["created", "name", "spots"] as const),
    page: Number(one(sp.sida)) || 1,
  };
}

/** Admins find any host account: private hosts, associations and companies, with owner and verification at a glance. */
export default function AdminAccountsPage({ searchParams }: PageProps<"/admin/konton">) {
  return (
    <div className="py-8">
      <h1 className="text-2xl font-bold">Uthyrare</h1>
      <Suspense fallback={<div className="card mt-6 h-96 animate-pulse" />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Results({ searchParams }: { searchParams: PageProps<"/admin/konton">["searchParams"] }) {
  await requireAdmin();
  const f = filtersFrom(await searchParams);
  const { rows, total, page, byVerification } = await searchAccounts(f);
  const all = Object.values(byVerification).reduce((a, b) => a + b, 0);
  const href = (change: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string | undefined> = { q: f.q, typ: f.kind, status: f.verification, utbetalning: f.payout, sortera: f.sort, ...change };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    return `/admin/konton${p.size ? `?${p}` : ""}`;
  };

  return (
    <div className="mt-4 space-y-4">
      <FilterForm className="card space-y-3 p-4">
        <div className="flex gap-2">
          <label htmlFor="q" className="sr-only">
            Sök
          </label>
          <input id="q" name="q" type="search" defaultValue={f.q} placeholder="Sök namn, org.nr, eller ägarens namn eller e-post" className="input" />
          <button className="btn-primary shrink-0">Sök</button>
        </div>
        {f.verification ? <input type="hidden" name="status" value={f.verification} /> : null}
        <div className="grid gap-3 sm:grid-cols-3">
          <Select label="Typ" name="typ" value={f.kind} options={Object.entries(HOST_KIND_LABEL)} />
          <Select label="Utbetalning" name="utbetalning" value={f.payout} options={[["active", "Kopplad"], ["not_connected", "Ej kopplad"]]} />
          <Select label="Sortera" name="sortera" value={f.sort} all="Senast skapad" options={[["name", "Namn A–Ö"], ["spots", "Flest platser"]]} />
        </div>
      </FilterForm>

      <nav aria-label="Verifiering" className="flex flex-wrap gap-2">
        {[["", "Alla", all] as const, ...Object.entries(VERIFICATION_LABEL).map(([v, l]) => [v, l.text, byVerification[v] ?? 0] as const)].map(([value, label, n]) => (
          <Link
            key={value}
            href={href({ status: value || undefined })}
            aria-current={(f.verification ?? "") === value ? "true" : undefined}
            className="rounded-full border border-line px-3 py-1 text-sm text-ink-soft hover:text-ink aria-[current]:border-white aria-[current]:bg-white aria-[current]:font-semibold aria-[current]:text-black"
          >
            {label} <span className="opacity-70">{n}</span>
          </Link>
        ))}
        {f.q || f.kind || f.verification || f.payout || f.sort ? (
          <Link href="/admin/konton" className="px-2 py-1 text-sm text-muted underline-offset-2 hover:underline">
            Rensa
          </Link>
        ) : null}
      </nav>

      {rows.length === 0 ? (
        <p className="card p-6 text-ink-soft">Inga uthyrare matchar.</p>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="hidden border-b border-line bg-canvas text-xs tracking-wide text-muted uppercase md:table-header-group">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Uthyrare</th>
                <th className="px-4 py-2.5 font-semibold">Ägare</th>
                <th className="px-4 py-2.5 font-semibold">Verifiering</th>
                <th className="px-4 py-2.5 font-semibold">Utbetalning</th>
                <th className="px-4 py-2.5 text-right font-semibold" title="Godkända av alla">
                  Platser
                </th>
                <th className="px-4 py-2.5 font-semibold">Skapad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map(({ account: a, spots, approved, owner }) => {
                const v = VERIFICATION_LABEL[a.verificationStatus];
                const formMismatch = a.kind !== "household" && formMatchesKind(a.registryForm, a.kind) === false;
                return (
                  <tr key={a.id} className="relative grid gap-1 px-4 py-3 hover:bg-canvas md:table-row md:p-0">
                    <td className="md:px-4 md:py-3">
                      <Link href={`/admin/konton/${a.id}`} className="font-semibold after:absolute after:inset-0">
                        {a.name}
                      </Link>
                      <span className="block text-muted">
                        {HOST_KIND_LABEL[a.kind]}
                        {a.orgNumber ? ` · ${a.orgNumber}` : ""}
                        {a.kind !== "household" ? (a.registryCheckedAt ? ` · Bolagsverket: ${a.registryStatus === "active" ? "aktiv" : a.registryStatus}` : " · ej kontrollerad hos Bolagsverket") : ""}
                      </span>
                      {formMismatch ? <span className="block font-medium text-warn">Registrerad som {a.registryForm}</span> : null}
                    </td>
                    <td className="text-ink-soft md:px-4 md:py-3">
                      {owner ? (
                        <>
                          {owner.name} {owner.verified ? <span className="text-ok">· BankID ✓</span> : <span className="text-muted">· ej legitimerad</span>}
                          <span className="block text-muted">{owner.email}</span>
                        </>
                      ) : (
                        "–"
                      )}
                    </td>
                    <td className="whitespace-nowrap md:px-4 md:py-3">
                      <Badge kind={v.kind}>{v.text}</Badge>
                    </td>
                    <td className="md:px-4 md:py-3">
                      {a.payoutStatus === "active" ? <span className="text-ok">Kopplad</span> : <span className="text-muted">Ej kopplad</span>}
                    </td>
                    <td className="text-ink-soft md:px-4 md:py-3 md:text-right">
                      <Link href={`/admin/platser?q=${encodeURIComponent(a.orgNumber ?? a.name)}`} className="link relative z-10">
                        {approved} av {spots}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap text-muted md:px-4 md:py-3">{formatDateTime(a.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pager total={total} page={page} href={(p) => href({ sida: p > 1 ? String(p) : undefined })} />
    </div>
  );
}
