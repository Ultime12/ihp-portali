alter table public.profiles drop constraint if exists profiles_anonymous_display_name;

create or replace function private.can_manage_members()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_app_role() = any (
    array[
      'super_admin',
      'president',
      'vice_president',
      'presidential_aide',
      'admission_officer',
      'discipline_admission_officer',
      'chief_representative'
    ]::public.app_role[]
  ), false);
$$;

create or replace function private.can_manage_announcements()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_app_role() = any (
    array[
      'super_admin',
      'president',
      'vice_president',
      'presidential_aide',
      'spokesperson',
      'youth_chair'
    ]::public.app_role[]
  ), false);
$$;

create or replace function private.can_view_discipline()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_app_role() = any (
    array[
      'super_admin',
      'president',
      'vice_president',
      'discipline_chair',
      'discipline_vice_chair',
      'discipline_admission_officer',
      'discipline_member'
    ]::public.app_role[]
  ), false);
$$;

create or replace function private.can_manage_discipline()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_app_role() = any (
    array['super_admin', 'discipline_chair', 'discipline_vice_chair', 'discipline_admission_officer']::public.app_role[]
  ), false);
$$;

create or replace function private.can_manage_admissions()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_app_role() = any (
    array[
      'super_admin',
      'president',
      'vice_president',
      'admission_officer',
      'discipline_admission_officer'
    ]::public.app_role[]
  ), false);
$$;

create or replace function private.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.app_role;
begin
  if auth.uid() is null then
    return new;
  end if;

  actor_role := private.current_app_role();

  if auth.uid() = old.id and (
    new.role is distinct from old.role
    or new.status is distinct from old.status
    or new.committee_id is distinct from old.committee_id
  ) then
    raise exception 'Kullanici kendi rol veya durum yetkisini degistiremez.';
  end if;

  if new.role is distinct from old.role then
    if actor_role = 'super_admin' then
      return new;
    end if;

    if actor_role = 'president'
      and old.role not in ('super_admin', 'president')
      and new.role not in ('super_admin', 'president') then
      return new;
    end if;

    if actor_role = 'vice_president'
      and old.role not in ('super_admin', 'president', 'vice_president')
      and new.role not in ('super_admin', 'president', 'vice_president', 'discipline_chair') then
      return new;
    end if;

    if actor_role = 'presidential_aide'
      and old.role not in ('super_admin', 'president', 'vice_president', 'presidential_aide')
      and new.role not in ('super_admin', 'president', 'vice_president', 'presidential_aide', 'discipline_chair', 'discipline_admission_officer') then
      return new;
    end if;

    if actor_role in ('admission_officer', 'discipline_admission_officer')
      and old.role in ('member', 'guest', 'representative')
      and new.role in ('member', 'guest', 'representative') then
      return new;
    end if;

    if actor_role = 'chief_representative'
      and old.role in ('member', 'guest', 'representative')
      and new.role in ('member', 'guest', 'representative') then
      return new;
    end if;

    raise exception 'Secilen rolu atamak icin yetkiniz bulunmuyor.';
  end if;

  if (
    new.status is distinct from old.status
    or new.committee_id is distinct from old.committee_id
  ) and (
    actor_role not in (
      'super_admin',
      'president',
      'vice_president',
      'presidential_aide',
      'admission_officer',
      'discipline_admission_officer',
      'chief_representative'
    )
    or old.role in ('super_admin', 'president')
  ) then
    raise exception 'Profil durumunu degistirmek icin yetkiniz bulunmuyor.';
  end if;

  return new;
end;
$$;
