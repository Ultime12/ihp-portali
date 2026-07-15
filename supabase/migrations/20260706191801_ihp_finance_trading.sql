create table if not exists public.finance_accounts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete restrict,
  credit_account_id uuid not null unique references public.credit_accounts(id) on delete restrict,
  cash_balance bigint not null default 0 check (cash_balance between 0 and 100000000),
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_positions (
  id uuid primary key default gen_random_uuid(),
  finance_account_id uuid not null references public.finance_accounts(id) on delete restrict,
  symbol text not null check (symbol in (
    'THYAO.IS', 'TUPRS.IS', 'GARAN.IS', 'ASELS.IS', 'BIMAS.IS', 'KCHOL.IS'
  )),
  quantity numeric(20,6) not null check (quantity > 0),
  average_cost numeric(20,6) not null check (average_cost > 0),
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (finance_account_id, symbol)
);

create table if not exists public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  finance_account_id uuid not null references public.finance_accounts(id) on delete restrict,
  kind text not null check (kind in ('deposit', 'withdrawal', 'buy', 'sell')),
  symbol text check (symbol is null or symbol in (
    'THYAO.IS', 'TUPRS.IS', 'GARAN.IS', 'ASELS.IS', 'BIMAS.IS', 'KCHOL.IS'
  )),
  quantity numeric(20,6) check (quantity is null or quantity > 0),
  unit_price numeric(20,6) check (unit_price is null or unit_price > 0),
  amount bigint not null check (amount > 0),
  cash_balance_after bigint not null check (cash_balance_after between 0 and 100000000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists finance_positions_account_idx
  on public.finance_positions(finance_account_id);
create index if not exists finance_transactions_account_created_idx
  on public.finance_transactions(finance_account_id, created_at desc);

alter table public.finance_accounts enable row level security;
alter table public.finance_positions enable row level security;
alter table public.finance_transactions enable row level security;

revoke all on public.finance_accounts, public.finance_positions, public.finance_transactions
  from public, anon, authenticated;
grant all on public.finance_accounts, public.finance_positions, public.finance_transactions
  to service_role;

drop trigger if exists finance_accounts_updated_at on public.finance_accounts;
create trigger finance_accounts_updated_at
  before update on public.finance_accounts
  for each row execute function public.set_updated_at();

drop trigger if exists finance_positions_updated_at on public.finance_positions;
create trigger finance_positions_updated_at
  before update on public.finance_positions
  for each row execute function public.set_updated_at();

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
    'assistant_refund',
    'finance_deposit',
    'finance_withdrawal'
  ));

create or replace function public.open_finance_account(p_profile_id uuid)
returns public.finance_accounts
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_credit public.credit_accounts%rowtype;
  v_finance public.finance_accounts%rowtype;
begin
  if current_user <> 'service_role' then
    raise exception 'Sunucu yetkisi gerekir.';
  end if;

  select * into v_profile
  from public.profiles
  where id = p_profile_id
  for update;
  if not found or v_profile.status <> 'active' or v_profile.is_system_account then
    raise exception 'Aktif uye hesabi bulunamadi.';
  end if;

  select * into v_credit
  from public.credit_accounts
  where profile_id = p_profile_id and status = 'active'
  for update;
  if not found then
    raise exception 'Once aktif bir kredi hesabi acmalisiniz.';
  end if;

  select * into v_finance
  from public.finance_accounts
  where profile_id = p_profile_id
  for update;
  if found then
    return v_finance;
  end if;

  insert into public.finance_accounts(profile_id, credit_account_id)
  values (p_profile_id, v_credit.id)
  returning * into v_finance;

  return v_finance;
end;
$$;

