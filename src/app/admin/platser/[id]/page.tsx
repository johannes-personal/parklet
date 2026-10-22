import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { reviewSpotAction } from "@/app/admin/actions";
import { ReviewForm } from "@/app/admin/review-form";
import { Badge } from "@/components/status-badge";
import { Unavailable } from "@/components/unavailable";
import { requireAdmin } from "@/lib/auth/session";
import { DOCUMENT_KIND_LABEL, REVIEW_LABEL, VERIFICATION_LABEL } from "@/lib/labels";
import { formatDateTime } from "@/lib/time";
import { HOST_KIND_LABEL, listMembers } from "@/server/host-accounts";
import { getSpotWithAccount, listSpotDocuments, spotDecisions, spotRequirements } from "@/server/spots";

export const metadata: Metadata = { title: "Granska plats", robots: { index: false } };

type P = PageProps<"/admin/platser/[id]">;

const LANDLORD_APPROVAL_TEXT = {
  not_needed: "Behövs inte",
  missing: "Saknas – ingen förfrågan skickad och inget godkännande uppladdat",
  requested: "Förfrågan skickad, väntar på svar",
  approved: "Godkänt",
  declined: "Nekat av hyresvärden/föreningen",
} as const;

export default function AdminSpotPage(props: P) {
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
  const row = await getSpotWithAccount(id);
  if (!row) {
    return (
      <Unavailable title="Platsen finns inte" actions={[{ href: "/admin/platser", label: "Alla parkeringsplatser" }]}>
        <p>Platsen har tagits bort, eller så är länken fel.</p>
      </Unavailable>
    );
  }
  const { spot, account } = row;
  const [docs, members] = await Promise.all([listSpotDocuments(id), listMembers(account.id)]);
  const reqs = spotRequirements(spot, docs);
  const owner = members.find((m) => m.role === "owner");

  return (
    <div className="space-y-6">
      <Link href="/admin/platser" className="link text-sm">
        ← Alla parkeringsplatser
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{spot.title}</h1>
        <Badge kind={REVIEW_LABEL[spot.review].kind}>{REVIEW_LABEL[spot.review].text}</Badge>
      </div>
      <dl className="card divide-y divide-line text-sm">
        {[
          ["Adress", `${spot.address}, ${spot.city} (${spot.lat.toFixed(5)}, ${spot.lng.toFixed(5)})`],
          ["Uthyrarkonto", `${account.name} – ${HOST_KIND_LABEL[account.kind]}${account.orgNumber ? `, ${account.orgNumber}` : ""} (${VERIFICATION_LABEL[account.verificationStatus].text.toLowerCase()})`],
          ["Ägare av kontot", owner ? `${owner.name}, ${owner.email}` : "–"],
          ["Grund", spot.rightBasis === "owns" ? "Äger platsen" : `Hyr av ${spot.landlordKind === "brf" ? "bostadsrättsförening" : "hyresvärd"}: ${spot.landlordName ?? "–"} (${spot.landlordEmail ?? "ingen e-post"})`],
          [
            "Hyresvärdens godkännande",
            spot.rightBasis === "owns"
              ? "Behövs inte"
              : spot.landlordApproval === "approved"
                ? `Godkänt via länk av ${spot.landlordApprovedByName} (${spot.landlordApprovedByRole}), ${spot.landlordRespondedAt ? formatDateTime(spot.landlordRespondedAt) : ""}`
                : docs.some((d) => d.kind === "sublet_permission")
                  ? "Skriftligt godkännande uppladdat (se dokument)"
                  : LANDLORD_APPROVAL_TEXT[spot.landlordApproval],
          ],
          ["Kräver registrering av bil", spot.requiresVehicleRegistration ? `Ja. ${spot.vehicleRegistrationNote}` : "Nej"],
        ].map(([k, v]) => (
          <div key={k} className="grid gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr]">
            <dt className="font-medium text-muted">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <section className="card p-5">
        <h2 className="font-semibold">Krav</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {reqs.map((r) => (
            <li key={r.key}>
              {r.done ? "✓" : "✗"} {r.label}
            </li>
          ))}
        </ul>
        <h2 className="mt-4 font-semibold">Dokument</h2>
        {docs.length === 0 ? (
          <p className="text-sm text-muted">Inga dokument.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {docs.map((d) => (
              <li key={d.id}>
                <a href={`/api/dokument/${d.id}`} className="link" target="_blank" rel="noreferrer">
                  {d.filename}
                </a>{" "}
                – {DOCUMENT_KIND_LABEL[d.kind]} ({Math.round(d.sizeBytes / 1024)} kB, {formatDateTime(d.createdAt)})
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-sm text-muted">Kontrollera att namn och adress i dokumenten stämmer med kontots legitimerade ägare och platsens adress.</p>
      </section>
      <ReviewForm
        action={reviewSpotAction}
        idName="spotId"
        id={spot.id}
        decisions={spotDecisions(spot.review)}
        status={
          {
            draft: "Platsen har inte skickats in för granskning än.",
            pending_review: `Inskickad${spot.submittedAt ? ` ${formatDateTime(spot.submittedAt)}` : ""}. Väntar på ditt beslut.`,
            approved: `Godkänd${spot.reviewedAt ? ` ${formatDateTime(spot.reviewedAt)}` : ""}.`,
            rejected: `Ej godkänd${spot.reviewNote ? ` (${spot.reviewNote.replace(/[.\s]+$/, "")})` : ""}. Väntar på att uthyraren kompletterar.`,
          }[spot.review]
        }
        returnTo={spot.review === "pending_review" ? "/admin" : `/admin/platser/${spot.id}`}
        error={fel === "motivering" || fel === "status" ? fel : undefined}
      />
    </div>
  );
}
