"use server";

import type { FormState } from "@/components/form";
import { respondToLandlordApproval } from "@/server/spots";

export async function respondApprovalAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const approve = formData.get("decision") === "approve";
  const name = String(formData.get("name") ?? "").trim().slice(0, 100);
  const role = String(formData.get("role") ?? "").trim().slice(0, 100);
  const errors: Record<string, string> = {};
  if (name.length < 2) errors.name = "Ange ditt namn.";
  if (role.length < 2) errors.role = "Ange din roll.";
  if (formData.get("authority") !== "on") errors.authority = "Du behöver intyga att du får fatta beslutet.";
  if (Object.keys(errors).length) return { fieldErrors: errors };

  const result = await respondToLandlordApproval(String(formData.get("token")), {
    approve,
    name,
    role,
    requiresVehicleRegistration: formData.get("requiresVehicleRegistration") === "on",
    vehicleRegistrationNote: String(formData.get("vehicleRegistrationNote") ?? "").trim().slice(0, 500),
  });
  if (!result.ok) return { error: result.error };
  return {
    success: approve
      ? "Tack! Uthyrningen är godkänd. Parklet granskar nu platsen innan den publiceras."
      : "Tack för ditt svar. Platsen kommer inte att hyras ut via Parklet.",
  };
}
