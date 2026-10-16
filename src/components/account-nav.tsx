import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { MenuDrawer } from "./menu-drawer";

export function AccountNavFallback() {
  return <span className="inline-block h-5 w-24 animate-pulse rounded bg-white/10" aria-hidden />;
}

export async function AccountNav() {
  const user = await getCurrentUser();
  return (
    <>
      {user ? (
        <Link href="/mina-bokningar" className="hidden max-w-40 truncate text-zinc-300 transition-colors hover:text-white sm:inline">
          {user.name.split(" ")[0]}
        </Link>
      ) : (
        <Link href="/logga-in" className="text-zinc-300 transition-colors hover:text-white">
          Logga in
        </Link>
      )}
      <MenuDrawer user={user ? { name: user.name, isAdmin: user.isAdmin } : null} />
    </>
  );
}
