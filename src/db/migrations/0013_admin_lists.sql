ALTER TABLE "mail_outbox" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "mail_outbox" ADD COLUMN "host_account_id" uuid;--> statement-breakpoint
ALTER TABLE "mail_outbox" ADD CONSTRAINT "mail_outbox_host_account_id_host_accounts_id_fk" FOREIGN KEY ("host_account_id") REFERENCES "public"."host_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mail_outbox_kind_idx" ON "mail_outbox" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "mail_outbox_host_account_idx" ON "mail_outbox" USING btree ("host_account_id");--> statement-breakpoint

-- Admin list of sent e-mail (/admin/epost): one page of mails without their bodies, the
-- total, counts per kind (ignoring the kind filter, so each option shows what it would
-- give) and the organisations that have mail.
CREATE FUNCTION public.parklet_admin_search_mail(
  p_q text, p_kind text, p_account uuid, p_sort text, p_limit integer, p_offset integer
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
      SELECT a.id, a.name, count(*) AS n FROM mail_outbox m JOIN host_accounts a ON a.id = m.host_account_id GROUP BY a.id, a.name) c), '[]'::jsonb)
  );
$$;
--> statement-breakpoint

-- Admin list of bookings (/admin/bokningar): one page with the spot, host account and
-- driver, the total and counts per status (ignoring the status filter). The date range
-- keeps bookings that overlap it; p_to is inclusive (the whole day).
CREATE FUNCTION public.parklet_admin_search_bookings(
  p_q text, p_status text, p_payment text, p_when text, p_from date, p_to date, p_city text, p_sort text, p_limit integer, p_offset integer
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
    WHERE (params.q IS NULL
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
  chosen AS (SELECT * FROM base WHERE p_status IS NULL OR status::text = p_status),
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
      'payment_provider', payment_provider, 'total_ore', total_ore, 'fee_ore', fee_ore, 'vehicle_reg', vehicle_reg,
      'vehicle_registration', vehicle_registration, 'created_at', created_at, 'confirmed_at', confirmed_at,
      'cancelled_at', cancelled_at, 'cancelled_by', cancelled_by,
      'spot_id', spot_id, 'spot_title', spot_title, 'spot_address', spot_address, 'spot_city', spot_city,
      'account_id', account_id, 'account_name', account_name, 'account_kind', account_kind,
      'driver_id', driver_id, 'driver_name', driver_name, 'driver_email', driver_email
    ) ORDER BY pos) FROM page), '[]'::jsonb),
    'total', (SELECT count(*) FROM chosen),
    'by_status', coalesce((SELECT jsonb_object_agg(status, n) FROM (SELECT status, count(*) AS n FROM base GROUP BY status) r), '{}'::jsonb),
    'cities', coalesce((SELECT jsonb_agg(jsonb_build_object('city', city, 'n', n) ORDER BY city) FROM (
      SELECT s.city, count(*) AS n FROM bookings b JOIN spots s ON s.id = b.spot_id GROUP BY s.city) c), '[]'::jsonb)
  );
$$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION
  public.parklet_admin_search_mail(text, text, uuid, text, integer, integer),
  public.parklet_admin_search_bookings(text, text, text, text, date, date, text, text, integer, integer)
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
                WHERE n.nspname = 'public' AND p.proname IN ('parklet_admin_search_mail', 'parklet_admin_search_bookings') LOOP
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

-- Let a running PostgREST see the new columns and functions (Supabase also does this by itself).
NOTIFY pgrst, 'reload schema';
