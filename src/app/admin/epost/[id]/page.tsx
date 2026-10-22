import type { Metadata } from "next";
import { Suspense } from "react";
import { MailView } from "@/components/mail-view";
import { Unavailable } from "@/components/unavailable";
import { requireAdmin } from "@/lib/auth/session";
import { getMail } from "@/server/mail-log";

export const metadata: Metadata = { title: "Mejl – administration", robots: { index: false } };

type P = PageProps<"/admin/epost/[id]">;

export default function MailPage(props: P) {
  return (
    <div className="mx-auto w-full max-w-3xl py-8">
      <Suspense fallback={<div className="card h-96 animate-pulse" />}>
        <Content {...props} />
      </Suspense>
    </div>
  );
}

async function Content({ params }: P) {
  await requireAdmin();
  const { id } = await params;
  const mail = await getMail(id);
  if (!mail) {
    return (
      <Unavailable title="Mejlet finns inte" actions={[{ href: "/admin/epost", label: "All e-post" }]}>
        <p>Mejlet har tagits bort, eller så är länken fel.</p>
      </Unavailable>
    );
  }
  return (
    <MailView mail={mail} back={{ href: "/admin/epost", label: "All e-post" }} accountHref={mail.hostAccountId ? `/admin/konton/${mail.hostAccountId}` : undefined} />
  );
}
