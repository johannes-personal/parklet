"use client";

import { useActionState } from "react";
import { useFieldIds } from "@/components/use-field-ids";
import { errProps, FieldError, FormAlert, SubmitButton, type FormState } from "@/components/form";
import { deleteAccountAction } from "@/app/konto/actions";

export function DeleteAccountForm() {
  const f = useFieldIds();
  const [state, action] = useActionState<FormState, FormData>(deleteAccountAction, null);
  return (
    <form action={action} className="mt-3 space-y-3" noValidate>
      <FormAlert state={state} />
      <p className="text-sm text-ink-soft">
        Ditt namn, din e-postadress, dina bilar och notiser tas bort och du loggas ut. Bokningar du gjort sparas utan ditt namn, eftersom de måste finnas
        kvar i bokföringen. Är du uthyrare pausas dina parkeringsplatser och underlagen tas bort. Det går inte att ångra.
      </p>
      <div>
        <label htmlFor={f("password")} className="label">
          Ditt lösenord
        </label>
        <input id={f("password")} name="password" type="password" autoComplete="current-password" className="input" {...errProps(state, "password")} />
        <FieldError state={state} name="password" />
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="confirm" className="mt-0.5 size-4 accent-brand" {...errProps(state, "confirm")} />
        Jag förstår att kontot tas bort och inte går att återställa.
      </label>
      <FieldError state={state} name="confirm" />
      <SubmitButton className="btn-danger" pendingText="Tar bort…">
        Ta bort mitt konto
      </SubmitButton>
    </form>
  );
}
