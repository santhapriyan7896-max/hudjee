-- ═══════════════════════════════════════════════════════════════
--  HudJee waitlist — table, RLS, RPCs, live-counter broadcast.
--
--  Paste the whole file into the Supabase SQL editor and run it.
--  It is idempotent: safe to run on a fresh project, and safe to
--  re-run over an existing one. Nothing here drops data.
--
--  After running, jump to the very bottom — the last statement
--  prints a checklist telling you what exists and what doesn't.
-- ═══════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────
--  1. Table
-- ───────────────────────────────────────────────────────────────

create table if not exists public.waitlist (
  id         uuid primary key default gen_random_uuid(),
  name       text,
  email      text not null unique,
  batch      text check (batch in ('class_11','class_12','dropper')),
  source     text default 'landing',
  invited_at timestamptz,
  created_at timestamptz not null default now()
);

-- Columns added after the first version shipped.
alter table public.waitlist add column if not exists name text;

create index if not exists idx_waitlist_created on public.waitlist (created_at);
create index if not exists idx_waitlist_batch   on public.waitlist (batch);

-- Case-insensitive uniqueness. Without this, Priya@gmail.com and
-- priya@gmail.com are two people to Postgres and one person to Gmail,
-- so the same student gets two welcome emails and takes two queue slots.
--
-- Wrapped, because if the table already holds case-duplicates the index
-- can't be built — and that must not abort the rest of this script. The
-- warning tells you exactly which addresses to merge by hand.
do $$
begin
  create unique index if not exists idx_waitlist_email_lower
    on public.waitlist (lower(email));
exception when unique_violation then
  raise warning
    'Skipped idx_waitlist_email_lower: existing rows differ only by case. Run: select lower(email), count(*) from public.waitlist group by 1 having count(*) > 1;';
end $$;


-- ───────────────────────────────────────────────────────────────
--  2. Row-level security
--
--  Anonymous visitors may INSERT and nothing else. There is
--  deliberately no select/update/delete policy, so the public anon
--  key cannot read the list back, edit it, or delete from it.
--  Read signups from the dashboard or with the service-role key.
-- ───────────────────────────────────────────────────────────────

alter table public.waitlist enable row level security;

drop policy if exists "anon can join waitlist" on public.waitlist;
create policy "anon can join waitlist"
  on public.waitlist for insert to anon
  with check (
    email is not null
    and length(email) between 5 and 254
    and email like '%_@_%.__%'
    and (name is null or length(name) <= 80)
    and (source is null or length(source) <= 40)
  );

-- Column-level lockdown on top of the policy. Without this, anyone
-- can POST their own `created_at` or `invited_at` and jump the queue,
-- because the RLS policy above never looks at those columns.
revoke all on table public.waitlist from anon;
grant insert (name, email, batch, source) on table public.waitlist to anon;


-- ───────────────────────────────────────────────────────────────
--  3. Read-only RPCs
--
--  "RPC" = a SQL function the browser calls over HTTPS. Both of
--  these are SECURITY DEFINER, meaning they run with the owner's
--  rights and can therefore count rows the anon role cannot select.
--  Each returns a single integer and nothing else, so no email
--  address can leak through them.
-- ───────────────────────────────────────────────────────────────

-- Total signups — this is what the live counter on the landing page reads.
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
grant execute on function public.waitlist_count() to anon, authenticated;

-- Queue position for one email, shown on the confirmation card.
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
    select created_at
    from public.waitlist
    where lower(email) = lower(p_email)
    limit 1
  );
$$;

revoke all on function public.waitlist_position(text) from public;
grant execute on function public.waitlist_position(text) to anon, authenticated;

-- Handy view for checking signups by batch (service-role / dashboard only).
create or replace view public.waitlist_summary as
  select
    coalesce(batch, 'unspecified') as batch,
    count(*)                       as signups,
    min(created_at)                as first_signup,
    max(created_at)                as latest_signup
  from public.waitlist
  group by 1
  order by 2 desc;

