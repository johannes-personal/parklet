import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq, inArray } from "drizzle-orm";
import { closeDb, db } from "./direct-db";
import {
  appSecrets,
  bookings,
  documents,
  hostAccountMembers,
  hostAccounts,
  identityRequests,
  mailOutbox,
  notifications,
  passwordResetTokens,
  sessions,
  spots,
  users,
  vehicles,
} from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { hashToken } from "@/lib/auth/tokens";
import { DEMO_PASSWORD, DEMO_USERS, demoPayout, resetDemoData } from "@/server/demo-data";
import { storeDocument } from "@/server/storage";
import { hoursFromNow, makeAdmin, makeBookableSpot, makeConfirmedBooking, makeHost, makeUser, resetDb } from "./helpers";

// The server action reads the session cookie; this stands in for the request's cookies.
const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined),
    set: (name: string, value: string) => void cookieJar.set(name, value),
    delete: (name: string) => void cookieJar.delete(name),
  }),
}));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
const { resetDemoDataAction } = await import("@/app/admin/testdata/actions");

// Documents go to a temporary local store.
const storeDir = mkdtempSync(path.join(tmpdir(), "parklet-demo-"));
const storedFiles = () => readdirSync(storeDir, { recursive: true, withFileTypes: true }).filter((f) => f.isFile()).length;
const pdf = Buffer.from("%PDF-1.4\n% test\n");

beforeAll(() => {
  delete process.env.DOCUMENT_STORAGE;
  process.env.DOCUMENT_STORAGE_DIR = storeDir;
});
beforeEach(async () => {
  await resetDb();
  cookieJar.clear();
});
afterEach(() => {
  vi.unstubAllEnvs();
});
afterAll(async () => {
  delete process.env.DOCUMENT_STORAGE_DIR;
  rmSync(storeDir, { recursive: true, force: true });
  await closeDb();
});

const DEMO_EMAILS = DEMO_USERS.map((u) => u.email).sort();
const OWNER_EMAIL = "agare@foretaget.se";

async function signIn(userId: string, token: string) {
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt: hoursFromNow(24) });
  cookieJar.set("parklet_session", token);
}

/** Parklet's own admin (real address) with a host account, a spot with a document, a car, a notification and two sessions; plus others' data. */
async function realWorld() {
  const owner = await makeUser("Ägaren", {
    email: OWNER_EMAIL,
    isAdmin: true,
    passwordHash: await hashPassword("ägarens-lösenord"),
    identityProvider: "idura",
    identityRef: "sub-123",
    identityName: "Ägaren Själv",
  });
  const { spotId: ownerSpot, account: ownerAccount } = await makeBookableSpot();
  await db.insert(hostAccountMembers).values({ hostAccountId: ownerAccount.id, userId: owner.id, role: "admin" });
  const file = await storeDocument(pdf);
  if ("error" in file) throw new Error(file.error);
  await db.insert(documents).values({ hostAccountId: ownerAccount.id, spotId: ownerSpot, uploadedBy: owner.id, kind: "ownership_proof", filename: "lagfart.pdf", ...file });
  await db.insert(vehicles).values({ userId: owner.id, reg: "OWN123" });
  await db.insert(notifications).values({ userId: owner.id, kind: "test", title: "Hej", href: "/" });
  await db.insert(sessions).values({ id: "other-device", userId: owner.id, expiresAt: hoursFromNow(24) });

  // A real person testing as a host and a driver (not an admin), and an admin on a test domain.
  const { host: tester, account: testerAccount } = await makeHost({}, "Testaren");
  await db.update(users).set({ email: "testare@foretaget.se" }).where(eq(users.id, tester.id));
  const { spotId: testerSpot } = await makeBookableSpot();
  await makeConfirmedBooking(testerSpot, tester.id, hoursFromNow(24), hoursFromNow(26));
  await db.insert(passwordResetTokens).values({ id: "reset-token", userId: tester.id, expiresAt: hoursFromNow(1) });
  await db.insert(identityRequests).values({ state: "state", userId: tester.id, nonce: "n", codeVerifier: "v", next: "/", expiresAt: hoursFromNow(1) });
  await db.insert(mailOutbox).values({ to: "testare@foretaget.se", subject: "Hej", text: "Hej" });
  const testAdmin = await makeAdmin("Testadmin");
  await db.insert(appSecrets).values({ name: "cron", value: "token" });

  const [ownerRow] = await db.select().from(users).where(eq(users.id, owner.id));
  return { owner: ownerRow, tester, testerAccount, testAdmin, oldFile: file.storageKey };
}