create or replace function public.transfer_finance_credit(
  p_profile_id uuid,
  p_amount bigint,
  p_direction text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_credit public.credit_accounts%rowtype;
  v_finance public.finance_accounts%rowtype;
  v_credit_after bigint;
  v_finance_after bigint;
begin
  if current_user <> 'service_role' then
    raise exception 'Sunucu yetkisi gerekir.';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 100000000 then
    raise exception 'Aktarim tutari gecersiz.';
  end if;
  if p_direction not in ('deposit', 'withdrawal') then
    raise exception 'Aktarim yonu gecersiz.';
  end if;

  select * into v_credit
  from public.credit_accounts
  where profile_id = p_profile_id and status = 'active'
  for update;
  if not found then
    raise exception 'Aktif kredi hesabi bulunamadi.';
  end if;

  select * into v_finance
  from public.finance_accounts
  where profile_id = p_profile_id
  for update;
  if not found then
    raise exception 'Yatirim hesabi bulunamadi.';
  end if;

  if p_direction = 'deposit' then
    if v_credit.balance < p_amount then
      raise exception 'Kredi hesabinda yeterli bakiye yok.';
    end if;
    v_credit_after := v_credit.balance - p_amount;
    v_finance_after := v_finance.cash_balance + p_amount;
  else
    if v_finance.cash_balance < p_amount then
      raise exception 'Yatirim hesabinda yeterli nakit yok.';
    end if;
    v_credit_after := v_credit.balance + p_amount;
    v_finance_after := v_finance.cash_balance - p_amount;
  end if;

  if v_credit_after > 100000000 or v_finance_after > 100000000 then
    raise exception 'Hesap bakiyesi izin verilen siniri asamaz.';
  end if;

  update public.credit_accounts
  set balance = v_credit_after, updated_at = now()
  where id = v_credit.id;

  update public.finance_accounts
  set cash_balance = v_finance_after, updated_at = now()
  where id = v_finance.id;

  insert into public.credit_transactions(
    account_id, kind, amount, balance_after, reference, metadata
  ) values (
    v_credit.id,
    case when p_direction = 'deposit' then 'finance_deposit' else 'finance_withdrawal' end,
    p_amount,
    v_credit_after,
    case when p_direction = 'deposit' then 'IHP Finans hesabina aktarim' else 'IHP Finans hesabindan aktarim' end,
    jsonb_build_object('finance_account_id', v_finance.id)
  );

  insert into public.finance_transactions(
    finance_account_id, kind, amount, cash_balance_after, metadata
  ) values (
    v_finance.id,
    p_direction,
    p_amount,
    v_finance_after,
    jsonb_build_object('credit_account_id', v_credit.id)
  );

  return jsonb_build_object(
    'credit_balance', v_credit_after,
    'finance_balance', v_finance_after
  );
end;
$$;

create or replace function public.execute_finance_trade(
  p_profile_id uuid,
  p_symbol text,
  p_quantity numeric,
  p_unit_price numeric,
  p_side text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_finance public.finance_accounts%rowtype;
  v_position public.finance_positions%rowtype;
  v_amount bigint;
  v_cash_after bigint;
  v_new_quantity numeric(20,6);
  v_new_average numeric(20,6);
  v_realized numeric(20,6);
begin
  if current_user <> 'service_role' then
    raise exception 'Sunucu yetkisi gerekir.';
  end if;
  if p_symbol not in ('THYAO.IS', 'TUPRS.IS', 'GARAN.IS', 'ASELS.IS', 'BIMAS.IS', 'KCHOL.IS') then
    raise exception 'Desteklenmeyen piyasa kodu.';
  end if;
  if p_side not in ('buy', 'sell') then
    raise exception 'Islem yonu gecersiz.';
  end if;
  if p_quantity is null or p_quantity < 0.001 or p_quantity > 1000000 then
    raise exception 'Adet 0,001 ile 1.000.000 arasinda olmalidir.';
  end if;
  if p_unit_price is null or p_unit_price <= 0 or p_unit_price > 1000000 then
    raise exception 'Piyasa fiyati gecersiz.';
  end if;

  select * into v_finance
  from public.finance_accounts
  where profile_id = p_profile_id
  for update;
  if not found then
    raise exception 'Yatirim hesabi bulunamadi.';
  end if;

  select * into v_position
  from public.finance_positions
  where finance_account_id = v_finance.id and symbol = p_symbol
  for update;

  if p_side = 'buy' then
    v_amount := ceil(p_quantity * p_unit_price)::bigint;
    if v_amount < 1 or v_finance.cash_balance < v_amount then
      raise exception 'Yatirim hesabinda yeterli nakit yok.';
    end if;
    v_cash_after := v_finance.cash_balance - v_amount;
    if found then
      v_new_quantity := v_position.quantity + p_quantity;
      v_new_average := (
        (v_position.quantity * v_position.average_cost) + (p_quantity * p_unit_price)
      ) / v_new_quantity;
      update public.finance_positions
      set quantity = v_new_quantity, average_cost = v_new_average, updated_at = now()
      where id = v_position.id;
    else
      insert into public.finance_positions(
        finance_account_id, symbol, quantity, average_cost
      ) values (
        v_finance.id, p_symbol, p_quantity, p_unit_price
      );
    end if;
    v_realized := 0;
  else
    if not found or v_position.quantity < p_quantity then
      raise exception 'Satilabilir adet yetersiz.';
    end if;
    v_amount := floor(p_quantity * p_unit_price)::bigint;
    if v_amount < 1 then
      raise exception 'Islem tutari en az 1 kredi olmalidir.';
    end if;
    v_cash_after := v_finance.cash_balance + v_amount;
    if v_cash_after > 100000000 then
      raise exception 'Yatirim hesabi bakiye sinirini asamaz.';
    end if;
    v_new_quantity := v_position.quantity - p_quantity;
    v_realized := (p_quantity * p_unit_price) - (p_quantity * v_position.average_cost);
    if v_new_quantity < 0.000001 then
      delete from public.finance_positions where id = v_position.id;
    else
      update public.finance_positions
      set quantity = v_new_quantity, updated_at = now()
      where id = v_position.id;
    end if;
  end if;

  update public.finance_accounts
  set cash_balance = v_cash_after, updated_at = now()
  where id = v_finance.id;

  insert into public.finance_transactions(
    finance_account_id,
    kind,
    symbol,
    quantity,
    unit_price,
    amount,
    cash_balance_after,
    metadata
  ) values (
    v_finance.id,
    p_side,
    p_symbol,
    p_quantity,
    p_unit_price,
    v_amount,
    v_cash_after,
    jsonb_build_object('realized_profit', round(v_realized, 6))
  );

  return jsonb_build_object(
    'side', p_side,
    'symbol', p_symbol,
    'quantity', p_quantity,
    'unit_price', p_unit_price,
    'amount', v_amount,
    'cash_balance', v_cash_after,
    'realized_profit', round(v_realized, 6)
  );
end;
$$;

create or replace function private.prevent_credit_close_with_finance()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'active' and new.status = 'closed' and exists (
    select 1
    from public.finance_accounts fa
    where fa.credit_account_id = old.id
      and (
        fa.cash_balance > 0
        or exists (
          select 1
          from public.finance_positions fp
          where fp.finance_account_id = fa.id
        )
      )
  ) then
    raise exception 'Yatirim hesabinda nakit veya pozisyon varken kredi hesabi kapatilamaz.';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_credit_close_with_finance on public.credit_accounts;
create trigger prevent_credit_close_with_finance
  before update of status on public.credit_accounts
  for each row execute function private.prevent_credit_close_with_finance();

revoke all on function public.open_finance_account(uuid)
  from public, anon, authenticated;
revoke all on function public.transfer_finance_credit(uuid, bigint, text)
  from public, anon, authenticated;
revoke all on function public.execute_finance_trade(uuid, text, numeric, numeric, text)
  from public, anon, authenticated;

grant execute on function public.open_finance_account(uuid)
  to service_role;
grant execute on function public.transfer_finance_credit(uuid, bigint, text)
  to service_role;
grant execute on function public.execute_finance_trade(uuid, text, numeric, numeric, text)
  to service_role;
