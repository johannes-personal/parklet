import type { Metadata } from "next";
import { Suspense } from "react";
import { getSpotByApprovalToken } from "@/server/spots";
import { ApprovalForm } from "./approval-form";

export const metadata: Metadata = { title: "Godkännande av uthyrning", robots: { index: false } };

type P = PageProps<"/godkannande/[token]">;

export default function ApprovalPage(props: P) {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-12">
      <Suspense fallback={<div className="card h-96 animate-pulse" />}>
        <Content {...props} />
      </Suspense>
    </div>
  );
}

async function Content({ params }: P) {
  const { token } = await params;
  const found = await getSpotByApprovalToken(token);
  if (!found || found.spot.landlordApproval !== "requested") {
    return (
      <div className="card p-6">
        <h1 className="text-xl font-bold">Länken gäller inte längre</h1>
        <p className="mt-2 text-ink-soft">Förfrågan är redan besvarad eller har ersatts av en ny. Kontakta den som skickade den om något är fel.</p>
      </div>
    );
  }
  const { spot, accountName } = found;
  const who = spot.landlordKind === "brf" ? "föreningen" : "er som hyresvärd";
  return (
    <div className="card p-6 sm:p-8">
      <p className="text-sm font-semibold tracking-wide text-brand uppercase">Förfrågan om godkännande</p>
      <h1 className="mt-2 text-2xl font-bold">Får parkeringsplatsen hyras ut via Parklet?</h1>
      <dl className="mt-6 space-y-3 rounded-xl bg-canvas p-4 text-sm">
        <div>
          <dt className="font-medium text-muted">Plats</dt>
          <dd>
            {spot.address}, {spot.city}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-muted">Uthyrare</dt>
          <dd>{accountName} (legitimerad med BankID)</dd>
        </div>
        <div>
          <dt className="font-medium text-muted">Vad innebär det?</dt>
          <dd>
            Platsen hyrs ut korttid till andra förare när den inte används. Föraren bokar och betalar via Parklet. Ni kan när som helst dra
            tillbaka godkännandet genom att kontakta Parklet, och platsen tas då bort från sökningen.
          </dd>
        </div>
      </dl>
      <p className="mt-4 text-sm text-ink-soft">Vi behöver godkännande från {who} innan platsen kan bokas.</p>
      <ApprovalForm token={token} isBrf={spot.landlordKind === "brf"} />
    </div>
  );
}
