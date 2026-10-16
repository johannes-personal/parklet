import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "../../auth-card";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Välj nytt lösenord", robots: { index: false } };

export default function ResetPage({ params }: PageProps<"/aterstall-losenord/[token]">) {
  return (
    <AuthCard title="Välj ett nytt lösenord">
      <Suspense fallback={<div className="h-40" />}>
        <Form params={params} />
      </Suspense>
    </AuthCard>
  );
}

async function Form({ params }: { params: PageProps<"/aterstall-losenord/[token]">["params"] }) {
  const { token } = await params;
  return <ResetForm token={token} />;
}
