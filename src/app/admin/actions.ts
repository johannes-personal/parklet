"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { getSpot, reviewAccount, reviewSpot } from "@/server/spots";
import { listMembers } from "@/server/host-accounts";
import { sendMail } from "@/server/mailer";

async function notify(accountId: string, subject: string, text: string) {
  for (const m of await listMembers(accountId)) await sendMail({ to: m.email, subject, text });
}

export async function reviewSpotAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("spotId"));
  const approve = formData.get("decision") === "approve";
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!approve && !note) redirect(`/admin/platser/${id}?fel=motivering`);
  await reviewSpot(id, admin.id, approve, note);
  const spot = await getSpot(id);
  if (spot) {
    await notify(
      spot.hostAccountId,
      approve ? `Din plats ${spot.title} är godkänd` : `Din plats ${spot.title} behöver kompletteras`,
      approve
        ? `Platsen är nu godkänd och kan bokas så snart ditt konto är verifierat och utbetalningar är kopplade.`
        : `Vi kunde inte godkänna platsen än:\n\n${note}\n\nKomplettera underlagen och skicka in igen.`,
    );
  }
  redirect("/admin");
}

export async function reviewAccountAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("accountId"));
  const approve = formData.get("decision") === "approve";
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!approve && !note) redirect(`/admin/konton/${id}?fel=motivering`);
  await reviewAccount(id, approve, note);
  await notify(
    id,
    approve ? "Er organisation är verifierad på Parklet" : "Er organisation behöver kompletteras",
    approve ? "Organisationen är verifierad." : `Vi kunde inte verifiera organisationen än:\n\n${note}`,
  );
  redirect("/admin");
}
