"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/components/form";
import { requireAdmin } from "@/lib/auth/session";
import { emailSchema } from "@/lib/validation";
import { setDigestSettings } from "@/server/app-settings";
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
  const result = await reviewAccount(id, decision, note);
  if (!result) redirect(`/admin/konton/${id}?fel=status`);
  await notifyAccount(id, { kind: "account_reviewed", ...accountDecisionMessage(decision, result, note), href: `/uthyrare/${id}` });
  redirect(back(formData, `/admin/konton/${id}`));
}

/**
 * What the host is told about a decision on their account. A household is approved
 * through its owner's BankID, so after a rejection that is what they do again; an
 * organisation sends in its documents again.
 */
function accountDecisionMessage(
  decision: ReviewDecision,
  { kind, spotsReset }: { kind: "household" | "association" | "company"; spotsReset: number },
  note: string | null,
): { title: string; body: string } {
  const household = kind === "household";
  if (decision === "approve") {
    return household
      ? { title: "Ditt uthyrarkonto är godkänt på Parklet", body: "Kontot är godkänt. Dina parkeringsplatser kan bokas när de är godkända och utbetalningar är kopplade." }
      : { title: "Er organisation är verifierad på Parklet", body: "Organisationen är verifierad." };
  }
  const redo = household
    ? "Legitimera dig med BankID igen från ditt uthyrarkonto, så granskar vi kontot på nytt."
    : "Ladda upp underlagen och skicka in organisationen för granskning igen.";
  const spots = spotsReset
    ? `\n\n${spotsReset === 1 ? "Platsen" : `De ${spotsReset} parkeringsplatserna`} behöver också skickas in för granskning igen när kontot är godkänt.`
    : "";
  if (decision === "reject") {
    return {
      title: household ? "Ditt uthyrarkonto behöver granskas igen" : "Er organisation behöver kompletteras",
      body: `${household ? "Vi kunde inte godkänna kontot än" : "Vi kunde inte verifiera organisationen än"}:\n\n${note}\n\n${redo}${spots}`,
    };
  }
  return {
    title: household ? "Godkännandet av ditt uthyrarkonto har tagits bort" : "Verifieringen av er organisation har tagits bort",
    body: `${household ? "Dina parkeringsplatser" : "Organisationens parkeringsplatser"} kan inte bokas förrän kontot är godkänt igen. Bokningar som redan är gjorda gäller.\n\n${note}\n\n${redo}${spots}`,
  };
}

/** The morning summary on or off, and its address (empty: every admin). */
export async function saveDigestSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const enabled = formData.get("enabled") === "on";
  const raw = String(formData.get("to") ?? "").trim();
  const values = { to: raw, ...(enabled ? { enabled: "on" } : {}) };
  const to = raw ? emailSchema.safeParse(raw) : null;
  if (to && !to.success) return { fieldErrors: { to: "Ange en giltig e-postadress, eller lämna fältet tomt." }, values };
  await setDigestSettings({ enabled, to: to?.data ?? null }, admin.id);
  return {
    success: enabled ? `Sammanfattningen skickas varje morgon till ${to?.data ?? "alla administratörer"}.` : "Sammanfattningen är avstängd.",
  };
}
