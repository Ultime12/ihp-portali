alter table public.game_settings
  drop constraint if exists game_settings_attempt_period_check,
  add constraint game_settings_attempt_period_check
    check (attempt_period in ('daily', 'weekly', 'two_days', 'unlimited'));

update public.game_settings
set attempt_period = 'unlimited', updated_at = now();

alter table public.flappy_sessions
  drop constraint if exists flappy_sessions_profile_id_week_start_key;

alter table public.game_attempts
  drop constraint if exists game_attempts_profile_id_game_key_period_key_key;

drop index if exists public.game_credit_requests_open_unique;
create unique index game_credit_requests_open_unique
  on public.game_credit_requests(profile_id, game_key)
  where status in ('pending', 'approved');

delete from public.notifications;
delete from public.audit_logs;
delete from public.flappy_sessions;
delete from public.game_attempts;
delete from public.game_credit_requests;
delete from public.credit_installments;
delete from public.credit_loans;
delete from public.credit_cheques;
delete from public.credit_transactions;
delete from public.credit_accounts;

delete from auth.users
where lower(email) in ('deneme@tfo.k12.tr', 'deneme2@tfo.k12.tr');

create or replace function public.request_game_credit_authorization(p_profile_id uuid, p_game_key text)
returns public.game_credit_requests
language plpgsql security invoker set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_settings public.game_settings%rowtype;
  v_account public.credit_accounts%rowtype;
  v_request public.game_credit_requests%rowtype;
  v_attempt_key text;
begin
  if auth.role() <> 'service_role' then raise exception 'Sunucu yetkisi gerekir.'; end if;
  if p_game_key not in ('flappy', 'snake', 'scratch') then raise exception 'Oyun secimi gecersiz.'; end if;
  select * into v_profile from public.profiles where id = p_profile_id;
  if not found or v_profile.status <> 'active' or v_profile.is_system_account then raise exception 'Aktif uye hesabi bulunamadi.'; end if;
  select * into v_settings from public.game_settings where game_key = p_game_key;
  if not found or not v_settings.enabled then raise exception 'Oyun su anda kapali.'; end if;
  select * into v_account from public.credit_accounts where profile_id = p_profile_id and status = 'active' for update;
  if not found then raise exception 'Once Kredi Sistemi hesabini acmalisiniz.'; end if;
  if v_account.balance < v_settings.entry_cost then raise exception 'Kredi bakiyeniz yetersiz.'; end if;

  if p_game_key = 'flappy' and exists (
    select 1 from public.flappy_sessions where profile_id = p_profile_id and status = 'active' and expires_at > now()
  ) then raise exception 'Devam eden Flappy oyununuzu tamamlamalisiniz.'; end if;
  if p_game_key = 'snake' and exists (
    select 1 from public.game_attempts where profile_id = p_profile_id and game_key = 'snake' and status = 'active' and expires_at > now()
  ) then raise exception 'Devam eden Snake oyununuzu tamamlamalisiniz.'; end if;

  select * into v_request from public.game_credit_requests
  where profile_id = p_profile_id and game_key = p_game_key and status in ('pending', 'approved')
  order by requested_at desc limit 1;
  if found then return v_request; end if;

  v_attempt_key := to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS') || '-' || substr(md5(random()::text), 1, 8);
  insert into public.game_credit_requests(profile_id, account_id, game_key, period_key, credit_amount)
  values (p_profile_id, v_account.id, p_game_key, v_attempt_key, v_settings.entry_cost)
  returning * into v_request;
  return v_request;
end;
$$;

create or replace function public.consume_game_credit_authorization(p_profile_id uuid, p_game_key text)
returns public.game_credit_requests
language plpgsql security invoker set search_path = ''
as $$
declare v_request public.game_credit_requests%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Sunucu yetkisi gerekir.'; end if;
  select * into v_request from public.game_credit_requests
  where profile_id = p_profile_id and game_key = p_game_key and status = 'approved'
  order by requested_at desc limit 1 for update;
  if not found then raise exception 'Kredi Sistemi uzerinden oyun bedelini onaylamalisiniz.'; end if;
  update public.game_credit_requests set status = 'consumed', consumed_at = now()
  where id = v_request.id returning * into v_request;
  return v_request;
