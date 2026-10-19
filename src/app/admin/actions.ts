"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { getSpot, reviewAccount, reviewSpot } from "@/server/spots";
import { notifyAccount } from "@/server/notifications";

export async function reviewSpotAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("spotId"));
  const approve = formData.get("decision") === "approve";
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!approve && !note) redirect(`/admin/platser/${id}?fel=motivering`);
  await reviewSpot(id, admin.id, approve, note);
  const spot = await getSpot(id);
  if (spot) {
    await notifyAccount(spot.hostAccountId, {
      kind: "spot_reviewed",
      title: approve ? `Din plats ${spot.title} är godkänd` : `Din plats ${spot.title} behöver kompletteras`,
      body: approve
        ? `Platsen är nu godkänd och kan bokas så snart ditt konto är verifierat och utbetalningar är kopplade.`
        : `Vi kunde inte godkänna platsen än:\n\n${note}\n\nKomplettera underlagen och skicka in igen.`,
      href: `/uthyrare/${spot.hostAccountId}/platser/${spot.id}`,
    });
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
  await notifyAccount(id, {
    kind: "account_reviewed",
    title: approve ? "Er organisation är verifierad på Parklet" : "Er organisation behöver kompletteras",
    body: approve ? "Organisationen är verifierad." : `Vi kunde inte verifiera organisationen än:\n\n${note}`,
    href: `/uthyrare/${id}`,
  });
  redirect("/admin");
}
