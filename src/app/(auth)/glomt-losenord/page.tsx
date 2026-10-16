import type { Metadata } from "next";
import { AuthCard } from "../auth-card";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Glömt lösenord" };

export default function ForgotPage() {
  return (
    <AuthCard title="Glömt lösenordet?" intro="Ange din e-postadress så skickar vi en länk där du kan välja ett nytt lösenord.">
      <ForgotForm />
    </AuthCard>
  );
}
