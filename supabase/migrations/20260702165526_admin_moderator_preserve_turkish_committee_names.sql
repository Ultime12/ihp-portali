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

  if target_name in ('Yürütme Kurulu', 'Yönetim Kurulu')
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

  if target_name = 'Gençlik Kolları'
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

  if agreement_target_type = 'youth' or committee_name = 'Gençlik Kolları' then
    return private.has_any_role(array['youth_chair']::public.app_role[]);
  end if;

  return false;
end;
$$;

revoke all on function private.can_review_application(uuid, public.app_role) from public;
revoke all on function private.can_sign_agreement(text, uuid, uuid) from public;
grant execute on function private.can_review_application(uuid, public.app_role) to authenticated, service_role;
grant execute on function private.can_sign_agreement(text, uuid, uuid) to authenticated, service_role;
