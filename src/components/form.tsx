"use client";

import { useFormStatus } from "react-dom";

export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
  success?: string;
} | null;

export function SubmitButton({ children, className = "btn-primary", pendingText }: { children: React.ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-disabled={pending}>
      {pending ? (pendingText ?? "Skickar…") : children}
    </button>
  );
}

export function FormAlert({ state }: { state: FormState }) {
  if (state?.error) {
    return (
      <p role="alert" className="rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
        {state.error}
      </p>
    );
  }
  if (state?.success) {
    return (
      <p role="status" className="rounded-xl border border-ok/20 bg-ok-soft px-4 py-3 text-sm font-medium text-ok">
        {state.success}
      </p>
    );
  }
  return null;
}

export function FieldError({ state, name }: { state: FormState; name: string }) {
  const msg = state?.fieldErrors?.[name];
  if (!msg) return null;
  return (
    <p id={`${name}-error`} className="field-error">
      {msg}
    </p>
  );
}

/** Props wiring an input to its error message for screen readers. */
export function errProps(state: FormState, name: string) {
  const has = Boolean(state?.fieldErrors?.[name]);
  return { "aria-invalid": has || undefined, "aria-describedby": has ? `${name}-error` : undefined } as const;
}
