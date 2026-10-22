import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, BookingStatusBadge } from "@/components/status-badge";
import { Unavailable } from "@/components/unavailable";
import { requireAdmin } from "@/lib/auth/session";
import { PAYMENT_STATUS_LABEL } from "@/lib/labels";
import { formatSek } from "@/lib/money";
import { formatDateTime, formatRange } from "@/lib/time";
import { getBookingForAdmin } from "@/server/bookings";
import { HOST_KIND_LABEL } from "@/server/host-accounts";

export const metadata: Metadata = { title: "Bokning – administration", robots: { index: false } };

type P = PageProps<"/admin/bokningar/[id]">;

const REGISTRATION_TEXT = { not_required: "Krävs inte", pending: "Väntar på uthyraren", done: "Registrerad" } as const;

export default function AdminBookingPage(props: P) {
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
  const b = await getBookingForAdmin(id);
  if (!b) {
    return (
      <Unavailable title="Bokningen finns inte" actions={[{ href: "/admin/bokningar", label: "Alla bokningar" }]}>
        <p>Länken är fel, eller så har bokningen aldrig funnits.</p>
      </Unavailable>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/bokningar" className="link text-sm">
        ← Alla bokningar
      </Link>
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{b.spot.title}</h1>
          <BookingStatusBadge status={b.status} endsAt={b.endsAt} />
          {b.paymentStatus === "refunded" ? <Badge>Återbetald</Badge> : null}
        </div>
        <p className="mt-1 text-ink-soft">{formatRange(b.startsAt, b.endsAt)}</p>
      </div>

      <dl className="card divide-y divide-line">
        <Item label="Plats">
          <Link href={`/admin/platser/${b.spot.id}`} className="link">
            {b.spot.title}
          </Link>
          <span className="block text-sm text-muted">
            {b.spot.address}, {b.spot.city}
          </span>
        </Item>
        <Item label="Uthyrare">
          <Link href={`/admin/konton/${b.account.id}`} className="link">
            {b.account.name}
          </Link>
          <span className="block text-sm text-muted">{HOST_KIND_LABEL[b.account.kind]}</span>
        </Item>
        <Item label="Förare">
          {b.driver.name}
          <span className="block text-sm break-all text-muted">{b.driver.email}</span>
        </Item>
        <Item label="Bil">{b.vehicleReg}</Item>
        <Item label="Registrering hos föreningen">
          {REGISTRATION_TEXT[b.vehicleRegistration]}
          {b.vehicleRegisteredAt ? <span className="block text-sm text-muted">{formatDateTime(b.vehicleRegisteredAt)}</span> : null}
        </Item>
        <Item label="Belopp">
          {formatSek(b.totalOre)}
          <span className="block text-sm text-muted">
            Uthyraren {formatSek(b.baseOre)} · serviceavgift {formatSek(b.feeOre)}
          </span>
        </Item>
        <Item label="Betalning">
          {PAYMENT_STATUS_LABEL[b.paymentStatus]} · {b.paymentProvider === "stripe" ? "Stripe" : "Testläge"}
          {b.paymentRef ? <span className="block font-mono text-xs break-all text-muted">{b.paymentRef}</span> : null}
          {b.checkoutSessionId ? <span className="block font-mono text-xs break-all text-muted">{b.checkoutSessionId}</span> : null}
        </Item>
        <Item label="Boknings-id">
          <span className="font-mono text-sm break-all">{b.id}</span>
        </Item>
        <Item label="Skapad">{formatDateTime(b.createdAt)}</Item>
        {b.confirmedAt ? <Item label="Bokad">{formatDateTime(b.confirmedAt)}</Item> : null}
        {b.status === "pending_payment" && b.holdExpiresAt ? <Item label="Reserverad till">{formatDateTime(b.holdExpiresAt)}</Item> : null}
        {b.cancelledAt ? (
          <Item label="Avbokad">
            {formatDateTime(b.cancelledAt)}
            {b.cancelledBy ? ` av ${b.cancelledBy === "host" ? "uthyraren" : "föraren"}` : ""}
          </Item>
        ) : null}
      </dl>
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr]">
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
