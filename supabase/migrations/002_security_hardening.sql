-- Move authorization helpers out of the exposed API schema and tune RLS policies.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

drop policy if exists profiles_select_own_or_managers on public.profiles;
drop policy if exists profiles_insert_managers on public.profiles;
drop policy if exists profiles_update_own_or_managers on public.profiles;
drop policy if exists committees_select_authenticated on public.committees;
drop policy if exists committees_write_upper_management on public.committees;
drop policy if exists positions_select_authenticated on public.positions;
drop policy if exists positions_write_upper_management on public.positions;
drop policy if exists announcements_select_allowed on public.announcements;
drop policy if exists announcements_write_authorized on public.announcements;
drop policy if exists discipline_select_own_or_authorized on public.discipline_records;
drop policy if exists discipline_insert_authorized on public.discipline_records;
drop policy if exists discipline_update_authorized on public.discipline_records;
drop policy if exists applications_manage_authorized on public.applications;
drop policy if exists regulations_select_authenticated on public.regulations;
drop policy if exists regulations_write_upper_management on public.regulations;
drop policy if exists youth_activities_select_authenticated on public.youth_activities;
drop policy if exists youth_activities_write_authorized on public.youth_activities;
drop policy if exists portal_settings_select_authenticated on public.portal_settings;
drop policy if exists portal_settings_write_upper_management on public.portal_settings;
drop policy if exists audit_logs_select_upper_management on public.audit_logs;

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists protect_profile_privileges_before_update on public.profiles;
drop trigger if exists audit_profiles on public.profiles;
drop trigger if exists audit_committees on public.committees;
drop trigger if exists audit_positions on public.positions;
drop trigger if exists audit_announcements on public.announcements;
drop trigger if exists audit_discipline_records on public.discipline_records;
drop trigger if exists audit_applications on public.applications;
drop trigger if exists audit_regulations on public.regulations;
drop trigger if exists audit_youth_activities on public.youth_activities;
drop trigger if exists audit_portal_settings on public.portal_settings;

drop function if exists public.handle_new_user();
drop function if exists public.protect_profile_privileges();
drop function if exists public.write_audit_log();
drop function if exists public.can_manage_youth();
drop function if exists public.can_manage_admissions();
drop function if exists public.can_manage_discipline();
drop function if exists public.can_view_discipline();
drop function if exists public.can_manage_announcements();
drop function if exists public.can_manage_members();
drop function if exists public.is_upper_management();
drop function if exists public.current_app_role();

create or replace function private.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function private.is_upper_management()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_app_role() = any (
    array['super_admin', 'president', 'vice_president']::public.app_role[]
  ), false);
$$;

create or replace function private.can_manage_members()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_app_role() = any (
    array['super_admin', 'president', 'vice_president', 'admission_officer']::public.app_role[]
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
    array['super_admin', 'president', 'vice_president', 'spokesperson', 'youth_chair']::public.app_role[]
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
    array['super_admin', 'president', 'vice_president', 'discipline_chair', 'discipline_member']::public.app_role[]
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
    array['super_admin', 'discipline_chair']::public.app_role[]
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
    array['super_admin', 'president', 'vice_president', 'admission_officer']::public.app_role[]
  ), false);
$$;

create or replace function private.can_manage_youth()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_app_role() = any (
    array['super_admin', 'president', 'vice_president', 'youth_chair']::public.app_role[]
  ), false);
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', 'Yeni Üye'),
    'pending'
  );
  return new;
end;
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
    raise exception 'Kullanıcı kendi rol veya durum yetkisini değiştiremez.';
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

    if actor_role = 'admission_officer'
      and old.role in ('member', 'guest')
      and new.role in ('member', 'guest') then
      return new;
    end if;

    raise exception 'Seçilen rolü atamak için yetkiniz bulunmuyor.';
  end if;

  if (
    new.status is distinct from old.status
    or new.committee_id is distinct from old.committee_id
  ) and (
    actor_role not in ('super_admin', 'president', 'vice_president', 'admission_officer')
    or old.role in ('super_admin', 'president')
  ) then
    raise exception 'Profil durumunu değiştirmek için yetkiniz bulunmuyor.';
  end if;

  return new;
end;
$$;

create or replace function private.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_id text;
begin
  if tg_op = 'DELETE' then
    row_id := old.id::text;
  else
    row_id := new.id::text;
  end if;

  insert into public.audit_logs (action, actor_id, target_type, target_id, details)
  values (
    lower(tg_op),
    auth.uid(),
    tg_table_name,
    row_id,
    jsonb_build_object('operation', tg_op)
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.current_app_role() to authenticated, service_role;
grant execute on function private.is_upper_management() to authenticated, service_role;
grant execute on function private.can_manage_members() to authenticated, service_role;
grant execute on function private.can_manage_announcements() to authenticated, service_role;
grant execute on function private.can_view_discipline() to authenticated, service_role;
grant execute on function private.can_manage_discipline() to authenticated, service_role;
grant execute on function private.can_manage_admissions() to authenticated, service_role;
grant execute on function private.can_manage_youth() to authenticated, service_role;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure private.handle_new_user();
create trigger protect_profile_privileges_before_update
  before update on public.profiles
  for each row execute procedure private.protect_profile_privileges();
create trigger audit_profiles after update on public.profiles
  for each row execute procedure private.write_audit_log();
create trigger audit_committees after insert or update on public.committees
  for each row execute procedure private.write_audit_log();
create trigger audit_positions after insert or update on public.positions
  for each row execute procedure private.write_audit_log();
create trigger audit_announcements after insert or update on public.announcements
  for each row execute procedure private.write_audit_log();
create trigger audit_discipline_records after insert or update on public.discipline_records
  for each row execute procedure private.write_audit_log();
create trigger audit_applications after insert or update on public.applications
  for each row execute procedure private.write_audit_log();
create trigger audit_regulations after update on public.regulations
  for each row execute procedure private.write_audit_log();
create trigger audit_youth_activities after insert or update on public.youth_activities
  for each row execute procedure private.write_audit_log();
create trigger audit_portal_settings after update on public.portal_settings
  for each row execute procedure private.write_audit_log();

create policy profiles_select_own_or_managers
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select private.can_manage_members())
    or (select private.can_view_discipline())
  );
