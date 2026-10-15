import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireUser, safeNext } from "@/lib/auth/session";
import { verifyIdentityMock } from "@/server/identity";

export const metadata: Metadata = { title: "Legitimera dig" };

async function verifyAction(formData: FormData) {
  "use server";
  const user = await requireUser("/konto/verifiera");
  await verifyIdentityMock(user.id);
  redirect(safeNext(formData.get("next"), "/uthyrare"));
}

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
  const { next } = await searchParams;
  const user = await requireUser("/konto/verifiera");
  if (user.identityVerified) {
    return <p className="mt-6 rounded-xl bg-ok-soft px-4 py-3 font-medium text-ok">Du är redan legitimerad.</p>;
  }
  return (
    <form action={verifyAction} className="mt-6 space-y-4">
      <input type="hidden" name="next" value={typeof next === "string" ? next : "/uthyrare"} />
      <div className="rounded-xl border border-dashed border-warn/50 bg-warn-soft p-4 text-sm text-warn">
        <strong>Testläge.</strong> I produktion öppnas BankID-appen (via en e-legitimationstjänst som Criipto eller Signicat).
      </div>
      <button className="btn-primary btn-lg w-full">Legitimera (testläge)</button>
    </form>
  );
}
