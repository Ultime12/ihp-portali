create or replace function private.enforce_discipline_record_hierarchy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_roles public.app_role[];
  target_roles public.app_role[];
  actor_rank integer;
  target_rank integer;
  is_reward boolean;
  is_leadership boolean;
  is_authority_or_status_effect boolean;
  is_upper_point_limit_target boolean;
  is_limited_upper_rank_point_penalty boolean;
begin
  if new.decision_status = 'decided'::public.discipline_status
     and btrim(coalesce(new.decree_text, '')) = '' then
    raise exception 'Kararname metni zorunludur.';
  end if;

  is_reward := coalesce(new.sanction_effect, 'none') = 'reward_points'
    or coalesce(new.point_delta, 0) > 0;

  if auth.uid() is null then
    if new.decision_status = 'decided'::public.discipline_status
       and not is_reward and new.investigation_id is null then
      raise exception 'Ceza kararnamesi icin once sorusturma secilmelidir.';
    end if;
    return new;
  end if;

  actor_roles := private.current_app_roles();

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

  if new.decision_status = 'decided'::public.discipline_status
     and not is_reward and new.investigation_id is null then
    raise exception 'Ceza kararnamesi icin once sorusturma secilmelidir.';
  end if;

  if actor_roles && array['super_admin']::public.app_role[] then
    return new;
  end if;

  if is_reward then
    if actor_roles && array['president','discipline_chair']::public.app_role[] then
      return new;
    end if;
    raise exception 'Odul puani icin admin, baskan veya disiplin kurulu baskani yetkisi gerekir.';
  end if;

  if not (actor_roles && array['discipline_chair','discipline_vice_chair','discipline_member']::public.app_role[]) then
    raise exception 'Disiplin kaydi icin disiplin kurulu yetkisi gerekir.';
  end if;

  if target_roles && array['super_admin']::public.app_role[] then
    raise exception 'Admin hesabi disiplin kurulu hiyerarsisi disinda korunur.';
  end if;

  is_leadership := target_roles && array['president','vice_president']::public.app_role[];
  is_authority_or_status_effect := coalesce(new.sanction_effect, 'none') in (
    'remove_roles',
    'suspend_member',
    'party_suspension',
    'passive_member'
  );

  if is_leadership and is_authority_or_status_effect then
    raise exception 'Baskan ve baskan yardimcisina yetki alma veya uyelik durumu yaptirimi uygulanamaz; puan veya para cezasi girilebilir.';
  end if;

  actor_rank := private.discipline_rank(actor_roles);
  target_rank := private.discipline_rank(target_roles);
  is_upper_point_limit_target := (target_roles && array[
    'president',
    'vice_president',
    'presidential_aide',
    'discipline_chair',
    'discipline_vice_chair'
  ]::public.app_role[])
    or (actor_rank > 0 and target_rank > 0 and target_rank >= actor_rank);

  if is_upper_point_limit_target and coalesce(new.point_delta, 0) < -50 then
    raise exception 'Ust rutbe uyelere admin disinda en fazla 50 puan ceza yazilabilir.';
  end if;

  is_limited_upper_rank_point_penalty := coalesce(new.sanction_effect, 'none') in ('none', 'points_only')
    and coalesce(new.point_delta, 0) < 0
    and coalesce(new.point_delta, 0) >= -50
    and coalesce(new.credit_fine_amount, 0) = 0
    and not is_authority_or_status_effect;

  if target_rank > 0 and target_rank >= actor_rank and not is_limited_upper_rank_point_penalty then
    raise exception 'Disiplin hiyerarsisi bu kayda izin vermiyor.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_discipline_record_hierarchy_before_change on public.discipline_records;
create trigger enforce_discipline_record_hierarchy_before_change
  before insert or update of member_id, decision_status, decree_text, point_delta, sanction_effect, investigation_id, credit_fine_amount
  on public.discipline_records
  for each row execute function private.enforce_discipline_record_hierarchy();

grant execute on function private.enforce_discipline_record_hierarchy() to authenticated, service_role;
