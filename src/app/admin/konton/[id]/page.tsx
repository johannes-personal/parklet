import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { reviewAccountAction } from "@/app/admin/actions";
import { ReviewForm } from "@/app/admin/review-form";
import { db } from "@/db";
import { hostAccounts } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { formMatchesKind } from "@/lib/bolagsverket";
import { DOCUMENT_KIND_LABEL } from "@/lib/labels";
import { HOST_KIND_LABEL, listAccountDocuments, listMembers } from "@/server/host-accounts";
import { isUuid } from "@/server/ids";

export const metadata: Metadata = { title: "Granska organisation", robots: { index: false } };

type P = PageProps<"/admin/konton/[id]">;

export default function AdminAccountPage(props: P) {
  return (
    <div className="mx-auto w-full max-w-3xl py-8">
      <Suspense fallback={<div className="card h-96 animate-pulse" />}>
        <Content {...props} />
      </Suspense>
    </div>
  );
}

async function Content({ params, searchParams }: P) {
  await requireAdmin();
  const { id } = await params;
  const { fel } = await searchParams;
  if (!isUuid(id)) notFound();
  const [account] = await db.select().from(hostAccounts).where(eq(hostAccounts.id, id)).limit(1);
  if (!account) notFound();
  const [docs, members] = await Promise.all([listAccountDocuments(id), listMembers(id)]);
  return (
    <div className="space-y-6">
      <Link href="/admin/konton" className="link text-sm">
        ← Alla uthyrare
      </Link>
      <h1 className="text-2xl font-bold">{account.name}</h1>
      <dl className="card divide-y divide-line text-sm">
        {[
          ["Typ", HOST_KIND_LABEL[account.kind]],
          ["Organisationsnummer", account.orgNumber ?? "–"],
          [
            "Bolagsverket",
            account.registryCheckedAt
              ? `${account.registryName} · ${account.registryForm ?? "okänd form"} · ${account.registryStatus === "liquidation" ? "under avveckling/omstrukturering" : "aktiv"}${
                  account.kind !== "household" && formMatchesKind(account.registryForm, account.kind) === false ? " · ⚠ formen stämmer inte med vald typ" : ""
                }`
              : "Inte kontrollerat automatiskt – kontrollera manuellt",
          ],
          ["Uppgiven roll", account.signatoryRole ?? "–"],
          ["Administratörer", members.map((m) => `${m.name} (${m.email}, ${m.role})`).join("; ")],
          ["Status", account.verificationStatus],
        ].map(([k, v]) => (
          <div key={k} className="grid gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr]">
            <dt className="font-medium text-muted">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <section className="card p-5">
        <h2 className="font-semibold">Dokument</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {docs.map((d) => (
            <li key={d.id}>
              <a href={`/api/dokument/${d.id}`} className="link" target="_blank" rel="noreferrer">
                {d.filename}
              </a>{" "}
              – {DOCUMENT_KIND_LABEL[d.kind]}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted">
          Kontrollera mot Bolagsverket att organisationsnumret och namnet stämmer och att personen är styrelseledamot/firmatecknare enligt
          protokoll eller registreringsbevis.
        </p>
      </section>
      <ReviewForm action={reviewAccountAction} idName="accountId" id={account.id} error={Boolean(fel)} />
    </div>
  );
}
