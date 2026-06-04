alter table public.applications
  drop constraint if exists applications_anonymous_candidate_label;

create table if not exists public.profile_committees (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  committee_id uuid not null references public.committees(id) on delete cascade,
  role_in_committee text not null default 'manual',
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (profile_id, committee_id),
  constraint profile_committees_role_length check (char_length(role_in_committee) between 2 and 40)
);

alter table public.profile_committees enable row level security;

drop policy if exists profile_committees_select_authenticated on public.profile_committees;
drop policy if exists profile_committees_write_managers on public.profile_committees;

create policy profile_committees_select_authenticated
  on public.profile_committees
  for select
  to authenticated
  using (true);

create policy profile_committees_write_managers
  on public.profile_committees
  for all
  to authenticated
  using (private.can_manage_members())
  with check (private.can_manage_members());

grant select, insert, update, delete on public.profile_committees to authenticated;

do $$
declare
  old_management_id uuid;
  executive_id uuid;
begin
  select id into old_management_id
  from public.committees
  where name = U&'Y\00F6netim Kurulu'
  limit 1;

  select id into executive_id
  from public.committees
  where name = U&'Y\00FCr\00FCtme Kurulu'
  limit 1;

  if executive_id is null and old_management_id is not null then
    update public.committees
    set name = U&'Y\00FCr\00FCtme Kurulu',
        description = U&'Ba\015Fkan, ba\015Fkan yard\0131mc\0131s\0131, ba\015Fkan yaveri ve ba\015Fkan\0131n se\00E7ti\011Fi \00FCyelerden olu\015Fan y\00FCr\00FCtme yap\0131s\0131.',
        status = 'active'
    where id = old_management_id
    returning id into executive_id;
  elsif executive_id is null then
    insert into public.committees(name, description, status, notes)
    values (
      U&'Y\00FCr\00FCtme Kurulu',
      U&'Ba\015Fkan, ba\015Fkan yard\0131mc\0131s\0131, ba\015Fkan yaveri ve ba\015Fkan\0131n se\00E7ti\011Fi \00FCyelerden olu\015Fan y\00FCr\00FCtme yap\0131s\0131.',
      'active',
      ''
    )
    returning id into executive_id;
  end if;

  if old_management_id is not null and old_management_id <> executive_id then
    update public.positions set committee_id = executive_id where committee_id = old_management_id;
    update public.profiles set committee_id = executive_id where committee_id = old_management_id;
    update public.committees set status = 'passive' where id = old_management_id;
  end if;
end $$;

insert into public.committees(name, description, status, notes)
values
  (U&'Disiplin Kurulu', U&'Uyar\0131, ceza ve disiplin s\00FCre\00E7lerini yetki s\0131n\0131rlar\0131yla y\00F6netir.', 'active', ''),
  (U&'Gen\00E7lik Kollar\0131', U&'Gen\00E7lik kollar\0131 etkinlik, sosyal \00E7al\0131\015Fma ve kat\0131l\0131m s\00FCre\00E7lerini koordine eder.', 'active', ''),
  (U&'Sosyal Medya Ba\015Fkanl\0131\011F\0131', U&'Sosyal medya etiketi ve g\00F6r\00FCn\00FCrl\00FCk alan\0131d\0131r; ek y\00F6netim yetkisi vermez.', 'active', '')
on conflict (name) do update
set description = excluded.description,
    status = 'active';

update public.committees
set chair_profile_id = null
where name in (U&'Y\00FCr\00FCtme Kurulu', U&'Sosyal Medya Ba\015Fkanl\0131\011F\0131');

create or replace function private.committee_for_roles(profile_roles public.app_role[])
returns uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  committee_name text;
  committee_id uuid;
begin
  if coalesce(profile_roles, array[]::public.app_role[]) && array['discipline_chair','discipline_vice_chair','discipline_member','discipline_admission_officer']::public.app_role[] then
    committee_name := U&'Disiplin Kurulu';
  elsif coalesce(profile_roles, array[]::public.app_role[]) && array['youth_chair','youth_member']::public.app_role[] then
    committee_name := U&'Gen\00E7lik Kollar\0131';
  elsif coalesce(profile_roles, array[]::public.app_role[]) && array['spokesperson']::public.app_role[] then
    committee_name := U&'Sosyal Medya Ba\015Fkanl\0131\011F\0131';
  elsif coalesce(profile_roles, array[]::public.app_role[]) && array['super_admin','president','vice_president','presidential_aide']::public.app_role[] then
    committee_name := U&'Y\00FCr\00FCtme Kurulu';
  else
    return null;
  end if;

  select id into committee_id
  from public.committees
  where name = committee_name
  limit 1;

  return committee_id;
