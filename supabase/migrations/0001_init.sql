-- Line Inbox. RLS is off for the hackathon evening so the anon key can read and write.
-- Do not enable this pattern outside tonight's demo.

create table if not exists public.calls (
  id text primary key,
  source text not null check (source in ('phone','dwelly','synthetic')),
  started_at timestamptz not null,
  duration_s int,
  out_of_hours boolean not null default false,
  weekday text,
  caller_initials text,
  transcript text not null,
  raw jsonb,
  created_at timestamptz default now()
);

create table if not exists public.records (
  id text primary key,
  call_id text references public.calls(id) on delete cascade,
  type text not null check (type in ('maintenance','viewing','let','arrears','general')),
  priority text not null check (priority in ('urgent','today','week')),
  property text,
  issue text,
  callback_confirmed boolean default false,
  safety_check text,
  summary text not null,
  created_at timestamptz default now()
);

create table if not exists public.actions (
  id uuid primary key default gen_random_uuid(),
  record_id text references public.records(id) on delete cascade,
  action text not null,
  due timestamptz,
  done boolean default false,
  created_at timestamptz default now()
);

create or replace view public.kpi
with (security_invoker = true) as
select
  count(*)::int as calls,
  round(100.0 * avg(case when out_of_hours then 1 else 0 end))::int as out_of_hours_pct,
  (select count(*) from public.records r join public.actions a on a.record_id = r.id where r.priority = 'urgent' and not a.done)::int as urgent_open,
  round((select count(*) from public.records) * 4.0 / 60, 1) as hours_saved
from public.calls;

alter table public.calls disable row level security;
alter table public.records disable row level security;
alter table public.actions disable row level security;

grant select, insert, update, delete on public.calls, public.records, public.actions to anon, authenticated, service_role;
grant select on public.kpi to anon, authenticated, service_role;

do $$
begin
  alter publication supabase_realtime add table public.calls;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.records;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.actions;
exception
  when duplicate_object then null;
end $$;