end;
$$;

create or replace function public.start_weekly_flappy(p_profile_id uuid, p_seed integer, p_terms_accepted boolean)
returns public.flappy_sessions
language plpgsql security invoker set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_settings public.game_settings%rowtype;
  v_session public.flappy_sessions%rowtype;
  v_local_date date;
begin
  if auth.role() <> 'service_role' then raise exception 'Sunucu yetkisi gerekir.'; end if;
  if p_terms_accepted is not true then raise exception 'Kredi onayi gerekir.'; end if;
  if p_seed is null or p_seed < 1 or p_seed > 2147483646 then raise exception 'Oyun tohumu gecersiz.'; end if;
  select * into v_settings from public.game_settings where game_key = 'flappy' for update;
  if not found or not v_settings.enabled then raise exception 'IHP Flappy su anda kapali.'; end if;
  select * into v_profile from public.profiles where id = p_profile_id;
  if not found or v_profile.status <> 'active' or v_profile.is_system_account then raise exception 'Aktif uye hesabi bulunamadi.'; end if;
  update public.flappy_sessions set status = 'expired', finished_at = coalesce(finished_at, now())
  where profile_id = p_profile_id and status = 'active' and expires_at <= now();
  if exists (select 1 from public.flappy_sessions where profile_id = p_profile_id and status = 'active') then raise exception 'Devam eden Flappy oyununuzu tamamlamalisiniz.'; end if;
  perform public.consume_game_credit_authorization(p_profile_id, 'flappy');
  v_local_date := (now() at time zone 'Europe/Istanbul')::date;
  insert into public.flappy_sessions(profile_id, week_start, seed, entry_cost, reward_target)
  values (p_profile_id, v_local_date, p_seed, v_settings.entry_cost, v_settings.reward_points)
  returning * into v_session;
  insert into public.notifications(recipient_id, actor_id, title, body, category, link)
  values (p_profile_id, p_profile_id, 'Kredili Flappy basladi', v_settings.entry_cost || ' kredilik onay kullanildi.', 'game', '#/portal/games');
  return v_session;
end;
$$;

create or replace function public.start_ranked_snake(p_profile_id uuid, p_seed integer, p_terms_accepted boolean)
returns public.game_attempts
language plpgsql security invoker set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_settings public.game_settings%rowtype;
  v_attempt public.game_attempts%rowtype;
  v_attempt_key text;
begin
  if auth.role() <> 'service_role' then raise exception 'Sunucu yetkisi gerekir.'; end if;
  if p_terms_accepted is not true then raise exception 'Kredi onayi gerekir.'; end if;
  if p_seed is null or p_seed < 1 or p_seed > 2147483646 then raise exception 'Oyun tohumu gecersiz.'; end if;
  select * into v_settings from public.game_settings where game_key = 'snake' for update;
  if not found or not v_settings.enabled then raise exception 'IHP Snake su anda kapali.'; end if;
  select * into v_profile from public.profiles where id = p_profile_id;
  if not found or v_profile.status <> 'active' or v_profile.is_system_account then raise exception 'Aktif uye hesabi bulunamadi.'; end if;
  update public.game_attempts set status = 'expired', finished_at = coalesce(finished_at, now())
  where profile_id = p_profile_id and game_key = 'snake' and status = 'active' and expires_at <= now();
  if exists (select 1 from public.game_attempts where profile_id = p_profile_id and game_key = 'snake' and status = 'active') then raise exception 'Devam eden Snake oyununuzu tamamlamalisiniz.'; end if;
  perform public.consume_game_credit_authorization(p_profile_id, 'snake');
  v_attempt_key := to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS') || '-' || substr(md5(random()::text), 1, 8);
  insert into public.game_attempts(profile_id, game_key, period_key, seed, expires_at, entry_cost, reward_target, target_score)
  values (p_profile_id, 'snake', v_attempt_key, p_seed, now() + interval '12 minutes', v_settings.entry_cost, v_settings.reward_points, v_settings.target_score)
  returning * into v_attempt;
  insert into public.notifications(recipient_id, actor_id, title, body, category, link)
  values (p_profile_id, p_profile_id, 'Kredili Snake basladi', v_settings.entry_cost || ' kredilik onay kullanildi.', 'game', '#/portal/games');
  return v_attempt;
