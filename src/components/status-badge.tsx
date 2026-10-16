const tone = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-canvas text-ink-soft ring-1 ring-line",
  brand: "bg-brand-soft text-brand",
} as const;

export function Badge({ children, kind = "neutral" }: { children: React.ReactNode; kind?: keyof typeof tone }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone[kind]}`}>{children}</span>;
}

export function BookingStatusBadge({ status, endsAt }: { status: string; endsAt: Date }) {
  if (status === "cancelled") return <Badge kind="danger">Avbokad</Badge>;
  if (status === "pending_payment") return <Badge kind="warn">Väntar på betalning</Badge>;
  if (status === "expired") return <Badge>Ej genomförd</Badge>;
  if (endsAt < new Date()) return <Badge>Genomförd</Badge>;
  return <Badge kind="ok">Bekräftad</Badge>;
}
