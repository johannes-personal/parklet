import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "./direct-db";
import { markAllRead, notifyUsers, unreadCount } from "@/server/notifications";
import { allMail, makeUser, notificationsOf, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(async () => {
  await closeDb();
});

const note = (title: string) => ({ kind: "test", title, body: "", href: "/" });

describe("notifications", () => {
  it("marking all read touches only the user's own, and the unread count follows", async () => {
    const me = await makeUser("Jag");
    const other = await makeUser("Annan");
    await notifyUsers([me.id, other.id], note("Till båda"), { email: false });
    await notifyUsers([me.id], note("Bara till mig"), { email: false });
    await notifyUsers([other.id], note("Bara till den andra"), { email: false });
    expect(await allMail()).toEqual([]);
    expect(await unreadCount(me.id)).toBe(2);
    expect(await unreadCount(other.id)).toBe(2);

    await markAllRead(me.id);
    expect(await unreadCount(me.id)).toBe(0);
    expect(await unreadCount(other.id)).toBe(2);
    expect((await notificationsOf(me.id)).every((n) => n.readAt instanceof Date)).toBe(true);
    expect((await notificationsOf(other.id)).map((n) => n.readAt)).toEqual([null, null]);

    // New ones after that are unread again; the old ones keep their read time.
    const readAt = (await notificationsOf(me.id)).map((n) => n.readAt);
    await notifyUsers([me.id], note("Ny"), { email: false });
    expect(await unreadCount(me.id)).toBe(1);
    expect((await notificationsOf(me.id)).slice(0, 2).map((n) => n.readAt)).toEqual(readAt);
  });
});
