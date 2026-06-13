alter table public.profiles
  add column if not exists member_code text,
  add column if not exists is_system_account boolean not null default false;

alter table public.portal_settings
  add column if not exists logo_url text;

create or replace function private.generate_member_code()
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  candidate text;
begin
  loop
    candidate := lpad((floor(random() * 900000)::int + 100000)::text, 6, '0');
    exit when not exists (
      select 1
      from public.profiles p
      where p.member_code = candidate
    );
  end loop;
  return candidate;
end;
$$;

create or replace function private.assign_member_code()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if lower(coalesce(new.email, '')) = 'giris@tfo.k12.tr' then
    new.is_system_account := true;
  end if;

  if coalesce(new.is_system_account, false) then
    new.member_code := null;
    return new;
  end if;

  if new.member_code is null or new.member_code !~ '^[0-9]{6}$' then
    new.member_code := private.generate_member_code();
  end if;

  return new;
end;
$$;

drop trigger if exists assign_member_code_before_write on public.profiles;
create trigger assign_member_code_before_write
  before insert or update of email, is_system_account, member_code
  on public.profiles
  for each row
  execute function private.assign_member_code();

select set_config('app.bypass_profile_protection', 'on', true);

update public.profiles
set is_system_account = true,
    member_code = null
where lower(coalesce(email, '')) = 'giris@tfo.k12.tr';

update public.profiles
set member_code = private.generate_member_code()
where coalesce(is_system_account, false) = false
  and member_code is null;

create unique index if not exists profiles_member_code_unique_idx
  on public.profiles(member_code)
  where member_code is not null;

alter table public.profiles
  drop constraint if exists profiles_member_code_format;

alter table public.profiles
  add constraint profiles_member_code_format
  check (
    member_code is null
    or member_code ~ '^[0-9]{6}$'
  );

create table if not exists public.executive_committee_members (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  added_at timestamptz not null default now()
);

alter table public.executive_committee_members enable row level security;

drop policy if exists executive_committee_members_select_authenticated on public.executive_committee_members;
drop policy if exists executive_committee_members_manage_presidency on public.executive_committee_members;

create policy executive_committee_members_select_authenticated
  on public.executive_committee_members
  for select
  to authenticated
  using (true);

create policy executive_committee_members_manage_presidency
  on public.executive_committee_members
  for all
  to authenticated
  using (private.has_any_role(array['super_admin', 'president']::public.app_role[]))
  with check (private.has_any_role(array['super_admin', 'president']::public.app_role[]));

grant select, insert, update, delete on public.executive_committee_members to authenticated;
grant all on public.executive_committee_members to service_role;

create or replace function private.is_entry_access_account()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_system_account = true
      and lower(coalesce(p.email, '')) = 'giris@tfo.k12.tr'
      and p.status = 'active'
  );
$$;

grant execute on function private.is_entry_access_account() to authenticated, service_role;

drop policy if exists access_checkins_select_authorized on public.access_checkins;

create policy access_checkins_select_authorized
  on public.access_checkins
  for select
  to authenticated
  using (
    member_id = (select auth.uid())
    or requested_by = (select auth.uid())
    or private.is_entry_access_account()
  );
