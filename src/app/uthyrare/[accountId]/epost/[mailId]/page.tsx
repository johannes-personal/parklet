import type { Metadata } from "next";
import { Suspense } from "react";
import { loadHostAccount } from "@/components/host/host-page";
import { MailView } from "@/components/mail-view";
import { Unavailable } from "@/components/unavailable";
import { getHostMail } from "@/server/mail-log";

export const metadata: Metadata = { title: "Mejl – uthyrarkonto", robots: { index: false } };

type P = PageProps<"/uthyrare/[accountId]/epost/[mailId]">;

export default function HostMailPage(props: P) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Suspense fallback={<div className="card h-96 animate-pulse" />}>
        <Content {...props} />
      </Suspense>
    </div>
  );
}

async function Content({ params }: P) {
  const { accountId, mailId } = await params;
  const loaded = await loadHostAccount(accountId, `/uthyrare/${accountId}/epost/${mailId}`);
  if ("denied" in loaded) return loaded.denied;
  const mail = await getHostMail(accountId, mailId);
  const back = { href: `/uthyrare/${accountId}/epost`, label: "All e-post" };
  if (!mail) {
    return (
      <Unavailable title="Mejlet finns inte" actions={[back]}>
        <p>Mejlet hör inte till kontot, eller så är länken fel.</p>
      </Unavailable>
    );
  }
  return <MailView mail={mail} back={back} />;
}
