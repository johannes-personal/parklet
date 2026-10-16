/** "Parklet." wordmark: white, fading into light blue towards the full stop, as on parklet.se. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block bg-linear-to-br from-white from-45% to-accent bg-clip-text text-[1.75rem] leading-none font-bold tracking-tight text-transparent ${className}`}
    >
      Parklet.
    </span>
  );
}
