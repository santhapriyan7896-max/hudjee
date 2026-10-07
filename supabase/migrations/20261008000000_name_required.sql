-- Not yet applied to the live project (cvqzcpehxiapkkamhsbm).
--
-- The form asks for a name with the email now, and won't send one without it.
--  * a new address without a name is refused as 'name_required', so the rule
--    holds for anything that calls register_interest(), not just the page.
--  * the name no longer counts as a follow-up answer: a repeat signup from the
--    email step carries a name now, and should still hear 'already_registered'
--    rather than being treated as a follow-up and shown the next step.
--
-- Ship the page first: the page live before it sends no name, and every new
-- signup from it would be refused. Anyone with that page still open when this
-- lands has to reload it to register.

create or replace function public.register_interest(
  p_email text,
  p_name text default null,
  p_exam_year integer default null,
  p_platform text default null,
  p_source text default null,
  p_utm jsonb default null,
  p_trap text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_email    text := lower(btrim(coalesce(p_email, '')));
  v_name     text := nullif(left(btrim(coalesce(p_name, '')), 80), '');
  v_year     smallint := case when p_exam_year between 2026 and 2035 then p_exam_year end;
  v_platform text := case when lower(p_platform) in ('android', 'ios') then lower(p_platform) end;
  v_source   text := nullif(left(btrim(coalesce(p_source, '')), 40), '');
  -- the follow-up answers; the name comes with the email now, so it isn't one
  v_details  boolean := v_year is not null or v_platform is not null;
  v_exists   boolean;
  v_utm      jsonb;
begin
  -- the form's hidden field: only bots fill it; tell them it worked
  if nullif(btrim(coalesce(p_trap, '')), '') is not null then
    return jsonb_build_object('ok', true);
  end if;

  if length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or email_domain_is_typo(split_part(v_email, '@', 2)) then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;

  v_exists := exists (select 1 from waitlist where lower(email) = v_email);

  -- the email step for an address already on the list: say so
  if v_exists and not v_details then
    return jsonb_build_object('ok', false, 'error', 'already_registered');
  end if;

  -- a new address needs a name: the welcome email greets them by it
  if not v_exists and v_name is null then
    return jsonb_build_object('ok', false, 'error', 'name_required');
  end if;

  -- a new address during a flood is turned away
  if not v_exists
     and (select count(*) from waitlist where created_at > now() - interval '10 minutes') >= 60 then
    return jsonb_build_object('ok', false, 'error', 'busy');
  end if;

  -- only the campaign tags, each cut short
  if jsonb_typeof(p_utm) = 'object' then
    select jsonb_object_agg(key, left(value, 100))
      into v_utm
      from jsonb_each_text(p_utm)
     where key in ('utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'referrer')
       and value <> '';
  end if;

  -- First call inserts with the name (and the welcome email goes out); the
  -- follow-up answers arrive as a second call and only fill in what's still empty.
  insert into waitlist as w (email, name, exam_year, platform, source, utm)
  values (v_email, v_name, v_year, v_platform, coalesce(v_source, 'landing'), v_utm)
  on conflict ((lower(email))) do update set
    name       = coalesce(w.name, excluded.name),
    exam_year  = coalesce(w.exam_year, excluded.exam_year),
    platform   = coalesce(w.platform, excluded.platform),
    utm        = coalesce(w.utm, excluded.utm),
    updated_at = now();

  return jsonb_build_object('ok', true);
end;
$function$;
