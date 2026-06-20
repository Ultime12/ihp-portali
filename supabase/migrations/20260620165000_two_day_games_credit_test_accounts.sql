alter table public.profiles
  add column if not exists credit_test_access boolean not null default false;

alter table public.game_settings
  drop constraint if exists game_settings_attempt_period_check;

alter table public.game_settings
  add constraint game_settings_attempt_period_check
  check (attempt_period in ('daily', 'weekly', 'two_days'));

update public.game_settings
set attempt_period = 'two_days', updated_at = now()
where game_key in ('flappy', 'snake', 'scratch');

create or replace function public.start_weekly_flappy(
  p_profile_id uuid,
  p_seed integer,
  p_terms_accepted boolean
)
returns public.flappy_sessions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_settings public.game_settings%rowtype;
  v_session public.flappy_sessions%rowtype;
  v_local_date date;
  v_period_start date;
begin
  if auth.role() <> 'service_role' then raise exception 'Sunucu yetkisi gerekir.'; end if;
  if p_terms_accepted is not true then raise exception 'Puan kullanim metni kabul edilmelidir.'; end if;
  if p_seed is null or p_seed < 1 or p_seed > 2147483646 then raise exception 'Oyun tohumu gecersiz.'; end if;

  select * into v_settings from public.game_settings where game_key = 'flappy' for update;
  if not found or not v_settings.enabled then raise exception 'IHP Flappy su anda kapali.'; end if;
  select * into v_profile from public.profiles where id = p_profile_id for update;
  if not found or v_profile.status <> 'active' or v_profile.is_system_account then
    raise exception 'Aktif uye hesabi bulunamadi.';
  end if;
  if v_profile.discipline_points < v_settings.entry_cost then raise exception 'Disiplin puaniniz yetersiz.'; end if;

  v_local_date := (now() at time zone 'Europe/Istanbul')::date;
  v_period_start := date '2026-01-01' + (((v_local_date - date '2026-01-01') / 2) * 2);
  if exists (select 1 from public.flappy_sessions where profile_id = p_profile_id and week_start = v_period_start) then
    raise exception 'Bu 2 gunluk donemdeki Flappy hakkiniz kullanildi.';
  end if;

  perform set_config('app.bypass_profile_protection', 'on', true);
  update public.profiles set discipline_points = discipline_points - v_settings.entry_cost where id = p_profile_id;
  insert into public.flappy_sessions(profile_id, week_start, seed, entry_cost, reward_target)
  values (p_profile_id, v_period_start, p_seed, v_settings.entry_cost, v_settings.reward_points)
  returning * into v_session;
  insert into public.notifications(recipient_id, actor_id, title, body, category, link)
  values (p_profile_id, p_profile_id, '2 gunluk Flappy basladi',
    v_settings.entry_cost || ' disiplin puani kullanildi; giris bedeli iade edilmez.', 'game', '#/portal/games');
  insert into public.audit_logs(action, actor_id, target_type, target_id, details)
  values ('flappy_weekly_started', p_profile_id, 'flappy_session', v_session.id::text,
    jsonb_build_object('entry_cost', v_settings.entry_cost, 'reward_target', v_settings.reward_points));
  return v_session;
end;
$$;

create or replace function public.finish_weekly_flappy(
  p_session_id uuid,
  p_profile_id uuid,
  p_score integer,
  p_pipes_passed integer,
  p_flap_count integer,
  p_duration_ms integer,
  p_won boolean
)
returns public.flappy_sessions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.flappy_sessions%rowtype;
  v_before integer;
  v_after integer;
  v_reward integer := 0;
begin
  if auth.role() <> 'service_role' then raise exception 'Sunucu yetkisi gerekir.'; end if;
  if p_score < 0 or p_score > 10000 or p_pipes_passed < 0 or p_pipes_passed > 25
     or p_flap_count < 0 or p_flap_count > 1200 or p_duration_ms < 250 or p_duration_ms > 180000
     or p_score <> p_pipes_passed * 400 or p_won is distinct from (p_score >= 10000) then
    raise exception 'Dogrulanmis oyun sonucu gecersiz.';
  end if;
  select * into v_session from public.flappy_sessions
  where id = p_session_id and profile_id = p_profile_id for update;
  if not found then raise exception 'Oyun oturumu bulunamadi.'; end if;
  if v_session.status <> 'active' then return v_session; end if;
  if now() > v_session.expires_at then
    update public.flappy_sessions set status = 'expired', finished_at = now() where id = v_session.id returning * into v_session;
    return v_session;
  end if;
  if p_won then
    select discipline_points into v_before from public.profiles where id = p_profile_id for update;
    v_after := least(200, v_before + v_session.reward_target);
    v_reward := v_after - v_before;
    perform set_config('app.bypass_profile_protection', 'on', true);
    update public.profiles set discipline_points = v_after where id = p_profile_id;
  end if;
  update public.flappy_sessions set status = case when p_won then 'won' else 'failed' end,
    score = p_score, pipes_passed = p_pipes_passed, flap_count = p_flap_count,
    duration_ms = p_duration_ms, reward_points = v_reward, finished_at = now()
  where id = v_session.id returning * into v_session;
  insert into public.notifications(recipient_id, actor_id, title, body, category, link)
  values (p_profile_id, p_profile_id,
    case when p_won then 'Flappy odulu kazanildi' else '2 gunluk Flappy tamamlandi' end,
    case when p_won then 'Tebrikler! ' || v_reward || ' disiplin puani kazandiniz.' else p_score || ' skorla tamamlandi.' end,
    case when p_won then 'reward' else 'game' end, '#/portal/games');
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
  v_period text;
