import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FilterForm, Select } from "@/components/filter-form";
import { Pager } from "@/app/admin/list-controls";
import { Badge, BookingStatusBadge } from "@/components/status-badge";
import { requireAdmin } from "@/lib/auth/session";
import { BOOKING_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/labels";
import { formatSek } from "@/lib/money";
import { formatDateTime, formatRange } from "@/lib/time";
import { searchBookings, type BookingFilters } from "@/server/admin-search";

export const metadata: Metadata = { title: "Bokningar – administration", robots: { index: false } };

type SP = Awaited<PageProps<"/admin/bokningar">["searchParams"]>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const pick = <T extends string>(v: string | undefined, allowed: readonly T[]) => (allowed.includes(v as T) ? (v as T) : undefined);
const date = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

const STATUSES = ["confirmed", "pending_payment", "cancelled", "expired"] as const;

function filtersFrom(sp: SP): BookingFilters {
  return {
    q: one(sp.q)?.slice(0, 100),
    status: pick(one(sp.status), STATUSES),
    payment: pick(one(sp.betalning), ["unpaid", "paid", "refunded"] as const),
    when: pick(one(sp.tid), ["upcoming", "ongoing", "past"] as const),
    from: date(one(sp.fran)),
    to: date(one(sp.till)),
    city: one(sp.stad)?.slice(0, 80),
    sort: pick(one(sp.sortera), ["starts", "starts_desc", "total"] as const),
    page: Number(one(sp.sida)) || 1,
  };
}

/** Every booking, for support: who booked what where, and how the payment went. */
export default function AdminBookingsPage({ searchParams }: PageProps<"/admin/bokningar">) {
  return (
    <div className="py-8">
      <h1 className="text-2xl font-bold">Bokningar</h1>
      <Suspense fallback={<div className="card mt-6 h-96 animate-pulse" />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Results({ searchParams }: { searchParams: PageProps<"/admin/bokningar">["searchParams"] }) {
  await requireAdmin();
  const sp = await searchParams;
  const f = filtersFrom(sp);
  const { rows, total, page, byStatus, cities } = await searchBookings(f);
  const all = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const href = (change: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string | undefined> = {
      q: f.q,
      status: f.status,
      betalning: f.payment,
      tid: f.when,
      fran: f.from,
      till: f.to,
      stad: f.city,
      sortera: f.sort,
      ...change,
    };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    return `/admin/bokningar${p.size ? `?${p}` : ""}`;
  };
  const filtered = f.q || f.status || f.payment || f.when || f.from || f.to || f.city || f.sort;

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
            placeholder="Sök plats, uthyrare, förare, e-post, regnummer, boknings-id eller betalning"
            className="input"
          />
          <button className="btn-primary shrink-0">Sök</button>
        </div>
        {f.status ? <input type="hidden" name="status" value={f.status} /> : null}
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
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
          <Select label="Betalning" name="betalning" value={f.payment} options={Object.entries(PAYMENT_STATUS_LABEL)} />
          <Select label="Ort" name="stad" value={f.city} options={cities.map((c) => [c.city, `${c.city} (${c.n})`])} />
          <Select
            label="Sortera"
            name="sortera"
            value={f.sort}
            all="Senast bokad"
            options={[["starts_desc", "Starttid, senast först"], ["starts", "Starttid, tidigast först"], ["total", "Högst belopp"]]}
          />
        </div>
        <p className="text-xs text-muted">Med Från och Till visas bokningar som pågår någon gång under perioden. Datumen tillämpas med Sök.</p>
      </FilterForm>

      <nav aria-label="Status" className="flex flex-wrap gap-2">
        {[["", "Alla", all] as const, ...STATUSES.map((s) => [s, BOOKING_STATUS_LABEL[s], byStatus[s] ?? 0] as const)].map(([value, label, n]) => (
          <Link
            key={value}
            href={href({ status: value || undefined })}
            aria-current={(f.status ?? "") === value ? "true" : undefined}
            className="rounded-full border border-line px-3 py-1 text-sm text-ink-soft hover:text-ink aria-[current]:border-white aria-[current]:bg-white aria-[current]:font-semibold aria-[current]:text-black"
          >
            {label} <span className="opacity-70">{n}</span>
          </Link>
        ))}
        {filtered ? (
          <Link href="/admin/bokningar" className="px-2 py-1 text-sm text-muted underline-offset-2 hover:underline">
            Rensa
          </Link>
        ) : null}
      </nav>

      {rows.length === 0 ? (
        <p className="card p-6 text-ink-soft">Inga bokningar matchar.</p>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="hidden border-b border-line bg-canvas text-xs tracking-wide text-muted uppercase md:table-header-group">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Plats och tid</th>
                <th className="px-4 py-2.5 font-semibold">Förare</th>
                <th className="px-4 py-2.5 font-semibold">Uthyrare</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 text-right font-semibold">Belopp</th>
                <th className="px-4 py-2.5 font-semibold">Bokad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((b) => (
                <tr key={b.id} className="relative grid gap-1 px-4 py-3 hover:bg-canvas md:table-row md:p-0">
                  <td className="md:px-4 md:py-3">
                    <Link href={`/admin/bokningar/${b.id}`} className="font-semibold after:absolute after:inset-0">
                      {b.spot.title}
                    </Link>
                    <span className="block text-muted">
                      {formatRange(b.startsAt, b.endsAt)} · {b.spot.city}
                    </span>
                  </td>
                  <td className="text-ink-soft md:px-4 md:py-3">
                    {b.driver.name}
                    <span className="block break-all text-muted">
                      {b.driver.email} · {b.vehicleReg}
                    </span>
                  </td>
                  <td className="text-ink-soft md:px-4 md:py-3">{b.account.name}</td>
                  <td className="md:px-4 md:py-3">
                    <span className="flex flex-wrap gap-1">
                      <BookingStatusBadge status={b.status} endsAt={b.endsAt} />
                      {b.paymentStatus === "refunded" ? <Badge>Återbetald</Badge> : null}
                      {b.vehicleRegistration === "pending" && b.status === "confirmed" ? <Badge kind="warn">Bil ej registrerad</Badge> : null}
                    </span>
                  </td>
                  <td className="whitespace-nowrap text-ink-soft md:px-4 md:py-3 md:text-right">{formatSek(b.totalOre)}</td>
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
