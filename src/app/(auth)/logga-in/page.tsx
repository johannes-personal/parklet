import type { Metadata } from "next";
import { Suspense } from "react";
import { safeNext } from "@/lib/auth/session";
import { AuthCard } from "../auth-card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Logga in" };

export default function LoginPage({ searchParams }: PageProps<"/logga-in">) {
  return (
    <AuthCard title="Logga in" intro="Välkommen tillbaka till Parklet.">
      <Suspense fallback={<div className="h-72" />}>
        <Form searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/logga-in">["searchParams"] }) {
  const { next } = await searchParams;
  return <LoginForm next={safeNext(next)} />;
}
