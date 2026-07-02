create table if not exists public.assistant_settings (
  id text primary key default 'main' check (id = 'main'),
  enabled boolean not null default true,
  per_message_cost bigint not null default 10000 check (per_message_cost between 0 and 9007199254740991),
  weekly_cost bigint not null default 200000 check (weekly_cost between 0 and 9007199254740991),
  max_input_chars integer not null default 2000 check (max_input_chars between 100 and 6000),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.assistant_settings(id)
values ('main')
on conflict (id) do nothing;

create table if not exists public.assistant_subscriptions (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  account_id uuid not null references public.credit_accounts(id) on delete restrict,
  paid_at timestamptz not null default now(),
  valid_until timestamptz not null,
  updated_at timestamptz not null default now(),
  check (valid_until > paid_at)
);

create table if not exists public.assistant_requests (
  id uuid primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  account_id uuid not null references public.credit_accounts(id) on delete restrict,
  payment_mode text not null check (payment_mode in ('weekly', 'per_message')),
  charged_amount bigint not null default 0 check (charged_amount >= 0),
  status text not null default 'reserved' check (status in ('reserved', 'completed', 'refunded', 'failed')),
  question text not null check (char_length(question) between 1 and 6000),
  answer text not null default '' check (char_length(answer) <= 16000),
  model text not null default '',
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists assistant_requests_profile_created_idx
  on public.assistant_requests(profile_id, created_at desc);

create index if not exists assistant_requests_reserved_idx
  on public.assistant_requests(created_at)
  where status = 'reserved';

alter table public.assistant_settings enable row level security;
alter table public.assistant_subscriptions enable row level security;
alter table public.assistant_requests enable row level security;

revoke all on table public.assistant_settings from public, anon, authenticated;
revoke all on table public.assistant_subscriptions from public, anon, authenticated;
revoke all on table public.assistant_requests from public, anon, authenticated;
grant select, insert, update, delete on table public.assistant_settings to service_role;
grant select, insert, update, delete on table public.assistant_subscriptions to service_role;
grant select, insert, update, delete on table public.assistant_requests to service_role;

alter table public.credit_transactions
  drop constraint if exists credit_transactions_kind_check;

alter table public.credit_transactions
  add constraint credit_transactions_kind_check check (kind in (
    'account_opened',
    'transfer_out',
    'transfer_in',
    'transfer_tax',
    'transfer_reserve',
    'transfer_refund',
    'weekly_allowance',
    'cheque_issue',
    'cheque_redeem',
    'loan_disbursement',
    'loan_repayment',
    'discipline_fine_repayment',
    'balance_forfeit',
    'admin_adjustment',
    'game_entry',
    'game_reward',
    'assistant_message',
    'assistant_weekly',
    'assistant_refund'
  ));

create or replace function public.purchase_assistant_weekly(
  p_profile_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_settings public.assistant_settings%rowtype;
  v_profile public.profiles%rowtype;
  v_account public.credit_accounts%rowtype;
  v_subscription public.assistant_subscriptions%rowtype;
  v_valid_until timestamptz;
begin
  select * into v_settings
  from public.assistant_settings
  where id = 'main'
  for update;

  if not found or not v_settings.enabled then
    raise exception 'IHP Dijital Asistan su anda kullanima kapali.';
  end if;

  select * into v_profile
  from public.profiles
  where id = p_profile_id;

  if not found or v_profile.status <> 'active' or coalesce(v_profile.is_system_account, false) then
    raise exception 'Aktif bir uye hesabi gerekir.';
  end if;

  select * into v_account
  from public.credit_accounts
  where profile_id = p_profile_id and status = 'active'
  for update;

  if not found then
    raise exception 'Haftalik paket icin aktif kredi hesabi gerekir.';
  end if;

  select * into v_subscription
  from public.assistant_subscriptions
  where profile_id = p_profile_id
  for update;

  if found and v_subscription.valid_until > now() then
    raise exception 'Haftalik paketiniz zaten aktif.';
  end if;

  if v_account.balance < v_settings.weekly_cost then
    raise exception 'Haftalik paket icin kredi bakiyesi yetersiz.';
  end if;

  v_valid_until := now() + interval '7 days';

  update public.credit_accounts
  set balance = balance - v_settings.weekly_cost,
      updated_at = now()
  where id = v_account.id;

  insert into public.credit_transactions(
    account_id,
    kind,
    amount,
    balance_after,
    reference,
    metadata
  ) values (
    v_account.id,
    'assistant_weekly',
    v_settings.weekly_cost,
    v_account.balance - v_settings.weekly_cost,
    'IHP Dijital Asistan haftalik paket',
    jsonb_build_object('valid_until', v_valid_until)
  );

  insert into public.assistant_subscriptions(
    profile_id,
    account_id,
    paid_at,
    valid_until,
    updated_at
  ) values (
    p_profile_id,
    v_account.id,
    now(),
    v_valid_until,
    now()
  )
  on conflict (profile_id) do update
  set account_id = excluded.account_id,
      paid_at = excluded.paid_at,
      valid_until = excluded.valid_until,
      updated_at = now();

  return jsonb_build_object(
    'balance', v_account.balance - v_settings.weekly_cost,
    'charged_amount', v_settings.weekly_cost,
    'valid_until', v_valid_until
  );
end;
$$;

create or replace function public.reserve_assistant_message(
  p_profile_id uuid,
  p_request_id uuid,
  p_question text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_settings public.assistant_settings%rowtype;
  v_profile public.profiles%rowtype;
  v_account public.credit_accounts%rowtype;
  v_subscription public.assistant_subscriptions%rowtype;
  v_charge bigint := 0;
  v_payment_mode text := 'per_message';
begin
  select * into v_settings
  from public.assistant_settings
  where id = 'main'
  for update;

  if not found or not v_settings.enabled then
    raise exception 'IHP Dijital Asistan su anda kullanima kapali.';
  end if;

  if p_question is null
     or char_length(btrim(p_question)) < 2
     or char_length(p_question) > v_settings.max_input_chars then
    raise exception 'Mesaj 2 ile % karakter arasinda olmalidir.', v_settings.max_input_chars;
  end if;

  select * into v_profile
  from public.profiles
  where id = p_profile_id;

  if not found or v_profile.status <> 'active' or coalesce(v_profile.is_system_account, false) then
    raise exception 'Aktif bir uye hesabi gerekir.';
  end if;

  select * into v_account
  from public.credit_accounts
  where profile_id = p_profile_id and status = 'active'
  for update;

  if not found then
    raise exception 'Asistani kullanmak icin aktif kredi hesabi gerekir.';
  end if;

  select * into v_subscription
  from public.assistant_subscriptions
  where profile_id = p_profile_id;

  if found and v_subscription.valid_until > now() then
    v_payment_mode := 'weekly';
    v_charge := 0;
  else
    v_payment_mode := 'per_message';
    v_charge := v_settings.per_message_cost;
  end if;

  if v_account.balance < v_charge then
    raise exception 'Mesaj ucreti icin kredi bakiyesi yetersiz.';
  end if;

  if v_charge > 0 then
    update public.credit_accounts
    set balance = balance - v_charge,
        updated_at = now()
    where id = v_account.id;

    insert into public.credit_transactions(
      account_id,
      kind,
      amount,
      balance_after,
      reference,
      metadata
    ) values (
      v_account.id,
      'assistant_message',
      v_charge,
      v_account.balance - v_charge,
      'IHP Dijital Asistan mesaji',
      jsonb_build_object('request_id', p_request_id)
    );
  end if;

  insert into public.assistant_requests(
    id,
    profile_id,
    account_id,
    payment_mode,
    charged_amount,
    question
  ) values (
    p_request_id,
    p_profile_id,
    v_account.id,
    v_payment_mode,
    v_charge,
    btrim(p_question)
  );

  return jsonb_build_object(
    'request_id', p_request_id,
    'payment_mode', v_payment_mode,
    'charged_amount', v_charge,
    'balance', v_account.balance - v_charge,
    'weekly_valid_until', case when v_payment_mode = 'weekly' then v_subscription.valid_until else null end
  );
end;
$$;

create or replace function public.complete_assistant_message(
  p_profile_id uuid,
  p_request_id uuid,
  p_answer text,
  p_model text,
  p_sources jsonb default '[]'::jsonb
)
returns public.assistant_requests
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_request public.assistant_requests%rowtype;
begin
  if p_answer is null or char_length(btrim(p_answer)) < 1 or char_length(p_answer) > 16000 then
    raise exception 'Asistan yaniti gecersiz.';
  end if;

  update public.assistant_requests
  set status = 'completed',
      answer = btrim(p_answer),
      model = left(coalesce(p_model, ''), 120),
      sources = coalesce(p_sources, '[]'::jsonb),
      completed_at = now()
  where id = p_request_id
    and profile_id = p_profile_id
    and status = 'reserved'
  returning * into v_request;

  if not found then
    raise exception 'Bekleyen asistan istegi bulunamadi.';
  end if;

  return v_request;
end;
$$;

create or replace function public.refund_assistant_message(
  p_profile_id uuid,
  p_request_id uuid,
  p_reason text default ''
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_request public.assistant_requests%rowtype;
  v_account public.credit_accounts%rowtype;
begin
  select * into v_request
  from public.assistant_requests
  where id = p_request_id
    and profile_id = p_profile_id
  for update;

  if not found then
    return jsonb_build_object('refunded', false, 'reason', 'request_not_found');
  end if;

  if v_request.status <> 'reserved' then
    return jsonb_build_object('refunded', false, 'reason', 'already_finalized');
  end if;

  select * into v_account
  from public.credit_accounts
  where id = v_request.account_id
  for update;

  if v_request.charged_amount > 0 and found then
    update public.credit_accounts
    set balance = balance + v_request.charged_amount,
        updated_at = now()
    where id = v_account.id;

    insert into public.credit_transactions(
      account_id,
      kind,
      amount,
      balance_after,
      reference,
      metadata
    ) values (
      v_account.id,
      'assistant_refund',
      v_request.charged_amount,
      v_account.balance + v_request.charged_amount,
      'IHP Dijital Asistan iadesi',
      jsonb_build_object(
        'request_id', p_request_id,
        'reason', left(coalesce(p_reason, ''), 240)
      )
    );
  end if;

  update public.assistant_requests
  set status = case when v_request.charged_amount > 0 then 'refunded' else 'failed' end,
      completed_at = now()
  where id = p_request_id;

  return jsonb_build_object(
    'refunded', v_request.charged_amount > 0,
    'amount', v_request.charged_amount,
    'balance', case when v_account.id is null then null else v_account.balance + v_request.charged_amount end
  );
end;
$$;

revoke all on function public.purchase_assistant_weekly(uuid) from public, anon, authenticated;
revoke all on function public.reserve_assistant_message(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.complete_assistant_message(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.refund_assistant_message(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.purchase_assistant_weekly(uuid) to service_role;
grant execute on function public.reserve_assistant_message(uuid, uuid, text) to service_role;
grant execute on function public.complete_assistant_message(uuid, uuid, text, text, jsonb) to service_role;
grant execute on function public.refund_assistant_message(uuid, uuid, text) to service_role;
