create or replace function private.enforce_discipline_member_eligibility()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  target_status public.member_status;
  target_is_system boolean;
begin
  select profile.status, coalesce(profile.is_system_account, false)
    into target_status, target_is_system
  from public.profiles profile
  where profile.id = new.member_id;

  if target_status is null then
    raise exception 'Disiplin islemi hedefi bulunamadi.';
  end if;

  if target_status = 'left'::public.member_status or target_is_system then
    raise exception 'Partiden ayrilan veya sistem hesabi olan kisiye disiplin islemi uygulanamaz.';
  end if;

  return new;
end;
$$;

create or replace function private.enforce_investigation_subject_eligibility()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  target_status public.member_status;
  target_is_system boolean;
begin
  select profile.status, coalesce(profile.is_system_account, false)
    into target_status, target_is_system
  from public.profiles profile
  where profile.id = new.subject_profile_id;

  if target_status is null then
    raise exception 'Sorusturma hedefi bulunamadi.';
  end if;

  if target_status = 'left'::public.member_status or target_is_system then
    raise exception 'Partiden ayrilan veya sistem hesabi olan kisi hakkinda sorusturma acilamaz.';
  end if;

  return new;
end;
$$;

create or replace function private.enforce_complaint_party_eligibility()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  complainant_status public.member_status;
  complainant_is_system boolean;
  accused_status public.member_status;
  accused_is_system boolean;
begin
  select profile.status, coalesce(profile.is_system_account, false)
    into complainant_status, complainant_is_system
  from public.profiles profile
  where profile.id = new.complainant_profile_id;

  if complainant_status is null
     or complainant_status = 'left'::public.member_status
     or complainant_is_system then
    raise exception 'Partiden ayrilan veya sistem hesabi olan kisi sikayet olusturamaz.';
  end if;

  if new.accused_profile_id is not null then
    select profile.status, coalesce(profile.is_system_account, false)
      into accused_status, accused_is_system
    from public.profiles profile
    where profile.id = new.accused_profile_id;

    if accused_status is null then
      raise exception 'Sikayet hedefi bulunamadi.';
    end if;

    if accused_status = 'left'::public.member_status or accused_is_system then
      raise exception 'Partiden ayrilan veya sistem hesabi olan kisi sikayet hedefi olamaz.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.enforce_application_member_eligibility()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  applicant_status public.member_status;
  applicant_is_system boolean;
begin
  if new.applicant_profile_id is null then
    return new;
  end if;

  select profile.status, coalesce(profile.is_system_account, false)
    into applicant_status, applicant_is_system
  from public.profiles profile
  where profile.id = new.applicant_profile_id;

  if applicant_status is null
     or applicant_status = 'left'::public.member_status
     or applicant_is_system then
    raise exception 'Partiden ayrilan veya sistem hesabi olan kisi basvuru olusturamaz.';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_discipline_member_eligibility() from public;
revoke all on function private.enforce_investigation_subject_eligibility() from public;
revoke all on function private.enforce_complaint_party_eligibility() from public;
revoke all on function private.enforce_application_member_eligibility() from public;
grant execute on function private.enforce_discipline_member_eligibility() to authenticated, service_role;
grant execute on function private.enforce_investigation_subject_eligibility() to authenticated, service_role;
grant execute on function private.enforce_complaint_party_eligibility() to authenticated, service_role;
grant execute on function private.enforce_application_member_eligibility() to authenticated, service_role;

drop trigger if exists enforce_discipline_member_eligibility_before_write on public.discipline_records;
create trigger enforce_discipline_member_eligibility_before_write
  before insert or update of member_id on public.discipline_records
  for each row execute function private.enforce_discipline_member_eligibility();

drop trigger if exists enforce_investigation_subject_eligibility_before_write on public.investigations;
create trigger enforce_investigation_subject_eligibility_before_write
  before insert or update of subject_profile_id on public.investigations
  for each row execute function private.enforce_investigation_subject_eligibility();

drop trigger if exists enforce_complaint_party_eligibility_before_write on public.complaints;
create trigger enforce_complaint_party_eligibility_before_write
  before insert or update of complainant_profile_id, accused_profile_id on public.complaints
  for each row execute function private.enforce_complaint_party_eligibility();

drop trigger if exists enforce_application_member_eligibility_before_write on public.applications;
create trigger enforce_application_member_eligibility_before_write
  before insert or update of applicant_profile_id on public.applications
  for each row execute function private.enforce_application_member_eligibility();
