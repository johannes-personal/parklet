import Link from "next/link";

const STEPS = ["Platsen", "Underlag", "Granskning"] as const;

/** 1 Platsen → 2 Underlag → 3 Granskning. Finished steps link back when a link is given. */
export function SpotSteps({ current, done, links = {} }: { current: 1 | 2 | 3; done: number; links?: Partial<Record<1 | 2, string>> }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" aria-label="Steg">
      {STEPS.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const isDone = n <= done;
        const isCurrent = n === current;
        const href = n !== current ? links[n as 1 | 2] : undefined;
        const content = (
          <>
            <span
              aria-hidden
              className={`grid size-6 place-items-center rounded-full text-xs font-bold ${
                isCurrent ? "bg-brand text-on-brand" : isDone ? "bg-ok text-white" : "border border-line-strong text-muted"
              }`}
            >
              {isDone && !isCurrent ? "✓" : n}
            </span>
            <span className={isCurrent ? "font-semibold text-ink" : "text-ink-soft"}>{label}</span>
          </>
        );
        return (
          <li key={label} className="flex items-center gap-2" aria-current={isCurrent ? "step" : undefined}>
            {href ? (
              <Link href={href} className="flex items-center gap-2 hover:underline">
                {content}
              </Link>
            ) : (
              content
            )}
            {n < STEPS.length ? <span aria-hidden className="mx-1 h-px w-6 bg-line-strong" /> : null}
          </li>
        );
      })}
    </ol>
  );
}
