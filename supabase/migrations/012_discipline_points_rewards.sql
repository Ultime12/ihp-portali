alter table public.profiles
  add column if not exists discipline_points integer;

select set_config('app.bypass_profile_protection', 'on', true);

update public.profiles
set discipline_points = 100
where discipline_points is null;

alter table public.profiles
  alter column discipline_points set default 100,
  alter column discipline_points set not null;

alter table public.profiles
  drop constraint if exists profiles_discipline_points_range;

alter table public.profiles
  add constraint profiles_discipline_points_range
  check (discipline_points between 0 and 200);

alter table public.discipline_records
  add column if not exists point_delta integer not null default 0,
  add column if not exists points_before integer,
  add column if not exists points_after integer,
  add column if not exists sanction_effect text not null default 'none';

alter table public.discipline_records
  drop constraint if exists discipline_records_point_delta_range;

alter table public.discipline_records
  add constraint discipline_records_point_delta_range
  check (point_delta between -100 and 100);

alter table public.discipline_records
  drop constraint if exists discipline_records_points_before_range;

alter table public.discipline_records
  add constraint discipline_records_points_before_range
  check (points_before is null or points_before between 0 and 200);

alter table public.discipline_records
  drop constraint if exists discipline_records_points_after_range;

alter table public.discipline_records
  add constraint discipline_records_points_after_range
  check (points_after is null or points_after between 0 and 200);

alter table public.discipline_records
  drop constraint if exists discipline_records_sanction_effect_allowed;

alter table public.discipline_records
  add constraint discipline_records_sanction_effect_allowed
  check (sanction_effect in ('none', 'points_only', 'reward_points', 'remove_roles', 'suspend_member', 'passive_member'));

create index if not exists profiles_discipline_points_idx
  on public.profiles(discipline_points);

create index if not exists discipline_records_point_delta_idx
  on public.discipline_records(point_delta);

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
  is_reward boolean;
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

  is_reward := coalesce(new.sanction_effect, 'none') = 'reward_points' or coalesce(new.point_delta, 0) > 0;
  if is_reward then
    if actor_roles && array['discipline_chair']::public.app_role[] then
      return new;
    end if;
    raise exception 'Odul puani icin disiplin kurulu baskani yetkisi gerekir.';
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
  before insert or update of member_id, decision_status, decree_text, point_delta, sanction_effect on public.discipline_records
  for each row execute function private.enforce_discipline_record_hierarchy();

drop trigger if exists notify_discipline_record_after_change on public.discipline_records;
create trigger notify_discipline_record_after_change
  after insert or update of record_type, reason, decision_status, action_taken, decree_text, archived, point_delta, sanction_effect on public.discipline_records
  for each row
  execute function private.notify_discipline_record();

grant execute on function private.enforce_discipline_record_hierarchy() to authenticated, service_role;
