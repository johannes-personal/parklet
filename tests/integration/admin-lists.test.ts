import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { searchBookings, searchMail } from "@/server/admin-search";
import { cancelBooking, getBookingForAdmin } from "@/server/bookings";
import { sendEmail } from "@/server/mailer";
import { closeDb } from "./direct-db";
import { hoursFromNow, makeBookableSpot, makeConfirmedBooking, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(async () => {
  await closeDb();
});

const day = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });

describe("the admins' e-mail log", () => {
  it("knows what each mail is and which organisation it concerns, and filters and sorts on it", async () => {
    const { spotId, account } = await makeBookableSpot();
    const driver = await makeUser("Dora Förare");
    // A booking mails the driver (a confirmation) and the host (a new booking), both about the host's account.
    await makeConfirmedBooking(spotId, driver.id, hoursFromNow(24), hoursFromNow(26));
    await sendEmail("glomsk@example.com", "Välj ett nytt lösenord för Parklet", { heading: "x", paragraphs: [] }, { kind: "password_reset" });

    const all = await searchMail({});
    expect(all.total).toBe(3);
    expect(all.byKind).toEqual({ booking_confirmed: 1, booking_new: 1, password_reset: 1 });
    expect(all.accounts).toEqual([{ id: account.id, name: account.name, n: 2 }]);
    // Newest first.
    expect(all.rows[0]).toMatchObject({ to: "glomsk@example.com", kind: "password_reset", accountName: null, createdAt: expect.any(Date) });

    expect((await searchMail({ kind: "booking_confirmed" })).rows.map((r) => r.to)).toEqual([driver.email]);
    expect((await searchMail({ account: account.id })).total).toBe(2);
    expect((await searchMail({ q: "glomsk" })).total).toBe(1);
    expect((await searchMail({ sort: "to" })).rows.map((r) => r.to)).toEqual([...all.rows.map((r) => r.to)].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
    // Without an organisation last.
    expect((await searchMail({ sort: "account" })).rows.at(-1)?.accountName).toBeNull();
    // Mails logged before kinds were stored are "Övrigt".
    await sendEmail("gammal@example.com", "Gammalt", { heading: "x", paragraphs: [] });
    expect((await searchMail({ kind: "" })).rows.map((r) => r.to)).toEqual(["gammal@example.com"]);
  });
});

describe("the admins' booking list", () => {
  it("finds bookings by person, plate and date, and counts them per status", async () => {
    const { spotId, account } = await makeBookableSpot();
    const dora = await makeUser("Dora Förare");
    const olle = await makeUser("Olle Annan");
    const soon = await makeConfirmedBooking(spotId, dora.id, hoursFromNow(24), hoursFromNow(26));
    const later = await makeConfirmedBooking(spotId, olle.id, hoursFromNow(24 * 10), hoursFromNow(24 * 10 + 2));
    expect(await cancelBooking(later.id, olle.id)).toMatchObject({ ok: true });

    const all = await searchBookings({});
    expect(all.total).toBe(2);
    expect(all.byStatus).toEqual({ confirmed: 1, cancelled: 1 });
    expect(all.rows.find((r) => r.id === soon.id)).toMatchObject({
      status: "confirmed",
      paymentStatus: "paid",
      startsAt: expect.any(Date),
      account: { id: account.id, name: account.name },
      driver: { id: dora.id, name: "Dora Förare", email: dora.email },
    });

    expect((await searchBookings({ status: "cancelled" })).rows.map((r) => r.id)).toEqual([later.id]);
    expect((await searchBookings({ status: "cancelled" })).byStatus).toEqual({ confirmed: 1, cancelled: 1 });
    expect((await searchBookings({ q: "olle" })).rows.map((r) => r.id)).toEqual([later.id]);
    expect((await searchBookings({ q: "abc 123" })).total).toBe(2);
    expect((await searchBookings({ q: soon.id.slice(0, 8) })).rows.map((r) => r.id)).toEqual([soon.id]);
    expect((await searchBookings({ payment: "refunded" })).rows.map((r) => r.id)).toEqual([later.id]);
    // A day range keeps what overlaps it.
    const tomorrow = day(hoursFromNow(25));
    expect((await searchBookings({ from: tomorrow, to: tomorrow })).rows.map((r) => r.id)).toEqual([soon.id]);
    expect((await searchBookings({ from: day(hoursFromNow(24 * 5)) })).rows.map((r) => r.id)).toEqual([later.id]);
    expect((await searchBookings({ when: "past" })).total).toBe(0);
    expect((await searchBookings({ sort: "starts" })).rows.map((r) => r.id)).toEqual([soon.id, later.id]);
    expect((await searchBookings({ sort: "starts_desc" })).rows.map((r) => r.id)).toEqual([later.id, soon.id]);

    expect(await getBookingForAdmin(soon.id)).toMatchObject({ id: soon.id, spot: { id: spotId }, account: { id: account.id }, driver: { email: dora.email } });
    expect(await getBookingForAdmin("nope")).toBeNull();
  });
});
