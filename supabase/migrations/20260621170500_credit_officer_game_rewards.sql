alter table public.game_settings
  drop constraint if exists game_settings_reward_points_check;
alter table public.game_settings
  add constraint game_settings_reward_points_check check (reward_points between 0 and 100000);

alter table public.game_attempts
  drop constraint if exists game_attempts_reward_target_check,
  drop constraint if exists game_attempts_reward_points_check;
alter table public.game_attempts
  add constraint game_attempts_reward_target_check check (reward_target between 0 and 100000),
  add constraint game_attempts_reward_points_check check (reward_points between 0 and 100000);

alter table public.flappy_sessions
  drop constraint if exists flappy_sessions_reward_target_range,
  drop constraint if exists flappy_sessions_reward_points_range;
alter table public.flappy_sessions
  add constraint flappy_sessions_reward_target_range check (reward_target between 0 and 100000),
  add constraint flappy_sessions_reward_points_range check (reward_points between 0 and 100000);

alter table public.credit_transactions
  drop constraint if exists credit_transactions_kind_check;
alter table public.credit_transactions
  add constraint credit_transactions_kind_check check (kind in (
    'account_opened', 'transfer_out', 'transfer_in', 'transfer_tax',
    'weekly_allowance', 'cheque_issue', 'cheque_redeem',
    'loan_disbursement', 'loan_repayment', 'balance_forfeit', 'admin_adjustment',
    'game_entry', 'game_reward'
  ));

