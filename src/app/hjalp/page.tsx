import type { Metadata } from "next";
import { ContentPage } from "@/components/content-page";

export const metadata: Metadata = { title: "Hjälp och kontakt" };

const sections = [
  {
    id: "forare",
    title: "För förare",
    items: [
      ["Behöver jag ett konto?", "Ja, för att kunna betala och få tillgång till instruktionerna. Det tar under en minut att skapa."],
      ["Hur hittar jag platsen?", "Efter betalningen ser du adress, vägbeskrivning och uthyrarens instruktioner (t.ex. portkod och platsnummer) i bokningen."],
      ["Kan jag avboka?", "Ja, kostnadsfritt fram till den avbokningsfrist som står på platsen. Pengarna återbetalas till ditt betalsätt."],
      ["Varför måste jag ange registreringsnummer?", "Bilen kopplas till bokningen. Vissa föreningar kräver dessutom att bilen registreras i deras system för att du inte ska få parkeringsbot."],
      ["Vad händer om platsen är upptagen när jag kommer?", "Kontakta supporten direkt. Du får pengarna tillbaka och vi hjälper dig hitta en annan plats."],
    ],
  },
  {
    id: "uthyrare",
    title: "För uthyrare",
    items: [
      ["Vem får hyra ut?", "Den som äger platsen, eller hyr den och har hyresvärdens eller bostadsrättsföreningens godkännande. Vi granskar underlag innan platsen publiceras."],
      ["Hur verifieras jag?", "Privatpersoner legitimerar sig med BankID. Föreningar och företag laddar upp registreringsbevis och protokoll eller firmatecknarbevis."],
      ["Hur får jag betalt?", "Via vår licensierade betalpartner till ditt bankkonto, efter att bokningen genomförts. Du kopplar kontot en gång."],
      ["Skatt", "Hyresintäkter kan vara skattepliktiga. Parklet lämnar uppgifter om uthyrares intäkter till Skatteverket enligt DAC7."],
    ],
  },
  {
    id: "konto",
    title: "Konto och säkerhet",
    items: [
      ["Jag har glömt mitt lösenord", "Klicka på \"Glömt lösenordet?\" på inloggningssidan så skickar vi en länk."],
      ["Hur hanteras mina personuppgifter?", "Se vår integritetspolicy. Dina uppgifter lagras inom EU, och personnummer sparas bara för uthyrare, eftersom lagen kräver att vi rapporterar deras intäkter."],
    ],
  },
];

export default function HelpPage() {
  return (
    <ContentPage title="Hjälp och kontakt" intro="Svar på de vanligaste frågorna. Hittar du inte svaret? Kontakta oss längst ner.">
      {sections.map((s) => (
        <section key={s.id} id={s.id} className="scroll-mt-20">
          <h2>{s.title}</h2>
          <div className="space-y-2">
            {s.items.map(([q, a]) => (
              <details key={q} className="card p-4">
                <summary className="cursor-pointer font-medium">{q}</summary>
                <p className="mt-2">{a}</p>
              </details>
            ))}
          </div>
        </section>
      ))}
      <section id="kontakt" className="scroll-mt-20">
        <h2>Kontakta oss</h2>
        <p>
          Mejla <a className="link" href="mailto:support@parklet.se">support@parklet.se</a>. Gäller det en pågående bokning, ange boknings-id så hjälper vi dig snabbare. Vi svarar vardagar inom fyra timmar.
        </p>
      </section>
    </ContentPage>
  );
}
