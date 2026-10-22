import { NextResponse } from "next/server";
import { api, cols, must, names } from "@/db/api";
import { spots } from "@/db/schema";
import { spotHref } from "@/lib/spot-link";
import { isUuid } from "@/server/ids";

/**
 * Old spot pages: a spot is shown on the search map now (src/lib/spot-link.ts). Links
 * already shared or sent by e-mail keep working, chosen times included. A spot that is
 * gone opens the panel's "not found".
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const times = { from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined };
  const spot = isUuid(id)
    ? must<{ id: string; lat: number; lng: number; city: string } | null>(
        await api().from("spots").select(cols(spots, ["id", "lat", "lng", "city"])).eq(names(spots).id, id).is(names(spots).deletedAt, null).maybeSingle(),
        "spotRedirect",
      )
    : null;
  const target = spot ? spotHref(spot, times) : `/sok?${new URLSearchParams({ plats: id })}`;
  return NextResponse.redirect(new URL(target, url), 308);
}
