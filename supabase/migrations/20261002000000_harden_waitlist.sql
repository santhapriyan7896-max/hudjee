-- Applied to the live project (cvqzcpehxiapkkamhsbm) on 2026-10-02.

-- 1. waitlist_position: the email function (service_role) needs it for the
--    queue number in the welcome email, and was refused (403). The public had
--    it instead, which let anyone check whether an address is on the list.
grant execute on function public.waitlist_position(text) to service_role;
revoke execute on function public.waitlist_position(text) from public, anon, authenticated;

-- the broadcast function only ever runs as a trigger
revoke execute on function public.waitlist_broadcast() from public, anon, authenticated;

-- 2. waitlist_summary: signup counts by batch, for the dashboard only
alter view public.waitlist_summary set (security_invoker = true);
revoke all on public.waitlist_summary from anon, authenticated;

-- 3. the only way in is register_interest() (validation + bot trap); the old
--    site's direct insert path goes, along with the table grants RLS was
--    already guarding
drop policy if exists "anon can join waitlist" on public.waitlist;
revoke all on public.waitlist from anon, authenticated;

-- 4. a flood limit: at most 60 new signups per 10 minutes across the site, so
--    a script can't make the welcome email go to thousands of strangers.
--    Updates to an existing signup (the follow-up answers) aren't counted.
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
  v_utm      jsonb;
begin
  -- the form's hidden field: only bots fill it; tell them it worked
  if nullif(btrim(coalesce(p_trap, '')), '') is not null then
    return jsonb_build_object('ok', true);
  end if;

  if length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;

  -- a new address during a flood is turned away; one already on the list
  -- (its follow-up answers) always gets through
  if not exists (select 1 from waitlist where lower(email) = v_email)
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
