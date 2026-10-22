"use client";

import { useFieldIds } from "@/components/use-field-ids";
import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createAccountAction,
  deleteDocumentAction,
  inviteAdminAction,
  requestApprovalAction,
  submitAccountAction,
  submitSpotAction,
  uploadDocumentAction,
  withdrawSpotAction,
} from "@/app/uthyrare/actions";
import { fileTooLarge, TOO_LARGE } from "@/lib/documents";
import { errProps, FieldError, FormAlert, FormErrorSummary, SubmitButton, type FormState } from "@/components/form";

export function DocumentUploader({
  accountId,
  spotId,
  kinds,
  siblings = 0,
}: {
  accountId: string;
  spotId?: string;
  kinds: { value: string; label: string }[];
  siblings?: number;
}) {
  const f = useFieldIds();
  const [state, action] = useActionState<FormState, FormData>((prev, data) => (fileTooLarge(data) ? { error: TOO_LARGE } : uploadDocumentAction(prev, data)), null);
  return (
    <form action={action} className="space-y-3 rounded-xl border border-dashed border-line p-4">
      <FormAlert state={state} />
      <input type="hidden" name="accountId" value={accountId} />
      {spotId ? <input type="hidden" name="spotId" value={spotId} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={f("kind")} className="label">
            Typ av dokument
          </label>
          <select id={f("kind")} name="kind" className="input" defaultValue="">
            <option value="" disabled>
              Välj…
            </option>
            {kinds.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={f("file")} className="label">
            Fil (PDF eller bild, max 4 MB)
          </label>
          <input
            id={f("file")}
            name="file"
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/heic"
            capture="environment"
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:font-semibold file:text-brand"
          />
        </div>
      </div>
      {siblings > 0 ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="applyToSiblings" defaultChecked className="accent-brand" /> Gäller även de {siblings} andra parkeringsplatserna på samma adress
        </label>
      ) : null}
      <SubmitButton className="btn-secondary" pendingText="Laddar upp…">
        Ladda upp
      </SubmitButton>
    </form>
  );
}

export type SlotDocument = { id: string; filename: string; kindLabel?: string };

/**
 * One document a spot needs (or "Övriga dokument" with a type selector):
 * what has been uploaded, with delete buttons, and an upload that starts as
 * soon as a file is chosen.
 */
export function DocumentSlot({
  accountId,
  spotId,
  title,
  description,
  required,
  kind,
  kinds,
  docs,
  canDelete,
  canUpload = true,
  siblings = 0,
  note,
}: {
  accountId: string;
  spotId: string;
  title: string;
  description?: string;
  required: boolean;
  /** Replaces "(obligatoriskt)"/"(valfritt)" after the title. */
  note?: string;
  /** The document type of this slot, or… */
  kind?: string;
  /** …the types to choose from (for "Övriga dokument"). */
  kinds?: { value: string; label: string }[];
  docs: SlotDocument[];
  canDelete: boolean;
  /** False while the documents are locked (the spot is under review or approved). */
  canUpload?: boolean;
  siblings?: number;
}) {
  const f = useFieldIds();
  const form = useRef<HTMLFormElement>(null);
  // The latest of "uploaded" or "deleted" is shown, so a deletion replaces the upload's confirmation.
  const [notice, setNotice] = useState<FormState>(null);
  const [state, action] = useActionState<FormState, FormData>((prev, data) => {
    setNotice(null);
    return fileTooLarge(data) ? { error: TOO_LARGE } : uploadDocumentAction(prev, data);
  }, null);
  const done = docs.length > 0;
  return (
    <section aria-labelledby={f("title")} className="rounded-xl border border-line p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold ${done ? "bg-ok text-white" : required ? "border-2 border-ink-soft" : "border-2 border-line"}`}
        >
          {done ? "✓" : ""}
        </span>
        <div className="min-w-0 flex-1">
          <h3 id={f("title")} className="font-semibold">
            {title} <span className="text-sm font-normal text-muted">{note ?? (required ? "(obligatoriskt)" : "(valfritt)")}</span>
          </h3>
          {description ? <p className="mt-0.5 text-sm text-ink-soft">{description}</p> : null}

          {docs.length ? (
            <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <a href={`/api/dokument/${d.id}`} className="link block truncate" target="_blank" rel="noreferrer">
                      {d.filename}
                    </a>
                    {d.kindLabel ? <span className="text-muted">{d.kindLabel}</span> : null}
                  </span>
                  {canDelete ? (
                    <DeleteDocumentButton accountId={accountId} spotId={spotId} documentId={d.id} filename={d.filename} onResult={setNotice} />
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {canUpload ? (
            <form ref={form} action={action} className="mt-3 space-y-3">
              <FormAlert state={notice ?? state} />
              <input type="hidden" name="accountId" value={accountId} />
              <input type="hidden" name="spotId" value={spotId} />
              {kind ? <input type="hidden" name="kind" value={kind} /> : null}
              <div className="flex flex-wrap items-end gap-3">
                {kinds ? (
                  <div className="min-w-48 flex-1">
                    <label htmlFor={f("kind")} className="label">
                      Typ av dokument
                    </label>
                    <select id={f("kind")} name="kind" className="input" defaultValue={kinds[0]?.value}>
                      {kinds.map((k) => (
                        <option key={k.value} value={k.value}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <div>
                  <input
                    id={f("file")}
                    name="file"
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/heic"
                    // Upload as soon as a file is chosen.
                    onChange={(e) => e.currentTarget.files?.length && form.current?.requestSubmit()}
                    className="peer sr-only"
                  />
                  <FilePickButton htmlFor={f("file")}>{docs.length ? "Lägg till fil…" : "Välj fil…"}</FilePickButton>
                </div>
                <p className="basis-full text-xs text-muted sm:basis-auto sm:self-center">PDF eller bild, max 4 MB</p>
              </div>
              {siblings > 0 ? (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="applyToSiblings" defaultChecked className="accent-brand" /> Gäller även de {siblings} andra parkeringsplatserna på samma
                  adress
                </label>
              ) : null}
            </form>
          ) : docs.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Inget uppladdat.</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** The visible button for a hidden file input; shows progress while the chosen file uploads. */
function FilePickButton({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <label
      htmlFor={htmlFor}
      aria-disabled={pending}
      className="btn-secondary cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent aria-disabled:pointer-events-none aria-disabled:opacity-60"
    >
      {pending ? "Laddar upp…" : children}
    </label>
  );
}

function DeleteDocumentButton({
  accountId,
  spotId,
  documentId,
  filename,
  onResult,
}: {
  accountId: string;
  spotId: string;
  documentId: string;
  filename: string;
  /** Reported to the slot, since this row disappears once the file is gone. */
  onResult: (state: FormState) => void;
}) {
  const [, action] = useActionState<FormState, FormData>(async (prev, data) => {
    const result = await deleteDocumentAction(prev, data);
    onResult(result?.success ? { success: `${filename} är borttagen.` } : result);
    return result;
  }, null);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Ta bort ${filename}?`)) e.preventDefault();
      }}
      className="shrink-0"
    >
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="spotId" value={spotId} />
      <input type="hidden" name="documentId" value={documentId} />
      <SubmitButton className="btn-danger px-3 py-1.5" pendingText="Tar bort…">
        Ta bort<span className="sr-only"> {filename}</span>
      </SubmitButton>
    </form>
  );
}

export function SubmitSpotForm({ accountId, spotId, label, siblings = 0 }: { accountId: string; spotId: string; label: string; siblings?: number }) {
  const [state, action] = useActionState<FormState, FormData>(submitSpotAction, null);
  return (
    <form action={action} className="space-y-3">
      <FormAlert state={state} />
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="spotId" value={spotId} />
      {siblings > 0 && !state?.success ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="includeSiblings" defaultChecked className="accent-brand" /> Skicka även in de {siblings} andra parkeringsplatserna på samma adress
        </label>
      ) : null}
      {!state?.success ? <SubmitButton className="btn-primary btn-lg">{label}</SubmitButton> : null}
    </form>
  );
}

/** Take a spot back from Parklet's review, to change its documents. */
export function WithdrawSpotForm({ accountId, spotId }: { accountId: string; spotId: string }) {
  return (
    <form action={withdrawSpotAction}>
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="spotId" value={spotId} />
      <SubmitButton className="btn-secondary" pendingText="Tar tillbaka…">
        Ta tillbaka från granskningen
      </SubmitButton>
    </form>
  );
}

export function RequestApprovalForm({ accountId, spotId, again }: { accountId: string; spotId: string; again: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(requestApprovalAction, null);
  return (
    <form action={action} className="space-y-3">
      <FormAlert state={state} />
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="spotId" value={spotId} />
      <SubmitButton className="btn-secondary">{again ? "Skicka förfrågan igen" : "Skicka godkännandeförfrågan"}</SubmitButton>
    </form>
  );
}

export function SubmitAccountForm({ accountId }: { accountId: string }) {
  const [state, action] = useActionState<FormState, FormData>(submitAccountAction, null);
  return (
    <form action={action} className="space-y-3">
      <FormAlert state={state} />
      <input type="hidden" name="accountId" value={accountId} />
      {!state?.success ? <SubmitButton>Skicka in för verifiering</SubmitButton> : null}
    </form>
  );
}

export function InviteForm({ accountId }: { accountId: string }) {
  const f = useFieldIds();
  const [state, action] = useActionState<FormState, FormData>(inviteAdminAction, null);
  return (
    <form action={action} className="space-y-3">
      <FormAlert state={state} />
      <input type="hidden" name="accountId" value={accountId} />
      <div className="flex gap-2">
        <label htmlFor={f("invite-email")} className="sr-only">
          E-post
        </label>
        <input id={f("invite-email")} name="email" type="email" placeholder="namn@exempel.se" className="input" {...errProps(state, "email")} />
        <SubmitButton className="btn-secondary shrink-0">Bjud in</SubmitButton>
      </div>
      <FieldError state={state} name="email" />
    </form>
  );
}

const KINDS = [
  { value: "household", title: "Privatperson", body: "Du hyr ut din egen plats, t.ex. på uppfarten eller platsen du hyr i din BRF." },
  { value: "association", title: "Bostadsrättsförening", body: "Föreningen hyr ut sina parkeringsplatser till boende och/eller andra. Flera administratörer." },
  { value: "company", title: "Företag eller fastighetsägare", body: "Hyr ut kontorets eller fastighetens parkeringsplatser när de inte används." },
];

export function CreateAccountForm({ identityVerified }: { identityVerified: boolean }) {
  const f = useFieldIds();
  const [state, action] = useActionState<FormState, FormData>(createAccountAction, null);
  const kind = state?.values?.kind;
  return (
    <form action={action} className="space-y-6" noValidate>
      <FormAlert state={state} />
      <fieldset>
        <legend className="label">Vem hyr ut?</legend>
        <div className="grid gap-3">
          {KINDS.map((k) => (
            <label
              key={k.value}
              className="peer flex cursor-pointer gap-3 rounded-xl border border-line p-4 has-checked:border-brand has-checked:bg-brand-soft"
            >
              <input type="radio" name="kind" value={k.value} className="mt-1 accent-brand" defaultChecked={kind === k.value} />
              <span>
                <span className="font-medium">{k.title}</span>
                <span className="block text-sm text-ink-soft">{k.body}</span>
              </span>
            </label>
          ))}
        </div>
        <FieldError state={state} name="kind" />
      </fieldset>

      <details className="rounded-xl border border-line p-4" open={kind === "association" || kind === "company"}>
        <summary className="cursor-pointer font-medium">Uppgifter om organisationen (för förening och företag)</summary>
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor={f("name")} className="label">
              Organisationens namn
            </label>
            <input id={f("name")} name="name" className="input" placeholder="T.ex. Brf Eken" defaultValue={state?.values?.name} {...errProps(state, "name")} />
            <FieldError state={state} name="name" />
          </div>
          <div>
            <label htmlFor={f("orgNumber")} className="label">
              Organisationsnummer
            </label>
            <input
              id={f("orgNumber")}
              name="orgNumber"
              inputMode="numeric"
              className="input"
              placeholder="NNNNNN-NNNN"
              defaultValue={state?.values?.orgNumber}
              {...errProps(state, "orgNumber")}
            />
            <FieldError state={state} name="orgNumber" />
          </div>
          <div>
            <label htmlFor={f("signatoryRole")} className="label">
              Din roll
            </label>
            <input
              id={f("signatoryRole")}
              name="signatoryRole"
              className="input"
              placeholder="T.ex. Styrelseledamot, firmatecknare eller förvaltare"
              defaultValue={state?.values?.signatoryRole}
              {...errProps(state, "signatoryRole")}
            />
            <FieldError state={state} name="signatoryRole" />
          </div>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="confirm" className="mt-0.5 size-4 accent-brand" />
            Jag intygar att jag har rätt att företräda organisationen i frågor om uthyrning av dess parkeringsplatser.
          </label>
          <FieldError state={state} name="confirm" />
          <p className="text-sm text-muted">I nästa steg laddar du upp registreringsbevis och styrelseprotokoll eller firmatecknarbevis.</p>
        </div>
      </details>

      {!identityVerified ? <p className="text-sm text-ink-soft">Du kommer att behöva legitimera dig med BankID innan du kan ta emot bokningar.</p> : null}
      <SubmitButton className="btn-primary btn-lg">Skapa uthyrarkonto</SubmitButton>
      <FormErrorSummary state={state} />
    </form>
  );
}
