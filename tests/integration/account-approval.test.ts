import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { hostAccounts, spots } from "@/db/schema";
import { closeDb, db } from "./direct-db";
import { ownsRejectedHousehold } from "@/server/host-accounts";
import { verifyIdentityMock } from "@/server/identity";
import { searchSpots } from "@/server/search";
import { ACCOUNT_NOT_APPROVED_NOTE, requestLandlordApproval, reviewAccount, reviewSpot } from "@/server/spots";
import { getSpotRow, mailTo, makeAdmin, makeBookableSpot, makeHost, makeUser, notificationsOf, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(async () => {
  await closeDb();
});

const accountStatus = async (id: string) =>
  (await db.select({ s: hostAccounts.verificationStatus }).from(hostAccounts).where(eq(hostAccounts.id, id)))[0].s;
const searchAll = async () => (await searchSpots({ center: null, start: null, end: null })).results.map((r) => r.id);

describe("an account losing its approval", () => {
  it("sends its approved and submitted spots back for review, leaving drafts alone", async () => {
    const { account, spotId: approved } = await makeBookableSpot();
    const [submitted] = await db.insert(spots).values({ ...(await getSpotRow(approved)), id: undefined, title: "Inskickad", review: "pending_review" }).returning();
    const [draft] = await db.insert(spots).values({ ...(await getSpotRow(approved)), id: undefined, title: "Utkast", review: "draft" }).returning();

    expect(await reviewAccount(account.id, "revoke", "Fel uppgifter.")).toEqual({ kind: "household", spotsReset: 2 });
    expect(await accountStatus(account.id)).toBe("rejected");
    for (const id of [approved, submitted.id]) {
      expect(await getSpotRow(id)).toMatchObject({ review: "rejected", reviewNote: ACCOUNT_NOT_APPROVED_NOTE, submittedAt: null });
    }
    expect((await getSpotRow(draft.id)).review).toBe("draft");
    expect(await searchAll()).toEqual([]);

    // Approving the account again doesn't approve the spots: each is reviewed again.
    expect(await reviewAccount(account.id, "approve", null)).toEqual({ kind: "household", spotsReset: 0 });
    expect(await searchAll()).toEqual([]);
    const admin = await makeAdmin();
    expect(await reviewSpot(approved, admin.id, "approve", null)).toBe(true);
    expect(await searchAll()).toEqual([approved]);
  });

  it("does the same when a submitted organisation is rejected", async () => {
    const { account, spotId } = await makeBookableSpot({ review: "pending_review" });
    await db.update(hostAccounts).set({ kind: "association", verificationStatus: "pending" }).where(eq(hostAccounts.id, account.id));
    expect(await reviewAccount(account.id, "reject", "Protokollet saknas.")).toEqual({ kind: "association", spotsReset: 1 });
    expect((await getSpotRow(spotId)).review).toBe("rejected");
  });

  it("changes nothing when the decision doesn't fit the account's state", async () => {
    const { account, spotId } = await makeBookableSpot();
    expect(await reviewAccount(account.id, "reject", "x")).toBeNull();
    expect((await getSpotRow(spotId)).review).toBe("approved");
  });
});

describe("BankID and a household's approval", () => {
  it("verifies a new household", async () => {
    const { host, account } = await makeHost({ verificationStatus: "unverified" });
    await verifyIdentityMock(host.id);
    expect(await accountStatus(account.id)).toBe("verified");
  });

  it("doesn't approve a rejected household again: it goes back to Parklet's review", async () => {
    const admin = await makeAdmin();
    const { host, account } = await makeHost();
    await reviewAccount(account.id, "revoke", "Fel person.");
    expect(await ownsRejectedHousehold(host.id)).toBe(true);

    await verifyIdentityMock(host.id);
    expect(await accountStatus(account.id)).toBe("pending");
    expect(await ownsRejectedHousehold(host.id)).toBe(false);
    expect((await notificationsOf(admin.id)).map((n) => [n.kind, n.title, n.href])).toEqual([
      ["admin_account_submitted", `Privat uthyrare att granska igen: ${account.name}`, `/admin/konton/${account.id}`],
    ]);

    // Another BankID while it's under review changes nothing and doesn't notify again.
    await verifyIdentityMock(host.id);
    expect(await accountStatus(account.id)).toBe("pending");
    expect(await notificationsOf(admin.id)).toHaveLength(1);
  });

  it("leaves a household that is under review or approved as it is", async () => {
    const pending = await makeHost({ verificationStatus: "pending" });
    await verifyIdentityMock(pending.host.id);
    expect(await accountStatus(pending.account.id)).toBe("pending");
    const approved = await makeHost();
    await verifyIdentityMock(approved.host.id);
    expect(await accountStatus(approved.account.id)).toBe("verified");
  });

  it("doesn't touch an organisation the user owns", async () => {
    const { host, account } = await makeHost({ kind: "association", verificationStatus: "rejected" });
    await verifyIdentityMock(host.id);
    expect(await accountStatus(account.id)).toBe("rejected");
    expect(await ownsRejectedHousehold(host.id)).toBe(false);
  });
});

describe("asking the landlord", () => {
  it("also reaches an approver with a Parklet account in the bell, with one e-mail", async () => {
    const approver = await makeUser("Styrelsen", { email: "styrelsen@brf-test.se" });
    const { account, spotId, host } = await makeBookableSpot({ review: "draft", rightBasis: "rents", landlordKind: "brf", landlordEmail: "Styrelsen@BRF-test.se" });
    expect(await requestLandlordApproval(account.id, spotId, host.name)).toEqual({ ok: true });

    const mails = await mailTo("Styrelsen@BRF-test.se");
    expect(mails).toHaveLength(1);
    const token = mails[0].text.match(/\/godkannande\/([A-Za-z0-9_-]+)/)?.[1];
    expect(await mailTo("styrelsen@brf-test.se")).toHaveLength(0);
    const [bell] = await notificationsOf(approver.id);
    expect(bell).toMatchObject({ kind: "landlord_approval_requested", href: `/godkannande/${token}` });
    expect(bell.title).toContain("Godkännande begärt");
  });

  it("only e-mails an approver without an account", async () => {
    const { account, spotId, host } = await makeBookableSpot({ review: "draft", rightBasis: "rents", landlordKind: "brf", landlordEmail: "ingen@brf-test.se" });
    expect(await requestLandlordApproval(account.id, spotId, host.name)).toEqual({ ok: true });
    expect(await mailTo("ingen@brf-test.se")).toHaveLength(1);
    expect(await notificationsOf(host.id)).toEqual([]);
  });
});
