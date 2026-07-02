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

create or replace function private.enforce_discipline_record_hierarchy()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $$
declare
  actor_roles public.app_role[];
  target_roles public.app_role[];
  is_reward boolean;
begin
  if new.decision_status = 'decided'::public.discipline_status
     and btrim(coalesce(new.decree_text, '')) = '' then
    raise exception 'Kararname metni zorunludur.';
  end if;

  is_reward :=
    coalesce(new.sanction_effect, 'none') = 'reward_points'
    or coalesce(new.point_delta, 0) > 0;

  if new.decision_status = 'decided'::public.discipline_status
     and not is_reward
     and new.investigation_id is null then
    raise exception 'Ceza kararnamesi icin once sorusturma secilmelidir.';
  end if;

  if auth.uid() is null then
    return new;
  end if;

  actor_roles := private.current_app_roles();

  select case
    when profile.roles is null or cardinality(profile.roles) = 0 then array[profile.role]
    when profile.role = any(profile.roles) then profile.roles
    else profile.roles || profile.role
  end
  into target_roles
  from public.profiles profile
  where profile.id = new.member_id;

  if target_roles is null then
    raise exception 'Ilgili uye bulunamadi.';
  end if;

  if target_roles && array['super_admin']::public.app_role[] then
    raise exception 'Teknik Admin hesabi disiplin hedefi olamaz.';
  end if;

  if actor_roles && array['super_admin']::public.app_role[] then
    return new;
  end if;

  if is_reward then
    if actor_roles && array[
      'president',
      'discipline_chair',
      'discipline_vice_chair',
      'discipline_member'
    ]::public.app_role[] then
      return new;
    end if;
    raise exception 'Odul karari icin Baskan, Disiplin Kurulu veya teknik Admin yetkisi gerekir.';
  end if;

  if not (
    actor_roles && array[
      'discipline_chair',
      'discipline_vice_chair',
      'discipline_member'
    ]::public.app_role[]
  ) then
    raise exception 'Disiplin karari icin Disiplin Kurulu veya teknik Admin yetkisi gerekir.';
  end if;

  return new;
end;
$$;

create or replace function private.can_review_application(
  target_committee uuid,
  requested public.app_role
)
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

  if target_name = 'Disiplin Kurulu' then
    return private.has_any_role(array[
      'discipline_chair',
      'discipline_vice_chair',
      'discipline_member'
    ]::public.app_role[]);
  end if;

  if target_name in ('Yurutme Kurulu', 'Yonetim Kurulu')
     and private.has_any_role(array[
       'president',
       'vice_president',
       'presidential_aide'
     ]::public.app_role[]) then
    return true;
  end if;

  if exists (
    select 1
    from public.profile_committees membership
    where membership.profile_id = auth.uid()
      and membership.committee_id = target_committee
  ) and private.has_any_role(array[
    'president',
    'vice_president',
    'presidential_aide'
  ]::public.app_role[]) then
    return true;
  end if;

  if target_name = 'Genclik Kollari'
     and private.has_any_role(array['youth_chair']::public.app_role[]) then
    return true;
  end if;

  return false;
end;
$$;

create or replace function private.can_sign_agreement(
  agreement_target_type text,
  agreement_target_profile_id uuid,
  agreement_target_committee_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'auth'
as $$
declare
  committee_name text;
begin
  if private.has_any_role(array['super_admin']::public.app_role[]) then
    return true;
  end if;

  if agreement_target_type = 'member' then
    return agreement_target_profile_id = auth.uid();
  end if;

  if agreement_target_type = 'party' then
    return private.has_any_role(array['president']::public.app_role[])
      or exists (
        select 1
        from public.agreement_delegations delegation
        where delegation.delegate_profile_id = auth.uid()
          and delegation.revoked_at is null
          and delegation.starts_at <= now()
          and (delegation.ends_at is null or delegation.ends_at > now())
      );
  end if;

  select name into committee_name
  from public.committees
  where id = agreement_target_committee_id
  limit 1;

  if agreement_target_type = 'discipline' or committee_name = 'Disiplin Kurulu' then
    return private.has_any_role(array['discipline_chair']::public.app_role[]);
  end if;

  if agreement_target_type = 'youth' or committee_name = 'Genclik Kollari' then
    return private.has_any_role(array['youth_chair']::public.app_role[]);
  end if;

  return false;
end;
$$;

revoke all on function private.can_manage_discipline() from public;
revoke all on function private.can_manage_investigations() from public;
revoke all on function private.can_view_discipline() from public;
revoke all on function private.enforce_discipline_record_hierarchy() from public;
revoke all on function private.can_review_application(uuid, public.app_role) from public;
revoke all on function private.can_sign_agreement(text, uuid, uuid) from public;
grant execute on function private.can_manage_discipline() to authenticated, service_role;
grant execute on function private.can_manage_investigations() to authenticated, service_role;
grant execute on function private.can_view_discipline() to authenticated, service_role;
grant execute on function private.enforce_discipline_record_hierarchy() to authenticated, service_role;
grant execute on function private.can_review_application(uuid, public.app_role) to authenticated, service_role;
grant execute on function private.can_sign_agreement(text, uuid, uuid) to authenticated, service_role;

drop policy if exists investigations_delete_super_admin on public.investigations;
create policy investigations_delete_super_admin
  on public.investigations
  for delete
  to authenticated
  using (private.has_any_role(array['super_admin']::public.app_role[]));
grant delete on public.investigations to authenticated;

drop policy if exists discipline_delete_super_admin on public.discipline_records;
create policy discipline_delete_super_admin
  on public.discipline_records
  for delete
  to authenticated
  using (private.has_any_role(array['super_admin']::public.app_role[]));
grant delete on public.discipline_records to authenticated;

drop policy if exists applications_delete_authorized on public.applications;
create policy applications_delete_authorized
  on public.applications
  for delete
  to authenticated
  using (
    private.has_any_role(array['super_admin']::public.app_role[])
    or (
      applicant_profile_id = (select auth.uid())
      and status = 'new'::public.application_status
    )
  );

drop policy if exists complaints_select_authorized on public.complaints;
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

drop policy if exists complaints_update_discipline on public.complaints;
create policy complaints_update_discipline
  on public.complaints
  for update
  to authenticated
  using (private.has_any_role(array[
    'super_admin',
    'discipline_chair',
    'discipline_vice_chair',
    'discipline_member'
  ]::public.app_role[]))
  with check (private.has_any_role(array[
    'super_admin',
    'discipline_chair',
    'discipline_vice_chair',
    'discipline_member'
  ]::public.app_role[]));

drop policy if exists complaints_delete_authorized on public.complaints;
create policy complaints_delete_authorized
  on public.complaints
  for delete
  to authenticated
  using (
    private.has_any_role(array['super_admin']::public.app_role[])
    or (complainant_profile_id = (select auth.uid()) and status = 'new')
  );
