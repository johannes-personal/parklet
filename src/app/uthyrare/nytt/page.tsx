import type { Metadata } from "next";
import { Suspense } from "react";
import { CreateAccountForm } from "@/components/host/forms";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Bli uthyrare" };

export default function NewHostAccountPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold">Bli uthyrare</h1>
      <p className="mt-2 text-ink-soft">
        Det tar några minuter: skapa ett uthyrarkonto, legitimera dig, koppla ett konto för utbetalningar och lägg upp din plats med underlag.
      </p>
      <div className="card mt-6 p-5 sm:p-6">
        <Suspense fallback={<div className="h-96" />}>
          <Form />
        </Suspense>
      </div>
    </div>
  );
}

async function Form() {
  const user = await requireUser("/uthyrare/nytt");
  return <CreateAccountForm identityVerified={user.identityVerified} />;
}
