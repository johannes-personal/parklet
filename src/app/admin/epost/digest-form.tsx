"use client";

import { useActionState } from "react";
import { saveDigestSettingsAction } from "@/app/admin/actions";
import { errProps, FieldError, FormAlert, SubmitButton, type FormState } from "@/components/form";
import { useFieldIds } from "@/components/use-field-ids";

/** The admins' morning summary: on or off, and where it goes. */
export function DigestSettingsForm({ enabled, to }: { enabled: boolean; to: string | null }) {
  const f = useFieldIds();
  const [state, action] = useActionState<FormState, FormData>(saveDigestSettingsAction, null);
  const value = (name: string, fallback: string) => state?.values?.[name] ?? fallback;
  return (
    <form action={action} className="card space-y-3 p-4">
      <h2 className="font-semibold">Dagens sammanfattning</h2>
      <p className="text-sm text-ink-soft">
        Ett mejl varje morgon (kl. 7 på vintern, kl. 8 på sommaren) med det som väntar på granskning och det senaste dygnets bokningar, avbokningar och nya
        konton. Skickas bara när det finns något att rapportera.
      </p>
      <FormAlert state={state} />
      <label className="flex items-center gap-2">
        <input type="checkbox" name="enabled" className="size-4 accent-brand" defaultChecked={state?.values ? state.values.enabled === "on" : enabled} />
        Skicka dagens sammanfattning
      </label>
      <div>
        <label htmlFor={f("to")} className="label">
          Skicka till
        </label>
        <input
          id={f("to")}
          name="to"
          type="email"
          className="input sm:max-w-md"
          placeholder="Alla administratörer"
          defaultValue={value("to", to ?? "")}
          {...errProps(state, "to")}
          aria-describedby={state?.fieldErrors?.to ? `${f("to-hint")} to-error` : f("to-hint")}
        />
        <p id={f("to-hint")} className="hint">
          Lämna tomt för att skicka till alla administratörer.
        </p>
        <FieldError state={state} name="to" />
      </div>
      <SubmitButton pendingText="Sparar…">Spara</SubmitButton>
    </form>
  );
}
