"use client";

import { useFieldIds } from "@/components/use-field-ids";
import { useActionState, useState } from "react";
import { FieldError, FormAlert, type FormState } from "@/components/form";
import { respondApprovalAction } from "./actions";

export function ApprovalForm({ token, isBrf }: { token: string; isBrf: boolean }) {
  const f = useFieldIds();
  const [state, action] = useActionState<FormState, FormData>(respondApprovalAction, null);
  const [reg, setReg] = useState(false);
  if (state?.success) return <div className="mt-6"><FormAlert state={state} /></div>;
  return (
    <form action={action} className="mt-6 space-y-4">
      <FormAlert state={state} />
      <input type="hidden" name="token" value={token} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={f("name")} className="label">
            Ditt namn
          </label>
          <input id={f("name")} name="name" className="input" autoComplete="name" />
          <FieldError state={state} name="name" />
        </div>
        <div>
          <label htmlFor={f("role")} className="label">
            Din roll
          </label>
          <input id={f("role")} name="role" className="input" placeholder={isBrf ? "T.ex. ordförande" : "T.ex. förvaltare"} />
          <FieldError state={state} name="role" />
        </div>
      </div>
      <label className="flex items-start gap-3">
        <input type="checkbox" name="requiresVehicleRegistration" className="mt-1 size-4 accent-brand" checked={reg} onChange={(e) => setReg(e.target.checked)} />
        <span>
          Tillfälliga hyresgästers bilar måste registreras hos {isBrf ? "föreningen" : "oss"}
          <span className="block text-sm text-muted">Uthyraren får då förarens registreringsnummer i god tid och ansvarar för registreringen.</span>
        </span>
      </label>
      {reg ? (
        <div>
          <label htmlFor={f("vehicleRegistrationNote")} className="label">
            Hur registreras bilen? (visas för föraren)
          </label>
          <input id={f("vehicleRegistrationNote")} name="vehicleRegistrationNote" className="input" placeholder="T.ex. via föreningens parkeringsapp senast dagen innan" />
        </div>
      ) : null}
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="authority" className="mt-0.5 size-4 accent-brand" />
        Jag intygar att jag får fatta det här beslutet för {isBrf ? "föreningens" : "hyresvärdens"} räkning.
      </label>
      <FieldError state={state} name="authority" />
      <div className="flex flex-wrap gap-3">
        <button type="submit" name="decision" value="approve" className="btn-primary">
          Godkänn uthyrning
        </button>
        <button type="submit" name="decision" value="decline" className="btn-danger">
          Neka
        </button>
      </div>
    </form>
  );
}
