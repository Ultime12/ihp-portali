alter table public.credit_accounts
  drop constraint if exists credit_accounts_balance_check,
  add constraint credit_accounts_balance_check
    check (balance between 0 and 9007199254740991);

alter table public.credit_transactions
  drop constraint if exists credit_transactions_balance_after_check,
  add constraint credit_transactions_balance_after_check
    check (balance_after between 0 and 9007199254740991);

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
  v_roles public.app_role[];
begin
  if auth.role() <> 'service_role' then
    raise exception 'Sunucu yetkisi gerekir.';
  end if;
  if p_delta is null or p_delta = 0
     or p_delta < -9007199254740991
     or p_delta > 9007199254740991 then
    raise exception 'Bakiye degisikligi gecersiz.';
  end if;

  v_reason := btrim(coalesce(p_reason, ''));
  if char_length(v_reason) < 5 or char_length(v_reason) > 300 then
    raise exception 'Islem gerekcesi 5 ile 300 karakter arasinda olmalidir.';
  end if;

  select * into v_admin
  from public.profiles
  where id = p_admin_profile_id;
  if not found or v_admin.status <> 'active' then
    raise exception 'Kredi yonetimi yetkisi gerekir.';
  end if;

  v_roles := coalesce(v_admin.roles, array[v_admin.role]);
  if not (v_roles && array['super_admin','credit_officer']::public.app_role[]) then
    raise exception 'Kredi yonetimi yetkisi gerekir.';
  end if;

  select * into v_account
  from public.credit_accounts
  where id = p_account_id and status = 'active'
  for update;
  if not found then
    raise exception 'Aktif kredi hesabi bulunamadi.';
  end if;

  if 'super_admin' <> all(v_roles) and v_account.profile_id = p_admin_profile_id then
    raise exception 'Kredi Isleri Sorumlusu kendi bakiyesini duzenleyemez.';
  end if;

  v_after := v_account.balance + p_delta;
  if v_after < 0 or v_after > 9007199254740991 then
    raise exception 'Hesap bakiyesi izin verilen araligin disina cikamaz.';
  end if;

  update public.credit_accounts
  set balance = v_after, updated_at = now()
  where id = v_account.id
  returning * into v_account;

  insert into public.credit_transactions(
    account_id, kind, amount, balance_after, reference, metadata
  ) values (
    v_account.id,
    'admin_adjustment',
    abs(p_delta),
    v_after,
    v_reason,
    jsonb_build_object(
      'direction', case when p_delta > 0 then 'credit' else 'debit' end,
      'manager_profile_id', p_admin_profile_id,
      'reason', v_reason
    )
  );

  insert into public.notifications(recipient_id, actor_id, title, body, category, link)
  values (
    v_account.profile_id,
    p_admin_profile_id,
    case when p_delta > 0 then 'Hesabiniza kredi eklendi' else 'Hesabinizdan kredi cekildi' end,
    abs(p_delta) || ' kredi. Gerekce: ' || v_reason || '. Yeni bakiye: ' || v_after || ' kredi.',
    'credit',
    '#/portal/credit'
  );

  return v_account;
end;
$$;

create or replace function public.close_credit_account(p_profile_id uuid)
returns public.credit_accounts
language plpgsql
security invoker
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

revoke all on function public.admin_adjust_credit_balance(uuid, uuid, bigint, text)
  from public, anon, authenticated;
revoke all on function public.close_credit_account(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_adjust_credit_balance(uuid, uuid, bigint, text)
  to service_role;
grant execute on function public.close_credit_account(uuid)
  to service_role;
