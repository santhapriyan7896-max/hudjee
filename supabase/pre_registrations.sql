-- ── PRE-REGISTRATIONS ────────────────────────────────────────────────────────
--
-- The backend this page writes to: one table and one function, in the HudJee
-- app's Supabase project. It is already applied there, through the app repo's
-- migrations 20261001000000_pre_registrations.sql and
-- 20261001010000_pre_registrations_email_only.sql. This file is their end state,
-- so the page's contract can be read alongside the page. Change it in the app
-- repo, not here.
--
-- A visitor is not a user, so the table grants nothing to the client; the page
-- writes only through register_interest(), which validates, normalises and
-- de-duplicates. Registering again fills in answers left blank and changes
-- nothing else, and the answer is the same whether the address was new or not,
-- so the function cannot be used to check who has registered. Email only: phone
-- numbers are not collected.
--
-- Safe to re-run: on the project it describes, it changes nothing.

CREATE TABLE IF NOT EXISTS public.pre_registrations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  name        TEXT,
  exam_year   SMALLINT,
  platform    TEXT,
  -- Which form on the page it came from ('hero' or 'closing'), and the campaign
  -- tags the visit arrived with (utm_* and the referring host).
  source      TEXT,
  utm         JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pre_registrations_email_shape CHECK (
    email = lower(email) AND length(email) <= 254 AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  CONSTRAINT pre_registrations_name_length CHECK (name IS NULL OR length(name) BETWEEN 1 AND 80),
  CONSTRAINT pre_registrations_exam_year CHECK (exam_year IS NULL OR exam_year BETWEEN 2026 AND 2035),
  CONSTRAINT pre_registrations_platform CHECK (platform IS NULL OR platform IN ('android', 'ios')),
  CONSTRAINT pre_registrations_source_length CHECK (source IS NULL OR length(source) <= 40),
  CONSTRAINT pre_registrations_utm_size CHECK (utm IS NULL OR pg_column_size(utm) <= 2048)
);

CREATE INDEX IF NOT EXISTS pre_registrations_created_at_idx
  ON public.pre_registrations (created_at DESC);

ALTER TABLE public.pre_registrations ENABLE ROW LEVEL SECURITY;
-- No policies, on purpose: the client never touches the rows.
REVOKE ALL ON public.pre_registrations FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pre_registrations TO service_role;

-- Returns {"ok": true} for a registration, new or repeated, and
-- {"ok": false, "error": "invalid_email"} for an address it cannot read.
-- p_trap is the form's hidden honeypot: people never see it, form-filling bots
-- fill it in, and they are told it worked so they do not try again.
CREATE OR REPLACE FUNCTION public.register_interest(
  p_email     TEXT,
  p_name      TEXT DEFAULT NULL,
  p_exam_year INTEGER DEFAULT NULL,
  p_platform  TEXT DEFAULT NULL,
  p_source    TEXT DEFAULT NULL,
  p_utm       JSONB DEFAULT NULL,
  p_trap      TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_email    TEXT := lower(btrim(coalesce(p_email, '')));
  v_name     TEXT := nullif(left(btrim(coalesce(p_name, '')), 80), '');
  v_year     SMALLINT := CASE WHEN p_exam_year BETWEEN 2026 AND 2035 THEN p_exam_year END;
  v_platform TEXT := CASE WHEN lower(p_platform) IN ('android', 'ios') THEN lower(p_platform) END;
  v_source   TEXT := nullif(left(btrim(coalesce(p_source, '')), 40), '');
  v_utm      JSONB;
BEGIN
  IF nullif(btrim(coalesce(p_trap, '')), '') IS NOT NULL THEN
    RETURN jsonb_build_object('ok', TRUE);
  END IF;

  IF length(v_email) > 254 OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_email');
  END IF;

  -- Only the campaign tags, each cut short.
  IF jsonb_typeof(p_utm) = 'object' THEN
    SELECT jsonb_object_agg(key, left(value, 100))
      INTO v_utm
      FROM jsonb_each_text(p_utm)
     WHERE key IN ('utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'referrer')
       AND value <> '';
  END IF;

  INSERT INTO pre_registrations AS r (email, name, exam_year, platform, source, utm)
  VALUES (v_email, v_name, v_year, v_platform, v_source, v_utm)
  ON CONFLICT (email) DO UPDATE SET
    name       = coalesce(r.name, excluded.name),
    exam_year  = coalesce(r.exam_year, excluded.exam_year),
    platform   = coalesce(r.platform, excluded.platform),
    updated_at = NOW();

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.register_interest(TEXT, TEXT, INTEGER, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_interest(TEXT, TEXT, INTEGER, TEXT, TEXT, JSONB, TEXT) TO anon, authenticated;
