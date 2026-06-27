alter table public.credit_settings
  add column if not exists weekly_allowance_next_at timestamptz,
  add column if not exists weekly_allowance_last_at timestamptz;

update public.credit_settings
set weekly_allowance_next_at =
  case
    when weekly_allowance_enabled and weekly_allowance_next_at is null
      then ((date_trunc('week', now() at time zone 'Europe/Istanbul') + interval '7 days 9 hours') at time zone 'Europe/Istanbul')
    else weekly_allowance_next_at
  end
where id = 'main';

create table if not exists public.credit_scheduled_transfers (
  id uuid primary key default gen_random_uuid(),
  sender_account_id uuid not null references public.credit_accounts(id) on delete cascade,
  recipient_account_id uuid not null references public.credit_accounts(id) on delete restrict,
  amount bigint not null check (amount > 0 and amount <= 1000000),
  tax bigint not null check (tax >= 0),
  total_debit bigint not null check (total_debit = amount + tax),
  description text not null default '' check (char_length(description) <= 160),
  scheduled_for timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled', 'failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  failure_reason text,
  check (sender_account_id <> recipient_account_id)
);

create index if not exists credit_scheduled_transfers_due_idx
  on public.credit_scheduled_transfers(scheduled_for, id)
  where status = 'scheduled';

create index if not exists credit_scheduled_transfers_sender_idx
  on public.credit_scheduled_transfers(sender_account_id, created_at desc);

alter table public.credit_scheduled_transfers enable row level security;
revoke all on table public.credit_scheduled_transfers from public, anon, authenticated;
grant select, insert, update, delete on table public.credit_scheduled_transfers to service_role;

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
    'balance_forfeit',
    'admin_adjustment',
    'game_entry',
    'game_reward'
  ));

