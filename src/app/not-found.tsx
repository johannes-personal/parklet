import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-20 text-center">
      <p className="text-sm font-semibold text-brand">404</p>
      <h1 className="mt-2 text-3xl font-bold">Sidan finns inte</h1>
      <p className="mt-3 text-ink-soft">Länken kan vara fel, eller så har platsen tagits bort.</p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/" className="btn-primary">
          Till startsidan
        </Link>
        <Link href="/sok" className="btn-secondary">
          Hitta parkering
        </Link>
      </div>
    </div>
  );
}
