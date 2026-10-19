import { timingSafeEqual } from "node:crypto";
import { runRegistrationReminders } from "@/server/reminders";

/**
 * Car-registration reminders, for a scheduler (e.g. Supabase pg_cron or a
 * GitHub Actions schedule) to call every 10–15 minutes with
 * `Authorization: Bearer $CRON_SECRET`. Disabled when CRON_SECRET is unset.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return new Response("Unauthorized", { status: 401 });
  }
  return Response.json(await runRegistrationReminders());
}
