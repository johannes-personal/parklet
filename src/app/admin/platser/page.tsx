import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FilterForm, Select } from "@/components/filter-form";
import { Pager } from "@/app/admin/list-controls";
import { Badge } from "@/components/status-badge";
import { requireAdmin } from "@/lib/auth/session";
import { REVIEW_LABEL } from "@/lib/labels";
import { formatDateTime } from "@/lib/time";
import { searchSpots, type SpotFilters } from "@/server/admin-search";
import { HOST_KIND_LABEL } from "@/server/host-accounts";

export const metadata: Metadata = { title: "Platser – administration", robots: { index: false } };

type SP = Awaited<PageProps<"/admin/platser">["searchParams"]>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const pick = <T extends string>(v: string | undefined, allowed: readonly T[]) => (allowed.includes(v as T) ? (v as T) : undefined);

const REVIEWS = ["draft", "pending_review", "approved", "rejected"] as const;

function filtersFrom(sp: SP): SpotFilters {
  return {
    q: one(sp.q)?.slice(0, 100),
    review: pick(one(sp.status), REVIEWS),
    basis: pick(one(sp.grund), ["owns", "brf", "landlord"] as const),
    city: one(sp.stad)?.slice(0, 80),
    bookable: pick(one(sp.bokningsbar), ["yes", "no"] as const),
    sort: pick(one(sp.sortera), ["updated", "submitted", "title", "bookings"] as const),
    page: Number(one(sp.sida)) || 1,
  };
}

/** Admins find any spot: free-text search, filters and the facts that matter for support in the list. */
export default function AdminSpotsPage({ searchParams }: PageProps<"/admin/platser">) {
  return (
    <div className="py-8">
      <h1 className="text-2xl font-bold">Platser</h1>
      <Suspense fallback={<div className="card mt-6 h-96 animate-pulse" />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Results({ searchParams }: { searchParams: PageProps<"/admin/platser">["searchParams"] }) {
  await requireAdmin();
  const sp = await searchParams;
  const f = filtersFrom(sp);
  const { rows, total, page, byReview, cities } = await searchSpots(f);
  const all = Object.values(byReview).reduce((a, b) => a + b, 0);
  // Keep the other filters when following a chip or a page link.
  const href = (change: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string | undefined> = { q: f.q, status: f.review, grund: f.basis, stad: f.city, bokningsbar: f.bookable, sortera: f.sort, ...change };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    return `/admin/platser${p.size ? `?${p}` : ""}`;
  };

  return (
    <div className="mt-4 space-y-4">
      <FilterForm className="card space-y-3 p-4">
        <div className="flex gap-2">
          <label htmlFor="q" className="sr-only">
            Sök
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={f.q}
            placeholder="Sök rubrik, adress, ort, uthyrare, org.nr, förening eller plats-id"
            className="input"
          />
          <button className="btn-primary shrink-0">Sök</button>
        </div>
        {f.review ? <input type="hidden" name="status" value={f.review} /> : null}
        <div className="grid gap-3 sm:grid-cols-4">
          <Select label="Grund" name="grund" value={f.basis} options={[["owns", "Äger platsen"], ["brf", "Hyr av BRF"], ["landlord", "Hyr av hyresvärd"]]} />
          <Select label="Ort" name="stad" value={f.city} options={cities.map((c) => [c.city, `${c.city} (${c.n})`])} />
          <Select label="Bokningsbar" name="bokningsbar" value={f.bookable} options={[["yes", "Ja"], ["no", "Nej"]]} />
          <Select
            label="Sortera"
            name="sortera"
            value={f.sort}
            all="Senast ändrad"
            options={[["submitted", "Senast inskickad"], ["title", "Rubrik A–Ö"], ["bookings", "Flest bokningar"]]}
          />
        </div>
      </FilterForm>

      <nav aria-label="Status" className="flex flex-wrap gap-2">
        {[["", "Alla", all] as const, ...REVIEWS.map((r) => [r, REVIEW_LABEL[r].text, byReview[r] ?? 0] as const)].map(([value, label, n]) => (
          <Link
            key={value}
            href={href({ status: value || undefined })}
            aria-current={(f.review ?? "") === value ? "true" : undefined}
            className="rounded-full border border-line px-3 py-1 text-sm text-ink-soft hover:text-ink aria-[current]:border-white aria-[current]:bg-white aria-[current]:font-semibold aria-[current]:text-black"
          >
            {label} <span className="opacity-70">{n}</span>
          </Link>
        ))}
        {f.q || f.basis || f.city || f.bookable || f.review || f.sort ? (
          <Link href="/admin/platser" className="px-2 py-1 text-sm text-muted underline-offset-2 hover:underline">
            Rensa
          </Link>
        ) : null}
      </nav>

      {rows.length === 0 ? (
        <p className="card p-6 text-ink-soft">Inga platser matchar.</p>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="hidden border-b border-line bg-canvas text-xs tracking-wide text-muted uppercase md:table-header-group">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Plats</th>
                <th className="px-4 py-2.5 font-semibold">Uthyrare</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Bokningsbar</th>
                <th className="px-4 py-2.5 text-right font-semibold" title="Kommande / totalt">
                  Bokningar
                </th>
                <th className="px-4 py-2.5 font-semibold">Ändrad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="relative grid gap-1 px-4 py-3 hover:bg-canvas md:table-row md:p-0">
                  <td className="md:px-4 md:py-3">
                    <Link href={`/admin/platser/${r.id}`} className="font-semibold after:absolute after:inset-0">
                      {r.title}
                    </Link>
                    <span className="block text-muted">
                      {r.address}, {r.city} · {r.rightBasis === "owns" ? "Äger" : r.landlordKind === "brf" ? "Hyr av BRF" : "Hyr av hyresvärd"}
                    </span>
                  </td>
                  <td className="text-ink-soft md:px-4 md:py-3">
                    {r.accountName}
                    <span className="block text-muted">{HOST_KIND_LABEL[r.accountKind]}</span>
                  </td>
                  <td className="whitespace-nowrap md:px-4 md:py-3">
                    <Badge kind={REVIEW_LABEL[r.review].kind}>{REVIEW_LABEL[r.review].text}</Badge>
                  </td>
                  <td className="md:px-4 md:py-3">
                    {r.bookable ? (
                      <span className="font-medium text-ok">Ja</span>
                    ) : (
                      <span className="text-muted">Nej{r.notBookable ? ` – ${r.notBookable}` : ""}</span>
                    )}
                  </td>
                  <td className="text-ink-soft md:px-4 md:py-3 md:text-right">
                    <span className="md:hidden">Bokningar: </span>
                    <span className="whitespace-nowrap" title={`${r.upcoming} kommande av ${r.total} totalt`}>
                      {r.upcoming} <span className="text-muted">/ {r.total}</span>
                    </span>
                  </td>
                  <td className="whitespace-nowrap text-muted md:px-4 md:py-3">{formatDateTime(f.sort === "submitted" && r.submittedAt ? r.submittedAt : r.updatedAt)}</td>
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
