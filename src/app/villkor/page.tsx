import type { Metadata } from "next";
import { ContentPage } from "@/components/content-page";

export const metadata: Metadata = { title: "Användarvillkor" };

export default function TermsPage() {
  return (
    <ContentPage title="Användarvillkor" draft>
      <h2>1. Tjänsten</h2>
      <p>Parklet är en marknadsplats där uthyrare (privatpersoner, föreningar och företag) hyr ut parkeringsplatser till förare. Avtalet om hyra av platsen ingås mellan uthyraren och föraren. Parklet förmedlar bokningen och betalningen.</p>
      <h2>2. Uthyrarens åtaganden</h2>
      <ul>
        <li>Uthyraren intygar att hen äger platsen eller har rätt att hyra ut den, och visar detta med underlag. För en hyrd plats i en bostadsrättsförening krävs föreningens godkännande.</li>
        <li>Uthyraren ansvarar för att platsen är tillgänglig under bokad tid och att instruktionerna stämmer.</li>
        <li>Om föreningen eller hyresvärden kräver att förarens bil registreras ansvarar uthyraren för registreringen före bokningens start.</li>
        <li>Uthyraren ansvarar för att deklarera sina intäkter. Parklet rapporterar uppgifter till Skatteverket enligt lag (DAC7).</li>
      </ul>
      <h2>3. Förarens åtaganden</h2>
      <ul>
        <li>Föraren parkerar endast den bil vars registreringsnummer angetts i bokningen, och endast under bokad tid.</li>
        <li>Föraren följer de regler som gäller på platsen.</li>
      </ul>
      <h2>4. Pris och betalning</h2>
      <p>Föraren betalar uthyrarens pris plus Parklets serviceavgift i samband med bokningen. Betalningen hanteras av vår betalpartner. Uthyraren får betalt efter genomförd bokning, med avdrag för eventuella återbetalningar.</p>
      <h2>5. Avbokning</h2>
      <p>Föraren kan avboka kostnadsfritt fram till den avbokningsfrist som anges på platsen. Avbokar uthyraren återbetalas hela beloppet till föraren.</p>
      <h2>6. Ångerrätt</h2>
      <p>[Juridisk bedömning krävs: om ångerrätt enligt distansavtalslagen gäller för bokningar hos uthyrare som är näringsidkare, eller om undantaget för tjänster vid en bestämd tidpunkt är tillämpligt. Mellan privatpersoner gäller inte konsumentlagstiftningen.] Avbokningsreglerna ovan gäller alltid.</p>
      <h2>7. Tvister</h2>
      <p>Kontakta i första hand supporten. Konsumenter kan även vända sig till Allmänna reklamationsnämnden (ARN) eller EU:s plattform för tvistlösning online.</p>
    </ContentPage>
  );
}
