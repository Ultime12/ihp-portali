alter table public.discipline_records
  add column if not exists credit_fine_amount bigint not null default 0,
  add column if not exists credit_fine_installments integer not null default 1,
  add column if not exists credit_fine_debt_id uuid;

alter table public.discipline_records
  drop constraint if exists discipline_records_credit_fine_amount_check,
  drop constraint if exists discipline_records_credit_fine_installments_check;

alter table public.discipline_records
  add constraint discipline_records_credit_fine_amount_check
    check (credit_fine_amount between 0 and 100000000),
  add constraint discipline_records_credit_fine_installments_check
    check (credit_fine_installments between 1 and 12);

alter table public.credit_loans
  add column if not exists source text not null default 'member_loan',
  add column if not exists discipline_record_id uuid,
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

alter table public.credit_loans
  drop constraint if exists credit_loans_source_check,
  drop constraint if exists credit_loans_term_days_check,
  drop constraint if exists credit_loans_installment_count_check;

alter table public.credit_loans
  add constraint credit_loans_source_check
    check (source in ('member_loan', 'discipline_fine')),
  add constraint credit_loans_term_days_check
    check (term_days between 1 and 365),
  add constraint credit_loans_installment_count_check
    check (installment_count between 1 and 12);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'credit_loans_discipline_record_id_fkey'
      and conrelid = 'public.credit_loans'::regclass
  ) then
    alter table public.credit_loans
      add constraint credit_loans_discipline_record_id_fkey
      foreign key (discipline_record_id) references public.discipline_records(id) on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'discipline_records_credit_fine_debt_id_fkey'
      and conrelid = 'public.discipline_records'::regclass
  ) then
    alter table public.discipline_records
      add constraint discipline_records_credit_fine_debt_id_fkey
      foreign key (credit_fine_debt_id) references public.credit_loans(id) on delete set null;
  end if;
end $$;

create unique index if not exists credit_loans_one_discipline_fine_per_record_idx
  on public.credit_loans(discipline_record_id)
  where source = 'discipline_fine' and discipline_record_id is not null;

alter table public.credit_installments
  drop constraint if exists credit_installments_installment_no_check;

alter table public.credit_installments
  add constraint credit_installments_installment_no_check
    check (installment_no between 1 and 12);

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
    'game_reward'
  ));

