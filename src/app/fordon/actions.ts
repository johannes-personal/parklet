"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { vehicles } from "@/db/schema";
import type { FormState } from "@/components/form";
import { requireUser } from "@/lib/auth/session";
import { normalizeVehicleReg } from "@/lib/validation";

export async function addVehicleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/fordon");
  const reg = normalizeVehicleReg(String(formData.get("reg") ?? ""));
  const nickname = String(formData.get("nickname") ?? "").trim().slice(0, 40);
  if (!reg) return { fieldErrors: { reg: "Ange ett giltigt registreringsnummer, t.ex. ABC123." } };
  await db.insert(vehicles).values({ userId: user.id, reg, nickname }).onConflictDoUpdate({ target: [vehicles.userId, vehicles.reg], set: { nickname } });
  revalidatePath("/fordon");
  return { success: `${reg} är sparad.` };
}

export async function removeVehicleAction(formData: FormData) {
  const user = await requireUser("/fordon");
  await db.delete(vehicles).where(and(eq(vehicles.id, String(formData.get("id"))), eq(vehicles.userId, user.id)));
  revalidatePath("/fordon");
}
