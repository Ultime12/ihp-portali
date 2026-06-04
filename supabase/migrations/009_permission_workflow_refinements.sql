alter table public.applications
  add column if not exists claimed_by uuid references public.profiles(id) on delete set null,
  add column if not exists claimed_at timestamptz;

alter table public.discipline_records
  add column if not exists decree_text text not null default '';

update public.discipline_records
set decree_text = action_taken
where coalesce(decree_text, '') = ''
  and coalesce(action_taken, '') <> '';

create index if not exists applications_claimed_by_idx
  on public.applications(claimed_by);

create or replace function private.can_view_discipline()
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
    'discipline_vice_chair'
  ]::public.app_role[]);
$$;

create or replace function private.can_manage_youth()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
as $$
  select private.has_any_role(array['super_admin','youth_chair']::public.app_role[]);
$$;

create or replace function private.can_review_application(target_committee uuid, requested public.app_role)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'auth'
as $$
declare
  target_name text;
begin
  if private.has_any_role(array['super_admin']::public.app_role[]) then
    return true;
  end if;

  select name into target_name
  from public.committees
  where id = target_committee;

  if target_name in (U&'Y\00FCr\00FCtme Kurulu', U&'Y\00F6netim Kurulu')
     and private.has_any_role(array['president','vice_president','presidential_aide']::public.app_role[]) then
    return true;
  end if;

  if exists (
    select 1
    from public.profile_committees pc
    where pc.profile_id = auth.uid()
      and pc.committee_id = target_committee
  ) and private.has_any_role(array['president','vice_president','presidential_aide']::public.app_role[]) then
    return true;
  end if;

  if target_name = U&'Disiplin Kurulu'
     and private.has_any_role(array['discipline_chair','discipline_vice_chair','discipline_member']::public.app_role[]) then
    return true;
  end if;

  if target_name = U&'Gen\00E7lik Kollar\0131'
     and private.has_any_role(array['youth_chair']::public.app_role[]) then
    return true;
  end if;

  return false;
end;
$$;

drop policy if exists discipline_delete_authorized on public.discipline_records;
drop policy if exists discipline_delete_super_admin on public.discipline_records;
drop policy if exists discipline_select_own_or_authorized on public.discipline_records;
drop policy if exists discipline_insert_authorized on public.discipline_records;
drop policy if exists discipline_update_authorized on public.discipline_records;

create policy discipline_select_own_or_authorized
  on public.discipline_records
  for select
  to authenticated
  using (
    member_id = (select auth.uid())
    or (select private.can_view_discipline())
  );

create policy discipline_insert_authorized
  on public.discipline_records
  for insert
  to authenticated
  with check ((select private.can_manage_discipline()));

create policy discipline_update_authorized
  on public.discipline_records
  for update
  to authenticated
  using ((select private.can_manage_discipline()))
  with check ((select private.can_manage_discipline()));

create policy discipline_delete_super_admin
  on public.discipline_records
  for delete
  to authenticated
  using (private.has_any_role(array['super_admin']::public.app_role[]));

drop policy if exists applications_select_authorized on public.applications;
drop policy if exists applications_update_reviewers on public.applications;
drop policy if exists applications_delete_authorized on public.applications;

create policy applications_select_authorized
  on public.applications
  for select
  to authenticated
  using (
    applicant_profile_id = (select auth.uid())
    or created_by = (select auth.uid())
    or (
      private.can_review_application(coalesce(target_committee_id, suggested_committee_id), requested_role)
      and (
        claimed_by is null
        or claimed_by = (select auth.uid())
        or private.has_any_role(array['super_admin']::public.app_role[])
      )
    )
  );

create policy applications_update_reviewers
  on public.applications
  for update
  to authenticated
  using (
    private.can_review_application(coalesce(target_committee_id, suggested_committee_id), requested_role)
    and (
      claimed_by is null
      or claimed_by = (select auth.uid())
      or private.has_any_role(array['super_admin']::public.app_role[])
    )
  )
  with check (
    private.can_review_application(coalesce(target_committee_id, suggested_committee_id), requested_role)
    and (
      claimed_by is null
      or claimed_by = (select auth.uid())
      or private.has_any_role(array['super_admin']::public.app_role[])
    )
  );

create policy applications_delete_authorized
  on public.applications
  for delete
  to authenticated
  using (
    (applicant_profile_id = (select auth.uid()) and status = 'new'::public.application_status)
    or private.has_any_role(array['super_admin']::public.app_role[])
  );

create or replace function private.notify_discipline_record()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
begin
  perform private.notify_user(
    new.member_id,
    case
      when new.archived then U&'Disiplin kayd\0131 silindi olarak i\015Faretlendi'
      when tg_op = 'INSERT' then U&'Disiplin kararname kayd\0131 olu\015Fturuldu'
      else U&'Disiplin kayd\0131 g\00FCncellendi'
    end,
    coalesce(new.record_type, U&'Kay\0131t') || ': ' || coalesce(new.reason, '') ||
      case when coalesce(new.decree_text, '') <> '' then U&' | Kararname: ' || left(new.decree_text, 220) else '' end,
    'discipline',
    '#/portal/discipline',
    new.created_by
  );
  return new;
end;
$$;

drop trigger if exists notify_discipline_record_after_change on public.discipline_records;
create trigger notify_discipline_record_after_change
  after insert or update of record_type, reason, decision_status, action_taken, decree_text, archived on public.discipline_records
  for each row
  execute function private.notify_discipline_record();

grant execute on function private.can_view_discipline() to authenticated, service_role;
grant execute on function private.can_manage_discipline() to authenticated, service_role;
grant execute on function private.can_manage_youth() to authenticated, service_role;
grant execute on function private.can_review_application(uuid, public.app_role) to authenticated, service_role;
