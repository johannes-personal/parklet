"use client";

import { useFieldIds } from "@/components/use-field-ids";
import { useActionState } from "react";
import {
  createAccountAction,
  inviteAdminAction,
  requestApprovalAction,
  submitAccountAction,
  submitSpotAction,
  uploadDocumentAction,
} from "@/app/uthyrare/actions";
import { errProps, FieldError, FormAlert, SubmitButton, type FormState } from "@/components/form";

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
  const [state, action] = useActionState<FormState, FormData>(uploadDocumentAction, null);
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
            Fil (PDF eller bild, max 10 MB)
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
          <input type="checkbox" name="applyToSiblings" defaultChecked className="accent-brand" /> Gäller även de {siblings} andra platserna på samma adress
        </label>
      ) : null}
      <SubmitButton className="btn-secondary" pendingText="Laddar upp…">
        Ladda upp
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
          <input type="checkbox" name="includeSiblings" defaultChecked className="accent-brand" /> Skicka även in de {siblings} andra platserna på samma adress
        </label>
      ) : null}
      {!state?.success ? <SubmitButton className="btn-primary btn-lg">{label}</SubmitButton> : null}
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
  { value: "association", title: "Bostadsrättsförening", body: "Föreningen hyr ut sina platser till boende och/eller andra. Flera administratörer." },
  { value: "company", title: "Företag eller fastighetsägare", body: "Hyr ut kontorets eller fastighetens platser när de inte används." },
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
            <label key={k.value} className="peer flex cursor-pointer gap-3 rounded-xl border border-line p-4 has-checked:border-brand has-checked:bg-brand-soft">
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
            <input id={f("orgNumber")} name="orgNumber" inputMode="numeric" className="input" placeholder="NNNNNN-NNNN" defaultValue={state?.values?.orgNumber} {...errProps(state, "orgNumber")} />
            <FieldError state={state} name="orgNumber" />
          </div>
          <div>
            <label htmlFor={f("signatoryRole")} className="label">
              Din roll
            </label>
            <input id={f("signatoryRole")} name="signatoryRole" className="input" placeholder="T.ex. Styrelseledamot, firmatecknare eller förvaltare" defaultValue={state?.values?.signatoryRole} {...errProps(state, "signatoryRole")} />
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

      {!identityVerified ? (
        <p className="text-sm text-ink-soft">Du kommer att behöva legitimera dig med BankID innan du kan ta emot bokningar.</p>
      ) : null}
      <SubmitButton className="btn-primary btn-lg">Skapa uthyrarkonto</SubmitButton>
    </form>
  );
}
