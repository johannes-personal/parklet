"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form";
import { requireUser } from "@/lib/auth/session";
import { cancelBooking, confirmPayment, getBookingForUser, markVehicleRegistered } from "@/server/bookings";
import { startCheckout } from "@/server/checkout";
import { getPaymentProvider } from "@/server/payments";

/** Mock checkout: stands in for Stripe's hosted payment page + `payment_intent.succeeded` webhook. */
export async function payMockAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("bookingId") ?? "");
  const user = await requireUser(`/betala/${id}`);
  const booking = await getBookingForUser(id, user.id);
  if (!booking || booking.driverId !== user.id) return { error: "Bokningen finns inte." };
  const provider = getPaymentProvider(booking.paymentProvider);
  if (!provider.simulateSuccess) return { error: "Betalning sker via betalleverantören." };
  const { ref } = await provider.simulateSuccess(id);
  const result = await confirmPayment(id, ref);
  if (!result.ok) return { error: result.error };
  redirect(`/bokning/${id}?bekraftad=1`);
}

/** Stripe: on to Stripe's hosted Checkout, which returns to /betala/[id]/klar. */
export async function startCheckoutAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("bookingId") ?? "");
  const user = await requireUser(`/betala/${id}`);
  let result;
  try {
    result = await startCheckout(id, user);
  } catch (err) {
    console.error("[checkout] could not start", id, err);
    return { error: "Betalningen kunde inte startas just nu. Ingen betalning har dragits. Försök igen om en stund." };
  }
  if (!result.ok) return { error: result.error };
  redirect(result.url);
}

export async function cancelBookingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("bookingId") ?? "");
  const user = await requireUser(`/bokning/${id}`);
  const result = await cancelBooking(id, user.id);
  if (!result.ok) return { error: result.error };
  revalidatePath(`/bokning/${id}`);
  return { success: "Bokningen är avbokad och pengarna återbetalas till ditt betalsätt inom några bankdagar." };
}

export async function markRegisteredAction(formData: FormData) {
  const id = String(formData.get("bookingId") ?? "");
  const user = await requireUser(`/bokning/${id}`);
  await markVehicleRegistered(id, user.id);
  const back = String(formData.get("back") ?? "");
  revalidatePath(back.startsWith("/") ? back : `/bokning/${id}`);
}
