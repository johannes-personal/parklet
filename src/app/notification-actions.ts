"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { bellData, markAllRead, type BellData } from "@/server/notifications";

/** Called when the bell is opened. */
export async function markNotificationsReadAction() {
  const user = await getCurrentUser();
  if (user) await markAllRead(user.id);
}

/** The bell's current contents; the header itself isn't re-rendered on client-side navigation. */
export async function bellDataAction(): Promise<BellData | null> {
  const user = await getCurrentUser();
  return user ? bellData(user) : null;
}

/** Who is signed in now: another tab may have logged out or in as someone else. */
export async function sessionUserAction(): Promise<string | null> {
  return (await getCurrentUser())?.id ?? null;
}
