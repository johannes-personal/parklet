import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createBooking, markVehicleRegistered } from "@/server/bookings";
import { approveVehicle, listSpotApprovals, revokeVehicle } from "@/server/vehicle-approvals";
import { closeDb } from "./direct-db";
import { getBooking, hoursFromNow, makeBookableSpot, makeConfirmedBooking, makeUser, notificationsOf, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(async () => {
  await closeDb();
});

async function brfSpot() {
  return makeBookableSpot({ requiresVehicleRegistration: true, minNoticeMinutes: 0 });
}

describe("registered cars per spot", () => {
  it("registering a booking's car registers it for the spot: the next booking with it starts registered", async () => {
    const { spotId, host } = await brfSpot();
    const driver = await makeUser("Dora Förare");
    const first = await makeConfirmedBooking(spotId, driver.id, hoursFromNow(24), hoursFromNow(26));
    // Booked again before the host got round to the first one: both wait.
    const second = await makeConfirmedBooking(spotId, driver.id, hoursFromNow(48), hoursFromNow(50));
    expect((await getBooking(first.id)).vehicleRegistration).toBe("pending");

    expect(await markVehicleRegistered(first.id, host.id)).toBe(true);
    // Both done, and the driver told about each.
    expect(await getBooking(first.id)).toMatchObject({ vehicleRegistration: "done", vehicleRegisteredAt: expect.any(Date) });
    expect((await getBooking(second.id)).vehicleRegistration).toBe("done");
    expect((await notificationsOf(driver.id)).filter((n) => n.kind === "vehicle_registered")).toHaveLength(2);
    expect(await listSpotApprovals(spotId)).toMatchObject([{ reg: "ABC123", approvedBy: host.id, approvedByName: host.name }]);

    // A third booking with the same car needs nothing from the host.
    const third = await createBooking({ driverId: driver.id, spotId, start: hoursFromNow(72), end: hoursFromNow(74), vehicleReg: "ABC123" });
    if (!third.ok) throw new Error(third.error);
    expect(await getBooking(third.bookingId)).toMatchObject({ vehicleRegistration: "done", vehicleRegisteredAt: expect.any(Date) });
    // Another car still waits.
    const other = await createBooking({ driverId: driver.id, spotId, start: hoursFromNow(96), end: hoursFromNow(98), vehicleReg: "XYZ987" });
    if (!other.ok) throw new Error(other.error);
    expect((await getBooking(other.bookingId)).vehicleRegistration).toBe("pending");
  });

  it("the host adds and removes cars on the spot; removing doesn't undo bookings already registered", async () => {
    const { spotId, host } = await brfSpot();
    const driver = await makeUser("Dora Förare");
    const waiting = await makeConfirmedBooking(spotId, driver.id, hoursFromNow(24), hoursFromNow(26));
    expect(await approveVehicle(spotId, "ABC123", host.id)).toBe(1);
    expect((await getBooking(waiting.id)).vehicleRegistration).toBe("done");
    // Adding the same car twice is harmless.
    expect(await approveVehicle(spotId, "ABC123", host.id)).toBe(0);

    await revokeVehicle(spotId, "ABC123");
    expect(await listSpotApprovals(spotId)).toEqual([]);
    expect((await getBooking(waiting.id)).vehicleRegistration).toBe("done");
    const next = await createBooking({ driverId: driver.id, spotId, start: hoursFromNow(48), end: hoursFromNow(50), vehicleReg: "ABC123" });
    if (!next.ok) throw new Error(next.error);
    expect((await getBooking(next.bookingId)).vehicleRegistration).toBe("pending");
  });
});
