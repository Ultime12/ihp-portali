create or replace function private.enforce_investigation_defense_before_penalty()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  member_state text;
  investigation_matches boolean;
  is_reward boolean;
begin
  is_reward := coalesce(new.sanction_effect, 'none') = 'reward_points'
    or coalesce(new.point_delta, 0) > 0;

  select status
  into member_state
  from public.profiles
  where id = new.member_id;

  if member_state = 'left'
     and (
       coalesce(new.point_delta, 0) <> 0
       or coalesce(new.sanction_effect, 'none') <> 'none'
       or coalesce(new.credit_fine_amount, 0) <> 0
     ) then
    raise exception 'Partiden ayrilan kisi hakkinda gorev, puan veya mali yaptirim uygulanamaz.';
  end if;

  if is_reward then
    return new;
  end if;

  if new.investigation_id is null then
    raise exception 'Disiplin kaydi gecerli bir sorusturmaya baglanmalidir.';
  end if;

  select exists(
    select 1
    from public.investigations i
    where i.id = new.investigation_id
      and i.subject_profile_id = new.member_id
  ) into investigation_matches;

  if not investigation_matches then
    raise exception 'Disiplin kaydi gecerli bir sorusturmaya baglanmalidir.';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_investigation_defense_before_penalty()
  from public, anon, authenticated;
grant execute on function private.enforce_investigation_defense_before_penalty()
  to service_role;