revoke all on public.waitlist_summary from anon, authenticated;


-- ───────────────────────────────────────────────────────────────
--  4. Live counter — websocket broadcast
--
--  On every insert this pushes the new total onto a PUBLIC Realtime
--  channel called `waitlist`, so every open landing page updates the
--  moment somebody joins instead of waiting for the next poll.
--
--  Public is fine here: the only thing on the wire is one integer
--  that the page already shows to everyone. No row data is sent.
--
--  The landing page listens with a ~70-line raw WebSocket client
--  (src/lib/realtime.ts) — no supabase-js on the page.
-- ───────────────────────────────────────────────────────────────

create or replace function public.waitlist_broadcast()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  select count(*)::int into n from public.waitlist;
  perform realtime.send(
    jsonb_build_object('count', n),
    'signup',      -- event name the client filters on
    'waitlist',    -- channel: clients join "realtime:waitlist"
    false          -- public channel — no auth handshake needed to listen
  );
  return null;
exception when others then
  -- A broadcast is a nicety. It must never roll back somebody's signup.
  raise warning 'waitlist_broadcast failed: %', sqlerrm;
  return null;
end;
$$;

-- Statement-level, not row-level: we broadcast one total, not one
-- message per row, so a bulk import sends a single update.
drop trigger if exists on_waitlist_broadcast on public.waitlist;
create trigger on_waitlist_broadcast
  after insert on public.waitlist
  for each statement execute function public.waitlist_broadcast();


-- ───────────────────────────────────────────────────────────────
--  5. Signup emails
--
--  The `notify-signup` Edge Function sends two emails per signup:
--  a welcome to the student, and a notification to hudjee26@gmail.com.
--
--  Wire it up in the dashboard — Database → Webhooks → Create a new hook
--      table:  waitlist
--      events: Insert
--      type:   Supabase Edge Function → notify-signup
--      header: x-webhook-secret = <your WEBHOOK_SECRET>
--
--  Or uncomment the SQL trigger below and fill in the two placeholders.
--  The dashboard route is easier and easier to debug; use it unless you
--  have a reason not to.
-- ───────────────────────────────────────────────────────────────

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


-- ───────────────────────────────────────────────────────────────
--  6. Checklist — the result of this query is your setup status.
--     Every row should say OK. Anything else tells you what to fix.
-- ───────────────────────────────────────────────────────────────

select 'waitlist table' as thing,
       case when to_regclass('public.waitlist') is not null
            then 'OK' else 'MISSING' end as status
union all
select 'row-level security',
       case when (select relrowsecurity from pg_class
                  where oid = 'public.waitlist'::regclass)
            then 'OK — enabled' else 'OFF — anyone can read your list' end
union all
select 'waitlist_count() rpc',
       case when has_function_privilege('anon', 'public.waitlist_count()', 'execute')
            then 'OK — counter will work' else 'NOT GRANTED to anon' end
union all
select 'waitlist_position() rpc',
       case when has_function_privilege('anon', 'public.waitlist_position(text)', 'execute')
            then 'OK' else 'NOT GRANTED to anon' end
union all
select 'anon can read rows?',
       case when has_table_privilege('anon', 'public.waitlist', 'select')
            then 'BAD — revoke select from anon' else 'OK — insert only' end
union all
select 'realtime broadcast trigger',
       case when exists (select 1 from pg_trigger
                         where tgname = 'on_waitlist_broadcast' and not tgisinternal)
            then 'OK — counter updates live' else 'MISSING' end
union all
select 'realtime.send available',
       case when exists (select 1 from pg_proc p
                         join pg_namespace n on n.oid = p.pronamespace
                         where n.nspname = 'realtime' and p.proname = 'send')
            then 'OK' else 'MISSING — enable Realtime for this project' end
union all
select 'signups so far', (select count(*)::text from public.waitlist);
