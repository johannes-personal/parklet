import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { revokeVehicleAction, toggleSpotAction } from "@/app/uthyrare/actions";
import { ApproveVehicleForm, DeleteForm } from "@/components/host/admin-forms";
import { DocumentSlot, RequestApprovalForm, SubmitSpotForm, WithdrawSpotForm } from "@/components/host/forms";
import { NoAccountAccess, SpotGone } from "@/components/host/host-access";
import { SpotSteps } from "@/components/host/spot-steps";
import { Badge } from "@/components/status-badge";
import { describeWindows } from "@/lib/availability";
import { requireUser } from "@/lib/auth/session";
import { DOCUMENT_KIND_LABEL, REVIEW_LABEL, spotFeatures } from "@/lib/labels";
import { formatSek } from "@/lib/money";
import { spotHref } from "@/lib/spot-link";
import { formatDateTime } from "@/lib/time";
import { getAccountForMember } from "@/server/host-accounts";
import { documentsEditable, documentsLockedError, getSpot, listSiblingSpots, listSpotDocuments, spotRequirements } from "@/server/spots";
import { listSpotApprovals } from "@/server/vehicle-approvals";

export const metadata: Metadata = { title: "Underlag för platsen" };

type P = PageProps<"/uthyrare/[accountId]/platser/[spotId]">;

/** Optional documents a host can add besides the required ones. */
const OTHER_KINDS = ["landlord_rules", "other"].map((value) => ({ value, label: DOCUMENT_KIND_LABEL[value] }));

/**
 * Step 2 of putting a spot up: the documents that show the host may rent it
 * out, then submitting it for review. The details from step 1 are summarised
 * at the top with a link back.
 */
