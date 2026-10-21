import type { ReviewDecision } from "@/server/spots";

const BUTTONS: Record<ReviewDecision, { label: string; className: string }> = {
  approve: { label: "Godkänn", className: "btn-primary" },
  reject: { label: "Avslå / begär komplettering", className: "btn-danger" },
  revoke: { label: "Ta bort godkännandet", className: "btn-danger" },
};

/**
 * The admin's decision on a spot or account. Only the decisions its current state
 * allows are offered (see spotDecisions/accountDecisions in src/server/spots.ts):
 * something under review can be approved or rejected; something approved can only
 * have its approval removed; something rejected can still be approved.
 */
export function ReviewForm({
  action,
  idName,
  id,
  decisions,
  status,
  returnTo,
  error,
}: {
  action: (fd: FormData) => Promise<void>;
  idName: string;
  id: string;
  decisions: ReviewDecision[];
  /** Where it stands now, in words. */
  status: string;
  /** Where to go after the decision: the review queue for submissions, else back here. */
  returnTo: string;
  error?: "motivering" | "status";
}) {
  const needsNote = decisions.some((d) => d !== "approve");
  return (
    <form action={action} className="card space-y-4 p-5">
      <div>
        <h2 className="font-semibold">Beslut</h2>
        <p className="mt-1 text-sm text-ink-soft">{status}</p>
      </div>
      {error === "status" ? <p className="field-error">Statusen hann ändras innan beslutet sparades. Kontrollera och försök igen.</p> : null}
      {decisions.length === 0 ? null : (
        <>
          <input type="hidden" name={idName} value={id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          {needsNote ? (
            <div>
              <label htmlFor="note" className="label">
                Motivering till uthyraren ({decisions.includes("approve") ? "krävs vid avslag" : "krävs"})
              </label>
              <textarea
                id="note"
                name="note"
                rows={3}
                className="input"
                placeholder={
                  decisions.includes("revoke")
                    ? "T.ex. Föreningen har meddelat att andrahandsuthyrning inte längre är tillåten."
                    : "T.ex. Hyresavtalet saknar platsnummer. Ladda upp ett avtal där platsen framgår."
                }
              />
              {error === "motivering" ? <p className="field-error">Skriv en motivering.</p> : null}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3">
            {decisions.map((d) => (
              <button key={d} name="decision" value={d} className={BUTTONS[d].className}>
                {BUTTONS[d].label}
              </button>
            ))}
          </div>
          {decisions.includes("revoke") ? <p className="text-sm text-muted">Befintliga bokningar påverkas inte, men nya kan inte göras.</p> : null}
        </>
      )}
    </form>
  );
}
