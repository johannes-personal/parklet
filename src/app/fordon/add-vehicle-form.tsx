"use client";

import { useFieldIds } from "@/components/use-field-ids";
import { useActionState } from "react";
import { errProps, FieldError, FormAlert, SubmitButton, type FormState } from "@/components/form";
import { addVehicleAction } from "./actions";

export function AddVehicleForm() {
  const f = useFieldIds();
  const [state, action] = useActionState<FormState, FormData>(addVehicleAction, null);
  return (
    <form action={action} className="card space-y-4 p-5">
      <h2 className="font-semibold">Lägg till bil</h2>
      <FormAlert state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={f("reg")} className="label">
            Registreringsnummer
          </label>
          <input id={f("reg")} name="reg" className="input uppercase" placeholder="ABC123" autoComplete="off" required {...errProps(state, "reg")} />
          <FieldError state={state} name="reg" />
        </div>
        <div>
          <label htmlFor={f("nickname")} className="label">
            Smeknamn (valfritt)
          </label>
          <input id={f("nickname")} name="nickname" className="input" placeholder="T.ex. Familjebilen" />
        </div>
      </div>
      <SubmitButton>Spara bil</SubmitButton>
    </form>
  );
}
