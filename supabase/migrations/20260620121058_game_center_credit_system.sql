create table public.game_settings (
  game_key text primary key check (game_key in ('flappy', 'snake', 'scratch')),
  display_name text not null,
  enabled boolean not null default true,
  entry_cost integer not null check (entry_cost between 0 and 100),
  reward_points integer not null check (reward_points between 0 and 100),
  target_score integer not null default 0 check (target_score between 0 and 50000),
  win_probability_basis_points integer not null default 0
    check (win_probability_basis_points between 0 and 10000),
  attempt_period text not null default 'weekly'
    check (attempt_period in ('daily', 'weekly')),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.game_settings(
  game_key,
  display_name,
  enabled,
  entry_cost,
  reward_points,
  target_score,
  win_probability_basis_points,
  attempt_period
)
values
  ('flappy', 'IHP Flappy', true, 5, 10, 10000, 0, 'weekly'),
  ('snake', 'IHP Snake', true, 5, 10, 1000, 0, 'weekly'),
  ('scratch', 'IHP Kazi Kazan', true, 10, 20, 0, 800, 'weekly')
on conflict (game_key) do nothing;

create table public.game_attempts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  game_key text not null references public.game_settings(game_key),
  period_key text not null,
  seed integer check (seed is null or seed between 1 and 2147483646),
  status text not null default 'active'
    check (status in ('active', 'won', 'lost', 'expired')),
  terms_version text not null default '2026-06-20-v1',
  terms_accepted_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  expires_at timestamptz,
  finished_at timestamptz,
  entry_cost integer not null check (entry_cost between 0 and 100),
  reward_target integer not null check (reward_target between 0 and 100),
  reward_points integer not null default 0 check (reward_points between 0 and 100),
  target_score integer not null default 0 check (target_score between 0 and 50000),
  score integer not null default 0 check (score between 0 and 50000),
  event_count integer not null default 0 check (event_count between 0 and 4000),
  duration_ms integer not null default 0 check (duration_ms between 0 and 600000),
  random_roll integer check (random_roll is null or random_roll between 0 and 9999),
  result_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (profile_id, game_key, period_key)
);

alter table public.flappy_sessions
  drop constraint if exists flappy_sessions_entry_cost_check,
  drop constraint if exists flappy_sessions_reward_points_check;

alter table public.flappy_sessions
  add column if not exists reward_target integer not null default 10,
  add constraint flappy_sessions_entry_cost_range check (entry_cost between 0 and 100),
  add constraint flappy_sessions_reward_target_range check (reward_target between 0 and 100),
  add constraint flappy_sessions_reward_points_range check (reward_points between 0 and 100);

create index game_attempts_profile_created_idx
  on public.game_attempts(profile_id, created_at desc);
create index game_attempts_game_period_idx
  on public.game_attempts(game_key, period_key, status);

alter table public.game_settings enable row level security;
alter table public.game_attempts enable row level security;

create policy game_settings_member_read
  on public.game_settings for select to authenticated using (true);
create policy game_attempts_select_own
  on public.game_attempts for select to authenticated
  using (profile_id = (select auth.uid()));

revoke all on public.game_settings, public.game_attempts from anon, authenticated;
grant select on public.game_settings, public.game_attempts to authenticated;
grant all on public.game_settings, public.game_attempts to service_role;

create table public.credit_settings (
  id text primary key default 'main' check (id = 'main'),
  member_access_enabled boolean not null default false,
  weekly_allowance_enabled boolean not null default false,
  transfer_tax_basis_points integer not null default 2000
    check (transfer_tax_basis_points between 0 and 5000),
  loan_interest_basis_points integer not null default 1000
    check (loan_interest_basis_points between 0 and 10000),
  max_loan_amount bigint not null default 5000 check (max_loan_amount between 1 and 1000000),
  max_term_days integer not null default 30 check (max_term_days between 1 and 30),
  grace_days integer not null default 1 check (grace_days between 0 and 7),
  role_allowances jsonb not null default '{
    "super_admin": 0,
    "president": 0,
    "vice_president": 0,
    "presidential_aide": 0,
    "spokesperson": 0,
    "discipline_chair": 0,
    "discipline_vice_chair": 0,
    "discipline_member": 0,
    "youth_chair": 0,
    "youth_member": 0,
    "chief_representative": 0,
    "representative": 0,
    "member": 0
  }'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.credit_settings(id) values ('main')
