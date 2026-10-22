import Link from "next/link";
import { after } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { bellData, isHost } from "@/server/notifications";
import { runRemindersOccasionally } from "@/server/reminders";
import { MenuDrawer } from "./menu-drawer";
import { NotificationBell } from "./notification-bell";

export function AccountNavFallback() {
  return <span className="inline-block h-5 w-24 animate-pulse rounded bg-white/10" aria-hidden />;
}

export async function AccountNav() {
  const user = await getCurrentUser();
  // Car-registration reminders ride along on page views (see src/server/reminders.ts).
  after(runRemindersOccasionally);
  if (!user) {
    return (
      <>
        <BecomeHostLink />
        <Link href="/logga-in" className="text-zinc-300 transition-colors hover:text-white">
          Logga in
        </Link>
        <MenuDrawer user={null} />
      </>
    );
  }

  const [host, bell] = await Promise.all([isHost(user.id), bellData(user)]);
  return (
    <>
      {host ? null : <BecomeHostLink />}
      <Link href="/mina-sidor" className="hidden max-w-40 truncate text-zinc-300 transition-colors hover:text-white sm:inline">
        {user.name.split(" ")[0]}
      </Link>
      <NotificationBell initial={bell} />
      <MenuDrawer user={{ name: user.name, isAdmin: user.isAdmin }} />
    </>
  );
}

function BecomeHostLink() {
  return (
    <Link href="/uthyrare" className="hidden text-zinc-300 transition-colors hover:text-white md:inline-flex">
      Bli uthyrare
    </Link>
  );
}
