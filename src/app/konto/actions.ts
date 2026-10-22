"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/components/form";
import { endSession, requireUser } from "@/lib/auth/session";
import { deleteOwnAccount } from "@/server/account-deletion";

export async function deleteAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/mina-sidor");
  if (formData.get("confirm") !== "on") return { fieldErrors: { confirm: "Bekräfta att du vill ta bort kontot." } };
  const password = String(formData.get("password") ?? "");
  if (!password) return { fieldErrors: { password: "Skriv ditt lösenord." } };
  const result = await deleteOwnAccount(user.id, password);
  if (!result.ok) return result.error === "Fel lösenord." ? { fieldErrors: { password: result.error } } : { error: result.error };
  await endSession();
  redirect("/konto/borttaget");
}
