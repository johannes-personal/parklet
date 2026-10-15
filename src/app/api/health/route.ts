import { sql } from "drizzle-orm";
import { connection, NextResponse } from "next/server";
import { db } from "@/db";

export async function GET() {
  // Must run per request: a prerendered health check would report the build's state.
  await connection();
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[health]", err);
    return NextResponse.json({ ok: false, error: "database unavailable" }, { status: 503 });
  }
}
