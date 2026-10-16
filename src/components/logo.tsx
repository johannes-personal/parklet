export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-xl font-extrabold tracking-tight text-ink ${className}`}>
      <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-brand text-base font-black text-white">
        P
      </span>
      Parklet
    </span>
  );
}
