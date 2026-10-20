ALTER TABLE "spots" ADD COLUMN "landlord_requires_registration" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- Spots whose landlord approved and that require registration: until now nothing
-- recorded who required it, so assume the landlord did (the host can ask support).
UPDATE "spots" SET "landlord_requires_registration" = true
WHERE "landlord_approval" = 'approved' AND "requires_vehicle_registration";
--> statement-breakpoint

-- As in 0010, and now also records that the landlord required registration (or that it
-- no longer does, on a new answer). CREATE OR REPLACE keeps the function's grants.
CREATE OR REPLACE FUNCTION public.parklet_respond_landlord(
  p_token_hash text,
  p_approve boolean,
  p_name text,
  p_role text,
  p_requires_registration boolean,
  p_registration_note text
) RETURNS uuid
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  spot uuid;
  imposes boolean := p_approve AND p_requires_registration;
BEGIN
  UPDATE spots SET
    landlord_approval = CASE WHEN p_approve THEN 'approved' ELSE 'declined' END::landlord_approval,
    landlord_approved_by_name = p_name,
    landlord_approved_by_role = p_role,
    landlord_responded_at = now(),
    landlord_approval_token_hash = NULL,
    landlord_requires_registration = imposes,
    -- The association can impose its own vehicle registration rule.
    requires_vehicle_registration = CASE WHEN imposes THEN true ELSE requires_vehicle_registration END,
    vehicle_registration_note = CASE WHEN imposes THEN p_registration_note ELSE vehicle_registration_note END,
    min_notice_minutes = CASE WHEN imposes THEN greatest(min_notice_minutes, 1440) ELSE min_notice_minutes END,
    -- A declined approval pulls an approved spot out of search immediately.
    review = CASE WHEN NOT p_approve AND review = 'approved' THEN 'rejected'::spot_review ELSE review END
  WHERE landlord_approval_token_hash = p_token_hash AND landlord_approval = 'requested'
  RETURNING id INTO spot;
  RETURN spot;
END
$$;
--> statement-breakpoint

NOTIFY pgrst, 'reload schema';
