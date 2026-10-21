"use client";

import { useEffect, useRef } from "react";
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

/**
 * The form's message, and two things every form with one gets:
 *
 * - What was entered stays until the form is sent successfully. React resets a form
 *   after its action has run, error or not; the visible fields then no longer matched
 *   what the user had chosen (and controlled fields, like the time selects, drifted
 *   from their state). The reset is kept only after a success.
 * - After an error the user is taken to it: the first invalid field is focused, or
 *   the message is scrolled into view, so it isn't missed at the top of a long form.
 */
export function FormAlert({ state }: { state: FormState }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const alert = useRef<HTMLParagraphElement>(null);
  const allowReset = useRef(false);

  useEffect(() => {
    const form = anchor.current?.closest("form");
    if (!form) return;
    const keep = (e: Event) => {
      if (!allowReset.current) e.preventDefault();
      allowReset.current = false;
    };
    form.addEventListener("reset", keep);
    return () => form.removeEventListener("reset", keep);
  }, []);

  useEffect(() => {
    if (!state) return;
    const form = anchor.current?.closest("form");
    const failed = Boolean(state.error || (state.fieldErrors && Object.keys(state.fieldErrors).length));
    if (!failed) {
      if (state.success && form) {
        allowReset.current = true;
        form.reset();
      }
      return;
    }
    const field = form?.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (field) {
      field.focus({ preventScroll: true });
      field.scrollIntoView({ block: "center", behavior: "smooth" });
    } else {
      alert.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [state]);

  return (
    <>
      <span ref={anchor} hidden />
      {state?.error ? (
        <p ref={alert} role="alert" className="rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          {state.error}
        </p>
      ) : state?.success ? (
        <p role="status" className="rounded-xl border border-ok/20 bg-ok-soft px-4 py-3 text-sm font-medium text-ok">
          {state.success}
        </p>
      ) : null}
    </>
  );
}

/** Beside the submit button of a long form: says something needs fixing above, so it's seen where the user clicked. */
export function FormErrorSummary({ state }: { state: FormState }) {
  const fields = state?.fieldErrors ? Object.keys(state.fieldErrors).length : 0;
  if (!state?.error && !fields) return null;
  return (
    <p className="text-sm font-medium text-danger">
      {fields === 0 ? state?.error : fields === 1 ? "Ett fält behöver rättas, se markeringen ovan." : `${fields} fält behöver rättas, se markeringarna ovan.`}
    </p>
  );
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
