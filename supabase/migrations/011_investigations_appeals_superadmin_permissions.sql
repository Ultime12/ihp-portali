alter table public.complaints
  add column if not exists evidence_note text not null default '',
  add column if not exists evidence_file text not null default '',
  add column if not exists evidence_filename text not null default '';

create table if not exists public.investigations (
  id uuid primary key default gen_random_uuid(),
  subject_profile_id uuid not null references public.profiles(id) on delete cascade,
  opened_by uuid references public.profiles(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  status text not null default 'open',
  title text not null,
  description text not null,
  evidence_note text not null default '',
  evidence_file text not null default '',
  evidence_filename text not null default '',
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint investigations_status_allowed check (status in ('open', 'reviewing', 'closed', 'cancelled')),
  constraint investigations_title_length check (char_length(title) between 3 and 140),
  constraint investigations_description_length check (char_length(description) between 10 and 1600)
);

alter table public.discipline_records
  add column if not exists investigation_id uuid references public.investigations(id) on delete set null,
  add column if not exists appeal_status text not null default 'none',
  add column if not exists appealed_at timestamptz,
  add column if not exists appeal_decided_by uuid references public.profiles(id) on delete set null,
  add column if not exists appeal_decided_at timestamptz,
  add column if not exists appeal_decision_note text not null default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'discipline_records_appeal_status_allowed'
      and conrelid = 'public.discipline_records'::regclass
  ) then
    alter table public.discipline_records
      add constraint discipline_records_appeal_status_allowed
      check (appeal_status in ('none', 'submitted', 'accepted', 'rejected'));
  end if;
end $$;

create index if not exists complaints_status_created_at_idx
  on public.complaints(status, created_at desc);
create index if not exists investigations_subject_profile_id_idx
  on public.investigations(subject_profile_id);
create index if not exists investigations_assigned_to_idx
  on public.investigations(assigned_to);
create index if not exists investigations_status_idx
  on public.investigations(status);
create index if not exists discipline_records_investigation_id_idx
  on public.discipline_records(investigation_id);
create index if not exists discipline_records_appeal_status_idx
  on public.discipline_records(appeal_status);

alter table public.investigations enable row level security;

drop trigger if exists investigations_updated_at on public.investigations;
create trigger investigations_updated_at
  before update on public.investigations
  for each row execute procedure public.set_updated_at();

drop trigger if exists audit_investigations on public.investigations;
create trigger audit_investigations
  after insert or update on public.investigations
  for each row execute procedure private.write_audit_log();

create or replace function private.can_manage_announcements()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
as $$
  select private.has_any_role(array[
    'super_admin',
    'president',
    'vice_president',
    'presidential_aide',
    'discipline_chair',
    'discipline_vice_chair',
    'spokesperson'
  ]::public.app_role[]);
$$;

create or replace function private.can_manage_discipline()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
as $$
  select private.has_any_role(array[
    'super_admin',
    'discipline_chair',
    'discipline_vice_chair',
    'discipline_member'
  ]::public.app_role[]);
$$;

create or replace function private.can_manage_investigations()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
as $$
  select private.has_any_role(array[
    'super_admin',
    'discipline_chair',
    'discipline_vice_chair',
    'discipline_member'
  ]::public.app_role[]);
$$;

create or replace function private.discipline_rank(profile_roles public.app_role[])
returns integer
language sql
immutable
as $$
  select case
    when profile_roles && array['discipline_chair']::public.app_role[] then 3
    when profile_roles && array['discipline_vice_chair']::public.app_role[] then 2
    when profile_roles && array['discipline_member']::public.app_role[] then 1
    else 0
  end;
$$;

create or replace function private.enforce_discipline_record_hierarchy()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  actor_roles public.app_role[];
  target_roles public.app_role[];
  actor_rank integer;
  target_rank integer;
begin
  if new.decision_status = 'decided'::public.discipline_status and btrim(coalesce(new.decree_text, '')) = '' then
    raise exception 'Kararname metni zorunludur.';
  end if;

  if auth.uid() is null then
    return new;
  end if;

  actor_roles := private.current_app_roles();
  if actor_roles && array['super_admin']::public.app_role[] then
    return new;
  end if;

  select case
    when p.roles is null or cardinality(p.roles) = 0 then array[p.role]
    when p.role = any(p.roles) then p.roles
    else p.roles || p.role
  end
  into target_roles
  from public.profiles p
  where p.id = new.member_id;

  if target_roles is null then
    raise exception 'Ilgili uye bulunamadi.';
  end if;

  if not (actor_roles && array['discipline_chair','discipline_vice_chair','discipline_member']::public.app_role[]) then
    raise exception 'Disiplin kaydi icin disiplin kurulu yetkisi gerekir.';
  end if;

  if target_roles && array['super_admin','president','vice_president']::public.app_role[] then
    raise exception 'Bu uye disiplin kurulu hiyerarsisi disinda korunur.';
  end if;

  actor_rank := private.discipline_rank(actor_roles);
  target_rank := private.discipline_rank(target_roles);
  if target_rank > 0 and target_rank >= actor_rank then
    raise exception 'Disiplin hiyerarsisi bu kayda izin vermiyor.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_discipline_record_hierarchy_before_change on public.discipline_records;
create trigger enforce_discipline_record_hierarchy_before_change
  before insert or update of member_id, decision_status, decree_text on public.discipline_records
  for each row execute function private.enforce_discipline_record_hierarchy();

drop policy if exists investigations_select_authorized on public.investigations;
drop policy if exists investigations_insert_authorized on public.investigations;
drop policy if exists investigations_update_authorized on public.investigations;
drop policy if exists investigations_delete_super_admin on public.investigations;

create policy investigations_select_authorized
  on public.investigations
  for select
  to authenticated
  using (
    subject_profile_id = (select auth.uid())
    or opened_by = (select auth.uid())
    or assigned_to = (select auth.uid())
    or private.can_manage_investigations()
  );

create policy investigations_insert_authorized
  on public.investigations
  for insert
  to authenticated
  with check (private.can_manage_investigations());

create policy investigations_update_authorized
  on public.investigations
  for update
  to authenticated
  using (private.can_manage_investigations())
  with check (private.can_manage_investigations());

create policy investigations_delete_super_admin
  on public.investigations
  for delete
  to authenticated
  using (private.has_any_role(array['super_admin']::public.app_role[]));

grant select, insert, update, delete on public.investigations to authenticated;
grant execute on function private.can_manage_announcements() to authenticated, service_role;
grant execute on function private.can_manage_discipline() to authenticated, service_role;
grant execute on function private.can_manage_investigations() to authenticated, service_role;
grant execute on function private.discipline_rank(public.app_role[]) to authenticated, service_role;
grant execute on function private.enforce_discipline_record_hierarchy() to authenticated, service_role;

delete from public.notifications;
delete from public.audit_logs;
delete from public.discipline_records;
delete from public.applications;
delete from public.complaints;
delete from public.investigations;
delete from public.youth_activities;
delete from public.announcements;
