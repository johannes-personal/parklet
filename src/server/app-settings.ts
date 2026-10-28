import "server-only";
import { z } from "zod";
import { api, must, names, toDb } from "@/db/api";
import { appSettings } from "@/db/schema";

/**
 * The admins' morning summary (src/server/digest.ts): whether it is sent, and to whom.
 * Without an address it goes to every admin. Off until an admin turns it on.
 */
export type DigestSettings = { enabled: boolean; to: string | null };

const digestSchema = z.object({ enabled: z.boolean(), to: z.string().nullable() });
const DIGEST_OFF: DigestSettings = { enabled: false, to: null };

const S = names(appSettings);

export async function getDigestSettings(): Promise<DigestSettings> {
  const row = must<{ value: unknown } | null>(
    await api().from("app_settings").select(S.value).eq(S.key, "admin_digest").maybeSingle(),
    "getDigestSettings",
  );
  const parsed = digestSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : DIGEST_OFF;
}

export async function setDigestSettings(settings: DigestSettings, userId: string) {
  must(
    await api()
      .from("app_settings")
      .upsert(toDb(appSettings, { key: "admin_digest", value: settings, updatedAt: new Date(), updatedBy: userId }), { onConflict: S.key }),
    "setDigestSettings",
  );
}
