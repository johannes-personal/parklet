import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/time";
import { HOST_KIND_LABEL } from "@/server/host-accounts";
import { listReviewQueue } from "@/server/spots";

export const metadata: Metadata = { title: "Granskning", robots: { index: false } };

export default function AdminPage() {
  return (
    <div className="w-full py-8">
      <h1 className="text-2xl font-bold">Granskning</h1>
      <p className="mt-1 text-ink-soft">Kontrollera att uthyraren har rätt att hyra ut platsen och att organisationer finns och företräds av rätt person.</p>
      <p className="mt-1 text-sm text-ink-soft">
        Letar du efter något annat? Sök bland alla{" "}
        <Link href="/admin/platser" className="link">
          parkeringsplatser
        </Link>{" "}
        och{" "}
        <Link href="/admin/konton" className="link">
          uthyrare
        </Link>
        .
      </p>
      <Suspense fallback={<div className="card mt-6 h-40 animate-pulse" />}>
        <Queue />
      </Suspense>
    </div>
  );
}

async function Queue() {
  await requireAdmin();
  const { pendingSpots, pendingAccounts } = await listReviewQueue();
  return (
    <div className="mt-8 space-y-8">
      <section>
        <h2 className="text-lg font-semibold">Uthyrarkonton ({pendingAccounts.length})</h2>
        {pendingAccounts.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Inget att granska.</p>
        ) : (
          <ul className="card mt-3 divide-y divide-line">
            {pendingAccounts.map((a) => (
              <li key={a.id}>
                <Link href={`/admin/konton/${a.id}`} className="flex justify-between px-4 py-3 hover:bg-canvas">
                  <span>
                    <span className="font-medium">{a.name}</span> <span className="text-sm text-muted">{a.orgNumber}</span>
                  </span>
                  <span className="text-sm text-muted">{HOST_KIND_LABEL[a.kind]}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="text-lg font-semibold">Parkeringsplatser ({pendingSpots.length})</h2>
        {pendingSpots.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Inget att granska.</p>
        ) : (
          <ul className="card mt-3 divide-y divide-line">
            {pendingSpots.map(({ spot, accountName }) => (
              <li key={spot.id}>
                <Link href={`/admin/platser/${spot.id}`} className="flex flex-wrap justify-between gap-2 px-4 py-3 hover:bg-canvas">
                  <span>
                    <span className="block font-medium">{spot.title}</span>
                    <span className="text-sm text-muted">
                      {accountName} · {spot.address}, {spot.city} · {spot.rightBasis === "owns" ? "Äger" : spot.landlordKind === "brf" ? "Hyr av BRF" : "Hyr av hyresvärd"}
                    </span>
                  </span>
                  <span className="text-sm text-muted">{spot.submittedAt ? formatDateTime(spot.submittedAt) : ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
