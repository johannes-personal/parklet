-- A parking spot can never have two overlapping bookings that hold the slot
-- (awaiting payment or confirmed). Enforced by the database itself, so
-- concurrent checkouts cannot race past an application-level check. Ranges
-- are half-open: a booking ending 10:00 does not conflict with one at 10:00.
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist ("spot_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&)
  WHERE ("status" IN ('pending_payment', 'confirmed'));