create policy profiles_insert_managers
  on public.profiles for insert to authenticated
  with check ((select private.can_manage_members()));
create policy profiles_update_own_or_managers
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select private.can_manage_members()))
  with check (id = (select auth.uid()) or (select private.can_manage_members()));

create policy committees_select_authenticated
  on public.committees for select to authenticated using (true);
create policy committees_insert_upper_management
  on public.committees for insert to authenticated
  with check ((select private.is_upper_management()));
create policy committees_update_upper_management
  on public.committees for update to authenticated
  using ((select private.is_upper_management()))
  with check ((select private.is_upper_management()));

create policy positions_select_authenticated
  on public.positions for select to authenticated using (true);
create policy positions_insert_upper_management
  on public.positions for insert to authenticated
  with check ((select private.is_upper_management()));
create policy positions_update_upper_management
  on public.positions for update to authenticated
  using ((select private.is_upper_management()))
  with check ((select private.is_upper_management()));

create policy announcements_select_allowed
  on public.announcements for select to authenticated
  using (
    (select private.can_manage_announcements())
    or (
      status = 'published'
      and (
        audience = 'all_members'
        or (audience = 'management' and (select private.is_upper_management()))
        or (audience = 'discipline' and (select private.can_view_discipline()))
        or (
          audience = 'youth'
          and (select private.current_app_role()) = any (
            array['youth_chair', 'youth_member']::public.app_role[]
          )
        )
      )
    )
  );
create policy announcements_insert_authorized
  on public.announcements for insert to authenticated
  with check ((select private.can_manage_announcements()));
create policy announcements_update_authorized
  on public.announcements for update to authenticated
  using ((select private.can_manage_announcements()))
  with check ((select private.can_manage_announcements()));

create policy discipline_select_own_or_authorized
  on public.discipline_records for select to authenticated
  using (
    member_id = (select auth.uid())
    or (select private.can_view_discipline())
  );
create policy discipline_insert_authorized
  on public.discipline_records for insert to authenticated
  with check ((select private.can_manage_discipline()));
create policy discipline_update_authorized
  on public.discipline_records for update to authenticated
  using ((select private.can_manage_discipline()))
  with check ((select private.can_manage_discipline()));

create policy applications_select_authorized
  on public.applications for select to authenticated
  using ((select private.can_manage_admissions()));
create policy applications_insert_authorized
  on public.applications for insert to authenticated
  with check ((select private.can_manage_admissions()));
create policy applications_update_authorized
  on public.applications for update to authenticated
  using ((select private.can_manage_admissions()))
  with check ((select private.can_manage_admissions()));

create policy regulations_select_authenticated
  on public.regulations for select to authenticated using (true);
create policy regulations_insert_upper_management
  on public.regulations for insert to authenticated
  with check ((select private.is_upper_management()));
create policy regulations_update_upper_management
  on public.regulations for update to authenticated
  using ((select private.is_upper_management()))
  with check ((select private.is_upper_management()));

create policy youth_activities_select_authenticated
  on public.youth_activities for select to authenticated using (true);
create policy youth_activities_insert_authorized
  on public.youth_activities for insert to authenticated
  with check ((select private.can_manage_youth()));
create policy youth_activities_update_authorized
  on public.youth_activities for update to authenticated
  using ((select private.can_manage_youth()))
  with check ((select private.can_manage_youth()));

create policy portal_settings_select_authenticated
  on public.portal_settings for select to authenticated using (true);
create policy portal_settings_update_upper_management
  on public.portal_settings for update to authenticated
  using ((select private.is_upper_management()))
  with check ((select private.is_upper_management()));

create policy audit_logs_select_upper_management
  on public.audit_logs for select to authenticated
  using ((select private.is_upper_management()));

create index announcements_created_by_idx on public.announcements (created_by);
create index applications_created_by_idx on public.applications (created_by);
create index applications_suggested_committee_id_idx on public.applications (suggested_committee_id);
create index audit_logs_actor_id_idx on public.audit_logs (actor_id);
create index committees_chair_profile_id_idx on public.committees (chair_profile_id);
create index discipline_records_created_by_idx on public.discipline_records (created_by);
create index discipline_records_member_id_idx on public.discipline_records (member_id);
create index portal_settings_updated_by_idx on public.portal_settings (updated_by);
create index positions_assigned_profile_id_idx on public.positions (assigned_profile_id);
create index positions_committee_id_idx on public.positions (committee_id);
create index profiles_committee_id_idx on public.profiles (committee_id);
create index regulations_updated_by_idx on public.regulations (updated_by);
create index youth_activities_created_by_idx on public.youth_activities (created_by);
