-- Functions the app calls through Supabase's HTTP API (src/db/api.ts) for work
-- that must happen in one step, or that needs SQL the API can't express.
--
-- Every function runs with the caller's rights (security invoker) and is only
-- executable by service_role, the role of the app's server-side key. Supabase
-- grants new functions to anon and authenticated by default, hence the revokes.

-- Opening hours of a spot, replaced as a whole.
CREATE FUNCTION public.parklet_replace_windows(p_spot_id uuid, p_windows jsonb) RETURNS void
LANGUAGE sql SET search_path = public, pg_temp AS $$
  DELETE FROM availability_windows WHERE spot_id = p_spot_id;
  INSERT INTO availability_windows (spot_id, weekday, start_minute, end_minute)
  SELECT p_spot_id, w.weekday, w.start_minute, w.end_minute
  FROM jsonb_to_recordset(coalesce(p_windows, '[]'::jsonb)) AS w(weekday smallint, start_minute smallint, end_minute smallint);
$$;
--> statement-breakpoint

-- New spots (one, or several numbered ones) with the same opening hours. Each row is
-- an object of column values (snake_case); columns left out get their defaults.
CREATE FUNCTION public.parklet_create_spots(p_rows jsonb, p_windows jsonb) RETURNS SETOF uuid
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  r jsonb;
  columns text;
  new_id uuid;
BEGIN
  FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    SELECT string_agg(format('%I', k), ', ') INTO columns FROM jsonb_object_keys(r) AS k;
    EXECUTE format('INSERT INTO spots (%1$s) SELECT %1$s FROM jsonb_populate_record(null::spots, $1) RETURNING id', columns)
      INTO new_id USING r;
    PERFORM parklet_replace_windows(new_id, p_windows);
    RETURN NEXT new_id;
  END LOOP;
END
$$;
--> statement-breakpoint

-- Change a spot of the given account (only the columns in p_patch) and, unless
-- p_windows is null, its opening hours. False if the account has no such spot.
CREATE FUNCTION public.parklet_update_spot(p_account_id uuid, p_spot_id uuid, p_patch jsonb, p_windows jsonb) RETURNS boolean
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  assignments text;
  changed integer;
BEGIN
  IF p_patch IS NULL OR p_patch = '{}'::jsonb THEN
    PERFORM 1 FROM spots WHERE id = p_spot_id AND host_account_id = p_account_id;
    IF NOT FOUND THEN RETURN false; END IF;
  ELSE
    SELECT string_agg(format('%1$I = p.%1$I', k), ', ') INTO assignments FROM jsonb_object_keys(p_patch) AS k;
    EXECUTE format('UPDATE spots s SET %s FROM jsonb_populate_record(null::spots, $3) AS p WHERE s.id = $1 AND s.host_account_id = $2', assignments)
      USING p_spot_id, p_account_id, p_patch;
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed = 0 THEN RETURN false; END IF;
  END IF;
  IF p_windows IS NOT NULL THEN PERFORM parklet_replace_windows(p_spot_id, p_windows); END IF;
  RETURN true;
END
$$;
--> statement-breakpoint

-- Step 1 of checkout: hold the slot. Bookings on a spot are serialised by locking the
-- spot row, stale holds are released first, the plate is remembered for next time,
-- and the exclusion constraint (0001) refuses overlaps with 23P01.
CREATE FUNCTION public.parklet_create_booking(
  p_spot_id uuid,
  p_driver_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_vehicle_reg text,
  p_vehicle_registration vehicle_registration,
  p_base_ore integer,
  p_fee_ore integer,
  p_total_ore integer,
  p_payment_provider text,
  p_hold_minutes integer
) RETURNS uuid
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  vehicle uuid;
  booking uuid;
