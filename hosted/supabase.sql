-- Run once in this project's Supabase SQL editor. No public table policies exist.
-- Only the Vercel function's service-role key may access these tables.
create extension if not exists pgcrypto;

create table if not exists public.fridgeops_web_sessions (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null,
  revision integer not null default 1 check (revision >= 1),
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fridgeops_web_state_object check (jsonb_typeof(state) = 'object')
);
create index if not exists fridgeops_web_sessions_owner_updated
  on public.fridgeops_web_sessions(visitor_id, updated_at desc);
alter table public.fridgeops_web_sessions enable row level security;
revoke all on public.fridgeops_web_sessions from anon, authenticated;
grant select, insert, update on public.fridgeops_web_sessions to service_role;

create table if not exists public.fridgeops_web_usage (
  day date not null,
  visitor_id uuid not null,
  used integer not null default 0 check (used >= 0),
  primary key (day, visitor_id)
);
alter table public.fridgeops_web_usage enable row level security;
revoke all on public.fridgeops_web_usage from anon, authenticated;
grant select, insert, update on public.fridgeops_web_usage to service_role;

-- One physical Gemini start consumes one admission even if the request fails.
-- The lock makes the 20/day global and 4/day per-visitor limits atomic.
create or replace function public.fridgeops_claim_attempt(p_visitor uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  today_utc date := (now() at time zone 'utc')::date;
  global_used integer;
  visitor_used integer;
begin
  if p_visitor is null then return false; end if;
  perform pg_advisory_xact_lock(hashtext('fridgeops-web-' || today_utc::text));
  select coalesce(sum(used), 0) into global_used
    from public.fridgeops_web_usage where day = today_utc;
  select coalesce(used, 0) into visitor_used
    from public.fridgeops_web_usage
    where day = today_utc and visitor_id = p_visitor;
  if global_used >= 20 or visitor_used >= 4 then return false; end if;
  insert into public.fridgeops_web_usage(day, visitor_id, used)
  values (today_utc, p_visitor, 1)
  on conflict (day, visitor_id) do update
    set used = public.fridgeops_web_usage.used + 1;
  return true;
end;
$$;
revoke all on function public.fridgeops_claim_attempt(uuid) from public, anon, authenticated;
grant execute on function public.fridgeops_claim_attempt(uuid) to service_role;
