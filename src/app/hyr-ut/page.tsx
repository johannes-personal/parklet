import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Hyr ut din parkeringsplats",
  description: "Tjäna pengar på din parkeringsplats när du inte använder den. Du bestämmer tider och pris – vi sköter bokning och betalning.",
};

const steps = [
  { title: "Skapa ett uthyrarkonto", body: "Som privatperson, bostadsrättsförening eller företag. Legitimera dig med BankID." },
  {
    title: "Lägg upp platsen och visa att du får hyra ut den",
    body: "Ladda upp t.ex. lagfart eller hyresavtal. Hyr du platsen av din BRF skickar du en godkännandeförfrågan till styrelsen direkt från Parklet.",
  },
  { title: "Vi granskar", body: "Parklet kontrollerar underlagen, oftast inom en arbetsdag. Först då syns platsen för förare." },
  { title: "Få betalt", body: "Förare bokar och betalar i förväg. Pengarna betalas ut till ditt bankkonto via vår licensierade betalpartner." },
];

const faq = [
  {
    q: "Varför behöver ni underlag?",
    a: "För att förare ska kunna lita på att platsen faktiskt får användas, och för att skydda föreningar och hyresvärdar från otillåten andrahandsuthyrning. Utan rätt att hyra ut riskerar du både ditt eget hyresavtal och att föraren får parkeringsbot.",
  },
  {
    q: "Jag hyr min plats av bostadsrättsföreningen. Får jag hyra ut den?",
    a: "Bara om föreningen godkänner det. Ange styrelsens e-post så skickar vi en förfrågan med en länk där de kan godkänna eller neka. Har du redan ett skriftligt godkännande kan du ladda upp det i stället.",
  },
  {
    q: "Föreningen kräver att bilar registreras. Hur funkar det?",
    a: "Markera det på platsen. Då måste bokningar göras i förväg, du får förarens registreringsnummer och en påminnelse om att registrera bilen, och föraren ser när det är gjort.",
  },
  {
    q: "Vad kostar det?",
    a: "Inget för dig som uthyrare. Föraren betalar en serviceavgift på 10 % ovanpå ditt pris. Tänk på att hyresintäkter kan vara skattepliktiga – Parklet rapporterar intäkter till Skatteverket enligt EU:s plattformsregler (DAC7).",
  },
];

export default function HostLandingPage() {
  return (
    <>
      <section>
        <div className="mx-auto w-full max-w-4xl px-4 py-14 text-center sm:py-20">
          <h1 className="text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">Tjäna pengar på platsen som ändå står tom</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-ink-soft">
            Du bestämmer när platsen är ledig och vad den kostar. Vi sköter bokningar, betalning, kvitton och support.
          </p>
          <Link href="/uthyrare" className="btn-primary btn-lg mt-8">
            Kom igång
          </Link>
        </div>
      </section>

      <section className="mx-auto w-full max-w-4xl px-4 py-14">
        <h2 className="text-2xl font-bold">Så går det till</h2>
        <ol className="mt-6 space-y-4">
          {steps.map((s, i) => (
            <li key={s.title} className="card flex gap-4 p-5">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand">{i + 1}</span>
              <div>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="mt-1 text-ink-soft">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section id="foreningar" className="scroll-mt-20 py-14">
        <div className="mx-auto w-full max-w-4xl px-4">
          <h2 className="text-2xl font-bold">För bostadsrättsföreningar och fastighetsägare</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {[
              ["Flera platser på en gång", "Lägg upp \"Plats 1–20\" med samma villkor och samma underlag."],
              ["Flera administratörer", "Bjud in fler i styrelsen eller förvaltningen."],
              ["Registrering av bilar", "Kräv att tillfälliga hyresgästers bilar registreras, med tydlig att-göra-lista."],
              ["Bara via länk", "Låt platserna vara dolda i sökningen och dela länken med boende eller grannar."],
            ].map(([t, b]) => (
              <li key={t} className="card p-5">
                <h3 className="font-semibold">{t}</h3>
                <p className="mt-1 text-ink-soft">{b}</p>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-muted">
            Tänk på: uthyrning till icke-medlemmar kan påverka om en BRF räknas som privatbostadsföretag skattemässigt. Rådgör med er revisor
            om ni hyr ut många platser externt.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-4xl px-4 py-14">
        <h2 className="text-2xl font-bold">Vanliga frågor</h2>
        <div className="mt-6 space-y-3">
          {faq.map((f) => (
            <details key={f.q} className="card p-5">
              <summary className="cursor-pointer font-semibold">{f.q}</summary>
              <p className="mt-2 text-ink-soft">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
