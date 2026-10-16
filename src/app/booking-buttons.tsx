"use client";

import { useActionState } from "react";
import { FormAlert, SubmitButton, type FormState } from "@/components/form";
import { cancelBookingAction, payMockAction } from "./bokning-actions";

export function PayButton({ bookingId, label }: { bookingId: string; label: string }) {
  const [state, action] = useActionState<FormState, FormData>(payMockAction, null);
  return (
    <form action={action} className="space-y-3">
      <FormAlert state={state} />
      <input type="hidden" name="bookingId" value={bookingId} />
      <SubmitButton className="btn-primary btn-lg w-full" pendingText="Genomför betalning…">
        {label}
      </SubmitButton>
    </form>
  );
}

export function CancelButton({ bookingId, label = "Avboka" }: { bookingId: string; label?: string }) {
  const [state, action] = useActionState<FormState, FormData>(cancelBookingAction, null);
  if (state?.success) return <FormAlert state={state} />;
  return (
    <form
      action={action}
      className="space-y-3"
      onSubmit={(e) => {
        if (!confirm("Vill du avboka? Det går inte att ångra.")) e.preventDefault();
      }}
    >
      <FormAlert state={state} />
      <input type="hidden" name="bookingId" value={bookingId} />
      <SubmitButton className="btn-danger" pendingText="Avbokar…">
        {label}
      </SubmitButton>
    </form>
  );
}