export default function SpotDocumentsPage(props: P) {
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
  const { ny, sparad } = await searchParams;
  const user = await requireUser(`/uthyrare/${accountId}/platser/${spotId}`);
  const account = await getAccountForMember(accountId, user.id);
  if (!account) return <NoAccountAccess user={user} accountId={accountId} spotId={spotId} returnTo={`/uthyrare/${accountId}/platser/${spotId}`} />;
  const spot = await getSpot(spotId);
  if (!spot || spot.hostAccountId !== accountId) return <SpotGone accountId={accountId} accountName={account.name} />;
  const [docs, siblings, cars] = await Promise.all([
    listSpotDocuments(spotId),
    listSiblingSpots(spot),
    spot.requiresVehicleRegistration ? listSpotApprovals(spotId) : Promise.resolve([]),
  ]);
  const reqs = spotRequirements(spot, docs);
  const missing = reqs.filter((r) => !r.done);
  const review = REVIEW_LABEL[spot.review];
  const editable = documentsEditable(spot.review);
  const locked = documentsLockedError(spot.review);
  const who = spot.landlordKind === "brf" ? "föreningen" : "hyresvärden";
  const base = `/uthyrare/${accountId}/platser/${spotId}`;
  const of = (kind: string) => docs.filter((d) => d.kind === kind).map((d) => ({ id: d.id, filename: d.filename }));
  const slot = { accountId, spotId, canDelete: editable, canUpload: editable, siblings: siblings.filter((s) => documentsEditable(s.review)).length };

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/uthyrare/${accountId}/platser`} className="link text-sm">
          ← Parkeringsplatser
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{spot.title}</h1>
          <Badge kind={review.kind}>{review.text}</Badge>
        </div>
        <div className="mt-3">
          <SpotSteps
            current={spot.review === "pending_review" || spot.review === "approved" ? 3 : 2}
            done={spot.review === "approved" ? 3 : spot.review === "pending_review" ? 2 : 1}
            links={{ 1: `${base}/uppgifter` }}
          />
        </div>
      </div>

      {ny || sparad ? (
        <p role="status" className="text-sm font-medium text-ok">
          {Number(ny) > 1 ? `${ny} parkeringsplatser är sparade.` : sparad ? "Ändringarna är sparade." : "Platsen är sparad."}
        </p>
      ) : null}

      {spot.review === "rejected" && spot.reviewNote ? (
        <p role="alert" className="rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">
          <strong>Ej godkänd:</strong> {spot.reviewNote}
        </p>
      ) : null}

      <section className="card p-5 sm:p-6" aria-labelledby="summary">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="summary" className="font-semibold">
              {spot.address}, {spot.city}
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              {spotFeatures(spot).join(" · ")} · {formatSek(spot.pricePerHourOre)}/tim · {describeWindows(spot.windows)}
            </p>
            <p className="mt-1 text-sm text-ink-soft">{spot.rightBasis === "owns" ? "Du äger platsen" : `Du hyr platsen av ${spot.landlordName || who}`}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Link href={spotHref(spot)} className="btn-secondary px-3 py-1.5">
              {spot.review === "approved" ? "Visa annonsen" : "Förhandsgranska"}
            </Link>
            <Link href={`${base}/uppgifter`} className="btn-secondary px-3 py-1.5">
              Ändra uppgifter
            </Link>
          </div>
        </div>
        {spot.visibility === "link" ? <p className="mt-2 text-sm text-muted">Platsen syns bara för dem som får länken till annonsen.</p> : null}
      </section>

      <section className="card space-y-4 p-5 sm:p-6" aria-labelledby="underlag">
        <div>
          <h2 id="underlag" className="text-xl font-bold">
            Underlag för uthyrningsrätt
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Parklet granskar att du har rätt att hyra ut platsen innan den kan bokas. Underlagen visas bara för dig och Parklets granskare.
          </p>
        </div>

        {locked ? (
          <div role="note" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-canvas px-4 py-3 text-sm">
            <p className="min-w-0 flex-1 text-ink-soft">
              <span aria-hidden>🔒 </span>
              {locked}
            </p>
            {spot.review === "pending_review" ? <WithdrawSpotForm accountId={accountId} spotId={spot.id} /> : null}
          </div>
        ) : null}

        {spot.rightBasis === "owns" ? (
          <DocumentSlot
            {...slot}
            title="Bevis på att du äger platsen"
            description="T.ex. fastighetsutdrag eller lagfart, köpekontrakt eller upplåtelseavtal där platsen ingår."
            required
            kind="ownership_proof"
            docs={of("ownership_proof")}
          />
        ) : (
          <>
            <DocumentSlot
              {...slot}
              title="Hyresavtal för platsen"
              description={`Ditt avtal med ${who} om parkeringsplatsen.`}
              required
              kind="rental_contract"
              docs={of("rental_contract")}
            />

            <section className="rounded-xl border border-line p-4" aria-labelledby="approval">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold ${
                    spot.landlordApproval === "approved" || of("sublet_permission").length ? "bg-ok text-white" : "border-2 border-ink-soft"
                  }`}
                >
                  {spot.landlordApproval === "approved" || of("sublet_permission").length ? "✓" : ""}
                </span>
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <h3 id="approval" className="font-semibold">
                      Godkännande från {who} <span className="text-sm font-normal text-muted">(obligatoriskt)</span>
                    </h3>
                    <p className="mt-0.5 text-sm text-ink-soft">
                      Att platsen får hyras ut via Parklet. Skicka en förfrågan som {who} godkänner med ett klick, eller ladda upp ett skriftligt godkännande.
                    </p>
                  </div>
                  {spot.landlordApproval === "approved" ? (
                    <p className="text-sm text-ok">
                      Godkänt av {spot.landlordApprovedByName}
                      {spot.landlordApprovedByRole ? ` (${spot.landlordApprovedByRole})` : ""}
                      {spot.landlordRespondedAt ? `, ${formatDateTime(spot.landlordRespondedAt)}` : ""}.
                    </p>
                  ) : spot.landlordApproval === "declined" ? (
                    <p className="text-sm text-danger">{who[0].toUpperCase() + who.slice(1)} har nekat uthyrning av platsen.</p>
                  ) : !editable ? (
                    <p className="text-sm text-ink-soft">
                      {spot.landlordApproval === "requested" ? `Förfrågan skickad till ${spot.landlordEmail}. Väntar på svar.` : "Ingen förfrågan skickad."}
                    </p>
                  ) : (
                    <div className="space-y-2 text-sm">
                      {spot.landlordApproval === "requested" ? <p>Förfrågan skickad till {spot.landlordEmail}. Väntar på svar.</p> : null}
                      {spot.landlordEmail ? (
                        <RequestApprovalForm accountId={accountId} spotId={spot.id} again={spot.landlordApproval === "requested"} />
                      ) : (
                        <p>
                          <Link href={`${base}/uppgifter`} className="link">
                            Lägg till e-post till {who}
                          </Link>{" "}
                          för att skicka en förfrågan.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {spot.landlordApproval !== "approved" && spot.landlordApproval !== "declined" && (editable || of("sublet_permission").length > 0) ? (
                <div className="mt-4">
                  <DocumentSlot
                    {...slot}
                    title="…eller ladda upp ett skriftligt godkännande"
                    required={false}
                    note="(i stället för förfrågan)"
                    kind="sublet_permission"
                    docs={of("sublet_permission")}
                  />
                </div>
              ) : null}
            </section>
          </>
        )}

        <DocumentSlot
          {...slot}
          title="Övriga dokument"
          description="T.ex. föreningens parkeringsregler, eller annat som hjälper granskningen."
          required={false}
          kinds={OTHER_KINDS}
          docs={docs
            .filter((d) => OTHER_KINDS.some((k) => k.value === d.kind))
            .map((d) => ({ id: d.id, filename: d.filename, kindLabel: DOCUMENT_KIND_LABEL[d.kind] }))}
        />
      </section>

      <section className="card space-y-3 p-5 sm:p-6" aria-labelledby="submit">
        <h2 id="submit" className="text-lg font-semibold">
          Skicka in för granskning
        </h2>
        {editable ? (
          <>
            {missing.length ? (
              <div className="text-sm text-ink-soft">
                <p>Det här saknas innan du kan skicka in:</p>
                <ul className="mt-1 list-disc pl-5">
                  {missing.map((m) => (
                    <li key={m.key}>{m.label}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-ink-soft">Allt som behövs finns med. Vi granskar oftast inom en arbetsdag.</p>
            )}
            <SubmitSpotForm
              accountId={accountId}
              spotId={spot.id}
              label={spot.review === "rejected" ? "Skicka in igen" : "Skicka in för granskning"}
              siblings={siblings.filter((s) => s.review === "draft" || s.review === "rejected").length}
            />
          </>
        ) : spot.review === "pending_review" ? (
          <p className="text-sm text-ink-soft">Inskickad {spot.submittedAt ? formatDateTime(spot.submittedAt) : ""}. Vi granskar oftast inom en arbetsdag.</p>
        ) : (
          <p className="text-sm text-ink-soft">Platsen är godkänd{spot.reviewedAt ? ` sedan ${formatDateTime(spot.reviewedAt)}` : ""}.</p>
        )}
      </section>

      {spot.review === "approved" ? (
        <section className="card flex flex-wrap items-center justify-between gap-3 p-5 sm:p-6" aria-labelledby="uthyrning">
          <div>
            <h2 id="uthyrning" className="text-lg font-semibold">
              {spot.status === "active" ? "Uthyrd" : "Pausad"}
            </h2>
            <p className="text-sm text-ink-soft">
              {spot.status === "active"
                ? "Platsen kan bokas. Pausa den för att stoppa nya bokningar; bokningar som redan är gjorda gäller."
                : "Platsen syns inte i sökningen och kan inte bokas förrän du aktiverar den igen."}
            </p>
          </div>
          <form action={toggleSpotAction}>
            <input type="hidden" name="accountId" value={accountId} />
            <input type="hidden" name="spotId" value={spot.id} />
            <input type="hidden" name="status" value={spot.status === "active" ? "paused" : "active"} />
            <button className="btn-secondary">{spot.status === "active" ? "Pausa" : "Aktivera"}</button>
          </form>
        </section>
      ) : null}

      {spot.requiresVehicleRegistration ? (
        <section id="bilar" className="card scroll-mt-24 space-y-3 p-5 sm:p-6" aria-labelledby="bilar-rubrik">
          <div>
            <h2 id="bilar-rubrik" className="text-lg font-semibold">
              Registrerade bilar
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              Bilar som är registrerade i {who === "föreningen" ? "föreningens" : "hyresvärdens"} parkeringssystem för den här platsen. En bokning med
              någon av dem är klar direkt, utan att du behöver göra något. En bil du markerar som registrerad i en bokning hamnar här av sig själv.
            </p>
          </div>
          {cars.length ? (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {cars.map((c) => (
                <li key={c.reg} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2">
                  <span>
                    <span className="font-mono font-semibold tracking-wider">{c.reg}</span>
                    <span className="block text-sm text-muted">
                      Registrerad {formatDateTime(c.approvedAt)}
                      {c.approvedByName ? ` av ${c.approvedByName}` : ""}
                    </span>
                  </span>
                  <form action={revokeVehicleAction}>
                    <input type="hidden" name="accountId" value={accountId} />
                    <input type="hidden" name="spotId" value={spot.id} />
                    <input type="hidden" name="reg" value={c.reg} />
                    <button className="text-sm font-medium text-danger hover:underline" aria-label={`Ta bort ${c.reg}`}>
                      Ta bort
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Inga registrerade bilar än.</p>
          )}
          <ApproveVehicleForm accountId={accountId} spotId={spot.id} />
        </section>
      ) : null}

      <details className="card p-5 sm:p-6">
        <summary className="cursor-pointer font-semibold text-danger">Ta bort parkeringsplatsen</summary>
        <p className="mt-2 text-sm text-ink-soft">
          Platsen försvinner från Parklet tillsammans med underlagen. Har den bokats sparas bokningarna för bokföringen. Kommande bokningar behöver avbokas
          först.
        </p>
        <DeleteForm
          kind="spot"
          accountId={accountId}
          spotId={spot.id}
          confirmLabel="Jag förstår att parkeringsplatsen tas bort och inte går att återställa."
          button="Ta bort parkeringsplatsen"
        />
      </details>
    </div>
  );
}