on conflict (id) do nothing;

create table public.credit_accounts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete restrict,
  account_code text not null unique check (account_code ~ '^IHP[0-9]{9}$'),
  balance bigint not null default 0 check (balance between 0 and 100000000),
  status text not null default 'active' check (status in ('active', 'closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.credit_accounts(id) on delete restrict,
  counterparty_account_id uuid references public.credit_accounts(id) on delete restrict,
  kind text not null check (kind in (
    'account_opened', 'transfer_out', 'transfer_in', 'transfer_tax',
    'weekly_allowance', 'cheque_issue', 'cheque_redeem',
    'loan_disbursement', 'loan_repayment', 'balance_forfeit', 'admin_adjustment'
  )),
  amount bigint not null check (amount > 0),
  balance_after bigint not null check (balance_after between 0 and 100000000),
  reference text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.credit_cheques (
  id uuid primary key default gen_random_uuid(),
  issuer_account_id uuid not null references public.credit_accounts(id) on delete restrict,
  code_hash text not null unique check (char_length(code_hash) = 64),
  code_last4 text not null check (code_last4 ~ '^[0-9]{4}$'),
  amount bigint not null check (amount > 0),
  status text not null default 'issued' check (status in ('issued', 'redeemed', 'cancelled')),
  redeemed_by_account_id uuid references public.credit_accounts(id) on delete restrict,
  issued_at timestamptz not null default now(),
  redeemed_at timestamptz
);

create table public.credit_loans (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.credit_accounts(id) on delete restrict,
  principal bigint not null check (principal > 0),
  interest_basis_points integer not null check (interest_basis_points between 0 and 10000),
  total_due bigint not null check (total_due >= principal),
  paid_amount bigint not null default 0 check (paid_amount >= 0),
  term_days integer not null check (term_days between 1 and 30),
  installment_count integer not null check (installment_count between 1 and 4),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'paid', 'delinquent')),
  requested_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text not null default '',
  due_at timestamptz
);

create unique index credit_loans_one_pending_idx
  on public.credit_loans(account_id)
  where status = 'pending';

create table public.credit_installments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.credit_loans(id) on delete restrict,
  installment_no integer not null check (installment_no between 1 and 4),
  amount bigint not null check (amount > 0),
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'delinquent')),
  paid_at timestamptz,
  complaint_id uuid references public.complaints(id) on delete set null,
  unique (loan_id, installment_no)
);