begin
  if auth.role() <> 'service_role' then raise exception 'Sunucu yetkisi gerekir.'; end if;
  if p_terms_accepted is not true then raise exception 'Puan kullanim metni kabul edilmelidir.'; end if;
  if p_seed is null or p_seed < 1 or p_seed > 2147483646 then raise exception 'Oyun tohumu gecersiz.'; end if;
  select * into v_settings from public.game_settings where game_key = 'snake' for update;
  if not found or not v_settings.enabled then raise exception 'IHP Snake su anda kapali.'; end if;
  select * into v_profile from public.profiles where id = p_profile_id for update;
  if not found or v_profile.status <> 'active' or v_profile.is_system_account then raise exception 'Aktif uye hesabi bulunamadi.'; end if;
  if v_profile.discipline_points < v_settings.entry_cost then raise exception 'Disiplin puaniniz yetersiz.'; end if;
  v_period := to_char(date '2026-01-01' + (((((now() at time zone 'Europe/Istanbul')::date - date '2026-01-01') / 2) * 2)), 'YYYY-MM-DD');
  if exists (select 1 from public.game_attempts where profile_id = p_profile_id and game_key = 'snake' and period_key = v_period) then
    raise exception 'Bu 2 gunluk donemdeki Snake hakkiniz kullanildi.';
  end if;
  perform set_config('app.bypass_profile_protection', 'on', true);
  update public.profiles set discipline_points = discipline_points - v_settings.entry_cost where id = p_profile_id;
  insert into public.game_attempts(profile_id, game_key, period_key, seed, expires_at, entry_cost, reward_target, target_score)
  values (p_profile_id, 'snake', v_period, p_seed, now() + interval '12 minutes',
    v_settings.entry_cost, v_settings.reward_points, v_settings.target_score)
  returning * into v_attempt;
  insert into public.notifications(recipient_id, actor_id, title, body, category, link)
  values (p_profile_id, p_profile_id, '2 gunluk Snake basladi',
    v_settings.entry_cost || ' disiplin puani kullanildi; giris bedeli iade edilmez.', 'game', '#/portal/games');
  return v_attempt;
end;
$$;

create or replace function public.finish_ranked_snake(
  p_attempt_id uuid, p_profile_id uuid, p_score integer, p_event_count integer,
  p_duration_ms integer, p_won boolean, p_outcome text
)
returns public.game_attempts
language plpgsql security invoker set search_path = ''
as $$
declare
  v_attempt public.game_attempts%rowtype;
  v_before integer;
  v_after integer;
  v_reward integer := 0;
begin
  if auth.role() <> 'service_role' then raise exception 'Sunucu yetkisi gerekir.'; end if;
  if p_score < 0 or p_score > 50000 or p_event_count < 0 or p_event_count > 4000
     or p_duration_ms < 100 or p_duration_ms > 600000 or p_outcome not in ('won','crashed','timeout') then
    raise exception 'Snake sonucu gecersiz.';
  end if;
  select * into v_attempt from public.game_attempts
  where id = p_attempt_id and profile_id = p_profile_id and game_key = 'snake' for update;
  if not found then raise exception 'Snake oturumu bulunamadi.'; end if;
  if v_attempt.status <> 'active' then return v_attempt; end if;
  if now() > v_attempt.expires_at then
    update public.game_attempts set status = 'expired', finished_at = now() where id = v_attempt.id returning * into v_attempt;
    return v_attempt;
  end if;
  if p_won is distinct from (p_score >= v_attempt.target_score) then raise exception 'Snake sonucu hedefle uyusmuyor.'; end if;
  if p_won then
    select discipline_points into v_before from public.profiles where id = p_profile_id for update;
    v_after := least(200, v_before + v_attempt.reward_target);
    v_reward := v_after - v_before;
    perform set_config('app.bypass_profile_protection', 'on', true);
    update public.profiles set discipline_points = v_after where id = p_profile_id;
  end if;
  update public.game_attempts set status = case when p_won then 'won' else 'lost' end,
    score = p_score, event_count = p_event_count, duration_ms = p_duration_ms,
    reward_points = v_reward, result_snapshot = jsonb_build_object('outcome', p_outcome), finished_at = now()
  where id = v_attempt.id returning * into v_attempt;
  insert into public.notifications(recipient_id, actor_id, title, body, category, link)
  values (p_profile_id, p_profile_id,
    case when p_won then 'Snake odulu kazanildi' else '2 gunluk Snake tamamlandi' end,
    case when p_won then 'Tebrikler! ' || v_reward || ' disiplin puani kazandiniz.' else p_score || ' skorla tamamlandi.' end,
    case when p_won then 'reward' else 'game' end, '#/portal/games');
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
  v_period text;
  v_won boolean;
  v_before integer;
  v_after integer;
  v_reward integer := 0;
