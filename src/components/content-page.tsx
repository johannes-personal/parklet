export function ContentPage({ title, intro, draft, children }: { title: string; intro?: string; draft?: boolean; children: React.ReactNode }) {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold">{title}</h1>
      {intro ? <p className="mt-3 text-lg text-ink-soft">{intro}</p> : null}
      {draft ? (
        <p className="mt-4 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
          Utkast för MVP:n. Texten ska granskas av jurist innan lansering.
        </p>
      ) : null}
      <div className="prose-page mt-6">{children}</div>
    </article>
  );
}
