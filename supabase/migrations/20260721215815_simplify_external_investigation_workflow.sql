-- The detailed investigation is conducted outside the portal. The portal keeps
-- the opening record, a single close action, and the resulting decree.

do $migration$
declare
  decision_definition text;
  preparation_definition text;
begin
  select pg_get_functiondef(
    'public.apply_20260719_discipline_decision(uuid,jsonb)'::regprocedure
  ) into decision_definition;

  if position(
    'v_investigation.opened_by is distinct from p_actor_profile_id'
    in decision_definition
  ) = 0 then
    if position($old_assignment$
    if not (v_actor_roles && array['super_admin']::public.app_role[])
       and v_investigation.assigned_to is distinct from p_actor_profile_id then
      raise exception 'Karar vermeden once sorusturma sorumlulugu alinmalidir.';
    end if;
$old_assignment$ in decision_definition) = 0 then
      raise exception 'Disiplin karar fonksiyonundaki eski sorumluluk denetimi bulunamadi.';
    end if;

    decision_definition := replace(
      decision_definition,
      $old_assignment$
    if not (v_actor_roles && array['super_admin']::public.app_role[])
       and v_investigation.assigned_to is distinct from p_actor_profile_id then
      raise exception 'Karar vermeden once sorusturma sorumlulugu alinmalidir.';
    end if;
$old_assignment$,
      $new_assignment$
    if not (v_actor_roles && array['super_admin']::public.app_role[])
       and v_investigation.opened_by is distinct from p_actor_profile_id then
      raise exception 'Disiplin cezasini yalnizca sorusturmayi acan yetkili verebilir.';
    end if;
$new_assignment$
    );
  end if;

  if position($old_prerequisites$
    if v_investigation.defense_status = 'pending' then
      raise exception 'Savunma suresi tamamlanmadan karar verilemez.';
    end if;
    if coalesce(v_investigation.hearing_required, false) and v_investigation.hearing_held_at is null then
      raise exception 'Zorunlu durusma tamamlanmadan karar verilemez.';
    end if;
$old_prerequisites$ in decision_definition) > 0 then
    decision_definition := replace(
      decision_definition,
      $old_prerequisites$
    if v_investigation.defense_status = 'pending' then
      raise exception 'Savunma suresi tamamlanmadan karar verilemez.';
    end if;
    if coalesce(v_investigation.hearing_required, false) and v_investigation.hearing_held_at is null then
      raise exception 'Zorunlu durusma tamamlanmadan karar verilemez.';
    end if;
$old_prerequisites$,
      E'\n'
    );
  end if;

  execute decision_definition;

  select pg_get_functiondef(
    'private.prepare_20260719_discipline_decision()'::regprocedure
  ) into preparation_definition;

  if position($old_hearing$
  select i.hearing_required, i.hearing_held_at
  into requires_hearing, hearing_completed
  from public.investigations i
  where i.id = new.investigation_id;

  if coalesce(requires_hearing, false) and hearing_completed is null then
    raise exception 'Agir veya cok agir dosyada durusma islemi tamamlanmadan disiplin karari kaydedilemez.';
  end if;
$old_hearing$ in preparation_definition) > 0 then
    preparation_definition := replace(
      preparation_definition,
      $old_hearing$
  select i.hearing_required, i.hearing_held_at
  into requires_hearing, hearing_completed
  from public.investigations i
  where i.id = new.investigation_id;

  if coalesce(requires_hearing, false) and hearing_completed is null then
    raise exception 'Agir veya cok agir dosyada durusma islemi tamamlanmadan disiplin karari kaydedilemez.';
  end if;
$old_hearing$,
      E'\n'
    );
  end if;

  execute preparation_definition;
end;
$migration$;

create or replace function private.enforce_discipline_decision_opener()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  investigation_opener uuid;
  creator_roles public.app_role[] := '{}'::public.app_role[];
  is_reward boolean;
begin
  if new.regulation_version <> '2026-07-19' then
    return new;
  end if;

  is_reward := coalesce(new.sanction_effect, 'none') = 'reward_points'
    or coalesce(new.point_delta, 0) > 0;
  if is_reward or new.decision_status <> 'decided'::public.discipline_status then
    return new;
  end if;

  if new.investigation_id is null then
    raise exception 'Disiplin cezasi icin sorusturma kaydi zorunludur.';
  end if;

  select i.opened_by
  into investigation_opener
  from public.investigations i
  where i.id = new.investigation_id;

  if not found then
    raise exception 'Disiplin cezasina bagli sorusturma bulunamadi.';
  end if;

  select case
    when p.roles is null or cardinality(p.roles) = 0 then array[p.role]
    when p.role = any(p.roles) then p.roles
    else p.roles || p.role
  end
  into creator_roles
  from public.profiles p
  where p.id = new.created_by;

  if not (coalesce(creator_roles, '{}'::public.app_role[]) && array['super_admin']::public.app_role[])
     and new.created_by is distinct from investigation_opener then
    raise exception 'Disiplin cezasini yalnizca sorusturmayi acan yetkili verebilir.';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_discipline_decision_opener()
  from public, anon, authenticated;
grant execute on function private.enforce_discipline_decision_opener()
  to service_role;

drop trigger if exists enforce_discipline_decision_opener
  on public.discipline_records;
create trigger enforce_discipline_decision_opener
  before insert or update of regulation_version, investigation_id, sanction_effect,
    point_delta, decision_status, created_by
  on public.discipline_records
  for each row execute function private.enforce_discipline_decision_opener();
