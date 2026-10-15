"use client";

import { useFieldIds } from "@/components/use-field-ids";
import Link from "next/link";
import { useActionState } from "react";
import { errProps, FormAlert, SubmitButton, type FormState } from "@/components/form";
import { loginAction } from "../actions";
import { PasswordInput } from "../password-input";

export function LoginForm({ next }: { next: string }) {
  const f = useFieldIds();
  const [state, action] = useActionState<FormState, FormData>(loginAction, null);
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor={f("email")} className="label">
          E-post
        </label>
        <input id={f("email")} name="email" type="email" autoComplete="email" required className="input" defaultValue={state?.values?.email} {...errProps(state, "email")} />
      </div>
      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor={f("password")} className="label">
            Lösenord
          </label>
          <Link href="/glomt-losenord" className="link text-sm">
            Glömt lösenordet?
          </Link>
        </div>
        <PasswordInput id={f("password")} name="password" autoComplete="current-password" required />
      </div>
      <SubmitButton className="btn-primary btn-lg w-full" pendingText="Loggar in…">
        Logga in
      </SubmitButton>
      <p className="text-center text-sm text-ink-soft">
        Ny på Parklet?{" "}
        <Link href={`/registrera${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className="link">
          Skapa konto
        </Link>
      </p>
    </form>
  );
}
