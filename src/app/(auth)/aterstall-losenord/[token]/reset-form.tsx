"use client";

import { useFieldIds } from "@/components/use-field-ids";
import { useActionState } from "react";
import { errProps, FieldError, FormAlert, SubmitButton, type FormState } from "@/components/form";
import { MIN_PASSWORD_LENGTH } from "@/lib/validation";
import { resetPasswordAction } from "../../actions";
import { PasswordInput } from "../../password-input";

export function ResetForm({ token }: { token: string }) {
  const f = useFieldIds();
  const [state, action] = useActionState<FormState, FormData>(resetPasswordAction, null);
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor={f("password")} className="label">
          Nytt lösenord
        </label>
        <PasswordInput id={f("password")} name="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} {...errProps(state, "password")} />
        <FieldError state={state} name="password" />
      </div>
      <SubmitButton className="btn-primary btn-lg w-full">Spara och logga in</SubmitButton>
    </form>
  );
}
