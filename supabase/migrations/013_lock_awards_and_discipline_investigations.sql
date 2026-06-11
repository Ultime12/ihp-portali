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

  is_reward := coalesce(new.sanction_effect, 'none') = 'reward_points' or coalesce(new.point_delta, 0) > 0;
  if new.decision_status = 'decided'::public.discipline_status and not is_reward and new.investigation_id is null then
    raise exception 'Ceza kararnamesi icin once sorusturma secilmelidir.';
  end if;

  if auth.uid() is null then
    return new;
  end if;

  actor_roles := private.current_app_roles();
  if actor_roles && array['super_admin']::public.app_role[] then
    return new;
  end if;

  if is_reward then
    if actor_roles && array['president','discipline_chair']::public.app_role[] then
      return new;
    end if;
    raise exception 'Odul puani icin super admin, baskan veya disiplin kurulu baskani yetkisi gerekir.';
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
  before insert or update of member_id, decision_status, decree_text, point_delta, sanction_effect, investigation_id on public.discipline_records
  for each row execute function private.enforce_discipline_record_hierarchy();

grant execute on function private.enforce_discipline_record_hierarchy() to authenticated, service_role;
