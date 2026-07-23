do $migration$
declare
  decision_definition text;
begin
  select pg_get_functiondef(
    'public.apply_20260719_discipline_decision(uuid,jsonb)'::regprocedure
  ) into decision_definition;

  if position($new_validation$
      select * into v_recipient_profile
      from public.profiles
      where id = v_recipient_profile_id
        and not is_system_account
        and status = 'active'
      for update;
      if not found then
        raise exception 'Magdur profili bulunamadi.';
      end if;
      if v_recipient_profile_id = p_actor_profile_id then
        raise exception 'Karari veren kisi finansal odeme alicisi olamaz.';
      end if;
$new_validation$ in decision_definition) > 0 then
    return;
  end if;

  if position($old_validation$
      select * into v_recipient_profile
      from public.profiles
      where id = v_recipient_profile_id
        and not is_system_account
        and status in ('active', 'passive', 'suspended')
      for update;
      if not found then
        raise exception 'Magdur profili bulunamadi.';
      end if;
      v_recipient_roles := case
        when v_recipient_profile.roles is null or cardinality(v_recipient_profile.roles) = 0 then array[v_recipient_profile.role]
        when v_recipient_profile.role = any(v_recipient_profile.roles) then v_recipient_profile.roles
        else v_recipient_profile.roles || v_recipient_profile.role
      end;
      if v_recipient_profile_id = p_actor_profile_id
         or v_recipient_profile_id = v_investigation.assigned_to
         or v_recipient_roles && array['discipline_chair', 'discipline_vice_chair', 'discipline_member']::public.app_role[] then
        raise exception 'DK gorevlisi veya karar verici finansal odeme alicisi olamaz.';
      end if;
$old_validation$ in decision_definition) = 0 then
    raise exception 'Disiplin finansal alici denetimi bulunamadi.';
  end if;

  decision_definition := replace(
    decision_definition,
    $old_validation$
      select * into v_recipient_profile
      from public.profiles
      where id = v_recipient_profile_id
        and not is_system_account
        and status in ('active', 'passive', 'suspended')
      for update;
      if not found then
        raise exception 'Magdur profili bulunamadi.';
      end if;
      v_recipient_roles := case
        when v_recipient_profile.roles is null or cardinality(v_recipient_profile.roles) = 0 then array[v_recipient_profile.role]
        when v_recipient_profile.role = any(v_recipient_profile.roles) then v_recipient_profile.roles
        else v_recipient_profile.roles || v_recipient_profile.role
      end;
      if v_recipient_profile_id = p_actor_profile_id
         or v_recipient_profile_id = v_investigation.assigned_to
         or v_recipient_roles && array['discipline_chair', 'discipline_vice_chair', 'discipline_member']::public.app_role[] then
        raise exception 'DK gorevlisi veya karar verici finansal odeme alicisi olamaz.';
      end if;
$old_validation$,
    $new_validation$
      select * into v_recipient_profile
      from public.profiles
      where id = v_recipient_profile_id
        and not is_system_account
        and status = 'active'
      for update;
      if not found then
        raise exception 'Magdur profili bulunamadi.';
      end if;
      if v_recipient_profile_id = p_actor_profile_id then
        raise exception 'Karari veren kisi finansal odeme alicisi olamaz.';
      end if;
$new_validation$
  );

  execute decision_definition;
end;
$migration$;
