CREATE TABLE "spot_vehicle_approvals" (
	"spot_id" uuid NOT NULL,
	"reg" text NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by" uuid,
	CONSTRAINT "spot_vehicle_approvals_spot_id_reg_pk" PRIMARY KEY("spot_id","reg")
);
--> statement-breakpoint
ALTER TABLE "host_accounts" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "spots" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "spot_vehicle_approvals" ADD CONSTRAINT "spot_vehicle_approvals_spot_id_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_vehicle_approvals" ADD CONSTRAINT "spot_vehicle_approvals_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Like every other table: no access through Supabase's public API, only the app's service key.
ALTER TABLE "spot_vehicle_approvals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- The admin lists, now also used by a host for their own account (p_account), without
-- deleted spots and accounts. New names rather than new arguments on the old ones: the
-- running app keeps calling parklet_admin_search_spots/_bookings/_mail (0010, 0013) until
-- the deploy that uses these, and nothing has to be dropped while it does.
CREATE FUNCTION public.parklet_search_spots(
  p_q text, p_review text, p_basis text, p_city text, p_bookable text, p_sort text, p_limit integer, p_offset integer,
  p_account uuid
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
    WHERE s.deleted_at IS NULL
      AND (p_account IS NULL OR s.host_account_id = p_account)
      AND (params.q IS NULL
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
      (SELECT count(*) FROM bookings x WHERE x.spot_id = b.id AND x.status = 'confirmed')::integer AS total,
      (SELECT count(*) FROM spot_vehicle_approvals v WHERE v.spot_id = b.id)::integer AS cars
    FROM base b
    WHERE (p_bookable IS NULL OR (p_bookable = 'yes' AND b.bookable) OR (p_bookable = 'no' AND NOT b.bookable))
  ),
  chosen AS (SELECT * FROM filtered WHERE p_review IS NULL OR review::text = p_review),
  ordered AS (
    SELECT *, row_number() OVER (ORDER BY
      CASE WHEN p_sort = 'title' THEN title END ASC,
      CASE WHEN p_sort = 'submitted' THEN submitted_at END DESC NULLS LAST,
      CASE WHEN p_sort = 'bookings' THEN total END DESC,
      updated_at DESC, id) AS pos
    FROM chosen
  ),
  page AS (SELECT * FROM ordered ORDER BY pos LIMIT p_limit OFFSET p_offset)
  SELECT jsonb_build_object(
    'rows', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'title', title, 'address', address, 'city', city, 'review', review, 'status', status,
      'right_basis', right_basis, 'landlord_kind', landlord_kind, 'submitted_at', submitted_at, 'updated_at', updated_at,
      'requires_vehicle_registration', requires_vehicle_registration, 'price_per_hour_ore', price_per_hour_ore,
      'account_id', host_account_id, 'account_name', account_name, 'account_kind', account_kind,
      'bookable', bookable, 'not_bookable', not_bookable, 'upcoming', upcoming, 'total', total, 'cars', cars
    ) ORDER BY pos) FROM page), '[]'::jsonb),
    'total', (SELECT count(*) FROM chosen),
    'by_review', coalesce((SELECT jsonb_object_agg(review, n) FROM (SELECT review, count(*) AS n FROM filtered GROUP BY review) r), '{}'::jsonb),
    'cities', coalesce((SELECT jsonb_agg(jsonb_build_object('city', city, 'n', n) ORDER BY city) FROM (
      SELECT city, count(*) AS n FROM spots WHERE deleted_at IS NULL AND (p_account IS NULL OR host_account_id = p_account) GROUP BY city) c), '[]'::jsonb)
  );
$$;
--> statement-breakpoint

