-- ═══════════════════════════════════════════════════════════════
--  HudJee waitlist table
--  Run once in the Supabase SQL editor.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.waitlist (
  id         uuid primary key default gen_random_uuid(),
  name       text,
  email      text not null unique,
  batch      text check (batch in ('class_11','class_12','dropper')),
  source     text default 'landing',
  invited_at timestamptz,
  created_at timestamptz not null default now()
);

-- If the table already exists from an earlier run, add the column:
alter table public.waitlist add column if not exists name text;

create index if not exists idx_waitlist_created on public.waitlist (created_at);
create index if not exists idx_waitlist_batch   on public.waitlist (batch);

alter table public.waitlist enable row level security;

-- Anonymous visitors may INSERT only. There is deliberately no
-- select/update/delete policy, so the anon key cannot read the list
-- back, edit it, or delete from it. Read it from the dashboard or
-- with the service-role key.
drop policy if exists "anon can join waitlist" on public.waitlist;
create policy "anon can join waitlist"
  on public.waitlist for insert to anon
  with check (
    email is not null
    and length(email) between 5 and 254
    and email like '%_@_%.__%'
    and (name is null or length(name) <= 80)
  );

-- Handy view for checking signups by batch.
create or replace view public.waitlist_summary as
  select
    coalesce(batch, 'unspecified') as batch,
    count(*)                       as signups,
    min(created_at)                as first_signup,
    max(created_at)                as latest_signup
  from public.waitlist
  group by 1
  order by 2 desc;

-- Queue position for one email. SECURITY DEFINER so it can count rows
-- the anon role cannot select, but it returns a single integer and
-- nothing else — no emails leak.
create or replace function public.waitlist_position(p_email text)
returns int
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::int
  from public.waitlist w
  where w.created_at <= (
    select created_at from public.waitlist where email = p_email
  );
$$;

revoke all on function public.waitlist_position(text) from public;
grant execute on function public.waitlist_position(text) to anon;

-- Total signups, for the live counter on the landing page.
-- Returns one integer; no row data is exposed.
create or replace function public.waitlist_count()
returns int
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::int from public.waitlist;
$$;

revoke all on function public.waitlist_count() from public;
grant execute on function public.waitlist_count() to anon;


-- ═══════════════════════════════════════════════════════════════
--  Email notification on every signup
--
--  Easiest path is the dashboard:
--    Database → Webhooks → Create a new hook
--      table: waitlist,  events: Insert
--      type: Supabase Edge Function → notify-signup
--      HTTP header: x-webhook-secret = <your WEBHOOK_SECRET>
--
--  If you would rather keep it in SQL, the trigger below does the
--  same thing. Replace <PROJECT_REF> and <WEBHOOK_SECRET> first.
-- ═══════════════════════════════════════════════════════════════

-- drop trigger if exists on_waitlist_insert_notify on public.waitlist;
-- create trigger on_waitlist_insert_notify
--   after insert on public.waitlist
--   for each row execute function supabase_functions.http_request(
--     'https://<PROJECT_REF>.supabase.co/functions/v1/notify-signup',
--     'POST',
--     '{"Content-Type":"application/json","x-webhook-secret":"<WEBHOOK_SECRET>"}',
--     '{}',
--     '5000'
--   );