create or replace function public.create_discipline_credit_fine(
  p_actor_profile_id uuid,
  p_discipline_record_id uuid,
  p_member_profile_id uuid,
  p_account_code text,
  p_amount bigint,
  p_installment_count integer,
  p_note text default ''
)
returns public.credit_loans
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_record public.discipline_records%rowtype;
  v_account public.credit_accounts%rowtype;
  v_loan public.credit_loans%rowtype;
  v_piece bigint;
  v_remaining bigint;
  v_amount bigint;
  v_index integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Sunucu yetkisi gerekir.';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 100000000 then
    raise exception 'Para cezasi tutari gecersiz.';
  end if;
  if p_installment_count is null or p_installment_count < 1 or p_installment_count > 12 then
    raise exception 'Para cezasi taksit sayisi 1-12 arasinda olmalidir.';
  end if;
  if p_amount < p_installment_count then
    raise exception 'Taksit sayisi para cezasi tutarindan buyuk olamaz.';
  end if;
  if p_account_code !~ '^IHP[0-9]{9}$' then
    raise exception 'Hesap numarasi gecersiz.';
  end if;

  select * into v_record
  from public.discipline_records
  where id = p_discipline_record_id and member_id = p_member_profile_id
  for update;
  if not found then
    raise exception 'Disiplin kaydi bulunamadi.';
  end if;

  select * into v_profile
  from public.profiles
  where id = p_member_profile_id
  for update;
  if not found or v_profile.status not in ('active', 'suspended', 'passive')
     or v_profile.is_system_account then
    raise exception 'Para cezasi icin gecerli uye bulunamadi.';
  end if;

  select * into v_account
  from public.credit_accounts
  where profile_id = p_member_profile_id
  for update;

  if found and v_account.status <> 'active' then
    update public.credit_accounts
    set status = 'active',
        account_code = p_account_code,
        balance = 0,
        usage_purpose = 'general',
        terms_version = '2026-06-discipline-fine',
        terms_accepted_at = now(),
        opened_at = now(),
        closed_at = null,
        updated_at = now()
    where id = v_account.id
    returning * into v_account;
  elsif not found then
    insert into public.credit_accounts(
      profile_id,
      account_code,
      usage_purpose,
      terms_version,
      terms_accepted_at
    ) values (
      p_member_profile_id,
      p_account_code,
      'general',
      '2026-06-discipline-fine',
      now()
    )
    returning * into v_account;
  end if;

  select * into v_loan
  from public.credit_loans
  where source = 'discipline_fine'
    and discipline_record_id = p_discipline_record_id
  for update;

  if found then
    if v_loan.paid_amount > 0 and (
      v_loan.total_due <> p_amount or v_loan.installment_count <> p_installment_count
    ) then
      raise exception 'Odemesi baslamis para cezasi borcu degistirilemez.';
    end if;

    if v_loan.paid_amount = 0 then
      delete from public.credit_installments where loan_id = v_loan.id;
      update public.credit_loans
      set account_id = v_account.id,
          principal = p_amount,
          interest_basis_points = 0,
          total_due = p_amount,
          paid_amount = 0,
          term_days = least(365, p_installment_count * 7),
          installment_count = p_installment_count,
          status = 'approved',
          decided_by = p_actor_profile_id,
          decided_at = now(),
          decision_note = left(coalesce(p_note, ''), 600),
          due_at = now() + make_interval(days => least(365, p_installment_count * 7)),
          created_by = p_actor_profile_id
      where id = v_loan.id
      returning * into v_loan;
    end if;
  else
    insert into public.credit_loans(
      account_id,
      principal,
      interest_basis_points,
      total_due,
      paid_amount,
      term_days,
      installment_count,
      status,
      decided_by,
      decided_at,
      decision_note,
      due_at,
      source,
      discipline_record_id,
      created_by
    ) values (
      v_account.id,
      p_amount,
      0,
      p_amount,
      0,
      least(365, p_installment_count * 7),
      p_installment_count,
      'approved',
      p_actor_profile_id,
      now(),
      left(coalesce(p_note, ''), 600),
      now() + make_interval(days => least(365, p_installment_count * 7)),
      'discipline_fine',
      p_discipline_record_id,
      p_actor_profile_id
    )
    returning * into v_loan;
  end if;

  if v_loan.paid_amount = 0 then
    v_piece := ceil(p_amount::numeric / p_installment_count)::bigint;
    v_remaining := p_amount;
    for v_index in 1..p_installment_count loop
      v_amount := least(v_piece, v_remaining);
      insert into public.credit_installments(loan_id, installment_no, amount, due_at)
      values (
        v_loan.id,
        v_index,
        v_amount,
        now() + make_interval(days => v_index * 7)
      );
      v_remaining := v_remaining - v_amount;
    end loop;
  end if;

  update public.discipline_records
  set credit_fine_amount = p_amount,
      credit_fine_installments = p_installment_count,
      credit_fine_debt_id = v_loan.id
  where id = p_discipline_record_id;

  insert into public.notifications(recipient_id, actor_id, title, body, category, link)
  values (
    p_member_profile_id,
    p_actor_profile_id,
    'Disiplin para cezasi borcu olusturuldu',
    p_amount || ' kredi tutarinda para cezasi ' || p_installment_count || ' taksit olarak kredi hesabiniza islendi.',
    'credit',
    '#/portal/credit'
  );

  insert into public.audit_logs(action, actor_id, target_type, target_id, details)
  values (
    'discipline_credit_fine_created',
    p_actor_profile_id,
    'credit_loans',
    v_loan.id::text,
    jsonb_build_object(
      'discipline_record_id', p_discipline_record_id,
      'member_id', p_member_profile_id,
      'amount', p_amount,
      'installments', p_installment_count
    )
  );

  return v_loan;
