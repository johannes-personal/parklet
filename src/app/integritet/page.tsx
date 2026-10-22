import type { Metadata } from "next";
import { ContentPage } from "@/components/content-page";

export const metadata: Metadata = { title: "Integritetspolicy" };

export default function PrivacyPage() {
  return (
    <ContentPage title="Integritetspolicy" draft intro="Så här behandlar vi dina personuppgifter enligt dataskyddsförordningen (GDPR).">
      <h2>Personuppgiftsansvarig</h2>
      <p>Parklet AB (org.nr anges vid lansering) är personuppgiftsansvarig. Kontakt: privacy@parklet.se.</p>
      <h2>Vilka uppgifter och varför</h2>
      <ul>
        <li><strong>Konto</strong> (namn, e-post, lösenord i krypterad form) – för att tillhandahålla tjänsten (avtal).</li>
        <li><strong>Bokningar och registreringsnummer</strong> – för att genomföra bokningen och, där föreningen kräver det, registrera bilen (avtal).</li>
        <li><strong>Legitimering av uthyrare</strong> – namn och personnummer bekräftas med BankID via vår e-legitimationsleverantör. Personnumret sparas krypterat och används endast för rapportering till Skatteverket (rättslig förpliktelse enligt DAC7) och för att förhindra bedrägerier.</li>
        <li><strong>Underlag för uthyrningsrätt</strong> (t.ex. hyresavtal, protokoll) – för att kontrollera att platsen får hyras ut (berättigat intresse). Raderas 12 månader efter att platsen tagits bort.</li>
        <li><strong>Betalningar</strong> – hanteras av vår betalpartner. Bokföringsunderlag sparas i 7 år enligt bokföringslagen.</li>
        <li><strong>Uthyrares intäkter</strong> – rapporteras till Skatteverket enligt lagen om plattformsoperatörers rapportering (DAC7).</li>
      </ul>
      <h2>Mottagare</h2>
      <p>Vi delar bara det som behövs: föraren ser uthyrarens förnamn eller organisationsnamn; uthyraren ser förarens namn och registreringsnummer för sina bokningar. Våra leverantörer (drift inom EU, betalning, e-legitimation, e-post) behandlar uppgifter enligt personuppgiftsbiträdesavtal.</p>
      <h2>Dina rättigheter</h2>
      <p>Du har rätt att få tillgång till, rätta, radera och flytta dina uppgifter, samt att invända mot behandling. Du kan klaga hos Integritetsskyddsmyndigheten (IMY).</p>
    </ContentPage>
  );
}