CREATE FUNCTION public.parklet_search_bookings(
  p_q text, p_status text, p_payment text, p_when text, p_from date, p_to date, p_city text, p_sort text, p_limit integer, p_offset integer,
  p_account uuid
) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  WITH params AS (
    SELECT
      nullif(trim(p_q), '') AS q,
      '%' || replace(replace(replace(nullif(trim(p_q), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%' AS term,
      CASE WHEN length(regexp_replace(coalesce(p_q, ''), '[^0-9a-fA-F-]', '', 'g')) >= 4
        THEN regexp_replace(p_q, '[^0-9a-fA-F-]', '', 'g') || '%' END AS id_prefix,
      upper(regexp_replace(coalesce(p_q, ''), '\s', '', 'g')) AS reg
  ),
  base AS (
    SELECT b.*, s.title AS spot_title, s.address AS spot_address, s.city AS spot_city,
      a.id AS account_id, a.name AS account_name, a.kind AS account_kind,
      u.name AS driver_name, u.email AS driver_email
    FROM bookings b
      JOIN spots s ON s.id = b.spot_id
      JOIN host_accounts a ON a.id = s.host_account_id
      JOIN users u ON u.id = b.driver_id,
      params
    WHERE (p_account IS NULL OR a.id = p_account)
      AND (params.q IS NULL
        OR s.title ILIKE params.term OR s.address ILIKE params.term OR a.name ILIKE params.term
        OR u.name ILIKE params.term OR u.email ILIKE params.term
        OR (params.reg <> '' AND b.vehicle_reg = params.reg)
        OR b.payment_ref = params.q OR b.checkout_session_id = params.q
        OR (params.id_prefix IS NOT NULL AND b.id::text ILIKE params.id_prefix))
      AND (p_payment IS NULL OR b.payment_status::text = p_payment)
      AND (p_when IS NULL
        OR (p_when = 'upcoming' AND b.starts_at > now())
        OR (p_when = 'ongoing' AND b.starts_at <= now() AND b.ends_at > now())
        OR (p_when = 'past' AND b.ends_at <= now()))
      AND (p_from IS NULL OR b.ends_at > (p_from::timestamp AT TIME ZONE 'Europe/Stockholm'))
      AND (p_to IS NULL OR b.starts_at < ((p_to + 1)::timestamp AT TIME ZONE 'Europe/Stockholm'))
      AND (p_city IS NULL OR s.city = p_city)
  ),
  -- 'booked': what a host has, confirmed or cancelled (not holds that were never paid).
  chosen AS (SELECT * FROM base WHERE p_status IS NULL OR status::text = p_status OR (p_status = 'booked' AND status IN ('confirmed', 'cancelled'))),
  ordered AS (
    SELECT *, row_number() OVER (ORDER BY
      CASE WHEN p_sort = 'starts_desc' THEN starts_at END DESC,
      CASE WHEN p_sort = 'starts' THEN starts_at END ASC,
      CASE WHEN p_sort = 'total' THEN total_ore END DESC,
      created_at DESC, id) AS pos
    FROM chosen
  ),
  page AS (SELECT * FROM ordered ORDER BY pos LIMIT p_limit OFFSET p_offset)
  SELECT jsonb_build_object(
    'rows', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'starts_at', starts_at, 'ends_at', ends_at, 'status', status, 'payment_status', payment_status,
      'payment_provider', payment_provider, 'total_ore', total_ore, 'base_ore', base_ore, 'fee_ore', fee_ore, 'vehicle_reg', vehicle_reg,
      'vehicle_registration', vehicle_registration, 'created_at', created_at, 'confirmed_at', confirmed_at,
      'cancelled_at', cancelled_at, 'cancelled_by', cancelled_by,
      'spot_id', spot_id, 'spot_title', spot_title, 'spot_address', spot_address, 'spot_city', spot_city,
      'account_id', account_id, 'account_name', account_name, 'account_kind', account_kind,
      'driver_id', driver_id, 'driver_name', driver_name, 'driver_email', driver_email
    ) ORDER BY pos) FROM page), '[]'::jsonb),
    'total', (SELECT count(*) FROM chosen),
    'by_status', coalesce((SELECT jsonb_object_agg(status, n) FROM (SELECT status, count(*) AS n FROM base GROUP BY status) r), '{}'::jsonb),
    'cities', coalesce((SELECT jsonb_agg(jsonb_build_object('city', city, 'n', n) ORDER BY city) FROM (
      SELECT s.city, count(*) AS n FROM bookings b JOIN spots s ON s.id = b.spot_id
      WHERE p_account IS NULL OR s.host_account_id = p_account GROUP BY s.city) c), '[]'::jsonb)
  );
$$;
--> statement-breakpoint

-- A host's own e-mail (p_host_view): the mail about the account that went to its
-- administrators, or that they sent through Parklet (to the landlord, to invited
-- administrators). Not the drivers' confirmations or the admins' notices.
CREATE FUNCTION public.parklet_search_mail(
  p_q text, p_kind text, p_account uuid, p_sort text, p_limit integer, p_offset integer,
  p_host_view boolean
) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  WITH params AS (
    SELECT
      nullif(trim(p_q), '') AS q,
      '%' || replace(replace(replace(nullif(trim(p_q), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%' AS term
  ),
  base AS (
    SELECT m.id, m."to", m.subject, m.kind, m.host_account_id, m.created_at, a.name AS account_name
    FROM mail_outbox m LEFT JOIN host_accounts a ON a.id = m.host_account_id, params
    WHERE (params.q IS NULL OR m."to" ILIKE params.term OR m.subject ILIKE params.term OR a.name ILIKE params.term)
      AND (p_account IS NULL OR m.host_account_id = p_account)
      AND (NOT p_host_view OR (p_account IS NOT NULL AND (
        m.kind IN ('landlord_approval', 'invitation')
        OR EXISTS (SELECT 1 FROM host_account_members hm JOIN users u ON u.id = hm.user_id
                   WHERE hm.host_account_id = p_account AND lower(u.email) = lower(m."to")))))
  ),
  chosen AS (SELECT * FROM base WHERE p_kind IS NULL OR coalesce(kind, '') = p_kind),
  ordered AS (
    SELECT *, row_number() OVER (ORDER BY
      CASE WHEN p_sort = 'to' THEN lower("to") END ASC,
      CASE WHEN p_sort = 'account' THEN account_name END ASC NULLS LAST,
      CASE WHEN p_sort = 'kind' THEN kind END ASC NULLS LAST,
      created_at DESC, id DESC) AS pos
    FROM chosen
  ),
  page AS (SELECT * FROM ordered ORDER BY pos LIMIT p_limit OFFSET p_offset)
  SELECT jsonb_build_object(
    'rows', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'to', "to", 'subject', subject, 'kind', kind, 'created_at', created_at,
      'account_id', host_account_id, 'account_name', account_name
    ) ORDER BY pos) FROM page), '[]'::jsonb),
    'total', (SELECT count(*) FROM chosen),
    'by_kind', coalesce((SELECT jsonb_object_agg(k, n) FROM (SELECT coalesce(kind, '') AS k, count(*) AS n FROM base GROUP BY 1) r), '{}'::jsonb),
    'accounts', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name, 'n', n) ORDER BY name) FROM (
      SELECT a.id, a.name, count(*) AS n FROM mail_outbox m JOIN host_accounts a ON a.id = m.host_account_id
      WHERE NOT p_host_view GROUP BY a.id, a.name) c), '[]'::jsonb)
  );
