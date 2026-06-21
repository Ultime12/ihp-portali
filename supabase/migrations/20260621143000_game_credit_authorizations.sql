drop function if exists public.open_credit_account(uuid, text, text, text, boolean);

alter table public.credit_accounts
  drop constraint if exists credit_accounts_contact_phone_check;

alter table public.credit_accounts
  drop column if exists contact_phone;

create or replace function public.open_credit_account(
  p_profile_id uuid,
  p_account_code text,
  p_usage_purpose text,
  p_terms_accepted boolean
)
returns public.credit_accounts
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_settings public.credit_settings%rowtype;
  v_account public.credit_accounts%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Sunucu yetkisi gerekir.'; end if;
  if p_terms_accepted is not true then raise exception 'Hesap acilis sozlesmesi kabul edilmelidir.'; end if;
  if p_usage_purpose not in ('general', 'transfer', 'cheque', 'saving') then
    raise exception 'Hesap kullanim amaci gecersiz.';
  end if;

  select * into v_settings from public.credit_settings where id = 'main';
  if not v_settings.member_access_enabled then raise exception 'Kredi sistemi uyelere acik degil.'; end if;

  select * into v_profile from public.profiles where id = p_profile_id for update;
  if not found or v_profile.status <> 'active'
     or (v_profile.is_system_account and not coalesce(v_profile.credit_test_access, false)) then
    raise exception 'Aktif uye hesabi bulunamadi.';
  end if;
  if p_account_code !~ '^IHP[0-9]{9}$' then raise exception 'Hesap numarasi gecersiz.'; end if;

  select * into v_account from public.credit_accounts where profile_id = p_profile_id for update;
  if found and v_account.status = 'active' then return v_account; end if;

  if found then
    update public.credit_accounts
    set status = 'active', account_code = p_account_code, balance = 0,
      usage_purpose = p_usage_purpose, terms_version = '2026-06-v2',
      terms_accepted_at = now(), opened_at = now(), closed_at = null, updated_at = now()
    where id = v_account.id
    returning * into v_account;
  else
    insert into public.credit_accounts(
      profile_id, account_code, usage_purpose, terms_version, terms_accepted_at
    ) values (
      p_profile_id, p_account_code, p_usage_purpose, '2026-06-v2', now()
    ) returning * into v_account;
  end if;

  return v_account;
end;
$$;

revoke all on function public.open_credit_account(uuid, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.open_credit_account(uuid, text, text, boolean)
  to service_role;

alter table public.game_settings
  drop constraint if exists game_settings_entry_cost_check;
alter table public.game_settings
  add constraint game_settings_entry_cost_check check (entry_cost between 1 and 100000);

alter table public.game_attempts
  drop constraint if exists game_attempts_entry_cost_check;
alter table public.game_attempts
  add constraint game_attempts_entry_cost_check check (entry_cost between 1 and 100000);

alter table public.flappy_sessions
  drop constraint if exists flappy_sessions_entry_cost_range;
alter table public.flappy_sessions
  add constraint flappy_sessions_entry_cost_range check (entry_cost between 1 and 100000);

alter table public.credit_transactions
  drop constraint if exists credit_transactions_kind_check;
alter table public.credit_transactions
  add constraint credit_transactions_kind_check check (kind in (
    'account_opened', 'transfer_out', 'transfer_in', 'transfer_tax',
    'weekly_allowance', 'cheque_issue', 'cheque_redeem',
    'loan_disbursement', 'loan_repayment', 'balance_forfeit', 'admin_adjustment',
    'game_entry'
  ));

create table public.game_credit_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  account_id uuid not null references public.credit_accounts(id) on delete restrict,
  game_key text not null references public.game_settings(game_key),
  period_key text not null,
  credit_amount bigint not null check (credit_amount between 1 and 100000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'consumed')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  consumed_at timestamptz
);

create unique index game_credit_requests_open_unique
  on public.game_credit_requests(profile_id, game_key, period_key)
  where status in ('pending', 'approved');
create index game_credit_requests_profile_date_idx
  on public.game_credit_requests(profile_id, requested_at desc);
create index game_credit_requests_account_idx
  on public.game_credit_requests(account_id);
create index game_credit_requests_game_period_idx
  on public.game_credit_requests(game_key, period_key);

alter table public.game_credit_requests enable row level security;
revoke all on public.game_credit_requests from public, anon, authenticated;
grant all on public.game_credit_requests to service_role;