create or replace function public.credit_transfer(
  p_profile_id uuid,
  p_recipient_code text,
  p_amount bigint,
  p_description text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_settings public.credit_settings%rowtype;
  v_sender public.credit_accounts%rowtype;
  v_recipient public.credit_accounts%rowtype;
  v_description text := btrim(coalesce(p_description, ''));
  v_tax bigint;
  v_total bigint;
begin
  if auth.role() <> 'service_role' then raise exception 'Sunucu yetkisi gerekir.'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 1000000 then raise exception 'Transfer tutari gecersiz.'; end if;
  if char_length(v_description) > 160 then raise exception 'Transfer aciklamasi en fazla 160 karakter olabilir.'; end if;

  select * into v_settings from public.credit_settings where id = 'main';
  if not v_settings.member_access_enabled then raise exception 'Kredi sistemi uyelere henuz acik degil.'; end if;

  select a.* into v_sender
  from public.credit_accounts a
  join public.profiles p on p.id = a.profile_id
  where a.profile_id = p_profile_id
    and a.status = 'active'
    and p.status = 'active'
  for update of a;
  if not found then raise exception 'Aktif gonderici hesabi bulunamadi.'; end if;

  select a.* into v_recipient
  from public.credit_accounts a
  join public.profiles p on p.id = a.profile_id
  where a.account_code = upper(btrim(p_recipient_code))
    and a.status = 'active'
    and p.status = 'active'
  for update of a;
  if not found then raise exception 'Alici hesap numarasi bulunamadi.'; end if;
  if v_recipient.id = v_sender.id then raise exception 'Kendi hesabiniza transfer yapamazsiniz.'; end if;

  v_tax := ceil((p_amount::numeric * v_settings.transfer_tax_basis_points::numeric) / 10000)::bigint;
  v_total := p_amount + v_tax;
  if v_sender.balance < v_total then raise exception 'Vergi dahil transfer icin bakiye yetersiz.'; end if;

  update public.credit_accounts
  set balance = balance - v_total
  where id = v_sender.id;

  insert into public.credit_transactions(
    account_id, counterparty_account_id, kind, amount, balance_after, reference, metadata
  ) values (
    v_sender.id,
    v_recipient.id,
    'transfer_out',
    p_amount,
    v_sender.balance - v_total,
    'IHP kredi transferi',
    jsonb_build_object('tax', v_tax, 'irreversible', true, 'description', v_description, 'delivery', 'immediate')
  );

  if v_tax > 0 then
    insert into public.credit_transactions(account_id, kind, amount, balance_after, reference, metadata)
    values (
      v_sender.id,
      'transfer_tax',
      v_tax,
      v_sender.balance - v_total,
      'Transfer vergisi',
      jsonb_build_object('rate_basis_points', v_settings.transfer_tax_basis_points, 'description', v_description)
    );
  end if;

  update public.credit_accounts
  set balance = balance + p_amount
  where id = v_recipient.id;

  insert into public.credit_transactions(
    account_id, counterparty_account_id, kind, amount, balance_after, reference, metadata
  ) values (
    v_recipient.id,
    v_sender.id,
    'transfer_in',
    p_amount,
    v_recipient.balance + p_amount,
    'IHP kredi transferi',
    jsonb_build_object('sender_account', v_sender.account_code, 'description', v_description, 'delivery', 'immediate')
  );

  return jsonb_build_object(
    'amount', p_amount,
    'tax', v_tax,
    'total_debit', v_total,
    'balance', v_sender.balance - v_total,
    'recipient_account', v_recipient.account_code,
    'description', v_description,
    'status', 'completed'
  );
end;
$$;

create or replace function public.credit_transfer(
  p_profile_id uuid,
  p_recipient_code text,
  p_amount bigint
)
returns jsonb
language sql
set search_path = ''
as $$
  select public.credit_transfer(p_profile_id, p_recipient_code, p_amount, '');
$$;

create or replace function public.schedule_credit_transfer(
  p_profile_id uuid,
  p_recipient_code text,
  p_amount bigint,
  p_description text,
  p_scheduled_for timestamptz
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_settings public.credit_settings%rowtype;
  v_sender public.credit_accounts%rowtype;
  v_recipient public.credit_accounts%rowtype;
  v_transfer public.credit_scheduled_transfers%rowtype;
  v_description text := btrim(coalesce(p_description, ''));
  v_tax bigint;
  v_total bigint;
begin
  if auth.role() <> 'service_role' then raise exception 'Sunucu yetkisi gerekir.'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 1000000 then raise exception 'Transfer tutari gecersiz.'; end if;
  if char_length(v_description) > 160 then raise exception 'Transfer aciklamasi en fazla 160 karakter olabilir.'; end if;
  if p_scheduled_for is null or p_scheduled_for < now() + interval '30 seconds' then
    raise exception 'Planli transfer zamani gelecekte olmalidir.';
  end if;
  if p_scheduled_for > now() + interval '365 days' then
    raise exception 'Planli transfer en fazla bir yil ileriye ayarlanabilir.';
  end if;

  select * into v_settings from public.credit_settings where id = 'main';
  if not v_settings.member_access_enabled then raise exception 'Kredi sistemi uyelere henuz acik degil.'; end if;

  select a.* into v_sender
  from public.credit_accounts a
  join public.profiles p on p.id = a.profile_id
  where a.profile_id = p_profile_id
    and a.status = 'active'
    and p.status = 'active'
  for update of a;
  if not found then raise exception 'Aktif gonderici hesabi bulunamadi.'; end if;

  select a.* into v_recipient
  from public.credit_accounts a
  join public.profiles p on p.id = a.profile_id
  where a.account_code = upper(btrim(p_recipient_code))
    and a.status = 'active'
    and p.status = 'active';
  if not found then raise exception 'Alici hesap numarasi bulunamadi.'; end if;
  if v_recipient.id = v_sender.id then raise exception 'Kendi hesabiniza transfer yapamazsiniz.'; end if;

  v_tax := ceil((p_amount::numeric * v_settings.transfer_tax_basis_points::numeric) / 10000)::bigint;
  v_total := p_amount + v_tax;
  if v_sender.balance < v_total then raise exception 'Vergi dahil transfer icin bakiye yetersiz.'; end if;

  update public.credit_accounts
  set balance = balance - v_total
  where id = v_sender.id;

  insert into public.credit_scheduled_transfers(
    sender_account_id,
    recipient_account_id,
    amount,
    tax,
    total_debit,
    description,
    scheduled_for
  ) values (
    v_sender.id,
    v_recipient.id,
    p_amount,
    v_tax,
    v_total,
    v_description,
    p_scheduled_for
  )
  returning * into v_transfer;

  insert into public.credit_transactions(
    account_id, counterparty_account_id, kind, amount, balance_after, reference, metadata
  ) values (
    v_sender.id,
    v_recipient.id,
    'transfer_reserve',
    v_total,
    v_sender.balance - v_total,
    'Planli transfer rezervasyonu',
    jsonb_build_object(
      'transfer_id', v_transfer.id,
      'amount', p_amount,
      'tax', v_tax,
      'description', v_description,
      'scheduled_for', p_scheduled_for
    )
  );

  return jsonb_build_object(
    'id', v_transfer.id,
    'amount', p_amount,
    'tax', v_tax,
    'total_debit', v_total,
    'balance', v_sender.balance - v_total,
    'recipient_account', v_recipient.account_code,
    'description', v_description,
    'scheduled_for', p_scheduled_for,
    'status', 'scheduled'
  );
end;
$$;

create or replace function public.cancel_scheduled_credit_transfer(
  p_profile_id uuid,
  p_transfer_id uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_transfer public.credit_scheduled_transfers%rowtype;
  v_sender public.credit_accounts%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Sunucu yetkisi gerekir.'; end if;

  select t.* into v_transfer
  from public.credit_scheduled_transfers t
  join public.credit_accounts a on a.id = t.sender_account_id
  where t.id = p_transfer_id
    and a.profile_id = p_profile_id
  for update of t;

  if not found then raise exception 'Planli transfer bulunamadi.'; end if;
  if v_transfer.status <> 'scheduled' then raise exception 'Bu transfer artik iptal edilemez.'; end if;

  select * into v_sender
  from public.credit_accounts
  where id = v_transfer.sender_account_id
    and status = 'active'
  for update;
  if not found then raise exception 'Gonderici hesabi aktif degil.'; end if;

  update public.credit_accounts
  set balance = balance + v_transfer.total_debit
  where id = v_sender.id;

  update public.credit_scheduled_transfers
  set status = 'cancelled', cancelled_at = now()
  where id = v_transfer.id;

  insert into public.credit_transactions(
    account_id, counterparty_account_id, kind, amount, balance_after, reference, metadata
  ) values (
    v_sender.id,
    v_transfer.recipient_account_id,
    'transfer_refund',
    v_transfer.total_debit,
    v_sender.balance + v_transfer.total_debit,
    'Planli transfer iptali',
    jsonb_build_object(
      'transfer_id', v_transfer.id,
      'amount', v_transfer.amount,
      'tax', v_transfer.tax,
      'description', v_transfer.description
    )
  );

  return jsonb_build_object(
    'id', v_transfer.id,
    'status', 'cancelled',
    'refunded', v_transfer.total_debit,
    'balance', v_sender.balance + v_transfer.total_debit
  );
end;
$$;

create or replace function public.close_credit_account(p_profile_id uuid)
returns public.credit_accounts
language plpgsql
set search_path = ''
as $$
declare
  v_settings public.credit_settings%rowtype;
  v_account public.credit_accounts%rowtype;
  v_forfeit bigint;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Sunucu yetkisi gerekir.';
  end if;

  select * into v_settings
  from public.credit_settings
  where id = 'main';
  if not v_settings.member_access_enabled then
    raise exception 'Kredi sistemi uyelere acik degil.';
  end if;

  select * into v_account
  from public.credit_accounts
  where profile_id = p_profile_id and status = 'active'
  for update;
  if not found then
    raise exception 'Aktif kredi hesabi bulunamadi.';
  end if;

  if exists (
    select 1
    from public.credit_loans
    where account_id = v_account.id
      and status in ('pending','approved','delinquent')
  ) then
    raise exception 'Acik kredi borcu veya basvurusu varken hesap kapatilamaz.';
  end if;

  if exists (
    select 1
    from public.credit_cheques
    where issuer_account_id = v_account.id and status = 'issued'
  ) then
    raise exception 'Kullanilmamis cek varken hesap kapatilamaz.';
  end if;

  if exists (
    select 1
    from public.credit_scheduled_transfers
    where sender_account_id = v_account.id and status = 'scheduled'
  ) then
    raise exception 'Bekleyen planli transfer varken hesap kapatilamaz.';
  end if;

  if exists (
    select 1 from public.flappy_sessions
    where profile_id = p_profile_id and status = 'active'
  ) or exists (
    select 1 from public.game_attempts
    where profile_id = p_profile_id and status = 'active'
  ) then
    raise exception 'Devam eden oyun tamamlanmadan hesap kapatilamaz.';
  end if;

  update public.game_credit_requests
  set status = 'rejected', decided_at = coalesce(decided_at, now())
  where profile_id = p_profile_id
    and status in ('pending','approved');

  v_forfeit := v_account.balance;
  update public.credit_accounts
  set status = 'closed', balance = 0, closed_at = now(), updated_at = now()
  where id = v_account.id
  returning * into v_account;

  if v_forfeit > 0 then
    insert into public.credit_transactions(
      account_id, kind, amount, balance_after, reference, metadata
    ) values (
      v_account.id,
      'balance_forfeit',
      v_forfeit,
      0,
      'Hesap kapatma',
      jsonb_build_object('irreversible', true)
    );
  end if;

  return v_account;
end;
$$;

create or replace function public.process_credit_schedules()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_settings public.credit_settings%rowtype;
  v_week_key text;
  v_day_key text;
  v_allowance_count integer := 0;
  v_transfer_count integer := 0;
  v_transfer_failed integer := 0;
  v_paid_count integer := 0;
  v_complaint_count integer := 0;
  v_allowance bigint;
  v_admin uuid;
  v_complaint uuid;
  v_account record;
  v_due record;
  v_transfer record;
  v_sender public.credit_accounts%rowtype;
  v_recipient public.credit_accounts%rowtype;
  v_next_allowance timestamptz;
begin
  if auth.role() <> 'service_role' then raise exception 'Sunucu yetkisi gerekir.'; end if;
  select * into v_settings from public.credit_settings where id = 'main' for update;

  for v_transfer in
    select *
    from public.credit_scheduled_transfers
    where status = 'scheduled' and scheduled_for <= now()
    order by scheduled_for, id
    for update skip locked
  loop
    select * into v_sender
    from public.credit_accounts
    where id = v_transfer.sender_account_id
    for update;

    select a.* into v_recipient
    from public.credit_accounts a
    join public.profiles p on p.id = a.profile_id
    where a.id = v_transfer.recipient_account_id
      and a.status = 'active'
      and p.status = 'active'
    for update of a;

    if not found then
      if v_sender.id is not null and v_sender.status = 'active' then
        update public.credit_accounts
        set balance = balance + v_transfer.total_debit
        where id = v_sender.id;

        insert into public.credit_transactions(
          account_id, counterparty_account_id, kind, amount, balance_after, reference, metadata
        ) values (
          v_sender.id,
          v_transfer.recipient_account_id,
          'transfer_refund',
          v_transfer.total_debit,
          v_sender.balance + v_transfer.total_debit,
          'Basarisiz planli transfer iadesi',
          jsonb_build_object('transfer_id', v_transfer.id, 'reason', 'recipient_inactive')
        );
      end if;

      update public.credit_scheduled_transfers
      set status = 'failed',
          failure_reason = 'Alici hesabi teslim zamaninda aktif degildi.',
          completed_at = now()
      where id = v_transfer.id;
      v_transfer_failed := v_transfer_failed + 1;
      continue;
    end if;

    update public.credit_accounts
    set balance = balance + v_transfer.amount
    where id = v_recipient.id;

    insert into public.credit_transactions(
      account_id, counterparty_account_id, kind, amount, balance_after, reference, metadata
    ) values (
      v_recipient.id,
      v_transfer.sender_account_id,
      'transfer_in',
      v_transfer.amount,
      v_recipient.balance + v_transfer.amount,
      'Planli IHP kredi transferi',
      jsonb_build_object(
        'transfer_id', v_transfer.id,
        'sender_account', v_sender.account_code,
        'description', v_transfer.description,
        'scheduled_for', v_transfer.scheduled_for,
        'delivered_at', now()
      )
    );

    update public.credit_scheduled_transfers
    set status = 'completed', completed_at = now()
    where id = v_transfer.id;
    v_transfer_count := v_transfer_count + 1;
  end loop;

  if v_settings.weekly_allowance_enabled
    and v_settings.weekly_allowance_next_at is not null
    and v_settings.weekly_allowance_next_at <= now()
  then
    v_week_key := 'weekly:' || to_char(v_settings.weekly_allowance_next_at at time zone 'Europe/Istanbul', 'YYYY-MM-DD-HH24-MI');

    if not exists (select 1 from public.credit_cron_runs where run_key = v_week_key) then
      for v_account in
        select a.id, a.balance, p.roles, p.role
        from public.credit_accounts a
        join public.profiles p on p.id = a.profile_id
        where a.status = 'active'
          and p.status = 'active'
          and not p.is_system_account
        for update of a
      loop
        select coalesce(max(coalesce((v_settings.role_allowances ->> role_name::text)::bigint, 0)), 0)
        into v_allowance
        from unnest(coalesce(v_account.roles, array[v_account.role])) as roles(role_name)
        where (v_settings.role_allowances ->> role_name::text) is not null;

        if v_allowance > 0 then
          update public.credit_accounts set balance = balance + v_allowance where id = v_account.id;
          insert into public.credit_transactions(account_id, kind, amount, balance_after, reference, metadata)
          values (
            v_account.id,
            'weekly_allowance',
            v_allowance,
            v_account.balance + v_allowance,
            v_week_key,
            jsonb_build_object('automatic', true, 'scheduled_for', v_settings.weekly_allowance_next_at)
          );
          v_allowance_count := v_allowance_count + 1;
        end if;
      end loop;

      insert into public.credit_cron_runs(run_key, run_type, result)
      values (v_week_key, 'weekly_allowance', jsonb_build_object('credited_accounts', v_allowance_count));
    end if;

    v_next_allowance := v_settings.weekly_allowance_next_at + interval '7 days';
    while v_next_allowance <= now() loop
      v_next_allowance := v_next_allowance + interval '7 days';
    end loop;

    update public.credit_settings
    set weekly_allowance_last_at = v_settings.weekly_allowance_next_at,
        weekly_allowance_next_at = v_next_allowance
    where id = 'main';
  end if;

  v_day_key := 'daily:' || to_char(now() at time zone 'Europe/Istanbul', 'YYYY-MM-DD');
  if not exists (select 1 from public.credit_cron_runs where run_key = v_day_key) then
    select p.id into v_admin
    from public.profiles p
    where p.status = 'active'
      and coalesce(p.roles, array[p.role]) && array['super_admin']::public.app_role[]
    order by p.created_at
    limit 1;

    for v_due in
      select i.id, i.amount, i.loan_id, i.due_at, a.id as account_id, a.profile_id, a.balance
      from public.credit_installments i
      join public.credit_loans l on l.id = i.loan_id
      join public.credit_accounts a on a.id = l.account_id
      where i.status in ('pending','delinquent')
        and i.due_at + make_interval(days => v_settings.grace_days) < now()
      for update of i, l, a
    loop
      if v_due.balance >= v_due.amount then
        update public.credit_accounts set balance = balance - v_due.amount where id = v_due.account_id;
        update public.credit_installments set status = 'paid', paid_at = now() where id = v_due.id;
        update public.credit_loans
        set paid_amount = paid_amount + v_due.amount,
            status = case when paid_amount + v_due.amount >= total_due then 'paid' else 'approved' end
        where id = v_due.loan_id;
        insert into public.credit_transactions(account_id, kind, amount, balance_after, reference, metadata)
        values (
          v_due.account_id,
          'loan_repayment',
          v_due.amount,
          v_due.balance - v_due.amount,
          'Otomatik taksit ' || v_due.id::text,
          jsonb_build_object('automatic', true)
        );
        v_paid_count := v_paid_count + 1;
      elsif v_admin is not null
        and not exists (
          select 1 from public.credit_installments where id = v_due.id and complaint_id is not null
        )
      then
        update public.credit_installments set status = 'delinquent' where id = v_due.id;
        update public.credit_loans set status = 'delinquent' where id = v_due.loan_id;
        insert into public.complaints(
          complainant_profile_id,
          accused_profile_id,
          created_by,
          subject,
          description,
          priority,
          status
        ) values (
          v_admin,
          v_due.profile_id,
          v_admin,
          'IHP Kredi Sistemi - geciken odeme',
          'Kredi taksiti vade ve ' || v_settings.grace_days || ' gunluk ek sure sonunda odenmedi. Taksit tutari: '
            || v_due.amount || ' kredi. Vade: '
            || to_char(v_due.due_at at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI') || '.',
          'important',
          'new'
        )
        returning id into v_complaint;
        update public.credit_installments set complaint_id = v_complaint where id = v_due.id;
        v_complaint_count := v_complaint_count + 1;
      end if;
    end loop;

    insert into public.credit_cron_runs(run_key, run_type, result)
    values (
      v_day_key,
      'daily_collection',
      jsonb_build_object('paid', v_paid_count, 'complaints', v_complaint_count)
    );
  end if;

  return jsonb_build_object(
    'allowances', v_allowance_count,
    'scheduled_transfers', v_transfer_count,
    'failed_transfers', v_transfer_failed,
    'automatic_payments', v_paid_count,
    'complaints', v_complaint_count
  );
end;
$$;

revoke all on function public.credit_transfer(uuid, text, bigint, text) from public, anon, authenticated;
revoke all on function public.schedule_credit_transfer(uuid, text, bigint, text, timestamptz) from public, anon, authenticated;
revoke all on function public.cancel_scheduled_credit_transfer(uuid, uuid) from public, anon, authenticated;

grant execute on function public.credit_transfer(uuid, text, bigint, text) to service_role;
grant execute on function public.schedule_credit_transfer(uuid, text, bigint, text, timestamptz) to service_role;
grant execute on function public.cancel_scheduled_credit_transfer(uuid, uuid) to service_role;