create or replace function public.award_game_credit(
  p_profile_id uuid,
  p_game_key text,
  p_amount bigint,
  p_reference text
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_account public.credit_accounts%rowtype;
  v_reward bigint;
  v_after bigint;
begin
  if auth.role() <> 'service_role' then raise exception 'Sunucu yetkisi gerekir.'; end if;
  if p_game_key not in ('flappy', 'snake', 'scratch') or p_amount < 0 or p_amount > 100000 then
    raise exception 'Oyun kredi odulu gecersiz.';
  end if;
  if p_amount = 0 then return 0; end if;

  select * into v_account from public.credit_accounts
  where profile_id = p_profile_id and status = 'active' for update;
  if not found then raise exception 'Aktif kredi hesabi bulunamadi.'; end if;

  v_reward := least(p_amount, 100000000 - v_account.balance);
  if v_reward <= 0 then return 0; end if;
  v_after := v_account.balance + v_reward;
  update public.credit_accounts set balance = v_after, updated_at = now()
  where id = v_account.id;
  insert into public.credit_transactions(account_id, kind, amount, balance_after, reference, metadata)
  values (
    v_account.id, 'game_reward', v_reward, v_after, left(coalesce(p_reference, 'Oyun odulu'), 200),
    jsonb_build_object('game_key', p_game_key, 'profile_id', p_profile_id)
  );
  return v_reward;
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
    update public.flappy_sessions set status = 'expired', finished_at = now()
    where id = v_session.id returning * into v_session;
    return v_session;
  end if;
  if p_won then
    v_reward := public.award_game_credit(p_profile_id, 'flappy', v_session.reward_target, 'IHP Flappy odulu')::integer;
  end if;
  update public.flappy_sessions set status = case when p_won then 'won' else 'failed' end,
    score = p_score, pipes_passed = p_pipes_passed, flap_count = p_flap_count,
    duration_ms = p_duration_ms, reward_points = v_reward, finished_at = now()
  where id = v_session.id returning * into v_session;
  insert into public.notifications(recipient_id, actor_id, title, body, category, link)
  values (p_profile_id, p_profile_id,
    case when p_won then 'Flappy kredi odulu kazanildi' else '2 gunluk Flappy tamamlandi' end,
    case when p_won then 'Tebrikler! Kredi hesabiniza ' || v_reward || ' kredi eklendi.' else p_score || ' skorla tamamlandi.' end,
    case when p_won then 'reward' else 'game' end, '#/portal/games');
  return v_session;
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
    update public.game_attempts set status = 'expired', finished_at = now()
    where id = v_attempt.id returning * into v_attempt;
    return v_attempt;
  end if;
  if p_won is distinct from (p_score >= v_attempt.target_score) then raise exception 'Snake sonucu hedefle uyusmuyor.'; end if;
  if p_won then
    v_reward := public.award_game_credit(p_profile_id, 'snake', v_attempt.reward_target, 'IHP Snake odulu')::integer;
  end if;
  update public.game_attempts set status = case when p_won then 'won' else 'lost' end,
    score = p_score, event_count = p_event_count, duration_ms = p_duration_ms,
    reward_points = v_reward, result_snapshot = jsonb_build_object('outcome', p_outcome), finished_at = now()
  where id = v_attempt.id returning * into v_attempt;
  insert into public.notifications(recipient_id, actor_id, title, body, category, link)
  values (p_profile_id, p_profile_id,
    case when p_won then 'Snake kredi odulu kazanildi' else '2 gunluk Snake tamamlandi' end,
    case when p_won then 'Tebrikler! Kredi hesabiniza ' || v_reward || ' kredi eklendi.' else p_score || ' skorla tamamlandi.' end,
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
  v_reward integer := 0;
begin
  if auth.role() <> 'service_role' then raise exception 'Sunucu yetkisi gerekir.'; end if;
  if p_terms_accepted is not true then raise exception 'Kredi onayi gerekir.'; end if;
  if p_random_roll < 0 or p_random_roll > 9999 then raise exception 'Sans sonucu gecersiz.'; end if;
  select * into v_settings from public.game_settings where game_key = 'scratch' for update;
  if not found or not v_settings.enabled then raise exception 'IHP Kazi Kazan su anda kapali.'; end if;
  select * into v_profile from public.profiles where id = p_profile_id;
  if not found or v_profile.status <> 'active' or v_profile.is_system_account then raise exception 'Aktif uye hesabi bulunamadi.'; end if;
  v_period := to_char(date '2026-01-01' + ((((now() at time zone 'Europe/Istanbul')::date - date '2026-01-01') / 2) * 2), 'YYYY-MM-DD');
  if exists (select 1 from public.game_attempts where profile_id = p_profile_id and game_key = 'scratch' and period_key = v_period) then
    raise exception 'Bu 2 gunluk donemdeki Kazi Kazan hakkiniz kullanildi.';
  end if;
  perform public.consume_game_credit_authorization(p_profile_id, 'scratch');
  v_won := p_random_roll < v_settings.win_probability_basis_points;
  if v_won then
    v_reward := public.award_game_credit(p_profile_id, 'scratch', v_settings.reward_points, 'IHP Kazi Kazan odulu')::integer;
  end if;
  insert into public.game_attempts(profile_id, game_key, period_key, status, finished_at,
    entry_cost, reward_target, reward_points, random_roll, result_snapshot)
  values (p_profile_id, 'scratch', v_period, case when v_won then 'won' else 'lost' end, now(),
    v_settings.entry_cost, v_settings.reward_points, v_reward, p_random_roll,
    jsonb_build_object('won', v_won, 'probability_basis_points', v_settings.win_probability_basis_points))
  returning * into v_attempt;
  insert into public.notifications(recipient_id, actor_id, title, body, category, link)
  values (p_profile_id, p_profile_id,
    case when v_won then 'Kazi Kazan kredi odulu' else 'Kazi Kazan tamamlandi' end,
    case when v_won then 'Tebrikler! Kredi hesabiniza ' || v_reward || ' kredi eklendi.' else 'Bu kez odul cikmadi.' end,
    case when v_won then 'reward' else 'game' end, '#/portal/games');
  return v_attempt;
end;
$$;

create or replace function public.admin_adjust_credit_balance(
  p_admin_profile_id uuid,
  p_account_id uuid,
  p_delta bigint,
  p_reason text
)
returns public.credit_accounts
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_admin public.profiles%rowtype;
  v_account public.credit_accounts%rowtype;
  v_after bigint;
  v_reason text;
begin
  if auth.role() <> 'service_role' then raise exception 'Sunucu yetkisi gerekir.'; end if;
  if p_delta is null or p_delta = 0 or abs(p_delta) > 1000000 then raise exception 'Bakiye degisikligi gecersiz.'; end if;
  v_reason := btrim(coalesce(p_reason, ''));
  if char_length(v_reason) < 5 or char_length(v_reason) > 300 then
    raise exception 'Islem gerekcesi 5 ile 300 karakter arasinda olmalidir.';
  end if;
  select * into v_admin from public.profiles where id = p_admin_profile_id;
  if not found or v_admin.status <> 'active'
     or not (coalesce(v_admin.roles, array[v_admin.role]) && array['super_admin','credit_officer']::public.app_role[]) then
    raise exception 'Kredi yonetimi yetkisi gerekir.';
  end if;
  select * into v_account from public.credit_accounts where id = p_account_id and status = 'active' for update;
  if not found then raise exception 'Aktif kredi hesabi bulunamadi.'; end if;
  v_after := v_account.balance + p_delta;
  if v_after < 0 or v_after > 100000000 then raise exception 'Hesap bakiyesi izin verilen araligin disina cikamaz.'; end if;
  update public.credit_accounts set balance = v_after, updated_at = now()
  where id = v_account.id returning * into v_account;
  insert into public.credit_transactions(account_id, kind, amount, balance_after, reference, metadata)
  values (v_account.id, 'admin_adjustment', abs(p_delta), v_after, v_reason,
    jsonb_build_object('direction', case when p_delta > 0 then 'credit' else 'debit' end,
      'manager_profile_id', p_admin_profile_id, 'reason', v_reason));
  insert into public.notifications(recipient_id, actor_id, title, body, category, link)
  values (v_account.profile_id, p_admin_profile_id,
    case when p_delta > 0 then 'Hesabiniza kredi eklendi' else 'Hesabinizdan kredi cekildi' end,
    abs(p_delta) || ' kredi. Gerekce: ' || v_reason || '. Yeni bakiye: ' || v_after || ' kredi.',
    'credit', '#/portal/credit');
  return v_account;
end;
$$;

create or replace function public.review_credit_loan(
  p_admin_profile_id uuid, p_loan_id uuid, p_decision text, p_note text default ''
)
returns public.credit_loans
language plpgsql security invoker set search_path = ''
as $$
declare
  v_loan public.credit_loans%rowtype;
  v_account public.credit_accounts%rowtype;
  v_piece bigint;
  v_remaining bigint;
  v_index integer;
begin
  if auth.role() <> 'service_role' then raise exception 'Sunucu yetkisi gerekir.'; end if;
  if not exists (
    select 1 from public.profiles p where p.id = p_admin_profile_id and p.status = 'active'
      and coalesce(p.roles, array[p.role]) && array['super_admin','credit_officer']::public.app_role[]
  ) then raise exception 'Kredi yonetimi yetkisi gerekir.'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Karar gecersiz.'; end if;
  select * into v_loan from public.credit_loans where id = p_loan_id for update;
  if not found or v_loan.status <> 'pending' then raise exception 'Bekleyen kredi basvurusu bulunamadi.'; end if;
  update public.credit_loans set status = p_decision, decided_by = p_admin_profile_id,
    decided_at = now(), decision_note = left(coalesce(p_note,''), 600),
    due_at = case when p_decision = 'approved' then now() + make_interval(days => v_loan.term_days) else null end
  where id = v_loan.id returning * into v_loan;
  if p_decision = 'approved' then
    select * into v_account from public.credit_accounts where id = v_loan.account_id and status = 'active' for update;
    if not found then raise exception 'Kredi hesabi aktif degil.'; end if;
    update public.credit_accounts set balance = balance + v_loan.principal where id = v_account.id;
    insert into public.credit_transactions(account_id, kind, amount, balance_after, reference, metadata)
    values (v_account.id, 'loan_disbursement', v_loan.principal, v_account.balance + v_loan.principal,
      'Kredi ' || v_loan.id::text, jsonb_build_object('total_due', v_loan.total_due));
    v_piece := ceil(v_loan.total_due::numeric / v_loan.installment_count)::bigint;
    v_remaining := v_loan.total_due;
    for v_index in 1..v_loan.installment_count loop
      insert into public.credit_installments(loan_id, installment_no, amount, due_at)
      values (v_loan.id, v_index, least(v_piece, v_remaining),
        now() + make_interval(days => ceil(v_loan.term_days::numeric * v_index / v_loan.installment_count)::integer));
      v_remaining := v_remaining - least(v_piece, v_remaining);
    end loop;
  end if;
  return v_loan;
end;
$$;

revoke all on function public.award_game_credit(uuid, text, bigint, text) from public, anon, authenticated;
revoke all on function public.finish_weekly_flappy(uuid, uuid, integer, integer, integer, integer, boolean) from public, anon, authenticated;
revoke all on function public.finish_ranked_snake(uuid, uuid, integer, integer, integer, boolean, text) from public, anon, authenticated;
revoke all on function public.play_scratch(uuid, integer, boolean) from public, anon, authenticated;
revoke all on function public.admin_adjust_credit_balance(uuid, uuid, bigint, text) from public, anon, authenticated;
revoke all on function public.review_credit_loan(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.award_game_credit(uuid, text, bigint, text) to service_role;
grant execute on function public.finish_weekly_flappy(uuid, uuid, integer, integer, integer, integer, boolean) to service_role;
grant execute on function public.finish_ranked_snake(uuid, uuid, integer, integer, integer, boolean, text) to service_role;
grant execute on function public.play_scratch(uuid, integer, boolean) to service_role;
grant execute on function public.admin_adjust_credit_balance(uuid, uuid, bigint, text) to service_role;
grant execute on function public.review_credit_loan(uuid, uuid, text, text) to service_role;
