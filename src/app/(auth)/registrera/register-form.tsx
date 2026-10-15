"use client";

import { useFieldIds } from "@/components/use-field-ids";
import Link from "next/link";
import { useActionState } from "react";
import { errProps, FieldError, FormAlert, SubmitButton, type FormState } from "@/components/form";
import { MIN_PASSWORD_LENGTH } from "@/lib/validation";
import { registerAction } from "../actions";
import { PasswordInput } from "../password-input";

export function RegisterForm({ next }: { next: string }) {
  const f = useFieldIds();
  const [state, action] = useActionState<FormState, FormData>(registerAction, null);
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor={f("name")} className="label">
          För- och efternamn
        </label>
        <input id={f("name")} name="name" autoComplete="name" required className="input" defaultValue={state?.values?.name} {...errProps(state, "name")} />
        <FieldError state={state} name="name" />
      </div>
      <div>
        <label htmlFor={f("email")} className="label">
          E-post
        </label>
        <input id={f("email")} name="email" type="email" autoComplete="email" required className="input" defaultValue={state?.values?.email} {...errProps(state, "email")} />
        <FieldError state={state} name="email" />
      </div>
      <div>
        <label htmlFor={f("password")} className="label">
          Lösenord
        </label>
        <PasswordInput id={f("password")} name="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH}
          aria-invalid={errProps(state, "password")["aria-invalid"]}
          aria-describedby={state?.fieldErrors?.password ? "password-hint password-error" : "password-hint"}
        />
        <p id={f("password-hint")} className="hint">
          Minst {MIN_PASSWORD_LENGTH} tecken. En fras med flera ord är både säker och lätt att komma ihåg.
        </p>
        <FieldError state={state} name="password" />
      </div>
      <div>
        <label className="flex items-start gap-3 text-sm text-ink-soft">
          <input type="checkbox" name="terms" className="mt-0.5 size-4 accent-brand" {...errProps(state, "terms")} />
          <span>
            Jag godkänner{" "}
            <Link href="/villkor" className="link" target="_blank">
              användarvillkoren
            </Link>{" "}
            och har läst{" "}
            <Link href="/integritet" className="link" target="_blank">
              integritetspolicyn
            </Link>
            .
          </span>
        </label>
        <FieldError state={state} name="terms" />
      </div>
      <SubmitButton className="btn-primary btn-lg w-full" pendingText="Skapar konto…">
        Skapa konto
      </SubmitButton>
      <p className="text-center text-sm text-ink-soft">
        Har du redan ett konto?{" "}
        <Link href={`/logga-in${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className="link">
          Logga in
        </Link>
      </p>
    </form>
  );
}