BEGIN
  -- NO KEY UPDATE doesn't block foreign-key checks against the spot.
  PERFORM 1 FROM spots WHERE id = p_spot_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'spot % not found', p_spot_id USING ERRCODE = 'P0002'; END IF;

  UPDATE bookings SET status = 'expired'
  WHERE spot_id = p_spot_id AND status = 'pending_payment' AND hold_expires_at < now();

  INSERT INTO vehicles (user_id, reg) VALUES (p_driver_id, p_vehicle_reg)
  ON CONFLICT (user_id, reg) DO UPDATE SET reg = excluded.reg
  RETURNING id INTO vehicle;

  INSERT INTO bookings (
    spot_id, driver_id, vehicle_id, starts_at, ends_at, status, hold_expires_at, vehicle_reg,
    vehicle_registration, base_ore, fee_ore, total_ore, payment_provider
  ) VALUES (
    p_spot_id, p_driver_id, vehicle, p_starts_at, p_ends_at, 'pending_payment', now() + make_interval(mins => p_hold_minutes), p_vehicle_reg,
    p_vehicle_registration, p_base_ore, p_fee_ore, p_total_ore, p_payment_provider
  ) RETURNING id INTO booking;
  RETURN booking;
END
$$;
--> statement-breakpoint

-- A host account and its owner. p_account: column values (snake_case).
CREATE FUNCTION public.parklet_create_host_account(p_account jsonb, p_owner_id uuid) RETURNS uuid
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  columns text;
  account uuid;
BEGIN
  SELECT string_agg(format('%I', k), ', ') INTO columns FROM jsonb_object_keys(p_account) AS k;
  EXECUTE format('INSERT INTO host_accounts (%1$s) SELECT %1$s FROM jsonb_populate_record(null::host_accounts, $1) RETURNING id', columns)
    INTO account USING p_account;
  INSERT INTO host_account_members (host_account_id, user_id, role) VALUES (account, p_owner_id, 'owner');
  RETURN account;
END
$$;
--> statement-breakpoint

-- Accept an invitation once: the account's id, or null if it was used or has expired.
CREATE FUNCTION public.parklet_accept_invitation(p_invitation_id text, p_user_id uuid) RETURNS uuid
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  account uuid;
BEGIN
  UPDATE host_invitations SET accepted_at = now()
  WHERE id = p_invitation_id AND accepted_at IS NULL AND expires_at > now()
  RETURNING host_account_id INTO account;
  IF account IS NULL THEN RETURN NULL; END IF;
  INSERT INTO host_account_members (host_account_id, user_id, role) VALUES (account, p_user_id, 'admin')
  ON CONFLICT DO NOTHING;
  RETURN account;
END
$$;
--> statement-breakpoint

-- Use a password reset token once: set the password and sign out everywhere.
-- The user's id, or null if the token is unknown, used or expired.
CREATE FUNCTION public.parklet_reset_password(p_token_id text, p_password_hash text) RETURNS uuid
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  account_user uuid;
BEGIN
  UPDATE password_reset_tokens SET used_at = now()
  WHERE id = p_token_id AND used_at IS NULL AND expires_at > now()
  RETURNING user_id INTO account_user;
  IF account_user IS NULL THEN RETURN NULL; END IF;
  UPDATE users SET password_hash = p_password_hash WHERE id = account_user;
  DELETE FROM sessions WHERE user_id = account_user;
  RETURN account_user;
END
$$;
--> statement-breakpoint

