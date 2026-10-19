import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireUser, safeNext } from "@/lib/auth/session";
import { identityMode, startVerification, verifyIdentityMock } from "@/server/identity";

export const metadata: Metadata = { title: "Legitimera dig" };

async function verifyAction(formData: FormData) {
  "use server";
  const user = await requireUser("/konto/verifiera");
  const next = safeNext(formData.get("next"), "/uthyrare");
  const mode = identityMode();
  if (mode === "idura") redirect((await startVerification(user.id, next)).toString());
  if (mode === "mock") {
    await verifyIdentityMock(user.id);
    redirect(next);
  }
  redirect("/konto/verifiera?fel=ej-tillganglig");
}

const errors: Record<string, string> = {
  avbruten: "Legitimeringen avbröts. Försök igen när du är redo.",
  utgangen: "Legitimeringen tog för lång tid. Försök igen.",
  misslyckad: "Det gick inte att legitimera dig. Försök igen om en stund.",
  "ej-tillganglig": "BankID är inte tillgängligt just nu. Försök igen senare.",
};

export default function VerifyPage({ searchParams }: PageProps<"/konto/verifiera">) {
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-12">
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl font-bold">Legitimera dig med BankID</h1>
        <p className="mt-2 text-ink-soft">
          För att hyra ut en plats behöver vi veta vem du är. BankID bekräftar ditt namn och personnummer. Personnumret sparas krypterat och används bara för den rapportering av uthyrningsintäkter till Skatteverket som lagen kräver (DAC7).
        </p>
        <Suspense fallback={null}>
          <Form searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/konto/verifiera">["searchParams"] }) {
  const { next, fel } = await searchParams;
  const user = await requireUser("/konto/verifiera");
  if (user.identityVerified) {
    return <p className="mt-6 rounded-xl bg-ok-soft px-4 py-3 font-medium text-ok">Du är redan legitimerad.</p>;
  }
  const mode = identityMode();
  const error = typeof fel === "string" ? errors[fel] : undefined;
  return (
    <form action={verifyAction} className="mt-6 space-y-4">
      <input type="hidden" name="next" value={typeof next === "string" ? next : "/uthyrare"} />
      {error ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      {mode === "mock" ? (
        <div className="rounded-xl border border-dashed border-warn/50 bg-warn-soft p-4 text-sm text-warn">
          <strong>Testläge.</strong> BankID är inte kopplat i den här miljön, så du legitimeras direkt.
        </div>
      ) : null}
      <button className="btn-primary btn-lg w-full" disabled={mode === "unavailable"}>
        {mode === "mock" ? "Legitimera (testläge)" : "Legitimera med BankID"}
      </button>
      {mode === "idura" ? <p className="text-center text-sm text-muted">Du skickas till vår e-legitimationspartner Idura och sedan tillbaka hit.</p> : null}
    </form>
  );
}
