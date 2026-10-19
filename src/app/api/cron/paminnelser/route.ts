import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSecrets } from "@/db/schema";
import { runRegistrationReminders } from "@/server/reminders";

/**
 * Car-registration reminders, called every 10 minutes by the database's own
 * scheduler (Supabase pg_cron + pg_net, see docs/03-mvp.md) with
 * `Authorization: Bearer <token>`. The token is the `cron` row in app_secrets,
 * generated inside the database; CRON_SECRET works too, for an outside
 * scheduler. With neither, the endpoint is closed.
 */
export async function GET(req: Request) {
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!given || !(await accepted(given))) return new Response("Unauthorized", { status: 401 });
  return Response.json(await runRegistrationReminders());
}

async function accepted(given: string) {
  const [row] = await db.select({ value: appSecrets.value }).from(appSecrets).where(eq(appSecrets.name, "cron")).limit(1);
  return [process.env.CRON_SECRET, row?.value].some((secret) => secret && same(given, secret));
}

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
