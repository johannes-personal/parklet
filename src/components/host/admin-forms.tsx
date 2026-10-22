"use client";

import { useActionState, useState } from "react";
import { deleteHostAccountAction, deleteSpotAction, memberAction, approveVehicleAction } from "@/app/uthyrare/actions";
import { errProps, FieldError, FormAlert, SubmitButton, type FormState } from "@/components/form";
import { useFieldIds } from "@/components/use-field-ids";

/** One administrator's buttons (make owner, remove, leave), with the result above them. */
export function MemberButtons({ accountId, userId, buttons }: { accountId: string; userId: string; buttons: { op: "owner" | "remove"; label: string; confirm?: string }[] }) {
  const [state, action] = useActionState<FormState, FormData>(memberAction, null);
  return (
    <form action={action} className="space-y-2">
      <FormAlert state={state} />
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="userId" value={userId} />
      <div className="flex flex-wrap justify-end gap-2">
        {buttons.map((b) => (
          <button
            key={b.op}
            name="op"
            value={b.op}
            className={b.op === "remove" ? "btn-secondary px-3 py-1.5 text-danger" : "btn-secondary px-3 py-1.5"}
            onClick={(e) => {
              if (b.confirm && !confirm(b.confirm)) e.preventDefault();
            }}
          >
            {b.label}
          </button>
        ))}
      </div>
    </form>
  );
}

/** A pending invitation: send it again (to the same or a corrected address) or take it back. */
export function InvitationActions({ accountId, invitationId, email }: { accountId: string; invitationId: string; email: string }) {
  const f = useFieldIds();
  const [state, action] = useActionState<FormState, FormData>(memberAction, null);
  const [editing, setEditing] = useState(false);
  return (
    <form action={action} className="space-y-2">
      <FormAlert state={state} />
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="invitationId" value={invitationId} />
      {/* Keyed, and the toggles prevent their default: React reuses the clicked button's element for the
          other branch's submit button, which would then submit the form on the same click. */}
      {editing ? (
        <div key="edit" className="flex flex-wrap items-start gap-2">
          <label htmlFor={f("email")} className="sr-only">
            Ny e-postadress
          </label>
          <input id={f("email")} name="email" type="email" defaultValue={email} className="input min-w-56 flex-1" {...errProps(state, "email")} />
          <button name="op" value="resend" className="btn-primary px-3 py-2">
            Skicka till den här adressen
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setEditing(false);
            }}
            className="btn-secondary px-3 py-2"
          >
            Avbryt
          </button>
          <FieldError state={state} name="email" />
        </div>
      ) : (
        <div key="view" className="flex flex-wrap justify-end gap-2">
          <input type="hidden" name="email" value={email} />
          <button name="op" value="resend" className="btn-secondary px-3 py-1.5">
            Skicka igen
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setEditing(true);
            }}
            className="btn-secondary px-3 py-1.5"
          >
            Ändra e-post
          </button>
          <button name="op" value="cancel" className="btn-secondary px-3 py-1.5 text-danger">
            Ta tillbaka
          </button>
        </div>
      )}
    </form>
  );
}

/** "Ta bort …": a confirmation box and the button, for a spot or a whole account. */
export function DeleteForm({
  kind,
  accountId,
  spotId,
  confirmLabel,
  button,
}: {
  kind: "spot" | "account";
  accountId: string;
  spotId?: string;
  confirmLabel: string;
  button: string;
}) {
  const f = useFieldIds();
  const [state, action] = useActionState<FormState, FormData>(kind === "spot" ? deleteSpotAction : deleteHostAccountAction, null);
  return (
    <form action={action} className="mt-3 space-y-3">
      <FormAlert state={state} />
      <input type="hidden" name="accountId" value={accountId} />
      {spotId ? <input type="hidden" name="spotId" value={spotId} /> : null}
      <label htmlFor={f("confirm")} className="flex items-start gap-2 text-sm">
        <input id={f("confirm")} type="checkbox" name="confirm" className="mt-1 accent-brand" />
        <span>{confirmLabel}</span>
      </label>
      <SubmitButton className="btn-danger" pendingText="Tar bort…">
        {button}
      </SubmitButton>
    </form>
  );
}

/** Adds a car to the spot's registered cars. */
export function ApproveVehicleForm({ accountId, spotId }: { accountId: string; spotId: string }) {
  const f = useFieldIds();
  const [state, action] = useActionState<FormState, FormData>(approveVehicleAction, null);
  return (
    <form action={action} className="space-y-2">
      <FormAlert state={state} />
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="spotId" value={spotId} />
      <div className="flex gap-2">
        <label htmlFor={f("reg")} className="sr-only">
          Registreringsnummer
        </label>
        <input
          id={f("reg")}
          name="reg"
          className="input uppercase placeholder:normal-case"
          placeholder="Registreringsnummer, t.ex. ABC123"
          autoComplete="off"
          defaultValue={state?.values?.reg}
          {...errProps(state, "reg")}
        />
        <SubmitButton className="btn-secondary shrink-0" pendingText="Lägger till…">
          Lägg till bil
        </SubmitButton>
      </div>
      <FieldError state={state} name="reg" />
    </form>
  );
}