create or replace function public.request_game_credit_authorization(
  p_profile_id uuid,
  p_game_key text
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
  v_period text;
begin
  if auth.role() <> 'service_role' then raise exception 'Sunucu yetkisi gerekir.'; end if;
  if p_game_key not in ('flappy', 'snake', 'scratch') then raise exception 'Oyun secimi gecersiz.'; end if;

  select * into v_profile from public.profiles where id = p_profile_id;
  if not found or v_profile.status <> 'active' or v_profile.is_system_account then
    raise exception 'Aktif uye hesabi bulunamadi.';
  end if;
  select * into v_settings from public.game_settings where game_key = p_game_key;
  if not found or not v_settings.enabled then raise exception 'Oyun su anda kapali.'; end if;
  select * into v_account from public.credit_accounts
  where profile_id = p_profile_id and status = 'active' for update;
  if not found then raise exception 'Once Kredi Sistemi hesabini acmalisiniz.'; end if;
  if v_account.balance < v_settings.entry_cost then raise exception 'Kredi bakiyeniz yetersiz.'; end if;

  v_period := to_char(
    date '2026-01-01' + ((((now() at time zone 'Europe/Istanbul')::date - date '2026-01-01') / 2) * 2),
    'YYYY-MM-DD'
  );
  if p_game_key = 'flappy' then
    if exists (select 1 from public.flappy_sessions where profile_id = p_profile_id and week_start = v_period::date) then
      raise exception 'Bu 2 gunluk donemdeki Flappy hakkiniz kullanildi.';
    end if;
  elsif exists (
    select 1 from public.game_attempts
    where profile_id = p_profile_id and game_key = p_game_key and period_key = v_period
  ) then
    raise exception 'Bu 2 gunluk donemdeki oyun hakkiniz kullanildi.';
  end if;

  select * into v_request from public.game_credit_requests
  where profile_id = p_profile_id and game_key = p_game_key and period_key = v_period
    and status in ('pending', 'approved')
  order by requested_at desc limit 1;
  if found then return v_request; end if;

  insert into public.game_credit_requests(
    profile_id, account_id, game_key, period_key, credit_amount
  ) values (
    p_profile_id, v_account.id, p_game_key, v_period, v_settings.entry_cost
  ) returning * into v_request;
  return v_request;
end;
$$;

create or replace function public.decide_game_credit_authorization(
  p_profile_id uuid,
  p_request_id uuid,
  p_approve boolean
)
returns public.game_credit_requests
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_request public.game_credit_requests%rowtype;
  v_account public.credit_accounts%rowtype;
  v_after bigint;
begin
  if auth.role() <> 'service_role' then raise exception 'Sunucu yetkisi gerekir.'; end if;
  select * into v_request from public.game_credit_requests
  where id = p_request_id and profile_id = p_profile_id for update;
  if not found then raise exception 'Oyun kredi talebi bulunamadi.'; end if;
  if v_request.status = 'approved' and p_approve then return v_request; end if;
  if v_request.status <> 'pending' then raise exception 'Bu talep daha once sonuclandirildi.'; end if;

  if p_approve is not true then
    update public.game_credit_requests
    set status = 'rejected', decided_at = now()
    where id = v_request.id returning * into v_request;
    return v_request;
  end if;

  select * into v_account from public.credit_accounts
  where id = v_request.account_id and profile_id = p_profile_id and status = 'active' for update;
  if not found then raise exception 'Aktif kredi hesabi bulunamadi.'; end if;
  if v_account.balance < v_request.credit_amount then raise exception 'Kredi bakiyeniz yetersiz.'; end if;
  v_after := v_account.balance - v_request.credit_amount;

  update public.credit_accounts set balance = v_after, updated_at = now()
  where id = v_account.id;
  insert into public.credit_transactions(
    account_id, kind, amount, balance_after, reference, metadata
  ) values (
    v_account.id, 'game_entry', v_request.credit_amount, v_after,
    'Oyun giris bedeli',
    jsonb_build_object('game_key', v_request.game_key, 'request_id', v_request.id)
  );
  update public.game_credit_requests
  set status = 'approved', decided_at = now()
  where id = v_request.id returning * into v_request;

  insert into public.notifications(recipient_id, actor_id, title, body, category, link)
  values (
    p_profile_id, p_profile_id, 'Oyun kredisi onaylandi',
    v_request.credit_amount || ' kredi oyun girisi icin kesildi. Oyunu Oyun Alani uzerinden baslatabilirsiniz.',
    'credit', '#/portal/games'
  );
  return v_request;
end;
$$;

create or replace function public.consume_game_credit_authorization(
  p_profile_id uuid,
  p_game_key text
)
returns public.game_credit_requests
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_request public.game_credit_requests%rowtype;
  v_period text;
begin
  if auth.role() <> 'service_role' then raise exception 'Sunucu yetkisi gerekir.'; end if;
  v_period := to_char(
    date '2026-01-01' + ((((now() at time zone 'Europe/Istanbul')::date - date '2026-01-01') / 2) * 2),
    'YYYY-MM-DD'
  );
  select * into v_request from public.game_credit_requests
  where profile_id = p_profile_id and game_key = p_game_key and period_key = v_period
    and status = 'approved'
  order by requested_at desc limit 1 for update;
  if not found then raise exception 'Kredi Sistemi uzerinden oyun bedelini onaylamalisiniz.'; end if;
  update public.game_credit_requests set status = 'consumed', consumed_at = now()
  where id = v_request.id returning * into v_request;
  return v_request;
end;
$$;

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
  if p_terms_accepted is not true then raise exception 'Kredi onayi gerekir.'; end if;
  if p_seed is null or p_seed < 1 or p_seed > 2147483646 then raise exception 'Oyun tohumu gecersiz.'; end if;
  select * into v_settings from public.game_settings where game_key = 'flappy' for update;
  if not found or not v_settings.enabled then raise exception 'IHP Flappy su anda kapali.'; end if;
  select * into v_profile from public.profiles where id = p_profile_id;
  if not found or v_profile.status <> 'active' or v_profile.is_system_account then raise exception 'Aktif uye hesabi bulunamadi.'; end if;
  v_local_date := (now() at time zone 'Europe/Istanbul')::date;
  v_period_start := date '2026-01-01' + (((v_local_date - date '2026-01-01') / 2) * 2);
  if exists (select 1 from public.flappy_sessions where profile_id = p_profile_id and week_start = v_period_start) then
    raise exception 'Bu 2 gunluk donemdeki Flappy hakkiniz kullanildi.';
  end if;
  perform public.consume_game_credit_authorization(p_profile_id, 'flappy');
  insert into public.flappy_sessions(profile_id, week_start, seed, entry_cost, reward_target)
  values (p_profile_id, v_period_start, p_seed, v_settings.entry_cost, v_settings.reward_points)
  returning * into v_session;
  insert into public.notifications(recipient_id, actor_id, title, body, category, link)
  values (p_profile_id, p_profile_id, '2 gunluk Flappy basladi',
    v_settings.entry_cost || ' kredilik onay kullanildi.', 'game', '#/portal/games');
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
  if p_terms_accepted is not true then raise exception 'Kredi onayi gerekir.'; end if;
  if p_seed is null or p_seed < 1 or p_seed > 2147483646 then raise exception 'Oyun tohumu gecersiz.'; end if;
  select * into v_settings from public.game_settings where game_key = 'snake' for update;
  if not found or not v_settings.enabled then raise exception 'IHP Snake su anda kapali.'; end if;
  select * into v_profile from public.profiles where id = p_profile_id;
  if not found or v_profile.status <> 'active' or v_profile.is_system_account then raise exception 'Aktif uye hesabi bulunamadi.'; end if;
  v_period := to_char(date '2026-01-01' + ((((now() at time zone 'Europe/Istanbul')::date - date '2026-01-01') / 2) * 2), 'YYYY-MM-DD');
  if exists (select 1 from public.game_attempts where profile_id = p_profile_id and game_key = 'snake' and period_key = v_period) then
    raise exception 'Bu 2 gunluk donemdeki Snake hakkiniz kullanildi.';
  end if;
  perform public.consume_game_credit_authorization(p_profile_id, 'snake');
  insert into public.game_attempts(profile_id, game_key, period_key, seed, expires_at, entry_cost, reward_target, target_score)
  values (p_profile_id, 'snake', v_period, p_seed, now() + interval '12 minutes',
    v_settings.entry_cost, v_settings.reward_points, v_settings.target_score)
  returning * into v_attempt;
  insert into public.notifications(recipient_id, actor_id, title, body, category, link)
  values (p_profile_id, p_profile_id, '2 gunluk Snake basladi',
    v_settings.entry_cost || ' kredilik onay kullanildi.', 'game', '#/portal/games');
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
    select discipline_points into v_before from public.profiles where id = p_profile_id for update;
    v_after := least(200, v_before + v_settings.reward_points);
    v_reward := v_after - v_before;
    perform set_config('app.bypass_profile_protection', 'on', true);
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

revoke all on function public.request_game_credit_authorization(uuid, text) from public, anon, authenticated;
revoke all on function public.decide_game_credit_authorization(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.consume_game_credit_authorization(uuid, text) from public, anon, authenticated;
revoke all on function public.start_weekly_flappy(uuid, integer, boolean) from public, anon, authenticated;
revoke all on function public.start_ranked_snake(uuid, integer, boolean) from public, anon, authenticated;
revoke all on function public.play_scratch(uuid, integer, boolean) from public, anon, authenticated;
grant execute on function public.request_game_credit_authorization(uuid, text) to service_role;
grant execute on function public.decide_game_credit_authorization(uuid, uuid, boolean) to service_role;
grant execute on function public.consume_game_credit_authorization(uuid, text) to service_role;
grant execute on function public.start_weekly_flappy(uuid, integer, boolean) to service_role;
grant execute on function public.start_ranked_snake(uuid, integer, boolean) to service_role;
grant execute on function public.play_scratch(uuid, integer, boolean) to service_role;
