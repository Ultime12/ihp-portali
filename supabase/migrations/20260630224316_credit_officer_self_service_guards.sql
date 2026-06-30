create or replace function public.review_credit_loan(
  p_admin_profile_id uuid,
  p_loan_id uuid,
  p_decision text,
  p_note text default ''
)
returns public.credit_loans
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_admin public.profiles%rowtype;
  v_roles public.app_role[];
  v_loan public.credit_loans%rowtype;
  v_account public.credit_accounts%rowtype;
  v_piece bigint;
  v_remaining bigint;
  v_index integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Sunucu yetkisi gerekir.';
  end if;

  select * into v_admin
  from public.profiles
  where id = p_admin_profile_id and status = 'active';
  if not found then
    raise exception 'Kredi yonetimi yetkisi gerekir.';
  end if;

  v_roles := coalesce(v_admin.roles, array[v_admin.role]);
  if not (v_roles && array['super_admin','credit_officer']::public.app_role[]) then
    raise exception 'Kredi yonetimi yetkisi gerekir.';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'Karar gecersiz.';
  end if;

  select * into v_loan
  from public.credit_loans
  where id = p_loan_id
  for update;
  if not found or v_loan.status <> 'pending' then
    raise exception 'Bekleyen kredi basvurusu bulunamadi.';
  end if;

  select * into v_account
  from public.credit_accounts
  where id = v_loan.account_id
  for update;
  if not found then
    raise exception 'Kredi hesabi bulunamadi.';
  end if;
  if 'super_admin' <> all(v_roles) and v_account.profile_id = p_admin_profile_id then
    raise exception 'Kredi Isleri Sorumlusu kendi kredi basvurusunu sonuclandiramaz.';
  end if;

  update public.credit_loans
  set status = p_decision,
      decided_by = p_admin_profile_id,
      decided_at = now(),
      decision_note = left(coalesce(p_note, ''), 600),
      due_at = case
        when p_decision = 'approved' then now() + make_interval(days => v_loan.term_days)
        else null
      end
  where id = v_loan.id
  returning * into v_loan;

  if p_decision = 'approved' then
    if v_account.status <> 'active' then
      raise exception 'Kredi hesabi aktif degil.';
    end if;

    update public.credit_accounts
    set balance = balance + v_loan.principal
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
      'loan_disbursement',
      v_loan.principal,
      v_account.balance + v_loan.principal,
      'Kredi ' || v_loan.id::text,
      jsonb_build_object('total_due', v_loan.total_due)
    );

    v_piece := ceil(v_loan.total_due::numeric / v_loan.installment_count)::bigint;
    v_remaining := v_loan.total_due;
    for v_index in 1..v_loan.installment_count loop
      insert into public.credit_installments(
        loan_id,
        installment_no,
        amount,
        due_at
      ) values (
        v_loan.id,
        v_index,
        least(v_piece, v_remaining),
        now() + make_interval(
          days => ceil(v_loan.term_days::numeric * v_index / v_loan.installment_count)::integer
        )
      );
      v_remaining := v_remaining - least(v_piece, v_remaining);
    end loop;
  end if;

  return v_loan;
end;
$$;

revoke all on function public.review_credit_loan(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.review_credit_loan(uuid, uuid, text, text)
  to service_role;
