import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Pager } from "@/app/admin/list-controls";
import { FilterForm, Select } from "@/components/filter-form";
import { HostHeading, loadHostAccount } from "@/components/host/host-page";
import { Badge, BookingStatusBadge } from "@/components/status-badge";
import { BOOKING_STATUS_LABEL } from "@/lib/labels";
import { formatSek } from "@/lib/money";
import { formatDateTime, formatRange } from "@/lib/time";
import { searchBookings, type BookingFilters } from "@/server/admin-search";

export const metadata: Metadata = { title: "Bokningar – uthyrarkonto", robots: { index: false } };

type P = PageProps<"/uthyrare/[accountId]/bokningar">;
type SP = Awaited<P["searchParams"]>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const pick = <T extends string>(v: string | undefined, allowed: readonly T[]) => (allowed.includes(v as T) ? (v as T) : undefined);
const date = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
/** A host has bookings that are confirmed or were cancelled; holds that were never paid aren't theirs. */
const STATUSES = ["confirmed", "cancelled"] as const;

function filtersFrom(sp: SP, account: string): BookingFilters {
  return {
    account,
    q: one(sp.q)?.slice(0, 100),
    status: pick(one(sp.status), STATUSES) ?? "booked",
    when: pick(one(sp.tid), ["upcoming", "ongoing", "past"] as const),
    from: date(one(sp.fran)),
    to: date(one(sp.till)),
    sort: pick(one(sp.sortera), ["starts_desc", "total"] as const) ?? "starts",
    page: Number(one(sp.sida)) || 1,
  };
}

/** The account's bookings, like the admin's list: by status, time and date, searchable. */
export default function HostBookingsPage(props: P) {
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
  const loaded = await loadHostAccount(accountId, `/uthyrare/${accountId}/bokningar`);
  if ("denied" in loaded) return loaded.denied;
  const { account } = loaded;
  const sp = await searchParams;
  const f = filtersFrom(sp, accountId);
  const { rows, total, page, byStatus } = await searchBookings(f);
  const status = f.status === "booked" ? undefined : f.status;
  const sort = f.sort === "starts" ? undefined : f.sort;
  const base = `/uthyrare/${accountId}/bokningar`;
  const href = (change: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string | undefined> = { q: f.q, status, tid: f.when, fran: f.from, till: f.to, sortera: sort, ...change };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    return `${base}${p.size ? `?${p}` : ""}`;
  };
  const filtered = f.q || status || f.when || f.from || f.to || sort;
  const counts = { confirmed: byStatus.confirmed ?? 0, cancelled: byStatus.cancelled ?? 0 };

  return (
    <div className="space-y-4">
      <HostHeading account={account} title="Bokningar" />
      <FilterForm className="card space-y-3 p-4">
        <div className="flex gap-2">
          <label htmlFor="q" className="sr-only">
            Sök
          </label>
          <input id="q" name="q" type="search" defaultValue={f.q} placeholder="Sök parkeringsplats, förare, regnummer eller boknings-id" className="input" />
          <button className="btn-primary shrink-0">Sök</button>
        </div>
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <div className="grid gap-3 sm:grid-cols-4">
          <Select label="Tid" name="tid" value={f.when} options={[["upcoming", "Kommande"], ["ongoing", "Pågående"], ["past", "Passerade"]]} />
          <div>
            <label htmlFor="f-fran" className="label">
              Från
            </label>
            <input id="f-fran" name="fran" type="date" defaultValue={f.from} className="input" />
          </div>
          <div>
            <label htmlFor="f-till" className="label">
              Till
            </label>
            <input id="f-till" name="till" type="date" defaultValue={f.to} className="input" />
          </div>
          <Select
            label="Sortera"
            name="sortera"
            value={sort}
            all="Starttid, tidigast först"
            options={[["starts_desc", "Starttid, senast först"], ["total", "Högst belopp"]]}
          />
        </div>
      </FilterForm>

      <nav aria-label="Status" className="flex flex-wrap gap-2">
        {[["", "Alla", counts.confirmed + counts.cancelled] as const, ...STATUSES.map((s) => [s, BOOKING_STATUS_LABEL[s], counts[s]] as const)].map(
          ([value, label, n]) => (
            <Link
              key={value}
              href={href({ status: value || undefined })}
              aria-current={(status ?? "") === value ? "true" : undefined}
              className="rounded-full border border-line px-3 py-1 text-sm text-ink-soft hover:text-ink aria-[current]:border-white aria-[current]:bg-white aria-[current]:font-semibold aria-[current]:text-black"
            >
              {label} <span className="opacity-70">{n}</span>
            </Link>
          ),
        )}
        {filtered ? (
          <Link href={base} className="px-2 py-1 text-sm text-muted underline-offset-2 hover:underline">
            Rensa
          </Link>
        ) : null}
      </nav>

      {rows.length === 0 ? (
        <p className="card p-6 text-ink-soft">{filtered ? "Inga bokningar matchar." : "Inga bokningar ännu."}</p>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="hidden border-b border-line bg-canvas text-xs tracking-wide text-muted uppercase md:table-header-group">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Parkeringsplats och tid</th>
                <th className="px-4 py-2.5 font-semibold">Förare</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 text-right font-semibold">Din intäkt</th>
                <th className="px-4 py-2.5 font-semibold">Bokad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((b) => (
                <tr key={b.id} className="relative grid gap-1 px-4 py-3 hover:bg-canvas md:table-row md:p-0">
                  <td className="md:px-4 md:py-3">
                    <Link href={`/bokning/${b.id}`} className="font-semibold after:absolute after:inset-0">
                      {b.spot.title}
                    </Link>
                    <span className="block text-muted">{formatRange(b.startsAt, b.endsAt)}</span>
                  </td>
                  <td className="text-ink-soft md:px-4 md:py-3">
                    {b.driver.name}
                    <span className="block font-mono text-muted">{b.vehicleReg}</span>
                  </td>
                  <td className="md:px-4 md:py-3">
                    <span className="flex flex-wrap gap-1">
                      <BookingStatusBadge status={b.status} endsAt={b.endsAt} />
                      {b.vehicleRegistration === "pending" && b.status === "confirmed" ? <Badge kind="warn">Bil ej registrerad</Badge> : null}
                    </span>
                  </td>
                  <td className="whitespace-nowrap text-ink-soft md:px-4 md:py-3 md:text-right">{b.status === "confirmed" ? formatSek(b.baseOre) : "–"}</td>
                  <td className="whitespace-nowrap text-muted md:px-4 md:py-3">{formatDateTime(b.confirmedAt ?? b.createdAt)}</td>
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
