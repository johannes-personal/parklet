"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { markAllRead } from "@/server/notifications";

/** Called when the bell is opened. */
export async function markNotificationsReadAction() {
  const user = await getCurrentUser();
  if (user) await markAllRead(user.id);
}