end;
$$;

revoke all on function public.create_discipline_credit_fine(uuid, uuid, uuid, text, bigint, integer, text)
  from public, anon, authenticated;
grant execute on function public.create_discipline_credit_fine(uuid, uuid, uuid, text, bigint, integer, text)
  to service_role;

create or replace function public.pay_credit_installment(p_profile_id uuid, p_installment_id uuid)
returns public.credit_installments
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_settings public.credit_settings%rowtype;
  v_installment public.credit_installments%rowtype;
  v_loan public.credit_loans%rowtype;
  v_account public.credit_accounts%rowtype;
  v_kind text;
  v_reference text;
begin
  if auth.role() <> 'service_role' then raise exception 'Sunucu yetkisi gerekir.'; end if;
  select * into v_settings from public.credit_settings where id = 'main';
  if not v_settings.member_access_enabled then raise exception 'Kredi sistemi uyelere henuz acik degil.'; end if;

  select i.* into v_installment
  from public.credit_installments i
  join public.credit_loans l on l.id = i.loan_id
  join public.credit_accounts a on a.id = l.account_id
  join public.profiles p on p.id = a.profile_id
  where i.id = p_installment_id
    and a.profile_id = p_profile_id
    and a.status = 'active'
    and p.status = 'active'
  for update of i;
  if not found or v_installment.status = 'paid' then raise exception 'Odenebilir taksit bulunamadi.'; end if;

  select * into v_loan from public.credit_loans where id = v_installment.loan_id for update;
  select * into v_account from public.credit_accounts where id = v_loan.account_id for update;
  if v_account.balance < v_installment.amount then raise exception 'Taksit icin bakiye yetersiz.'; end if;

  update public.credit_accounts
  set balance = balance - v_installment.amount
  where id = v_account.id;

  update public.credit_installments
  set status = 'paid', paid_at = now()
  where id = v_installment.id
  returning * into v_installment;

  update public.credit_loans
  set paid_amount = paid_amount + v_installment.amount,
      status = case when paid_amount + v_installment.amount >= total_due then 'paid' else 'approved' end
  where id = v_loan.id;

  v_kind := case when v_loan.source = 'discipline_fine' then 'discipline_fine_repayment' else 'loan_repayment' end;
  v_reference := case when v_loan.source = 'discipline_fine' then 'Disiplin para cezasi taksiti ' else 'Taksit ' end
    || v_installment.id::text;

  insert into public.credit_transactions(account_id, kind, amount, balance_after, reference, metadata)
  values (
    v_account.id,
    v_kind,
    v_installment.amount,
    v_account.balance - v_installment.amount,
    v_reference,
    jsonb_build_object('manual', true, 'loan_id', v_loan.id, 'source', v_loan.source)
  );

  return v_installment;
end;
$$;

revoke all on function public.pay_credit_installment(uuid, uuid) from public, anon, authenticated;
grant execute on function public.pay_credit_installment(uuid, uuid) to service_role;

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
  is_leadership boolean;
  is_authority_or_status_effect boolean;
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

  if new.decision_status = 'decided'::public.discipline_status
     and not is_reward and new.investigation_id is null then
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

  is_leadership := target_roles && array['president','vice_president']::public.app_role[];
  is_authority_or_status_effect := coalesce(new.sanction_effect, 'none') in (
    'remove_roles',
    'suspend_member',
    'party_suspension',
    'passive_member'
  );

  if is_leadership and is_authority_or_status_effect then
    raise exception 'Baskan ve baskan yardimcisina yetki alma veya uyelik durumu yaptirimi uygulanamaz; puan veya para cezasi girilebilir.';
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
  before insert or update of member_id, decision_status, decree_text, point_delta, sanction_effect, investigation_id, credit_fine_amount
  on public.discipline_records
  for each row execute function private.enforce_discipline_record_hierarchy();

grant execute on function private.enforce_discipline_record_hierarchy() to authenticated, service_role;
