"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/components/form";
import { getCurrentUser } from "@/lib/auth/session";
import { parseLocalDateTime } from "@/lib/time";
import { normalizeVehicleReg } from "@/lib/validation";
import { createBooking } from "@/server/bookings";
import { getPaymentProvider } from "@/server/payments";

export async function bookAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const spotId = String(formData.get("spotId") ?? "");
  const fromRaw = String(formData.get("from") ?? "");
  const toRaw = String(formData.get("to") ?? "");
  const regRaw = String(formData.get("newReg") || formData.get("vehicleReg") || "");
  const values = { from: fromRaw, to: toRaw, newReg: String(formData.get("newReg") ?? "") };

  const user = await getCurrentUser();
  if (!user) {
    const back = `/plats/${spotId}?from=${encodeURIComponent(fromRaw)}&to=${encodeURIComponent(toRaw)}`;
    redirect(`/logga-in?next=${encodeURIComponent(back)}`);
  }

  const start = parseLocalDateTime(fromRaw);
  const end = parseLocalDateTime(toRaw);
  if (!start || !end) return { error: "Välj när du vill parkera.", values };
  const reg = normalizeVehicleReg(regRaw);
  if (!reg) return { fieldErrors: { newReg: "Ange ett giltigt registreringsnummer, t.ex. ABC123." }, values };

  const result = await createBooking({ driverId: user.id, spotId, start, end, vehicleReg: reg });
  if (!result.ok) return { error: result.error, values };
  redirect(getPaymentProvider().checkoutUrl(result.bookingId));
}
