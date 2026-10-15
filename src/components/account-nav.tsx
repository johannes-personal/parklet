import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { logoutAction } from "@/app/(auth)/actions";

export function AccountNavFallback() {
  return <span className="inline-block h-9 w-24 animate-pulse rounded-lg bg-canvas" aria-hidden />;
}

export async function AccountNav() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <>
        <Link href="/logga-in" className="rounded-lg px-3 py-2 hover:bg-canvas">
          Logga in
        </Link>
        <Link href="/registrera" className="btn-primary hidden py-2 sm:inline-flex">
          Skapa konto
        </Link>
      </>
    );
  }
  const items = [
    { href: "/mina-bokningar", label: "Mina bokningar" },
    { href: "/fordon", label: "Mina fordon" },
    { href: "/uthyrare", label: "Uthyrning" },
    ...(user.isAdmin ? [{ href: "/admin", label: "Granskning (admin)" }] : []),
  ];
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 hover:bg-canvas [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="grid size-7 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand">
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden max-w-32 truncate sm:inline">{user.name.split(" ")[0]}</span>
        <span className="sr-only">Kontomeny</span>
      </summary>
      <div className="card absolute right-0 mt-2 w-56 overflow-hidden p-1 shadow-lg">
        {items.map((i) => (
          <Link key={i.href} href={i.href} className="block rounded-lg px-3 py-2 hover:bg-canvas">
            {i.label}
          </Link>
        ))}
        <form action={logoutAction} className="border-t border-line pt-1">
          <button className="w-full rounded-lg px-3 py-2 text-left hover:bg-canvas">Logga ut</button>
        </form>
      </div>
    </details>
  );
}
