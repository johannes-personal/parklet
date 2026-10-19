import Link from "next/link";
import { after } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hostTodos, isHost, listNotifications, unreadCount } from "@/server/notifications";
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

  const host = await isHost(user.id);
  const [todos, items, unread] = await Promise.all([host ? hostTodos(user) : [], listNotifications(user.id), unreadCount(user.id)]);
  return (
    <>
      {host ? null : <BecomeHostLink />}
      <Link href="/mina-bokningar" className="hidden max-w-40 truncate text-zinc-300 transition-colors hover:text-white sm:inline">
        {user.name.split(" ")[0]}
      </Link>
      {host || items.length > 0 ? (
        <NotificationBell
          todos={todos}
          unread={unread}
          items={items.map((n) => ({ id: n.id, title: n.title, href: n.href, createdAt: n.createdAt.toISOString(), read: n.readAt != null }))}
        />
      ) : null}
      <MenuDrawer user={{ name: user.name, isAdmin: user.isAdmin, isHost: host }} />
    </>
  );
}

function BecomeHostLink() {
  return (
    <Link href="/hyr-ut" className="hidden text-zinc-300 transition-colors hover:text-white md:inline-flex">
      Bli uthyrare
    </Link>
  );
}
