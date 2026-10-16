import Link from "next/link";
import { SearchForm } from "@/components/search-form";
import { CITIES } from "@/lib/geo";

const driverSteps = [
  { title: "Sök", body: "Ange adress och tid. Du ser bara platser som är lediga hela den tiden, med totalpriset direkt." },
  { title: "Boka och betala", body: "Betala säkert med kort, Apple Pay, Google Pay eller Swish. Inga dolda avgifter." },
  { title: "Parkera", body: "Adress, vägbeskrivning och eventuell portkod visas i bokningen. Avboka kostnadsfritt inom avbokningsfristen." },
];

const trust = [
  {
    title: "Verifierade uthyrare",
    body: "Alla uthyrare legitimerar sig och visar att de har rätt att hyra ut platsen – för en hyrd plats i en BRF krävs föreningens godkännande.",
  },
  { title: "Säker betalning", body: "Pengarna hanteras av en licensierad betalpartner. Uthyraren får betalt först när bokningen är genomförd." },
  { title: "Inga dubbelbokningar", body: "En plats kan aldrig bokas av två personer samtidigt. Det garanteras av systemet, inte av tur." },
];

export default function HomePage() {
  return (
    <>
      <section>
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 md:grid-cols-[1.1fr_1fr] md:py-20">
          <div className="flex flex-col justify-center">
            <p className="text-sm font-semibold tracking-wide text-accent uppercase">Parkering, delad</p>
            <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">Hitta en ledig plats. Eller hyr ut din egen.</h1>
            <p className="mt-4 max-w-xl text-lg text-ink-soft">
              Tusentals parkeringsplatser står tomma varje dag hos privatpersoner, föreningar och företag. Parklet gör dem bokningsbara – per
              timme eller dygn.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/hyr-ut" className="btn-secondary btn-lg">
                Tjäna pengar på din plats
              </Link>
            </div>
          </div>
          <div className="card p-5 shadow-xl sm:p-7">
            <h2 className="mb-4 text-lg font-semibold">Sök parkering</h2>
            <SearchForm />
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-14" aria-labelledby="how">
        <h2 id="how" className="text-2xl font-bold">
          Så fungerar det
        </h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {driverSteps.map((s, i) => (
            <li key={s.title} className="card p-5">
              <span className="grid size-8 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand">{i + 1}</span>
              <h3 className="mt-3 font-semibold">{s.title}</h3>
              <p className="mt-1 text-ink-soft">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="py-14" aria-labelledby="trust">
        <div className="mx-auto w-full max-w-6xl px-4">
          <h2 id="trust" className="text-2xl font-bold">
            Tryggt för båda parter
          </h2>
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            {trust.map((t) => (
              <div key={t.title}>
                <h3 className="font-semibold">{t.title}</h3>
                <p className="mt-1 text-ink-soft">{t.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-14 md:grid-cols-2">
        <div className="card p-6">
          <h2 className="text-xl font-bold">Har du en plats som står tom?</h2>
          <p className="mt-2 text-ink-soft">
            Du bestämmer när den är ledig och vad den kostar. Vi sköter bokning, betalning och kvitton. Pengarna betalas ut till ditt konto.
          </p>
          <Link href="/hyr-ut" className="btn-primary mt-4">
            Hyr ut din plats
          </Link>
        </div>
        <div className="card p-6" id="foreningar">
          <h2 className="text-xl font-bold">Bostadsrättsförening eller fastighetsägare?</h2>
          <p className="mt-2 text-ink-soft">
            Lägg upp flera platser på en gång, bjud in fler administratörer och kräv att tillfälliga hyresgästers bilar registreras.
          </p>
          <Link href="/hyr-ut#foreningar" className="btn-secondary mt-4">
            Läs mer för organisationer
          </Link>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-6" aria-labelledby="cities">
        <h2 id="cities" className="text-lg font-semibold">
          Populära städer
        </h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {CITIES.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/sok?q=${encodeURIComponent(c.name)}&lat=${c.lat}&lng=${c.lng}`}
                className="inline-block rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium hover:bg-canvas"
              >
                Parkering i {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
