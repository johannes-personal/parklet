import { connection, NextResponse } from "next/server";
import { api, must } from "@/db/api";

export async function GET() {
  // Must run per request: a prerendered health check would report the build's state.
  await connection();
  try {
    // One cheap request through the same API the app uses.
    must(await api().from("spots").select("id").limit(1), "health");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[health]", err);
    return NextResponse.json({ ok: false, error: "database unavailable" }, { status: 503 });
  }
}
