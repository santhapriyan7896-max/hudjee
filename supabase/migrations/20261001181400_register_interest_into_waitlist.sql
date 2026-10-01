-- Applied to the live project (cvqzcpehxiapkkamhsbm) on 2026-10-01.
--
-- The site's form saves through register_interest(). It wrote to
-- pre_registrations, which has no welcome-email webhook, so signups from the
-- new site never got one. Point it at waitlist (which fires notify-signup and
-- the live count on insert), give waitlist the columns the form sends, and
-- bring across what pre_registrations collected. pre_registrations is kept.

alter table public.waitlist
  add column if not exists exam_year  smallint,
  add column if not exists platform   text,
  add column if not exists utm        jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table public.waitlist
  add constraint waitlist_exam_year check (exam_year is null or exam_year between 2026 and 2035),
  add constraint waitlist_platform  check (platform is null or platform in ('android', 'ios')),
  add constraint waitlist_utm_size  check (utm is null or pg_column_size(utm) <= 2048);

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

-- people already on the waitlist who also answered the new form: keep their
-- row, fill in the answers (an update, so no second email)
update public.waitlist w set
  name       = coalesce(w.name, p.name),
  exam_year  = coalesce(w.exam_year, p.exam_year),
  platform   = coalesce(w.platform, p.platform),
  utm        = coalesce(w.utm, p.utm),
  updated_at = now()
from public.pre_registrations p
where lower(w.email) = lower(p.email);

-- people only in pre_registrations: add them with their original signup time
-- (each insert sends the welcome email they missed)
insert into public.waitlist (email, name, exam_year, platform, source, utm, created_at)
select p.email, p.name, p.exam_year, p.platform, coalesce(p.source, 'landing'), p.utm, p.created_at
from public.pre_registrations p
where not exists (select 1 from public.waitlist w where lower(w.email) = lower(p.email));