end;
$$;

create or replace function public.play_scratch(p_profile_id uuid, p_random_roll integer, p_terms_accepted boolean)
returns public.game_attempts
language plpgsql security invoker set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_settings public.game_settings%rowtype;
  v_attempt public.game_attempts%rowtype;
  v_attempt_key text;
  v_won boolean;
  v_reward integer := 0;
begin
  if auth.role() <> 'service_role' then raise exception 'Sunucu yetkisi gerekir.'; end if;
  if p_terms_accepted is not true then raise exception 'Kredi onayi gerekir.'; end if;
  if p_random_roll < 0 or p_random_roll > 9999 then raise exception 'Sans sonucu gecersiz.'; end if;
  select * into v_settings from public.game_settings where game_key = 'scratch' for update;
  if not found or not v_settings.enabled then raise exception 'IHP Kazi Kazan su anda kapali.'; end if;
  select * into v_profile from public.profiles where id = p_profile_id;
  if not found or v_profile.status <> 'active' or v_profile.is_system_account then raise exception 'Aktif uye hesabi bulunamadi.'; end if;
  perform public.consume_game_credit_authorization(p_profile_id, 'scratch');
  v_won := p_random_roll < v_settings.win_probability_basis_points;
  if v_won then v_reward := public.award_game_credit(p_profile_id, 'scratch', v_settings.reward_points, 'IHP Kazi Kazan odulu')::integer; end if;
  v_attempt_key := to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS') || '-' || substr(md5(random()::text), 1, 8);
  insert into public.game_attempts(profile_id, game_key, period_key, status, finished_at, entry_cost, reward_target, reward_points, random_roll, result_snapshot)
  values (p_profile_id, 'scratch', v_attempt_key, case when v_won then 'won' else 'lost' end, now(), v_settings.entry_cost, v_settings.reward_points, v_reward, p_random_roll,
    jsonb_build_object('won', v_won, 'probability_basis_points', v_settings.win_probability_basis_points))
  returning * into v_attempt;
  insert into public.notifications(recipient_id, actor_id, title, body, category, link)
  values (p_profile_id, p_profile_id, case when v_won then 'Kazi Kazan kredi odulu' else 'Kazi Kazan tamamlandi' end,
    case when v_won then 'Tebrikler! Kredi hesabiniza ' || v_reward || ' kredi eklendi.' else 'Bu kez odul cikmadi.' end,
    case when v_won then 'reward' else 'game' end, '#/portal/games');
  return v_attempt;
end;
$$;

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.finish_weekly_flappy(uuid,uuid,integer,integer,integer,integer,boolean)'::regprocedure)
  into v_definition;
  execute replace(v_definition, '2 gunluk Flappy tamamlandi', 'Flappy tamamlandi');

  select pg_get_functiondef('public.finish_ranked_snake(uuid,uuid,integer,integer,integer,boolean,text)'::regprocedure)
  into v_definition;
  execute replace(v_definition, '2 gunluk Snake tamamlandi', 'Snake tamamlandi');
end;
$$;

revoke all on function public.request_game_credit_authorization(uuid, text) from public, anon, authenticated;
revoke all on function public.consume_game_credit_authorization(uuid, text) from public, anon, authenticated;
revoke all on function public.start_weekly_flappy(uuid, integer, boolean) from public, anon, authenticated;
revoke all on function public.start_ranked_snake(uuid, integer, boolean) from public, anon, authenticated;
revoke all on function public.play_scratch(uuid, integer, boolean) from public, anon, authenticated;
grant execute on function public.request_game_credit_authorization(uuid, text) to service_role;
grant execute on function public.consume_game_credit_authorization(uuid, text) to service_role;
grant execute on function public.start_weekly_flappy(uuid, integer, boolean) to service_role;
grant execute on function public.start_ranked_snake(uuid, integer, boolean) to service_role;
grant execute on function public.play_scratch(uuid, integer, boolean) to service_role;
