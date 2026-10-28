import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, db } from "./direct-db";
import { appSecrets } from "@/db/schema";
import { GET as reminders } from "@/app/api/cron/paminnelser/route";
import { GET as digest } from "@/app/api/cron/sammanfattning/route";
import { allMail, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  delete process.env.CRON_SECRET;
});
afterEach(() => {
  delete process.env.CRON_SECRET;
});
afterAll(async () => {
  await closeDb();
});

const call = (handler: (req: Request) => Promise<Response>, token?: string) =>
  handler(new Request("http://localhost/api/cron/x", { headers: token === undefined ? {} : { Authorization: `Bearer ${token}` } }));

const ROUTES: [string, (req: Request) => Promise<Response>, unknown][] = [
  ["/api/cron/paminnelser", reminders, { reminded: 0, overdue: 0 }],
  ["/api/cron/sammanfattning", digest, { sent: 0, enabled: false }],
];

describe.each(ROUTES)("%s", (_path, handler, expected) => {
  it("is closed when no secret is configured, whatever the token", async () => {
    for (const token of [undefined, "", "anything"]) {
      const res = await call(handler, token);
      expect([res.status, await res.text()], String(token)).toEqual([401, "Unauthorized"]);
    }
  });

  it("refuses a missing or wrong token, and accepts the database's own secret", async () => {
    await db.insert(appSecrets).values({ name: "cron", value: "db-generated-secret" });
    expect((await call(handler)).status).toBe(401);
    expect((await call(handler, "wrong")).status).toBe(401);
    expect((await call(handler, "db-generated-secret-but-longer")).status).toBe(401);
    const res = await call(handler, "db-generated-secret");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(expected);
    expect(await allMail()).toEqual([]);
  });

  it("accepts CRON_SECRET for an outside scheduler", async () => {
    process.env.CRON_SECRET = "outside-secret";
    expect((await call(handler, "wrong")).status).toBe(401);
    const res = await call(handler, "outside-secret");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(expected);
  });
});
