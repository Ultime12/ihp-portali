alter table public.finance_accounts
  add column if not exists portfolio_fee_consent_at timestamptz,
  add column if not exists portfolio_fee_last_charged_at timestamptz,
  add column if not exists portfolio_fee_debt bigint not null default 0;

alter table public.finance_accounts
  drop constraint if exists finance_accounts_portfolio_fee_debt_check;

alter table public.finance_accounts
  add constraint finance_accounts_portfolio_fee_debt_check
  check (portfolio_fee_debt >= 0);

alter table public.finance_transactions
  drop constraint if exists finance_transactions_kind_check;

alter table public.finance_transactions
  add constraint finance_transactions_kind_check check (kind in (
    'deposit',
    'withdrawal',
    'buy',
    'sell',
    'portfolio_fee'
  ));

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
    'finance_withdrawal',
    'finance_portfolio_fee'
  ));

create or replace function public.accept_finance_portfolio_terms(p_profile_id uuid)
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
    update public.finance_accounts
    set
      credit_account_id = v_credit.id,
      portfolio_fee_consent_at = coalesce(portfolio_fee_consent_at, now()),
      portfolio_fee_last_charged_at = coalesce(portfolio_fee_last_charged_at, now()),
      updated_at = now()
    where id = v_finance.id
    returning * into v_finance;
    return v_finance;
  end if;

  insert into public.finance_accounts(
    profile_id,
    credit_account_id,
    portfolio_fee_consent_at,
    portfolio_fee_last_charged_at
  ) values (
    p_profile_id,
    v_credit.id,
    now(),
    now()
  )
  returning * into v_finance;

  return v_finance;
end;
$$;

create or replace function public.apply_finance_portfolio_fee(p_profile_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_credit public.credit_accounts%rowtype;
  v_finance public.finance_accounts%rowtype;
  v_last timestamptz;
  v_weeks integer;
  v_position_cost bigint;
  v_basis bigint;
  v_new_due bigint;
  v_due_total bigint;
  v_available bigint;
  v_charged bigint;
  v_from_finance bigint;
  v_from_credit bigint;
  v_debt_after bigint;
  v_finance_after bigint;
  v_credit_after bigint;
  v_last_after timestamptz;
begin
  if current_user <> 'service_role' then
    raise exception 'Sunucu yetkisi gerekir.';
  end if;

  select * into v_finance
  from public.finance_accounts
  where profile_id = p_profile_id
  for update;
  if not found then
    return jsonb_build_object('applied', false, 'reason', 'no_finance_account');
  end if;
  if v_finance.portfolio_fee_consent_at is null then
    return jsonb_build_object('applied', false, 'reason', 'terms_not_accepted');
  end if;

  select * into v_credit
  from public.credit_accounts
  where id = v_finance.credit_account_id and status = 'active'
  for update;
  if not found then
    return jsonb_build_object('applied', false, 'reason', 'no_active_credit_account');
  end if;

  v_last := coalesce(v_finance.portfolio_fee_last_charged_at, v_finance.portfolio_fee_consent_at, now());
  v_weeks := floor(extract(epoch from (now() - v_last)) / 604800)::integer;

  if v_weeks < 1 and v_finance.portfolio_fee_debt <= 0 then
    return jsonb_build_object(
      'applied', false,
      'reason', 'not_due',
      'next_charge_at', v_last + interval '7 days',
      'debt', 0
    );
  end if;

  select coalesce(ceil(sum(quantity * average_cost)), 0)::bigint into v_position_cost
  from public.finance_positions
  where finance_account_id = v_finance.id;

  v_basis := greatest(0, v_finance.cash_balance + coalesce(v_position_cost, 0));
  v_new_due := case when v_weeks > 0 then ceil(v_basis * 0.10 * v_weeks)::bigint else 0 end;
  v_due_total := greatest(0, v_finance.portfolio_fee_debt + v_new_due);

  if v_due_total <= 0 then
    v_last_after := case when v_weeks > 0 then v_last + make_interval(secs => v_weeks * 604800) else v_last end;
    update public.finance_accounts
    set portfolio_fee_last_charged_at = v_last_after,
        portfolio_fee_debt = 0,
        updated_at = now()
    where id = v_finance.id;
    return jsonb_build_object(
      'applied', false,
      'reason', 'zero_basis',
      'next_charge_at', v_last_after + interval '7 days',
      'debt', 0
    );
  end if;

  v_available := greatest(0, v_finance.cash_balance + v_credit.balance);
  v_charged := least(v_due_total, v_available);
  v_from_finance := least(v_finance.cash_balance, v_charged);
  v_from_credit := least(v_credit.balance, v_charged - v_from_finance);
  v_debt_after := v_due_total - v_charged;
  v_finance_after := v_finance.cash_balance - v_from_finance;
  v_credit_after := v_credit.balance - v_from_credit;
  v_last_after := case when v_weeks > 0 then v_last + make_interval(secs => v_weeks * 604800) else v_last end;

  update public.finance_accounts
  set cash_balance = v_finance_after,
      portfolio_fee_last_charged_at = v_last_after,
      portfolio_fee_debt = v_debt_after,
      updated_at = now()
  where id = v_finance.id;

  if v_from_credit > 0 then
    update public.credit_accounts
    set balance = v_credit_after,
        updated_at = now()
    where id = v_credit.id;
  end if;

  if v_charged > 0 then
    insert into public.finance_transactions(
      finance_account_id,
      kind,
      amount,
      cash_balance_after,
      metadata
    ) values (
      v_finance.id,
      'portfolio_fee',
      v_charged,
      v_finance_after,
      jsonb_build_object(
        'rate_basis_points', 1000,
        'weeks', v_weeks,
        'basis', v_basis,
        'due_total', v_due_total,
        'charged_from_finance', v_from_finance,
        'charged_from_credit', v_from_credit,
        'debt_after', v_debt_after,
        'next_charge_at', v_last_after + interval '7 days'
      )
    );
  end if;

  if v_from_credit > 0 then
    insert into public.credit_transactions(
      account_id,
      kind,
      amount,
      balance_after,
      reference,
      metadata
    ) values (
      v_credit.id,
      'finance_portfolio_fee',
      v_from_credit,
      v_credit_after,
      'IHP Finans haftalik portfoy kesintisi',
      jsonb_build_object(
        'finance_account_id', v_finance.id,
        'rate_basis_points', 1000,
        'weeks', v_weeks,
        'charged_from_finance', v_from_finance,
        'debt_after', v_debt_after
      )
    );
  end if;

  return jsonb_build_object(
    'applied', v_charged > 0,
    'weeks', v_weeks,
    'basis', v_basis,
    'charged', v_charged,
    'charged_from_finance', v_from_finance,
    'charged_from_credit', v_from_credit,
    'debt', v_debt_after,
    'cash_balance', v_finance_after,
    'credit_balance', v_credit_after,
    'next_charge_at', v_last_after + interval '7 days'
  );
end;
$$;

revoke all on function public.accept_finance_portfolio_terms(uuid)
  from public, anon, authenticated;
revoke all on function public.apply_finance_portfolio_fee(uuid)
  from public, anon, authenticated;

grant execute on function public.accept_finance_portfolio_terms(uuid)
  to service_role;
grant execute on function public.apply_finance_portfolio_fee(uuid)
  to service_role;
