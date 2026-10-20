"use server";

import { revalidatePath } from "next/cache";
import { api, must, names, toDb } from "@/db/api";
import { vehicles } from "@/db/schema";
import type { FormState } from "@/components/form";
import { requireUser } from "@/lib/auth/session";
import { normalizeVehicleReg } from "@/lib/validation";

const V = names(vehicles);

export async function addVehicleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/fordon");
  const reg = normalizeVehicleReg(String(formData.get("reg") ?? ""));
  const nickname = String(formData.get("nickname") ?? "").trim().slice(0, 40);
  if (!reg) return { fieldErrors: { reg: "Ange ett giltigt registreringsnummer, t.ex. ABC123." } };
  must(
    await api()
      .from("vehicles")
      .upsert(toDb(vehicles, { userId: user.id, reg, nickname }), { onConflict: `${V.userId},${V.reg}` }),
    "addVehicleAction",
  );
  revalidatePath("/fordon");
  return { success: `${reg} är sparad.` };
}

export async function removeVehicleAction(formData: FormData) {
  const user = await requireUser("/fordon");
  must(await api().from("vehicles").delete().eq(V.id, String(formData.get("id"))).eq(V.userId, user.id), "removeVehicleAction");
  revalidatePath("/fordon");
}