/** What is left, in a form that compares across resets. */
async function contents() {
  const rows = await db.select({ email: users.email }).from(users).orderBy(asc(users.email));
  return {
    users: rows.map((r) => r.email),
    hostAccounts: (await db.select({ name: hostAccounts.name }).from(hostAccounts).orderBy(asc(hostAccounts.name))).map((r) => r.name),
    spots: (await db.select({ title: spots.title, review: spots.review }).from(spots).orderBy(asc(spots.title))).map((r) => `${r.title} (${r.review})`),
    bookings: (await db.select().from(bookings)).length,
    documents: (await db.select().from(documents)).length,
    vehicles: (await db.select({ reg: vehicles.reg }).from(vehicles)).map((r) => r.reg),
    files: storedFiles(),
  };
}

describe("resetting the demo data", () => {
  it("leaves exactly the demo set, plus Parklet's own admin with their login", async () => {
    const { owner, oldFile } = await realWorld();
    await signIn(owner.id, "owner-token");

    const result = await resetDemoData({ keepSessionId: hashToken("owner-token") });

    expect(result).toMatchObject({
      keptAdmins: 1,
      removed: { users: 4, hostAccounts: 3, spots: 2, bookings: 1, documents: 1 },
      created: { users: 6, hostAccounts: 5, spots: 17, bookings: 3, documents: 1 },
    });
    const after = await contents();
    expect(after.users).toEqual([OWNER_EMAIL, ...DEMO_EMAILS].sort());
    expect(after.hostAccounts).toEqual(["Anna Lindqvist", "Brf Linnéstaden", "Erik Berg", "Kvarteret Fastigheter AB", "Maja Ek"]);
    expect(after.spots).toHaveLength(17);
    expect(after.spots.filter((s) => s.endsWith("(pending_review)"))).toEqual(["BRF-plats i Haga (pending_review)"]);
    expect(after).toMatchObject({ bookings: 3, documents: 1, vehicles: ["ABC123"], files: 1 });

    // The owner is as they were, still signed in here, and owns nothing.
    const [ownerAfter] = await db.select().from(users).where(eq(users.id, owner.id));
    expect(ownerAfter).toEqual(owner);
    expect(await db.select({ id: sessions.id }).from(sessions)).toEqual([{ id: hashToken("owner-token") }]);
    expect(await db.select().from(hostAccountMembers).where(eq(hostAccountMembers.userId, owner.id))).toEqual([]);

    // Everyone else's traces are gone; the database's own secrets stay.
    for (const table of [notifications, mailOutbox, passwordResetTokens, identityRequests]) expect(await db.select().from(table)).toEqual([]);
    expect(await db.select({ name: appSecrets.name }).from(appSecrets)).toEqual([{ name: "cron" }]);
    expect(existsSync(path.join(storeDir, oldFile))).toBe(false);
    const [doc] = await db.select().from(documents);
    expect(existsSync(path.join(storeDir, doc.storageKey))).toBe(true);
  });

  it("gives the demo logins the demo password, and the demo set its shape", async () => {
    await resetDemoData();
    const rows = await db.select().from(users).where(inArray(users.email, DEMO_EMAILS));
    expect(rows).toHaveLength(DEMO_USERS.length);
    for (const u of rows) expect(await verifyPassword(DEMO_PASSWORD, u.passwordHash), u.email).toBe(true);
    expect(rows.filter((u) => u.isAdmin).map((u) => u.email)).toEqual(["admin@parklet.test"]);
    expect(rows.find((u) => u.email === "ny@parklet.test")?.identityVerifiedAt).toBeNull();
    // The driver's bookings are confirmed and in the future; Erik is in two accounts.
    const driver = rows.find((u) => u.email === "forare@parklet.test")!;
    const driverBookings = await db.select().from(bookings).where(eq(bookings.driverId, driver.id));
    expect(driverBookings.every((b) => b.status === "confirmed" && b.startsAt > new Date())).toBe(true);
    const erik = rows.find((u) => u.email === "erik@parklet.test")!;
    expect(await db.select().from(hostAccountMembers).where(eq(hostAccountMembers.userId, erik.id))).toHaveLength(2);
  });

  it("can be run again and again, ending the same way", async () => {
    const { owner } = await realWorld();
    await resetDemoData({ keepSessionId: "other-device" });
    const first = await contents();
    const second = await resetDemoData({ keepSessionId: "other-device" });
    expect(second.removed).toEqual({ users: 6, hostAccounts: 5, spots: 17, bookings: 3, documents: 1 });
    expect(await contents()).toEqual(first);
    expect(await db.select({ id: sessions.id, userId: sessions.userId }).from(sessions)).toEqual([{ id: "other-device", userId: owner.id }]);
  });

  it("takes everybody away when there is no admin with a real address", async () => {
    await makeAdmin();
    await resetDemoData();
    expect((await contents()).users).toEqual(DEMO_EMAILS);
  });
});

