import { isCronRequest } from "@/server/cron-auth";
import { runRegistrationReminders } from "@/server/reminders";

/** Car-registration reminders, every 10 minutes (see src/server/cron-auth.ts for who may call it). */
export async function GET(req: Request) {
  if (!(await isCronRequest(req))) return new Response("Unauthorized", { status: 401 });
  return Response.json(await runRegistrationReminders());
}
