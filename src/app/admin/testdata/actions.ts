"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form";
import { currentSessionId, requireAdmin, startSession } from "@/lib/auth/session";
import { demoResetEnabled } from "@/lib/demo";
import { resetDemoData, type DemoResetResult } from "@/server/demo-data";

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function counts(c: DemoResetResult["created"]) {
  return [
    count(c.users, "användare", "användare"),
    count(c.hostAccounts, "uthyrarkonto", "uthyrarkonton"),
    count(c.spots, "parkeringsplats", "parkeringsplatser"),
    count(c.bookings, "bokning", "bokningar"),
    count(c.documents, "dokument", "dokument"),
  ].join(", ");
}

export async function resetDemoDataAction(): Promise<FormState> {
  const admin = await requireAdmin();
  if (!demoResetEnabled()) return { error: "Återställning av testdata är avstängd här." };
  let result: DemoResetResult;
  try {
    // The admin pressing the button stays signed in.
    result = await resetDemoData({ keepSessionId: await currentSessionId() });
  } catch (err) {
    console.error("[demo] reset failed", err);
    return { error: "Återställningen avbröts halvvägs. Försök igen: den gör om det som saknas." };
  }
  // A demo admin (admin@parklet.test) went with the rest; sign them in as the new one.
  const again = result.userIds[admin.email];
  if (again) await startSession(again);
  console.info(`[demo] reset by ${admin.id}: removed ${JSON.stringify(result.removed)}, created ${JSON.stringify(result.created)}`);
  revalidatePath("/", "layout");
  return {
    success:
      `Testdatan är återställd. Borttaget: ${counts(result.removed)}. Skapat: ${counts(result.created)}.` +
      (result.keptAdmins ? ` ${count(result.keptAdmins, "administratör", "administratörer")} med riktig e-postadress fick vara kvar.` : ""),
  };
}