describe("the demo hosts' payouts", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("are the mock's, or under Stripe a shared onboarded test account, or not connected yet", () => {
    vi.stubEnv("PAYMENT_PROVIDER", "mock");
    expect(demoPayout()).toEqual({ payoutStatus: "active", payoutAccountRef: "acct_mock_seed" });
    vi.stubEnv("PAYMENT_PROVIDER", "stripe");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_demo");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_demo");
    vi.stubEnv("STRIPE_TEST_CONNECTED_ACCOUNT", "acct_1DemoShared");
    expect(demoPayout()).toEqual({ payoutStatus: "active", payoutAccountRef: "acct_1DemoShared" });
    vi.stubEnv("STRIPE_TEST_CONNECTED_ACCOUNT", "");
    expect(demoPayout()).toEqual({ payoutStatus: "not_connected", payoutAccountRef: null });
  });
});

describe("the admin's reset button", () => {
  it("is refused to someone who isn't an admin, and leaves the data alone", async () => {
    const { tester } = await realWorld();
    await signIn(tester.id, "tester-token");
    const before = await contents();
    await expect(resetDemoDataAction()).rejects.toThrow("redirect:/");
    cookieJar.clear();
    await expect(resetDemoDataAction()).rejects.toThrow("redirect:/logga-in");
    expect(await contents()).toEqual(before);
  });

  it("is turned off in production outside the demo", async () => {
    const { owner } = await realWorld();
    await signIn(owner.id, "owner-token");
    const before = await contents();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_DEMO", "");
    expect(await resetDemoDataAction()).toEqual({ error: "Återställning av testdata är avstängd här." });
    expect(await contents()).toEqual(before);
    vi.stubEnv("NEXT_PUBLIC_DEMO", "1");
    expect(await resetDemoDataAction()).toMatchObject({ success: expect.stringContaining("Testdatan är återställd.") });
  });

  it("resets for an admin, who stays signed in", async () => {
    const { owner } = await realWorld();
    await signIn(owner.id, "owner-token");
    const state = await resetDemoDataAction();
    expect(state?.success).toBe(
      "Testdatan är återställd. Borttaget: 4 användare, 3 uthyrarkonton, 2 parkeringsplatser, 1 bokning, 1 dokument. " +
        "Skapat: 6 användare, 5 uthyrarkonton, 17 parkeringsplatser, 3 bokningar, 1 dokument. 1 administratör med riktig e-postadress fick vara kvar.",
    );
    expect(cookieJar.get("parklet_session")).toBe("owner-token");
    expect(await db.select({ userId: sessions.userId }).from(sessions)).toEqual([{ userId: owner.id }]);
  });

  it("signs the demo admin in again as the new demo admin", async () => {
    await resetDemoData();
    const [demoAdmin] = await db.select().from(users).where(eq(users.email, "admin@parklet.test"));
    await signIn(demoAdmin.id, "demo-token");
    expect(await resetDemoDataAction()).toMatchObject({ success: expect.any(String) });
    const [newAdmin] = await db.select().from(users).where(eq(users.email, "admin@parklet.test"));
    expect(newAdmin.id).not.toBe(demoAdmin.id);
    const token = cookieJar.get("parklet_session")!;
    expect(token).not.toBe("demo-token");
    expect(await db.select({ userId: sessions.userId }).from(sessions).where(eq(sessions.id, hashToken(token)))).toEqual([{ userId: newAdmin.id }]);
  });
});