$$;
--> statement-breakpoint

-- Deleted accounts and spots leave the admin's account list and the host's statistics.
CREATE OR REPLACE FUNCTION public.parklet_admin_search_accounts(
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
      (SELECT count(*) FROM spots s WHERE s.host_account_id = a.id AND s.deleted_at IS NULL)::integer AS spot_count,
      (SELECT count(*) FROM spots s WHERE s.host_account_id = a.id AND s.deleted_at IS NULL AND s.review = 'approved')::integer AS approved_count
    FROM host_accounts a, params
    WHERE a.deleted_at IS NULL
      AND (params.q IS NULL
        OR a.name ILIKE params.term OR a.registry_name ILIKE params.term
        OR (params.digits IS NOT NULL AND regexp_replace(coalesce(a.org_number, ''), '\D', '', 'g') LIKE params.digits)
        OR EXISTS (SELECT 1 FROM host_account_members m JOIN users u ON u.id = m.user_id
                   WHERE m.host_account_id = a.id AND (u.name ILIKE params.term OR u.email ILIKE params.term)))
      AND (p_kind IS NULL OR a.kind::text = p_kind)
      AND (p_payout IS NULL OR a.payout_status::text = p_payout)
  ),
  chosen AS (SELECT * FROM base WHERE p_verification IS NULL OR verification_status::text = p_verification),
  ordered AS (
    SELECT *, row_number() OVER (ORDER BY
      CASE WHEN p_sort = 'spots' THEN spot_count END DESC,
      CASE WHEN p_sort IN ('name', 'spots') THEN name END ASC,
      created_at DESC, id) AS pos
    FROM chosen
  ),
  page AS (SELECT * FROM ordered ORDER BY pos LIMIT p_limit OFFSET p_offset)
  SELECT jsonb_build_object(
    'rows', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'account', to_jsonb(p) - 'spot_count' - 'approved_count' - 'pos', 'spots', spot_count, 'approved', approved_count
    ) ORDER BY pos) FROM page p), '[]'::jsonb),
    'total', (SELECT count(*) FROM chosen),
    'by_verification', coalesce((SELECT jsonb_object_agg(verification_status, n) FROM (SELECT verification_status, count(*) AS n FROM base GROUP BY verification_status) v), '{}'::jsonb)
  );
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.parklet_account_spot_stats(p_account_id uuid)
RETURNS TABLE (spot_id uuid, upcoming_bookings integer, earned_ore bigint)
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT s.id,
    (count(b.id) FILTER (WHERE b.status = 'confirmed' AND b.ends_at > now()))::integer,
    coalesce(sum(b.base_ore) FILTER (WHERE b.status = 'confirmed'), 0)::bigint
  FROM spots s LEFT JOIN bookings b ON b.spot_id = s.id
  WHERE s.host_account_id = p_account_id AND s.deleted_at IS NULL
  GROUP BY s.id;
$$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION
  public.parklet_search_spots(text, text, text, text, text, text, integer, integer, uuid),
  public.parklet_search_bookings(text, text, text, text, date, date, text, text, integer, integer, uuid),
  public.parklet_search_mail(text, text, uuid, text, integer, integer, boolean),
  public.parklet_admin_search_accounts(text, text, text, text, text, integer, integer),
  public.parklet_account_spot_stats(uuid)
FROM PUBLIC;
--> statement-breakpoint

-- As in 0010: only the app's service role may call them.
DO $$
DECLARE
  role_name text;
  fn text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      FOR fn IN SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.proname IN (
                  'parklet_search_spots', 'parklet_search_bookings', 'parklet_search_mail',
                  'parklet_admin_search_accounts', 'parklet_account_spot_stats') LOOP
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

-- Let a running PostgREST see the new table, columns and functions (Supabase also does this by itself).
NOTIFY pgrst, 'reload schema';
