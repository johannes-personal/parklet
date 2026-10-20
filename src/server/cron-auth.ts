import "server-only";
import { timingSafeEqual } from "node:crypto";
import { api, must, names } from "@/db/api";
import { appSecrets } from "@/db/schema";

/**
 * Scheduled jobs (/api/cron/*) are called by the database's own scheduler
 * (Supabase pg_cron + pg_net) with `Authorization: Bearer <token>`. The token
 * is the `cron` row in app_secrets, generated inside the database; CRON_SECRET
 * works too, for an outside scheduler. With neither, the endpoints are closed.
 */
export async function isCronRequest(req: Request): Promise<boolean> {
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!given) return false;
  const S = names(appSecrets);
  const row = must<{ value: string } | null>(await api().from("app_secrets").select(S.value).eq(S.name, "cron").maybeSingle(), "isCronRequest");
  return [process.env.CRON_SECRET, row?.value].some((secret) => secret && same(given, secret));
}

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
