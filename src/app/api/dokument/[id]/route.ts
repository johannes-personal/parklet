import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { getAccountForMember } from "@/server/host-accounts";
import { isUuid } from "@/server/ids";
import { readDocument } from "@/server/storage";

/** Verification documents are only ever served to members of the owning host account and to Parklet admins. */
export async function GET(_req: Request, ctx: RouteContext<"/api/dokument/[id]">) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!doc) return new Response("Not found", { status: 404 });
  if (!user.isAdmin && !(await getAccountForMember(doc.hostAccountId, user.id))) return new Response("Not found", { status: 404 });

  const bytes = await readDocument(doc.storageKey);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
