create or replace function private.current_app_roles()
returns public.app_role[]
language sql
stable
security definer
set search_path to 'public', 'auth'
as $$
  select coalesce(
    (
      select case
        when p.roles is null or cardinality(p.roles) = 0 then array[p.role]
        when p.role = any(p.roles) then p.roles
        else p.roles || p.role
      end
      from public.profiles p
      where p.id = auth.uid()
    ),
    array[]::public.app_role[]
  );
$$;

create or replace function private.has_any_role(allowed public.app_role[])
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
as $$
  select coalesce(private.current_app_roles() && allowed, false);
$$;

grant execute on function private.current_app_roles() to authenticated, service_role;
grant execute on function private.has_any_role(public.app_role[]) to authenticated, service_role;

alter table public.profiles
  add column if not exists suspended_until timestamptz,
  add column if not exists suspension_note text not null default '';

create index if not exists profiles_suspended_until_idx
  on public.profiles(suspended_until);

alter table public.discipline_records
  add column if not exists sanction_days integer,
  add column if not exists sanction_until timestamptz;

alter table public.discipline_records
  drop constraint if exists discipline_records_sanction_effect_allowed;

alter table public.discipline_records
  add constraint discipline_records_sanction_effect_allowed
  check (sanction_effect in ('none', 'points_only', 'reward_points', 'remove_roles', 'suspend_member', 'party_suspension', 'passive_member'));

alter table public.discipline_records
  drop constraint if exists discipline_records_sanction_days_range;

alter table public.discipline_records
  add constraint discipline_records_sanction_days_range
  check (sanction_days is null or sanction_days between 1 and 365);

create index if not exists discipline_records_sanction_until_idx
  on public.discipline_records(sanction_until);

create table if not exists public.access_checkins (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  code_hash text not null,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  approved_at timestamptz,
  note text not null default '',
  constraint access_checkins_status_allowed check (status in ('pending', 'approved', 'expired', 'cancelled')),
  constraint access_checkins_code_hash_length check (char_length(code_hash) = 64)
);

alter table public.access_checkins enable row level security;

create index if not exists access_checkins_member_id_idx
  on public.access_checkins(member_id);
create index if not exists access_checkins_requested_by_idx
  on public.access_checkins(requested_by);
create index if not exists access_checkins_status_requested_at_idx
  on public.access_checkins(status, requested_at desc);

drop policy if exists access_checkins_select_authorized on public.access_checkins;

create policy access_checkins_select_authorized
  on public.access_checkins
  for select
  using (
    member_id = (select auth.uid())
    or requested_by = (select auth.uid())
    or private.has_any_role(array[
      'super_admin',
      'president',
      'vice_president',
      'presidential_aide',
      'discipline_chair',
      'discipline_vice_chair',
      'discipline_member'
    ]::public.app_role[])
  );

revoke all on table public.access_checkins from authenticated;
grant select (
  id,
  member_id,
  requested_by,
  status,
  requested_at,
  expires_at,
  approved_at,
  note
) on public.access_checkins to authenticated;
grant all on public.access_checkins to service_role;
