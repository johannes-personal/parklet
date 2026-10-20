"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { getSpot, reviewAccount, reviewSpot, type ReviewDecision } from "@/server/spots";
import { notifyAccount } from "@/server/notifications";

/** Back to the review queue or to the page the decision was made on (admin pages only). */
function back(formData: FormData, fallback: string) {
  const to = String(formData.get("returnTo") ?? "");
  return to.startsWith("/admin") ? to : fallback;
}

function decisionFrom(formData: FormData): ReviewDecision | null {
  const d = formData.get("decision");
  return d === "approve" || d === "reject" || d === "revoke" ? d : null;
}

export async function reviewSpotAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("spotId"));
  const decision = decisionFrom(formData);
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!decision) redirect(`/admin/platser/${id}`);
  if (decision !== "approve" && !note) redirect(`/admin/platser/${id}?fel=motivering`);
  if (!(await reviewSpot(id, admin.id, decision, note))) redirect(`/admin/platser/${id}?fel=status`);
  const spot = await getSpot(id);
  if (spot) {
    const href = `/uthyrare/${spot.hostAccountId}/platser/${spot.id}`;
    await notifyAccount(
      spot.hostAccountId,
      decision === "approve"
        ? {
            kind: "spot_reviewed",
            title: `Din plats ${spot.title} är godkänd`,
            body: "Platsen är nu godkänd och kan bokas så snart ditt konto är verifierat och utbetalningar är kopplade.",
            href,
          }
        : decision === "reject"
          ? {
              kind: "spot_reviewed",
              title: `Din plats ${spot.title} behöver kompletteras`,
              body: `Vi kunde inte godkänna platsen än:\n\n${note}\n\nKomplettera underlagen och skicka in igen.`,
              href,
            }
          : {
              kind: "spot_reviewed",
              title: `Godkännandet av ${spot.title} har tagits bort`,
              body: `Platsen kan inte bokas längre. Bokningar som redan är gjorda gäller.\n\n${note}\n\nKomplettera underlagen och skicka in platsen igen.`,
              href,
            },
    );
  }
  redirect(back(formData, `/admin/platser/${id}`));
}

export async function reviewAccountAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("accountId"));
  const decision = decisionFrom(formData);
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!decision) redirect(`/admin/konton/${id}`);
  if (decision !== "approve" && !note) redirect(`/admin/konton/${id}?fel=motivering`);
  if (!(await reviewAccount(id, decision, note))) redirect(`/admin/konton/${id}?fel=status`);
  await notifyAccount(id, {
    kind: "account_reviewed",
    title:
      decision === "approve"
        ? "Er organisation är verifierad på Parklet"
        : decision === "reject"
          ? "Er organisation behöver kompletteras"
          : "Verifieringen av er organisation har tagits bort",
    body:
      decision === "approve"
        ? "Organisationen är verifierad."
        : decision === "reject"
          ? `Vi kunde inte verifiera organisationen än:\n\n${note}`
          : `Organisationens platser kan inte bokas förrän den är verifierad igen.\n\n${note}`,
    href: `/uthyrare/${id}`,
  });
  redirect(back(formData, `/admin/konton/${id}`));
}
