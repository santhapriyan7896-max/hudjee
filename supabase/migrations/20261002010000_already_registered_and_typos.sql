-- Applied to the live project (cvqzcpehxiapkkamhsbm) on 2026-10-02.
--
-- Two answers register_interest() didn't give before:
--  * an address already on the list is told so ('already_registered') rather
--    than silently updated; the follow-up answers (name / year / platform) for
--    someone who just signed up still save as before.
--  * obvious domain typos (gmail.con, gmial.com, ...) are refused as
--    'invalid_email', so the form asks the person to check for typos instead
--    of saving an address no welcome email can ever reach.

create or replace function public.email_domain_is_typo(p_domain text)
returns boolean
language sql
immutable
set search_path to 'public'
as $function$
  select
    -- top-level domains that don't exist but are one keystroke from .com
    -- (.cm and .om are real: Cameroon, Oman)
    p_domain ~ '\.(con|cmo|ocm|comm|cpm|xom|vom|cim)$'
    -- the big mail providers, misspelt
    or p_domain in (
      'gmail.co', 'gmail.c', 'gmail.coom', 'gmail.comm', 'gmai.com', 'gmial.com', 'gamil.com', 'gnail.com',
      'gmal.com', 'gmil.com', 'gmaill.com', 'gmali.com', 'gimail.com', 'gemail.com', 'gmeil.com', 'gmsil.com',
      'gmail.cm', 'gmail.om',
      'yahoo.co', 'yaho.com', 'yahooo.com', 'yhoo.com', 'yahoo.cm',
      'hotmail.co', 'hotmial.com', 'hotmai.com', 'hotmal.com', 'homail.com',
      'outlook.co', 'outlok.com', 'outloo.com', 'outllook.com',
      'icloud.co', 'iclod.com', 'icoud.com'
    );
$function$;

revoke execute on function public.email_domain_is_typo(text) from public, anon, authenticated;

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
  v_details  boolean := v_name is not null or v_year is not null or v_platform is not null;
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

  -- First call inserts (and the welcome email goes out); the follow-up answers
  -- arrive as a second call and only fill in what's still empty.
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