end;
$$;

create or replace function private.refresh_committee_chairs()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.committees c
  set chair_profile_id = (
    select p.id
    from public.profiles p
    where p.status = 'active'::public.member_status
      and coalesce(p.roles, array[p.role]) && array['discipline_chair']::public.app_role[]
    order by p.updated_at desc nulls last, p.created_at asc
    limit 1
  )
  where c.name = U&'Disiplin Kurulu';

  update public.committees c
  set chair_profile_id = (
    select p.id
    from public.profiles p
    where p.status = 'active'::public.member_status
      and coalesce(p.roles, array[p.role]) && array['youth_chair']::public.app_role[]
    order by p.updated_at desc nulls last, p.created_at asc
    limit 1
  )
  where c.name = U&'Gen\00E7lik Kollar\0131';

  update public.committees
  set chair_profile_id = null
  where name in (U&'Y\00FCr\00FCtme Kurulu', U&'Sosyal Medya Ba\015Fkanl\0131\011F\0131');
end;
$$;

create or replace function private.sync_positions_for_profile(target_profile_id uuid, profile_roles public.app_role[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  delete from public.positions
  where assigned_profile_id = target_profile_id
    and title = any(array[
      U&'Ba\015Fkan',
      U&'Ba\015Fkan Yard\0131mc\0131s\0131',
      U&'Ba\015Fkan Yaveri',
      U&'Disiplin Kurulu Ba\015Fkan\0131',
      U&'Disiplin Kurulu Ba\015Fkan Yard\0131mc\0131s\0131',
      U&'Disiplin Kurulu \00DCyesi',
      U&'Gen\00E7lik Kollar\0131 Ba\015Fkan\0131',
      U&'Gen\00E7lik Kollar\0131 \00DCyesi',
      U&'Parti S\00F6zc\00FCs\00FC',
      U&'Ba\015F Temsilci',
      U&'Temsilci'
    ]);

  if coalesce(profile_roles, array[]::public.app_role[]) && array['president']::public.app_role[] then
    perform private.assign_position(target_profile_id, U&'Ba\015Fkan', U&'Y\00FCr\00FCtme Kurulu', 10::smallint, U&'Partinin genel koordinasyonu.', true);
  end if;
  if coalesce(profile_roles, array[]::public.app_role[]) && array['vice_president']::public.app_role[] then
    perform private.assign_position(target_profile_id, U&'Ba\015Fkan Yard\0131mc\0131s\0131', U&'Y\00FCr\00FCtme Kurulu', 9::smallint, U&'Ba\015Fkana destek ve \00FCye d\00FCzenleme yetkisi.', true);
  end if;
  if coalesce(profile_roles, array[]::public.app_role[]) && array['presidential_aide']::public.app_role[] then
    perform private.assign_position(target_profile_id, U&'Ba\015Fkan Yaveri', U&'Y\00FCr\00FCtme Kurulu', 8::smallint, U&'Ba\015Fkanl\0131k koordinasyonuna destek.', true);
  end if;
  if coalesce(profile_roles, array[]::public.app_role[]) && array['discipline_chair']::public.app_role[] then
    perform private.assign_position(target_profile_id, U&'Disiplin Kurulu Ba\015Fkan\0131', U&'Disiplin Kurulu', 8::smallint, U&'Disiplin kurulunu y\00F6netir.', true);
  end if;
  if coalesce(profile_roles, array[]::public.app_role[]) && array['discipline_vice_chair']::public.app_role[] then
    perform private.assign_position(target_profile_id, U&'Disiplin Kurulu Ba\015Fkan Yard\0131mc\0131s\0131', U&'Disiplin Kurulu', 7::smallint, U&'Disiplin kurulu ba\015Fkan\0131na destek olur.', true);
  end if;
  if coalesce(profile_roles, array[]::public.app_role[]) && array['discipline_member']::public.app_role[] then
    perform private.assign_position(target_profile_id, U&'Disiplin Kurulu \00DCyesi', U&'Disiplin Kurulu', 5::smallint, U&'Disiplin kurulunda inceleme yapar.', false);
  end if;
  if coalesce(profile_roles, array[]::public.app_role[]) && array['youth_chair']::public.app_role[] then
    perform private.assign_position(target_profile_id, U&'Gen\00E7lik Kollar\0131 Ba\015Fkan\0131', U&'Gen\00E7lik Kollar\0131', 7::smallint, U&'Gen\00E7lik kollar\0131 \00E7al\0131\015Fmalar\0131n\0131 koordine eder.', true);
  end if;
  if coalesce(profile_roles, array[]::public.app_role[]) && array['youth_member']::public.app_role[] then
    perform private.assign_position(target_profile_id, U&'Gen\00E7lik Kollar\0131 \00DCyesi', U&'Gen\00E7lik Kollar\0131', 3::smallint, U&'Gen\00E7lik kollar\0131 \00E7al\0131\015Fmalar\0131na kat\0131l\0131r.', false);
  end if;
  if coalesce(profile_roles, array[]::public.app_role[]) && array['spokesperson']::public.app_role[] then
    perform private.assign_position(target_profile_id, U&'Parti S\00F6zc\00FCs\00FC', U&'Sosyal Medya Ba\015Fkanl\0131\011F\0131', 3::smallint, U&'Sosyal medya etiketi ve s\00F6zc\00FCs\00FC.', true);
  end if;
  if coalesce(profile_roles, array[]::public.app_role[]) && array['chief_representative']::public.app_role[] then
    perform private.assign_position(target_profile_id, U&'Ba\015F Temsilci', null, 6::smallint, U&'Temsilci atamalar\0131n\0131 koordine eder.', true);
  end if;
  if coalesce(profile_roles, array[]::public.app_role[]) && array['representative']::public.app_role[] then
    perform private.assign_position(target_profile_id, U&'Temsilci', null, 4::smallint, U&'\00DCyeleri temsil eder.', false);
  end if;
end;
$$;

do $$
declare
  profile_row record;
  all_roles public.app_role[];
begin
  for profile_row in select * from public.profiles loop
    all_roles := case
      when profile_row.roles is null or cardinality(profile_row.roles) = 0 then array[profile_row.role]
      when profile_row.role = any(profile_row.roles) then profile_row.roles
      else profile_row.roles || profile_row.role
    end;
    perform private.sync_positions_for_profile(profile_row.id, all_roles);
  end loop;
end $$;

with role_sets as (
  select
    p.id as profile_id,
    case
      when p.roles is null or cardinality(p.roles) = 0 then array[p.role]
      when p.role = any(p.roles) then p.roles
      else p.roles || p.role
    end as roles
  from public.profiles p
),
committee_targets as (
  select id, name from public.committees
  where name in (
    U&'Y\00FCr\00FCtme Kurulu',
    U&'Disiplin Kurulu',
    U&'Gen\00E7lik Kollar\0131',
    U&'Sosyal Medya Ba\015Fkanl\0131\011F\0131'
  )
),
matches as (
  select r.profile_id, c.id as committee_id
  from role_sets r
  join committee_targets c on (
    (c.name = U&'Y\00FCr\00FCtme Kurulu' and r.roles && array['super_admin','president','vice_president','presidential_aide']::public.app_role[])
    or (c.name = U&'Disiplin Kurulu' and r.roles && array['discipline_chair','discipline_vice_chair','discipline_member','discipline_admission_officer']::public.app_role[])
    or (c.name = U&'Gen\00E7lik Kollar\0131' and r.roles && array['youth_chair','youth_member']::public.app_role[])
    or (c.name = U&'Sosyal Medya Ba\015Fkanl\0131\011F\0131' and r.roles && array['spokesperson']::public.app_role[])
  )
)
insert into public.profile_committees(profile_id, committee_id, role_in_committee)
select profile_id, committee_id, 'role'
from matches
on conflict (profile_id, committee_id) do nothing;

delete from public.profile_committees pc
using public.committees c, public.profiles p
where pc.committee_id = c.id
  and pc.profile_id = p.id
  and pc.role_in_committee = 'role'
  and c.name = U&'Y\00FCr\00FCtme Kurulu'
  and not (
    case
      when p.roles is null or cardinality(p.roles) = 0 then array[p.role]
      when p.role = any(p.roles) then p.roles
      else p.roles || p.role
    end && array['super_admin','president','vice_president','presidential_aide']::public.app_role[]
  );

select private.refresh_committee_chairs();