begin
  if auth.role() <> 'service_role' then raise exception 'Sunucu yetkisi gerekir.'; end if;
  if p_terms_accepted is not true then raise exception 'Puan kullanim metni kabul edilmelidir.'; end if;
  if p_random_roll < 0 or p_random_roll > 9999 then raise exception 'Sans sonucu gecersiz.'; end if;
  select * into v_settings from public.game_settings where game_key = 'scratch' for update;
  if not found or not v_settings.enabled then raise exception 'IHP Kazi Kazan su anda kapali.'; end if;
  select * into v_profile from public.profiles where id = p_profile_id for update;
  if not found or v_profile.status <> 'active' or v_profile.is_system_account then raise exception 'Aktif uye hesabi bulunamadi.'; end if;
  if v_profile.discipline_points < v_settings.entry_cost then raise exception 'Disiplin puaniniz yetersiz.'; end if;
  v_period := to_char(date '2026-01-01' + (((((now() at time zone 'Europe/Istanbul')::date - date '2026-01-01') / 2) * 2)), 'YYYY-MM-DD');
  if exists (select 1 from public.game_attempts where profile_id = p_profile_id and game_key = 'scratch' and period_key = v_period) then
    raise exception 'Bu 2 gunluk donemdeki Kazi Kazan hakkiniz kullanildi.';
  end if;
  v_won := p_random_roll < v_settings.win_probability_basis_points;
  perform set_config('app.bypass_profile_protection', 'on', true);
  update public.profiles set discipline_points = discipline_points - v_settings.entry_cost where id = p_profile_id;
  if v_won then
    select discipline_points into v_before from public.profiles where id = p_profile_id for update;
    v_after := least(200, v_before + v_settings.reward_points);
    v_reward := v_after - v_before;
    update public.profiles set discipline_points = v_after where id = p_profile_id;
  end if;
  insert into public.game_attempts(profile_id, game_key, period_key, status, finished_at,
    entry_cost, reward_target, reward_points, random_roll, result_snapshot)
  values (p_profile_id, 'scratch', v_period, case when v_won then 'won' else 'lost' end, now(),
    v_settings.entry_cost, v_settings.reward_points, v_reward, p_random_roll,
    jsonb_build_object('won', v_won, 'probability_basis_points', v_settings.win_probability_basis_points))
  returning * into v_attempt;
  insert into public.notifications(recipient_id, actor_id, title, body, category, link)
  values (p_profile_id, p_profile_id,
    case when v_won then 'Kazi Kazan odulu' else 'Kazi Kazan tamamlandi' end,
    case when v_won then 'Tebrikler! ' || v_reward || ' disiplin puani kazandiniz.' else 'Bu kez odul cikmadi.' end,
    case when v_won then 'reward' else 'game' end, '#/portal/games');
  return v_attempt;
end;
$$;

revoke all on function public.start_weekly_flappy(uuid, integer, boolean) from public, anon, authenticated;
revoke all on function public.finish_weekly_flappy(uuid, uuid, integer, integer, integer, integer, boolean) from public, anon, authenticated;
revoke all on function public.start_ranked_snake(uuid, integer, boolean) from public, anon, authenticated;
revoke all on function public.finish_ranked_snake(uuid, uuid, integer, integer, integer, boolean, text) from public, anon, authenticated;
revoke all on function public.play_scratch(uuid, integer, boolean) from public, anon, authenticated;
grant execute on function public.start_weekly_flappy(uuid, integer, boolean) to service_role;
grant execute on function public.finish_weekly_flappy(uuid, uuid, integer, integer, integer, integer, boolean) to service_role;
grant execute on function public.start_ranked_snake(uuid, integer, boolean) to service_role;
grant execute on function public.finish_ranked_snake(uuid, uuid, integer, integer, integer, boolean, text) to service_role;
grant execute on function public.play_scratch(uuid, integer, boolean) to service_role;

select set_config('app.bypass_profile_protection', 'on', true);

update public.profiles
set
  is_system_account = true,
  credit_test_access = true,
  status = 'active',
  role = 'member',
  roles = array['member']::public.app_role[]
where email in ('deneme@tfo.k12.tr', 'deneme2@tfo.k12.tr');

update public.profiles
set discipline_points = 80
where email = 'tuna.kose@tfo.k12.tr';

update public.credit_settings
set member_access_enabled = true, updated_at = now()
where id = 'main';

insert into public.credit_accounts(profile_id, account_code, balance, status)
select p.id,
  case p.email when 'deneme@tfo.k12.tr' then 'IHP900000001' else 'IHP900000002' end,
  0,
  'active'
from public.profiles p
where p.email in ('deneme@tfo.k12.tr', 'deneme2@tfo.k12.tr')
on conflict (profile_id) do update
set status = 'active', closed_at = null, balance = 0;

delete from public.notifications;
delete from public.audit_logs;
