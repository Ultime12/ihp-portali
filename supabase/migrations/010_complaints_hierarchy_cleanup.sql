create table if not exists public.complaints (
  id uuid primary key default gen_random_uuid(),
  complainant_profile_id uuid not null references public.profiles(id) on delete cascade,
  accused_profile_id uuid references public.profiles(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  subject text not null,
  description text not null,
  priority text not null default 'normal',
  status text not null default 'new',
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint complaints_subject_length check (char_length(subject) between 3 and 140),
  constraint complaints_description_length check (char_length(description) between 10 and 1600),
  constraint complaints_priority_allowed check (priority in ('normal', 'important', 'urgent')),
  constraint complaints_status_allowed check (status in ('new', 'reviewing', 'resolved', 'rejected', 'closed'))
);

alter table public.complaints enable row level security;

drop trigger if exists complaints_updated_at on public.complaints;
create trigger complaints_updated_at
  before update on public.complaints
  for each row execute procedure public.set_updated_at();

drop trigger if exists audit_complaints on public.complaints;
create trigger audit_complaints
  after insert or update on public.complaints
  for each row execute procedure private.write_audit_log();

create index if not exists complaints_complainant_profile_id_idx
  on public.complaints(complainant_profile_id);
create index if not exists complaints_accused_profile_id_idx
  on public.complaints(accused_profile_id);
create index if not exists complaints_assigned_to_idx
  on public.complaints(assigned_to);
create index if not exists complaints_status_idx
  on public.complaints(status);

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
    'discipline_vice_chair'
  ]::public.app_role[]);
$$;

create or replace function private.notify_complaint_created()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
begin
  insert into public.notifications(recipient_id, actor_id, title, body, category, link)
  select
    p.id,
    new.complainant_profile_id,
    U&'Yeni \015Fikayet',
    left(coalesce(new.subject, U&'\015Eikayet'), 220),
    'complaint',
    '#/portal/complaints'
  from public.profiles p
  where p.status = 'active'
    and p.id <> new.complainant_profile_id
    and coalesce(p.roles, array[p.role]) && array[
      'super_admin',
      'discipline_chair',
      'discipline_vice_chair',
      'discipline_member'
    ]::public.app_role[];

  return new;
end;
$$;

drop trigger if exists notify_complaint_created_after_insert on public.complaints;
create trigger notify_complaint_created_after_insert
  after insert on public.complaints
  for each row execute function private.notify_complaint_created();

drop policy if exists complaints_select_authorized on public.complaints;
drop policy if exists complaints_insert_own on public.complaints;
drop policy if exists complaints_update_discipline on public.complaints;
drop policy if exists complaints_delete_authorized on public.complaints;

create policy complaints_select_authorized
  on public.complaints
  for select
  to authenticated
  using (
    complainant_profile_id = (select auth.uid())
    or accused_profile_id = (select auth.uid())
    or assigned_to = (select auth.uid())
    or private.has_any_role(array[
      'super_admin',
      'discipline_chair',
      'discipline_vice_chair',
      'discipline_member'
    ]::public.app_role[])
  );

create policy complaints_insert_own
  on public.complaints
  for insert
  to authenticated
  with check (
    complainant_profile_id = (select auth.uid())
    and created_by = (select auth.uid())
  );

create policy complaints_update_discipline
  on public.complaints
  for update
  to authenticated
  using (
    private.has_any_role(array[
      'super_admin',
      'discipline_chair',
      'discipline_vice_chair',
      'discipline_member'
    ]::public.app_role[])
  )
  with check (
    private.has_any_role(array[
      'super_admin',
      'discipline_chair',
      'discipline_vice_chair',
      'discipline_member'
    ]::public.app_role[])
  );

create policy complaints_delete_authorized
  on public.complaints
  for delete
  to authenticated
  using (
    private.has_any_role(array['super_admin']::public.app_role[])
    or (complainant_profile_id = (select auth.uid()) and status = 'new')
  );

grant select, insert, update, delete on public.complaints to authenticated;
grant execute on function private.can_manage_announcements() to authenticated, service_role;
