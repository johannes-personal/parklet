import { isCronRequest } from "@/server/cron-auth";
import { sendAdminDigest } from "@/server/digest";

/** The admins' daily summary, every morning (see src/server/cron-auth.ts for who may call it). */
export async function GET(req: Request) {
  if (!(await isCronRequest(req))) return new Response("Unauthorized", { status: 401 });
  return Response.json(await sendAdminDigest());
}
