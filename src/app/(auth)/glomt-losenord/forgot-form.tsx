"use client";

import { useFieldIds } from "@/components/use-field-ids";
import { useActionState } from "react";
import { errProps, FieldError, FormAlert, SubmitButton, type FormState } from "@/components/form";
import { requestResetAction } from "../actions";

export function ForgotForm() {
  const f = useFieldIds();
  const [state, action] = useActionState<FormState, FormData>(requestResetAction, null);
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormAlert state={state} />
      <div>
        <label htmlFor={f("email")} className="label">
          E-post
        </label>
        <input id={f("email")} name="email" type="email" autoComplete="email" required className="input" {...errProps(state, "email")} />
        <FieldError state={state} name="email" />
      </div>
      <SubmitButton className="btn-primary btn-lg w-full">Skicka länk</SubmitButton>
    </form>
  );
}
