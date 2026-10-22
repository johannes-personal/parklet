import "server-only";
import { api, cols, embed, must, names, parse, parseAll, toDb } from "@/db/api";
import { bookings, spots, spotVehicleApprovals, users, type Booking } from "@/db/schema";
import { formatRange } from "@/lib/time";
import { notifyUsers } from "./notifications";

/**
 * Cars the host has registered in the association's system for a spot that requires
 * it. Registering a car for one booking registers it for the spot: the next booking
 * with the same plate is registered from the start, and so are other bookings waiting
 * with it. The host can also add and remove cars on the spot's page.
 */

const V = names(spotVehicleApprovals);
const B = names(bookings);

export type VehicleApproval = { reg: string; approvedAt: Date; approvedBy: string | null; approvedByName: string | null };

export async function listSpotApprovals(spotId: string): Promise<VehicleApproval[]> {
  const rows = must<(Record<string, unknown> & { approver: { name: string } | null })[]>(
    await api()
      .from("spot_vehicle_approvals")
      .select(`${cols(spotVehicleApprovals)},${embed("approver", users, ["name"])}`)
      .eq(V.spotId, spotId)
      .order(V.reg),
    "listSpotApprovals",
  );
  return rows.map((r) => {
    const a = parse(spotVehicleApprovals, r);
    return { reg: a.reg, approvedAt: a.approvedAt, approvedBy: a.approvedBy, approvedByName: r.approver?.name ?? null };
  });
}

/** Which of these plates are registered for the spot. */
export async function approvedRegs(spotId: string, regs: string[]): Promise<Set<string>> {
  if (regs.length === 0) return new Set();
  const rows = must<{ reg: string }[]>(
    await api().from("spot_vehicle_approvals").select(V.reg).eq(V.spotId, spotId).in(V.reg, regs),
    "approvedRegs",
  );
  return new Set(rows.map((r) => r.reg));
}

export async function isVehicleApproved(spotId: string, reg: string) {
  return (await approvedRegs(spotId, [reg])).has(reg);
}

/**
 * Registers a car for a spot, and with it every booking of the spot waiting for that
 * car (their drivers are told). Returns how many bookings that was.
 */
export async function approveVehicle(spotId: string, reg: string, userId: string): Promise<number> {
  must(
    await api()
      .from("spot_vehicle_approvals")
      .upsert(toDb(spotVehicleApprovals, { spotId, reg, approvedBy: userId }), { onConflict: `${V.spotId},${V.reg}`, ignoreDuplicates: true }),
    "approveVehicle",
  );
  const done = must<unknown[]>(
    await api()
      .from("bookings")
      .update(toDb(bookings, { vehicleRegistration: "done", vehicleRegisteredAt: new Date() }))
      .eq(B.spotId, spotId)
      .eq(B.vehicleReg, reg)
      .eq(B.vehicleRegistration, "pending")
      .select(`${cols(bookings)},${embed("spot", spots, ["title", "hostAccountId"], { inner: true })}`),
    "approveVehicle",
  ) as (Record<string, unknown> & { spot: { title: string; hostAccountId: string } })[];
  for (const row of done) {
    const b = parse<typeof bookings, Booking>(bookings, row);
    if (b.status !== "confirmed") continue;
    await notifyUsers([b.driverId], {
      kind: "vehicle_registered",
      accountId: row.spot.hostAccountId,
      title: `${b.vehicleReg} är registrerad för ${row.spot.title}`,
      body: `Uthyraren har registrerat din bil i föreningens system. Du kan parkera ${formatRange(b.startsAt, b.endsAt)}.`,
      href: `/bokning/${b.id}`,
    });
  }
  return done.length;
}

/** Takes a car off the spot's list. Bookings already registered stay registered. */
export async function revokeVehicle(spotId: string, reg: string) {
  must(await api().from("spot_vehicle_approvals").delete().eq(V.spotId, spotId).eq(V.reg, reg), "revokeVehicle");
}

/** Every spot's registered cars, for a list of spots (the host's lists). */
export async function approvalsBySpot(spotIds: string[]): Promise<Map<string, string[]>> {
  if (spotIds.length === 0) return new Map();
  const rows = parseAll(
    spotVehicleApprovals,
    must(await api().from("spot_vehicle_approvals").select(cols(spotVehicleApprovals)).in(V.spotId, spotIds).order(V.reg), "approvalsBySpot"),
  );
  const out = new Map<string, string[]>();
  for (const r of rows) out.set(r.spotId, [...(out.get(r.spotId) ?? []), r.reg]);
  return out;
}
