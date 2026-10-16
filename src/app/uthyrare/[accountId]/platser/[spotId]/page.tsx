import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DocumentUploader, RequestApprovalForm, SubmitSpotForm } from "@/components/host/forms";
import { SpotForm } from "@/components/host/spot-form";
import type { SpotFormDefaults } from "@/components/host/spot-form-defaults";
import { Badge } from "@/components/status-badge";
import { requireUser } from "@/lib/auth/session";
import { DOCUMENT_KIND_LABEL, REVIEW_LABEL, SPOT_DOC_OPTIONS } from "@/lib/labels";
import { oreToSekInput } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { getAccountForMember } from "@/server/host-accounts";
import { getSpot, listSiblingSpots, listSpotDocuments, spotRequirements } from "@/server/spots";

export const metadata: Metadata = { title: "Redigera plats" };

type P = PageProps<"/uthyrare/[accountId]/platser/[spotId]">;

export default function EditSpotPage(props: P) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <Suspense fallback={<div className="h-96 animate-pulse" />}>
        <Content {...props} />
      </Suspense>
    </div>
  );
}

async function Content({ params, searchParams }: P) {
  const { accountId, spotId } = await params;
  const { ny } = await searchParams;
  const user = await requireUser(`/uthyrare/${accountId}/platser/${spotId}`);
  const account = await getAccountForMember(accountId, user.id);
  const spot = await getSpot(spotId);
  if (!account || !spot || spot.hostAccountId !== accountId) notFound();
  const [docs, siblings] = await Promise.all([listSpotDocuments(spotId), listSiblingSpots(spot)]);
  const reqs = spotRequirements(spot, docs);
  const review = REVIEW_LABEL[spot.review];
  const canSubmit = spot.review === "draft" || spot.review === "rejected";
  const who = spot.landlordKind === "brf" ? "föreningen" : "hyresvärden";

  const defaults: SpotFormDefaults = {
    title: spot.title,
    description: spot.description,
    address: spot.address,
    city: spot.city,
    lat: spot.lat,
    lng: spot.lng,
    spotType: spot.spotType,
    covered: spot.covered,
    evCharging: spot.evCharging,
    maxHeight: spot.maxHeightCm ? String(spot.maxHeightCm / 100).replace(".", ",") : "",
    pricePerHour: oreToSekInput(spot.pricePerHourOre),
    pricePerDay: oreToSekInput(spot.pricePerDayOre),
    minDurationMinutes: spot.minDurationMinutes,
    minNoticeMinutes: spot.minNoticeMinutes,
    cancellationHours: spot.cancellationHours,
    accessInstructions: spot.accessInstructions,
    visibility: spot.visibility,
    schedule: spot.schedule,
    rightBasis: spot.rightBasis,
    landlordKind: spot.landlordKind ?? "",
    landlordName: spot.landlordName ?? "",
    landlordEmail: spot.landlordEmail ?? "",
    requiresVehicleRegistration: spot.requiresVehicleRegistration,
    vehicleRegistrationNote: spot.vehicleRegistrationNote,
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/uthyrare/${accountId}`} className="link text-sm">
          ← {account.name}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{spot.title}</h1>
          <Badge kind={review.kind}>{review.text}</Badge>
        </div>
        <p className="mt-1 text-sm">
          <Link href={`/plats/${spot.id}`} className="link">
            {spot.review === "approved" ? "Visa annonsen" : "Förhandsgranska annonsen"}
          </Link>
          {spot.visibility === "link" ? <span className="text-muted"> – dela den länken med dem som ska kunna boka.</span> : null}
        </p>
      </div>

      {ny ? (
        <p role="status" className="rounded-xl border border-ok/20 bg-ok-soft px-4 py-3 font-medium text-ok">
          {Number(ny) > 1 ? `${ny} platser är sparade.` : "Platsen är sparad."} Ladda nu upp underlagen nedan och skicka in för granskning.
        </p>
      ) : null}

      {spot.review === "rejected" && spot.reviewNote ? (
        <p role="alert" className="rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">
          <strong>Ej godkänd:</strong> {spot.reviewNote}
        </p>
      ) : null}

      <section id="underlag" className="card scroll-mt-24 space-y-5 p-5 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold">Underlag för uthyrningsrätt</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Parklet granskar att du har rätt att hyra ut platsen innan den kan bokas. Underlagen visas bara för dig och Parklets granskare.
          </p>
        </div>
        <ul className="space-y-2">
          {reqs.map((r) => (
            <li key={r.key} className="flex gap-3">
              <span aria-hidden className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold ${r.done ? "bg-ok text-white" : "border-2 border-line"}`}>
                {r.done ? "✓" : ""}
              </span>
              <span>
                <span className="font-medium">{r.label}</span>
                <span className="sr-only">{r.done ? " (klart)" : " (saknas)"}</span>
                {r.hint && !r.done ? <span className="block text-sm text-muted">{r.hint}</span> : null}
              </span>
            </li>
          ))}
        </ul>

        {spot.rightBasis === "rents" ? (
          <div className="rounded-xl bg-canvas p-4 text-sm">
            <h3 className="font-semibold">Godkännande från {who}</h3>
            {spot.landlordApproval === "approved" ? (
              <p className="mt-1 text-ok">
                Godkänt av {spot.landlordApprovedByName}
                {spot.landlordApprovedByRole ? ` (${spot.landlordApprovedByRole})` : ""}
                {spot.landlordRespondedAt ? `, ${formatDateTime(spot.landlordRespondedAt)}` : ""}.
              </p>
            ) : spot.landlordApproval === "declined" ? (
              <p className="mt-1 text-danger">{who[0].toUpperCase() + who.slice(1)} har nekat uthyrning av platsen.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {spot.landlordApproval === "requested" ? <p>Förfrågan skickad till {spot.landlordEmail}. Väntar på svar.</p> : null}
                {spot.landlordEmail ? (
                  <RequestApprovalForm accountId={accountId} spotId={spot.id} again={spot.landlordApproval === "requested"} />
                ) : (
                  <p>Lägg till e-post till {who} i formuläret nedan för att skicka en förfrågan, eller ladda upp ett skriftligt godkännande.</p>
                )}
              </div>
            )}
          </div>
        ) : null}

        {docs.length ? (
          <ul className="space-y-1 text-sm">
            {docs.map((d) => (
              <li key={d.id}>
                <a href={`/api/dokument/${d.id}`} className="link" target="_blank" rel="noreferrer">
                  {d.filename}
                </a>{" "}
                <span className="text-muted">– {DOCUMENT_KIND_LABEL[d.kind]}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <DocumentUploader accountId={accountId} spotId={spot.id} kinds={SPOT_DOC_OPTIONS} siblings={siblings.length} />

        {canSubmit ? (
          <SubmitSpotForm
            accountId={accountId}
            spotId={spot.id}
            label={spot.review === "rejected" ? "Skicka in igen" : "Skicka in för granskning"}
            siblings={siblings.filter((s) => s.review === "draft" || s.review === "rejected").length}
          />
        ) : spot.review === "pending_review" ? (
          <p className="text-sm text-ink-soft">Inskickad {spot.submittedAt ? formatDateTime(spot.submittedAt) : ""}. Vi granskar oftast inom en arbetsdag.</p>
        ) : null}
      </section>

      <h2 className="pt-4 text-xl font-bold">Uppgifter om platsen</h2>
      {spot.review === "approved" ? (
        <p className="text-sm text-muted">Ändrar du adress eller uthyrningsgrund behöver platsen granskas igen innan den kan bokas.</p>
      ) : null}
      <SpotForm accountId={accountId} spotId={spot.id} defaults={defaults} allowMultiple={false} />
    </div>
  );
}
