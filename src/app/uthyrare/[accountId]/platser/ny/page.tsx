import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SpotForm } from "@/components/host/spot-form";
import { EMPTY_SPOT } from "@/components/host/spot-form-defaults";
import { SpotSteps } from "@/components/host/spot-steps";
import { requireUser } from "@/lib/auth/session";
import { getAccountForMember } from "@/server/host-accounts";

export const metadata: Metadata = { title: "Lägg upp plats" };

type P = PageProps<"/uthyrare/[accountId]/platser/ny">;

export default function NewSpotPage(props: P) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <Suspense fallback={<div className="h-96 animate-pulse" />}>
        <Content {...props} />
      </Suspense>
    </div>
  );
}

async function Content({ params }: P) {
  const { accountId } = await params;
  const user = await requireUser(`/uthyrare/${accountId}/platser/ny`);
  const account = await getAccountForMember(accountId, user.id);
  if (!account) notFound();
  return (
    <>
      <Link href={`/uthyrare/${accountId}`} className="link text-sm">
        ← {account.name}
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Lägg upp {account.kind === "household" ? "din plats" : "platser"}</h1>
      <div className="mt-3">
        <SpotSteps current={1} done={0} />
      </div>
      <p className="mt-4 mb-6 text-ink-soft">Börja med uppgifterna om platsen. I nästa steg laddar du upp underlag som visar att du får hyra ut den.</p>
      <SpotForm
        accountId={accountId}
        allowMultiple={account.kind !== "household"}
        defaults={{ ...EMPTY_SPOT, rightBasis: account.kind === "household" ? "" : "owns" }}
      />
    </>
  );
}
