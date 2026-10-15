import type { Metadata } from "next";
import { Suspense } from "react";
import { safeNext } from "@/lib/auth/session";
import { AuthCard } from "../auth-card";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Skapa konto" };

export default function RegisterPage({ searchParams }: PageProps<"/registrera">) {
  return (
    <AuthCard title="Skapa konto" intro="Ett konto för att både boka och hyra ut. Det tar under en minut.">
      <Suspense fallback={<div className="h-96" />}>
        <Form searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/registrera">["searchParams"] }) {
  const { next } = await searchParams;
  return <RegisterForm next={safeNext(next)} />;
}
