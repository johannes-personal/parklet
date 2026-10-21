"use client";

import { useActionState } from "react";
import { FormAlert, SubmitButton, type FormState } from "@/components/form";
import { resetDemoDataAction } from "./actions";

export function ResetForm() {
  const [state, action] = useActionState<FormState, FormData>(resetDemoDataAction, null);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Återställa testdatan? All data i demon tas bort och demokontona läggs in igen. Det går inte att ångra.")) e.preventDefault();
      }}
      className="mt-6 space-y-4"
    >
      <FormAlert state={state} />
      <SubmitButton className="btn-danger" pendingText="Återställer…">
        Återställ testdata
      </SubmitButton>
    </form>
  );
}