create table public.credit_cron_runs (
  run_key text primary key,
  run_type text not null check (run_type in ('weekly_allowance', 'daily_collection')),
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index credit_transactions_account_created_idx
  on public.credit_transactions(account_id, created_at desc);
create index credit_transactions_created_idx
  on public.credit_transactions(created_at desc);
create index credit_transactions_counterparty_idx
  on public.credit_transactions(counterparty_account_id)
  where counterparty_account_id is not null;
create index credit_cheques_issuer_idx on public.credit_cheques(issuer_account_id, issued_at desc);
create index credit_cheques_redeemed_by_idx on public.credit_cheques(redeemed_by_account_id)
  where redeemed_by_account_id is not null;
create index credit_loans_account_idx on public.credit_loans(account_id, requested_at desc);
create index credit_loans_decided_by_idx on public.credit_loans(decided_by)
  where decided_by is not null;
create index credit_installments_due_idx on public.credit_installments(status, due_at);
create index credit_installments_complaint_idx on public.credit_installments(complaint_id)
  where complaint_id is not null;

alter table public.credit_settings enable row level security;
alter table public.credit_accounts enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.credit_cheques enable row level security;
alter table public.credit_loans enable row level security;
alter table public.credit_installments enable row level security;
alter table public.credit_cron_runs enable row level security;

create policy credit_accounts_select_enabled_own
  on public.credit_accounts for select to authenticated
  using (
    profile_id = (select auth.uid())
    and exists (
      select 1 from public.credit_settings s
      where s.id = 'main' and s.member_access_enabled
    )
  );
create policy credit_transactions_select_enabled_own
  on public.credit_transactions for select to authenticated
  using (
    exists (
      select 1
      from public.credit_accounts a
      join public.credit_settings s on s.id = 'main' and s.member_access_enabled
      where a.id = account_id and a.profile_id = (select auth.uid())
    )
  );
create policy credit_cheques_select_enabled_own
  on public.credit_cheques for select to authenticated
  using (
    exists (
      select 1
      from public.credit_accounts a
      join public.credit_settings s on s.id = 'main' and s.member_access_enabled
      where a.id = issuer_account_id and a.profile_id = (select auth.uid())
    )
  );
create policy credit_loans_select_enabled_own
  on public.credit_loans for select to authenticated
  using (
    exists (
      select 1
      from public.credit_accounts a
      join public.credit_settings s on s.id = 'main' and s.member_access_enabled
      where a.id = account_id and a.profile_id = (select auth.uid())
    )
  );
create policy credit_installments_select_enabled_own
  on public.credit_installments for select to authenticated
  using (
    exists (
      select 1
      from public.credit_loans l
      join public.credit_accounts a on a.id = l.account_id
      join public.credit_settings s on s.id = 'main' and s.member_access_enabled
      where l.id = loan_id and a.profile_id = (select auth.uid())
    )
  );

revoke all on
  public.credit_settings,
  public.credit_accounts,
  public.credit_transactions,
  public.credit_cheques,
  public.credit_loans,
  public.credit_installments,
  public.credit_cron_runs
from anon, authenticated;

grant select on
  public.credit_accounts,
  public.credit_transactions,
  public.credit_cheques,
  public.credit_loans,
  public.credit_installments
to authenticated;

grant all on
  public.credit_settings,
  public.credit_accounts,
  public.credit_transactions,
  public.credit_cheques,
  public.credit_loans,
  public.credit_installments,
  public.credit_cron_runs
to service_role;

drop trigger if exists game_settings_updated_at on public.game_settings;
create trigger game_settings_updated_at
  before update on public.game_settings
  for each row execute function public.set_updated_at();
drop trigger if exists credit_settings_updated_at on public.credit_settings;
create trigger credit_settings_updated_at
  before update on public.credit_settings
  for each row execute function public.set_updated_at();
drop trigger if exists credit_accounts_updated_at on public.credit_accounts;
create trigger credit_accounts_updated_at
  before update on public.credit_accounts
  for each row execute function public.set_updated_at();

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
  is_chair_protected_point_penalty boolean := false;
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

  is_chair_protected_point_penalty :=
    actor_roles && array['discipline_chair']::public.app_role[]
    and target_roles && array['president','vice_president']::public.app_role[]
    and not (target_roles && array['super_admin']::public.app_role[])
    and coalesce(new.point_delta, 0) < 0
    and coalesce(new.sanction_effect, 'none') in ('none', 'points_only');

  if new.decision_status = 'decided'::public.discipline_status
     and not is_reward and new.investigation_id is null
     and not is_chair_protected_point_penalty then
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
  if target_roles && array['president','vice_president']::public.app_role[]
     and not is_chair_protected_point_penalty then
    raise exception 'Baskan ve baskan yardimcisina yalnizca DK Baskani puan cezasi verebilir.';
  end if;
  if is_chair_protected_point_penalty then
    return new;
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
  before insert or update of member_id, decision_status, decree_text, point_delta, sanction_effect, investigation_id
  on public.discipline_records
  for each row execute function private.enforce_discipline_record_hierarchy();

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
  v_week_start date;
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
  v_week_start := v_local_date - (extract(isodow from v_local_date)::integer - 1);
  if exists (select 1 from public.flappy_sessions where profile_id = p_profile_id and week_start = v_week_start) then
    raise exception 'Bu haftaki Flappy hakkiniz kullanildi.';
  end if;

  perform set_config('app.bypass_profile_protection', 'on', true);
  update public.profiles set discipline_points = discipline_points - v_settings.entry_cost where id = p_profile_id;
  insert into public.flappy_sessions(profile_id, week_start, seed, entry_cost, reward_target)
  values (p_profile_id, v_week_start, p_seed, v_settings.entry_cost, v_settings.reward_points)
  returning * into v_session;
  insert into public.notifications(recipient_id, actor_id, title, body, category, link)
  values (p_profile_id, p_profile_id, 'Haftalik Flappy basladi',
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
    case when p_won then 'Flappy odulu kazanildi' else 'Haftalik Flappy tamamlandi' end,
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
  v_period := case when v_settings.attempt_period = 'daily'
    then to_char(now() at time zone 'Europe/Istanbul', 'IYYY-MM-DD')
    else to_char(now() at time zone 'Europe/Istanbul', 'IYYY-IW') end;
  if exists (select 1 from public.game_attempts where profile_id = p_profile_id and game_key = 'snake' and period_key = v_period) then
    raise exception 'Bu donemdeki Snake hakkiniz kullanildi.';
  end if;
  perform set_config('app.bypass_profile_protection', 'on', true);
  update public.profiles set discipline_points = discipline_points - v_settings.entry_cost where id = p_profile_id;
  insert into public.game_attempts(profile_id, game_key, period_key, seed, expires_at, entry_cost, reward_target, target_score)
  values (p_profile_id, 'snake', v_period, p_seed, now() + interval '12 minutes',
    v_settings.entry_cost, v_settings.reward_points, v_settings.target_score)
  returning * into v_attempt;
  insert into public.notifications(recipient_id, actor_id, title, body, category, link)
  values (p_profile_id, p_profile_id, 'Haftalik Snake basladi',
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
    case when p_won then 'Snake odulu kazanildi' else 'Haftalik Snake tamamlandi' end,
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
  v_period := case when v_settings.attempt_period = 'daily'
    then to_char(now() at time zone 'Europe/Istanbul', 'IYYY-MM-DD')
    else to_char(now() at time zone 'Europe/Istanbul', 'IYYY-IW') end;
  if exists (select 1 from public.game_attempts where profile_id = p_profile_id and game_key = 'scratch' and period_key = v_period) then
    raise exception 'Bu donemdeki Kazi Kazan hakkiniz kullanildi.';
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

create or replace function public.open_credit_account(p_profile_id uuid, p_account_code text)
returns public.credit_accounts
language plpgsql security invoker set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_settings public.credit_settings%rowtype;
  v_account public.credit_accounts%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Sunucu yetkisi gerekir.'; end if;
  select * into v_settings from public.credit_settings where id = 'main';
  if not v_settings.member_access_enabled then raise exception 'Kredi sistemi uyelere henuz acik degil.'; end if;
  select * into v_profile from public.profiles where id = p_profile_id for update;
  if not found or v_profile.status <> 'active' or v_profile.is_system_account then raise exception 'Aktif uye hesabi bulunamadi.'; end if;
  if p_account_code !~ '^IHP[0-9]{9}$' then raise exception 'Hesap numarasi gecersiz.'; end if;
  select * into v_account from public.credit_accounts where profile_id = p_profile_id for update;
  if found and v_account.status = 'active' then return v_account; end if;
  if found then
    update public.credit_accounts set status = 'active', account_code = p_account_code,
      balance = 0, opened_at = now(), closed_at = null where id = v_account.id returning * into v_account;
  else
    insert into public.credit_accounts(profile_id, account_code) values (p_profile_id, p_account_code) returning * into v_account;
  end if;
  return v_account;
end;
$$;

create or replace function public.close_credit_account(p_profile_id uuid)
returns public.credit_accounts
language plpgsql security invoker set search_path = ''
as $$
declare
  v_settings public.credit_settings%rowtype;
  v_account public.credit_accounts%rowtype;
  v_forfeit bigint;
begin
  if auth.role() <> 'service_role' then raise exception 'Sunucu yetkisi gerekir.'; end if;
  select * into v_settings from public.credit_settings where id = 'main';
  if not v_settings.member_access_enabled then raise exception 'Kredi sistemi uyelere henuz acik degil.'; end if;
  select * into v_account from public.credit_accounts where profile_id = p_profile_id and status = 'active' for update;
  if not found then raise exception 'Aktif kredi hesabi bulunamadi.'; end if;
  if exists (select 1 from public.credit_loans where account_id = v_account.id and status in ('pending','approved','delinquent')) then
    raise exception 'Acik kredi borcu veya basvurusu varken hesap kapatilamaz.';
  end if;
  if exists (select 1 from public.credit_cheques where issuer_account_id = v_account.id and status = 'issued') then
    raise exception 'Kullanilmamis cek varken hesap kapatilamaz.';
  end if;
  v_forfeit := v_account.balance;
  update public.credit_accounts set status = 'closed', balance = 0, closed_at = now()
  where id = v_account.id returning * into v_account;
  if v_forfeit > 0 then
    insert into public.credit_transactions(account_id, kind, amount, balance_after, reference, metadata)
    values (v_account.id, 'balance_forfeit', v_forfeit, 0, 'Hesap kapatma', jsonb_build_object('irreversible', true));
  end if;
  return v_account;
end;
$$;

create or replace function public.credit_transfer(p_profile_id uuid, p_recipient_code text, p_amount bigint)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_settings public.credit_settings%rowtype;
  v_sender public.credit_accounts%rowtype;
  v_recipient public.credit_accounts%rowtype;
  v_tax bigint;
  v_total bigint;
begin
  if auth.role() <> 'service_role' then raise exception 'Sunucu yetkisi gerekir.'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 1000000 then raise exception 'Transfer tutari gecersiz.'; end if;
  select * into v_settings from public.credit_settings where id = 'main';
  if not v_settings.member_access_enabled then raise exception 'Kredi sistemi uyelere henuz acik degil.'; end if;
  select a.* into v_sender from public.credit_accounts a join public.profiles p on p.id = a.profile_id
  where a.profile_id = p_profile_id and a.status = 'active' and p.status = 'active' for update of a;
  if not found then raise exception 'Aktif gonderici hesabi bulunamadi.'; end if;
  select a.* into v_recipient from public.credit_accounts a join public.profiles p on p.id = a.profile_id
  where a.account_code = upper(btrim(p_recipient_code)) and a.status = 'active' and p.status = 'active' for update of a;
  if not found then raise exception 'Alici hesap numarasi bulunamadi.'; end if;
  if v_recipient.id = v_sender.id then raise exception 'Kendi hesabiniza transfer yapamazsiniz.'; end if;
  v_tax := ceil((p_amount::numeric * v_settings.transfer_tax_basis_points::numeric) / 10000)::bigint;
  v_total := p_amount + v_tax;
  if v_sender.balance < v_total then raise exception 'Vergi dahil transfer icin bakiye yetersiz.'; end if;
  update public.credit_accounts set balance = balance - v_total where id = v_sender.id;
  insert into public.credit_transactions(account_id, counterparty_account_id, kind, amount, balance_after, reference, metadata)
  values (v_sender.id, v_recipient.id, 'transfer_out', p_amount, v_sender.balance - v_total,
    'IHP kredi transferi', jsonb_build_object('tax', v_tax, 'irreversible', true));
  if v_tax > 0 then
    insert into public.credit_transactions(account_id, kind, amount, balance_after, reference, metadata)
    values (v_sender.id, 'transfer_tax', v_tax, v_sender.balance - v_total, 'Transfer vergisi',
      jsonb_build_object('rate_basis_points', v_settings.transfer_tax_basis_points));
  end if;
  update public.credit_accounts set balance = balance + p_amount where id = v_recipient.id;
  insert into public.credit_transactions(account_id, counterparty_account_id, kind, amount, balance_after, reference, metadata)
  values (v_recipient.id, v_sender.id, 'transfer_in', p_amount, v_recipient.balance + p_amount,
    'IHP kredi transferi', jsonb_build_object('sender_account', v_sender.account_code));
  return jsonb_build_object('amount', p_amount, 'tax', v_tax, 'total_debit', v_total,
    'balance', v_sender.balance - v_total, 'recipient_account', v_recipient.account_code);
end;
$$;

create or replace function public.issue_credit_cheque(
  p_profile_id uuid, p_code_hash text, p_code_last4 text, p_amount bigint
)
returns public.credit_cheques
language plpgsql security invoker set search_path = ''
as $$
declare
  v_settings public.credit_settings%rowtype;
  v_account public.credit_accounts%rowtype;
  v_cheque public.credit_cheques%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Sunucu yetkisi gerekir.'; end if;
  select * into v_settings from public.credit_settings where id = 'main';
  if not v_settings.member_access_enabled then raise exception 'Kredi sistemi uyelere henuz acik degil.'; end if;
  if p_amount < 1 or p_amount > 1000000 or p_code_hash !~ '^[0-9a-f]{64}$' or p_code_last4 !~ '^[0-9]{4}$' then
    raise exception 'Cek bilgileri gecersiz.';
  end if;
  select a.* into v_account from public.credit_accounts a join public.profiles p on p.id = a.profile_id
  where a.profile_id = p_profile_id and a.status = 'active' and p.status = 'active' for update of a;
  if not found or v_account.balance < p_amount then raise exception 'Cek icin bakiye yetersiz.'; end if;
  update public.credit_accounts set balance = balance - p_amount where id = v_account.id;
  insert into public.credit_cheques(issuer_account_id, code_hash, code_last4, amount)
  values (v_account.id, p_code_hash, p_code_last4, p_amount) returning * into v_cheque;
  insert into public.credit_transactions(account_id, kind, amount, balance_after, reference, metadata)
  values (v_account.id, 'cheque_issue', p_amount, v_account.balance - p_amount,
    'IHP-' || v_cheque.id::text, jsonb_build_object('last4', p_code_last4));
  return v_cheque;
end;
$$;

create or replace function public.redeem_credit_cheque(p_profile_id uuid, p_code_hash text)
returns public.credit_cheques
language plpgsql security invoker set search_path = ''
as $$
declare
  v_settings public.credit_settings%rowtype;
  v_account public.credit_accounts%rowtype;
  v_cheque public.credit_cheques%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Sunucu yetkisi gerekir.'; end if;
  select * into v_settings from public.credit_settings where id = 'main';
  if not v_settings.member_access_enabled then raise exception 'Kredi sistemi uyelere henuz acik degil.'; end if;
  select a.* into v_account from public.credit_accounts a join public.profiles p on p.id = a.profile_id
  where a.profile_id = p_profile_id and a.status = 'active' and p.status = 'active' for update of a;
  if not found then raise exception 'Aktif kredi hesabi bulunamadi.'; end if;
  select * into v_cheque from public.credit_cheques where code_hash = p_code_hash for update;
  if not found or v_cheque.status <> 'issued' then raise exception 'Cek kodu gecersiz veya daha once kullanilmis.'; end if;
  update public.credit_accounts set balance = balance + v_cheque.amount where id = v_account.id;
  update public.credit_cheques set status = 'redeemed', redeemed_by_account_id = v_account.id, redeemed_at = now()
  where id = v_cheque.id returning * into v_cheque;
  insert into public.credit_transactions(account_id, counterparty_account_id, kind, amount, balance_after, reference, metadata)
  values (v_account.id, v_cheque.issuer_account_id, 'cheque_redeem', v_cheque.amount,
    v_account.balance + v_cheque.amount, 'IHP-' || v_cheque.id::text, jsonb_build_object('last4', v_cheque.code_last4));
  return v_cheque;
end;
$$;

create or replace function public.request_credit_loan(
  p_profile_id uuid, p_amount bigint, p_term_days integer, p_installment_count integer
)
returns public.credit_loans
language plpgsql security invoker set search_path = ''
as $$
declare
  v_settings public.credit_settings%rowtype;
  v_account public.credit_accounts%rowtype;
  v_loan public.credit_loans%rowtype;
  v_total bigint;
begin
  if auth.role() <> 'service_role' then raise exception 'Sunucu yetkisi gerekir.'; end if;
  select * into v_settings from public.credit_settings where id = 'main';
  if not v_settings.member_access_enabled then raise exception 'Kredi sistemi uyelere henuz acik degil.'; end if;
  if p_amount < 1 or p_amount > v_settings.max_loan_amount or p_term_days < 1
     or p_term_days > v_settings.max_term_days or p_installment_count < 1 or p_installment_count > 4 then
    raise exception 'Kredi basvurusu ayar sinirlarinin disinda.';
  end if;
  select a.* into v_account from public.credit_accounts a join public.profiles p on p.id = a.profile_id
  where a.profile_id = p_profile_id and a.status = 'active' and p.status = 'active' for update of a;
  if not found then raise exception 'Aktif kredi hesabi bulunamadi.'; end if;
  if exists (select 1 from public.credit_loans where account_id = v_account.id and status = 'pending') then
    raise exception 'Sonuclanmamis kredi basvurunuz bulunuyor.';
  end if;
  v_total := p_amount + ceil((p_amount::numeric * v_settings.loan_interest_basis_points::numeric) / 10000)::bigint;
  if v_total < p_installment_count then raise exception 'Taksit sayisi kredi tutarindan buyuk olamaz.'; end if;
  insert into public.credit_loans(account_id, principal, interest_basis_points, total_due, term_days, installment_count)
  values (v_account.id, p_amount, v_settings.loan_interest_basis_points, v_total, p_term_days, p_installment_count)
  returning * into v_loan;
  return v_loan;
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
      and coalesce(p.roles, array[p.role]) && array['super_admin']::public.app_role[]
  ) then raise exception 'Admin yetkisi gerekir.'; end if;
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

create or replace function public.pay_credit_installment(p_profile_id uuid, p_installment_id uuid)
returns public.credit_installments
language plpgsql security invoker set search_path = ''
as $$
declare
  v_settings public.credit_settings%rowtype;
  v_installment public.credit_installments%rowtype;
  v_loan public.credit_loans%rowtype;
  v_account public.credit_accounts%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Sunucu yetkisi gerekir.'; end if;
  select * into v_settings from public.credit_settings where id = 'main';
  if not v_settings.member_access_enabled then raise exception 'Kredi sistemi uyelere henuz acik degil.'; end if;
  select i.* into v_installment from public.credit_installments i
  join public.credit_loans l on l.id = i.loan_id join public.credit_accounts a on a.id = l.account_id
  join public.profiles p on p.id = a.profile_id
  where i.id = p_installment_id and a.profile_id = p_profile_id and a.status = 'active' and p.status = 'active'
  for update of i;
  if not found or v_installment.status = 'paid' then raise exception 'Odenebilir taksit bulunamadi.'; end if;
  select * into v_loan from public.credit_loans where id = v_installment.loan_id for update;
  select * into v_account from public.credit_accounts where id = v_loan.account_id for update;
  if v_account.balance < v_installment.amount then raise exception 'Taksit icin bakiye yetersiz.'; end if;
  update public.credit_accounts set balance = balance - v_installment.amount where id = v_account.id;
  update public.credit_installments set status = 'paid', paid_at = now() where id = v_installment.id returning * into v_installment;
  update public.credit_loans set paid_amount = paid_amount + v_installment.amount,
    status = case when paid_amount + v_installment.amount >= total_due then 'paid' else 'approved' end
  where id = v_loan.id;
  insert into public.credit_transactions(account_id, kind, amount, balance_after, reference, metadata)
  values (v_account.id, 'loan_repayment', v_installment.amount, v_account.balance - v_installment.amount,
    'Taksit ' || v_installment.id::text, jsonb_build_object('manual', true));
  return v_installment;
end;
$$;

create or replace function public.process_credit_schedules()
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_settings public.credit_settings%rowtype;
  v_week_key text;
  v_day_key text;
  v_allowance_count integer := 0;
  v_paid_count integer := 0;
  v_complaint_count integer := 0;
  v_allowance bigint;
  v_admin uuid;
  v_complaint uuid;
  v_account record;
  v_due record;
begin
  if auth.role() <> 'service_role' then raise exception 'Sunucu yetkisi gerekir.'; end if;
  select * into v_settings from public.credit_settings where id = 'main' for update;
  v_week_key := 'weekly:' || to_char(now() at time zone 'Europe/Istanbul', 'IYYY-IW');
  v_day_key := 'daily:' || to_char(now() at time zone 'Europe/Istanbul', 'YYYY-MM-DD');

  if v_settings.weekly_allowance_enabled and not exists (select 1 from public.credit_cron_runs where run_key = v_week_key) then
    for v_account in
      select a.id, a.balance, p.roles, p.role from public.credit_accounts a
      join public.profiles p on p.id = a.profile_id
      where a.status = 'active' and p.status = 'active' and not p.is_system_account for update of a
    loop
      select coalesce(max(coalesce((v_settings.role_allowances ->> role_name::text)::bigint, 0)), 0)
      into v_allowance
      from unnest(coalesce(v_account.roles, array[v_account.role])) as roles(role_name)
      where (v_settings.role_allowances ->> role_name::text) is not null;
      if v_allowance > 0 then
        update public.credit_accounts set balance = balance + v_allowance where id = v_account.id;
        insert into public.credit_transactions(account_id, kind, amount, balance_after, reference, metadata)
        values (v_account.id, 'weekly_allowance', v_allowance, v_account.balance + v_allowance,
          v_week_key, jsonb_build_object('automatic', true));
        v_allowance_count := v_allowance_count + 1;
      end if;
    end loop;
    insert into public.credit_cron_runs(run_key, run_type, result)
    values (v_week_key, 'weekly_allowance', jsonb_build_object('credited_accounts', v_allowance_count));
  end if;

  if not exists (select 1 from public.credit_cron_runs where run_key = v_day_key) then
    select p.id into v_admin from public.profiles p
    where p.status = 'active' and coalesce(p.roles, array[p.role]) && array['super_admin']::public.app_role[]
    order by p.created_at limit 1;
    for v_due in
      select i.id, i.amount, i.loan_id, i.due_at, a.id as account_id, a.profile_id, a.balance
      from public.credit_installments i join public.credit_loans l on l.id = i.loan_id
      join public.credit_accounts a on a.id = l.account_id
      where i.status in ('pending','delinquent')
        and i.due_at + make_interval(days => v_settings.grace_days) < now()
      for update of i, l, a
    loop
      if v_due.balance >= v_due.amount then
        update public.credit_accounts set balance = balance - v_due.amount where id = v_due.account_id;
        update public.credit_installments set status = 'paid', paid_at = now() where id = v_due.id;
        update public.credit_loans set paid_amount = paid_amount + v_due.amount,
          status = case when paid_amount + v_due.amount >= total_due then 'paid' else 'approved' end
        where id = v_due.loan_id;
        insert into public.credit_transactions(account_id, kind, amount, balance_after, reference, metadata)
        values (v_due.account_id, 'loan_repayment', v_due.amount, v_due.balance - v_due.amount,
          'Otomatik taksit ' || v_due.id::text, jsonb_build_object('automatic', true));
        v_paid_count := v_paid_count + 1;
      elsif v_admin is not null and not exists (select 1 from public.credit_installments where id = v_due.id and complaint_id is not null) then
        update public.credit_installments set status = 'delinquent' where id = v_due.id;
        update public.credit_loans set status = 'delinquent' where id = v_due.loan_id;
        insert into public.complaints(complainant_profile_id, accused_profile_id, created_by, subject, description, priority, status)
        values (v_admin, v_due.profile_id, v_admin, 'IHP Kredi Sistemi - geciken odeme',
          'Kredi taksiti vade ve ' || v_settings.grace_days || ' gunluk ek sure sonunda odenmedi. Taksit tutari: '
          || v_due.amount || ' kredi. Vade: ' || to_char(v_due.due_at at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI') || '.',
          'important', 'new')
        returning id into v_complaint;
        update public.credit_installments set complaint_id = v_complaint where id = v_due.id;
        v_complaint_count := v_complaint_count + 1;
      end if;
    end loop;
    insert into public.credit_cron_runs(run_key, run_type, result)
    values (v_day_key, 'daily_collection', jsonb_build_object('paid', v_paid_count, 'complaints', v_complaint_count));
  end if;
  return jsonb_build_object('allowances', v_allowance_count, 'automatic_payments', v_paid_count, 'complaints', v_complaint_count);
end;
$$;

revoke all on function public.open_credit_account(uuid, text) from public, anon, authenticated;
revoke all on function public.close_credit_account(uuid) from public, anon, authenticated;
revoke all on function public.credit_transfer(uuid, text, bigint) from public, anon, authenticated;
revoke all on function public.issue_credit_cheque(uuid, text, text, bigint) from public, anon, authenticated;
revoke all on function public.redeem_credit_cheque(uuid, text) from public, anon, authenticated;
revoke all on function public.request_credit_loan(uuid, bigint, integer, integer) from public, anon, authenticated;
revoke all on function public.review_credit_loan(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.pay_credit_installment(uuid, uuid) from public, anon, authenticated;
revoke all on function public.process_credit_schedules() from public, anon, authenticated;
grant execute on function public.open_credit_account(uuid, text) to service_role;
grant execute on function public.close_credit_account(uuid) to service_role;
grant execute on function public.credit_transfer(uuid, text, bigint) to service_role;
grant execute on function public.issue_credit_cheque(uuid, text, text, bigint) to service_role;
grant execute on function public.redeem_credit_cheque(uuid, text) to service_role;
grant execute on function public.request_credit_loan(uuid, bigint, integer, integer) to service_role;
grant execute on function public.review_credit_loan(uuid, uuid, text, text) to service_role;
grant execute on function public.pay_credit_installment(uuid, uuid) to service_role;
grant execute on function public.process_credit_schedules() to service_role;
