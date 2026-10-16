export function AuthCard({ title, intro, children }: { title: string; intro?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:py-16">
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl font-bold">{title}</h1>
        {intro ? <p className="mt-2 text-ink-soft">{intro}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