-- The landlord's or BRF's answer to an approval request, once. The spot's id, or null.
CREATE FUNCTION public.parklet_respond_landlord(
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

-- Per spot of an account: upcoming confirmed bookings and the host's earnings so far.
CREATE FUNCTION public.parklet_account_spot_stats(p_account_id uuid)
RETURNS TABLE (spot_id uuid, upcoming_bookings integer, earned_ore bigint)
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT s.id,
    (count(b.id) FILTER (WHERE b.status = 'confirmed' AND b.ends_at > now()))::integer,
    coalesce(sum(b.base_ore) FILTER (WHERE b.status = 'confirmed'), 0)::bigint
  FROM spots s LEFT JOIN bookings b ON b.spot_id = s.id
  WHERE s.host_account_id = p_account_id
  GROUP BY s.id;
$$;
--> statement-breakpoint

-- Admin search for spots: one page of rows, the total, counts per review status
-- (ignoring the status filter, so each chip shows what it would give) and the cities.
CREATE FUNCTION public.parklet_admin_search_spots(
  p_q text, p_review text, p_basis text, p_city text, p_bookable text, p_sort text, p_limit integer, p_offset integer
) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  WITH params AS (
    SELECT
      nullif(trim(p_q), '') AS q,
      '%' || replace(replace(replace(nullif(trim(p_q), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%' AS term,
      CASE WHEN length(regexp_replace(coalesce(p_q, ''), '[^0-9a-fA-F-]', '', 'g')) >= 4
        THEN regexp_replace(p_q, '[^0-9a-fA-F-]', '', 'g') || '%' END AS id_prefix
  ),
  base AS (
    SELECT s.*, a.name AS account_name, a.kind AS account_kind, a.org_number AS account_org_number,
      (s.review = 'approved' AND s.status = 'active' AND a.verification_status = 'verified' AND a.payout_status = 'active') AS bookable,
      CASE
        WHEN s.review <> 'approved' THEN NULL
        WHEN s.status = 'paused' THEN 'Pausad av uthyraren'
        WHEN a.verification_status <> 'verified' THEN 'Kontot är inte verifierat'
        WHEN a.payout_status <> 'active' THEN 'Utbetalning saknas'
      END AS not_bookable
    FROM spots s JOIN host_accounts a ON a.id = s.host_account_id, params
    WHERE (params.q IS NULL
        OR s.title ILIKE params.term OR s.address ILIKE params.term OR s.city ILIKE params.term
        OR a.name ILIKE params.term OR a.org_number ILIKE params.term OR s.landlord_name ILIKE params.term
        OR (params.id_prefix IS NOT NULL AND s.id::text ILIKE params.id_prefix))
      AND (p_basis IS NULL
        OR (p_basis = 'owns' AND s.right_basis = 'owns')
        OR (p_basis IN ('brf', 'landlord') AND s.right_basis = 'rents' AND s.landlord_kind::text = p_basis))
      AND (p_city IS NULL OR s.city = p_city)
  ),
  filtered AS (
    SELECT b.*,
      (SELECT count(*) FROM bookings x WHERE x.spot_id = b.id AND x.status = 'confirmed' AND x.ends_at > now())::integer AS upcoming,
      (SELECT count(*) FROM bookings x WHERE x.spot_id = b.id AND x.status = 'confirmed')::integer AS total
    FROM base b
    WHERE (p_bookable IS NULL OR (p_bookable = 'yes' AND b.bookable) OR (p_bookable = 'no' AND NOT b.bookable))
  ),
  chosen AS (SELECT * FROM filtered WHERE p_review IS NULL OR review::text = p_review),
  page AS (
    SELECT * FROM chosen
    ORDER BY
      CASE WHEN p_sort = 'title' THEN title END ASC,
      CASE WHEN p_sort = 'submitted' THEN submitted_at END DESC NULLS LAST,
      CASE WHEN p_sort = 'bookings' THEN total END DESC,
      updated_at DESC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_build_object(
    'rows', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'title', title, 'address', address, 'city', city, 'review', review,
      'right_basis', right_basis, 'landlord_kind', landlord_kind, 'submitted_at', submitted_at, 'updated_at', updated_at,
      'account_id', host_account_id, 'account_name', account_name, 'account_kind', account_kind,
      'bookable', bookable, 'not_bookable', not_bookable, 'upcoming', upcoming, 'total', total
    )) FROM page), '[]'::jsonb),
    'total', (SELECT count(*) FROM chosen),
    'by_review', coalesce((SELECT jsonb_object_agg(review, n) FROM (SELECT review, count(*) AS n FROM filtered GROUP BY review) r), '{}'::jsonb),
    'cities', coalesce((SELECT jsonb_agg(jsonb_build_object('city', city, 'n', n) ORDER BY city) FROM (SELECT city, count(*) AS n FROM spots GROUP BY city) c), '[]'::jsonb)
  );
$$;
--> statement-breakpoint

-- Admin search for host accounts: one page of accounts (all columns) with their spot
-- counts, the total and counts per verification status (ignoring that filter).
CREATE FUNCTION public.parklet_admin_search_accounts(
  p_q text, p_kind text, p_verification text, p_payout text, p_sort text, p_limit integer, p_offset integer
) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  WITH params AS (
    SELECT
      nullif(trim(p_q), '') AS q,
      '%' || replace(replace(replace(nullif(trim(p_q), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%' AS term,
      CASE WHEN length(regexp_replace(coalesce(p_q, ''), '\D', '', 'g')) >= 4
        THEN '%' || regexp_replace(p_q, '\D', '', 'g') || '%' END AS digits
  ),
  base AS (
    SELECT a.*,
      (SELECT count(*) FROM spots s WHERE s.host_account_id = a.id)::integer AS spot_count,
      (SELECT count(*) FROM spots s WHERE s.host_account_id = a.id AND s.review = 'approved')::integer AS approved_count
    FROM host_accounts a, params
    WHERE (params.q IS NULL
        OR a.name ILIKE params.term OR a.registry_name ILIKE params.term
        OR (params.digits IS NOT NULL AND regexp_replace(coalesce(a.org_number, ''), '\D', '', 'g') LIKE params.digits)
        OR EXISTS (SELECT 1 FROM host_account_members m JOIN users u ON u.id = m.user_id
                   WHERE m.host_account_id = a.id AND (u.name ILIKE params.term OR u.email ILIKE params.term)))
      AND (p_kind IS NULL OR a.kind::text = p_kind)
      AND (p_payout IS NULL OR a.payout_status::text = p_payout)
  ),
  chosen AS (SELECT * FROM base WHERE p_verification IS NULL OR verification_status::text = p_verification),
  page AS (
    SELECT * FROM chosen
    ORDER BY
      CASE WHEN p_sort = 'spots' THEN spot_count END DESC,
      CASE WHEN p_sort IN ('name', 'spots') THEN name END ASC,
      created_at DESC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_build_object(
    'rows', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'account', to_jsonb(p) - 'spot_count' - 'approved_count', 'spots', spot_count, 'approved', approved_count
    )) FROM page p), '[]'::jsonb),
    'total', (SELECT count(*) FROM chosen),
    'by_verification', coalesce((SELECT jsonb_object_agg(verification_status, n) FROM (SELECT verification_status, count(*) AS n FROM base GROUP BY verification_status) v), '{}'::jsonb)
  );
$$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION
  public.parklet_replace_windows(uuid, jsonb),
  public.parklet_create_spots(jsonb, jsonb),
  public.parklet_update_spot(uuid, uuid, jsonb, jsonb),
  public.parklet_create_booking(uuid, uuid, timestamptz, timestamptz, text, vehicle_registration, integer, integer, integer, text, integer),
  public.parklet_create_host_account(jsonb, uuid),
  public.parklet_accept_invitation(text, uuid),
  public.parklet_reset_password(text, text),
  public.parklet_respond_landlord(text, boolean, text, text, boolean, text),
  public.parklet_account_spot_stats(uuid),
  public.parklet_admin_search_spots(text, text, text, text, text, text, integer, integer),
  public.parklet_admin_search_accounts(text, text, text, text, text, integer, integer)
FROM PUBLIC;
--> statement-breakpoint

-- anon and authenticated exist on Supabase and in local API setups (scripts/api-roles.sql),
-- not necessarily in a plain Postgres; only touch them where they do.
DO $$
DECLARE
  role_name text;
  fn text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      FOR fn IN SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.proname IN (
                  'parklet_replace_windows', 'parklet_create_spots', 'parklet_update_spot', 'parklet_create_booking',
                  'parklet_create_host_account', 'parklet_accept_invitation', 'parklet_reset_password',
                  'parklet_respond_landlord', 'parklet_account_spot_stats', 'parklet_admin_search_spots',
                  'parklet_admin_search_accounts') LOOP
        IF role_name = 'service_role' THEN
          EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
        ELSE
          EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM %I', fn, role_name);
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END
$$;
--> statement-breakpoint

-- Let a running PostgREST see the new functions (Supabase also does this by itself).
NOTIFY pgrst, 'reload schema';
