create or replace function public.request_scratch_credit_authorization(
  p_profile_id uuid,
  p_quantity integer
)
returns public.game_credit_requests
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_settings public.game_settings%rowtype;
  v_account public.credit_accounts%rowtype;
  v_request public.game_credit_requests%rowtype;
  v_total bigint;
  v_attempt_key text;
begin
  if auth.role() <> 'service_role' then raise exception 'Sunucu yetkisi gerekir.'; end if;
  if p_quantity < 1 or p_quantity > 10 then raise exception 'Kart adedi 1 ile 10 arasinda olmalidir.'; end if;

  select * into v_profile from public.profiles where id = p_profile_id;
  if not found or v_profile.status <> 'active' or v_profile.is_system_account then
    raise exception 'Aktif uye hesabi bulunamadi.';
  end if;

  select * into v_settings from public.game_settings where game_key = 'scratch';
  if not found or not v_settings.enabled then raise exception 'IHP Kazi Kazan su anda kapali.'; end if;
  v_total := v_settings.entry_cost::bigint * p_quantity::bigint;

  select * into v_account
  from public.credit_accounts
  where profile_id = p_profile_id and status = 'active'
  for update;
  if not found then raise exception 'Once Kredi Sistemi hesabini acmalisiniz.'; end if;
  if v_account.balance < v_total then raise exception 'Kredi bakiyeniz yetersiz.'; end if;

  select * into v_request
  from public.game_credit_requests
  where profile_id = p_profile_id
    and game_key = 'scratch'
    and status in ('pending', 'approved')
  order by requested_at desc
  limit 1;
  if found then
    if v_request.credit_amount <> v_total then
      raise exception 'Mevcut Kazi Kazan talebi sonuclanmadan kart adedi degistirilemez.';
    end if;
    return v_request;
  end if;

  v_attempt_key := to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS') || '-' || substr(md5(random()::text), 1, 8);
  insert into public.game_credit_requests(profile_id, account_id, game_key, period_key, credit_amount)
  values (p_profile_id, v_account.id, 'scratch', v_attempt_key, v_total)
  returning * into v_request;
  return v_request;
end;
$$;

create or replace function public.play_scratch_batch(
  p_profile_id uuid,
  p_random_rolls integer[],
  p_terms_accepted boolean
)
returns setof public.game_attempts
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_settings public.game_settings%rowtype;
  v_request public.game_credit_requests%rowtype;
  v_attempt public.game_attempts%rowtype;
  v_roll integer;
  v_won boolean;
  v_reward integer;
  v_total_reward bigint := 0;
  v_wins integer := 0;
  v_quantity integer;
  v_attempt_key text;
begin
  if auth.role() <> 'service_role' then raise exception 'Sunucu yetkisi gerekir.'; end if;
  if p_terms_accepted is not true then raise exception 'Kredi onayi gerekir.'; end if;
  v_quantity := coalesce(cardinality(p_random_rolls), 0);
  if v_quantity < 1 or v_quantity > 10 then raise exception 'Kart adedi 1 ile 10 arasinda olmalidir.'; end if;

  select * into v_profile from public.profiles where id = p_profile_id;
  if not found or v_profile.status <> 'active' or v_profile.is_system_account then
    raise exception 'Aktif uye hesabi bulunamadi.';
  end if;
  select * into v_settings from public.game_settings where game_key = 'scratch' for update;
  if not found or not v_settings.enabled then raise exception 'IHP Kazi Kazan su anda kapali.'; end if;

  select * into v_request
  from public.game_credit_requests
  where profile_id = p_profile_id and game_key = 'scratch' and status = 'approved'
  order by requested_at desc
  limit 1
  for update;
  if not found then raise exception 'Kredi Sistemi uzerinden oyun bedelini onaylamalisiniz.'; end if;
  if v_request.credit_amount <> v_settings.entry_cost::bigint * v_quantity::bigint then
    raise exception 'Onaylanan kart adedi ile acilan kart adedi uyusmuyor.';
  end if;

  update public.game_credit_requests
  set status = 'consumed', consumed_at = now()
  where id = v_request.id;

  foreach v_roll in array p_random_rolls loop
    if v_roll < 0 or v_roll > 9999 then raise exception 'Sans sonucu gecersiz.'; end if;
    v_won := v_roll < v_settings.win_probability_basis_points;
    v_reward := 0;
    if v_won then
      v_reward := public.award_game_credit(
        p_profile_id,
        'scratch',
        v_settings.reward_points,
        'IHP Kazi Kazan odulu'
      )::integer;
      v_wins := v_wins + 1;
      v_total_reward := v_total_reward + v_reward;
    end if;
    v_attempt_key := to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS') || '-' || substr(md5(random()::text), 1, 8);
    insert into public.game_attempts(
      profile_id,
      game_key,
      period_key,
      status,
      finished_at,
      entry_cost,
      reward_target,
      reward_points,
      random_roll,
      result_snapshot
    )
    values (
      p_profile_id,
      'scratch',
      v_attempt_key,
      case when v_won then 'won' else 'lost' end,
      now(),
      v_settings.entry_cost,
      v_settings.reward_points,
      v_reward,
      v_roll,
      jsonb_build_object(
        'won', v_won,
        'batch_size', v_quantity,
        'probability_basis_points', v_settings.win_probability_basis_points
      )
    )
    returning * into v_attempt;
    return next v_attempt;
  end loop;

  insert into public.notifications(recipient_id, actor_id, title, body, category, link)
  values (
    p_profile_id,
    p_profile_id,
    case when v_wins > 0 then 'Kazi Kazan paketi tamamlandi' else 'Kazi Kazan tamamlandi' end,
    v_quantity || ' kart acildi; ' || v_wins || ' kart kazandi. Toplam odul: ' || v_total_reward || ' kredi.',
    case when v_wins > 0 then 'reward' else 'game' end,
    '#/portal/games'
  );
end;
$$;

revoke all on function public.request_scratch_credit_authorization(uuid, integer) from public, anon, authenticated;
revoke all on function public.play_scratch_batch(uuid, integer[], boolean) from public, anon, authenticated;
grant execute on function public.request_scratch_credit_authorization(uuid, integer) to service_role;
grant execute on function public.play_scratch_batch(uuid, integer[], boolean) to service_role;
