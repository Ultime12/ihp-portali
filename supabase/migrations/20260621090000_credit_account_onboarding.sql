alter table public.credit_accounts
  add column if not exists contact_phone text,
  add column if not exists usage_purpose text,
  add column if not exists terms_version text,
  add column if not exists terms_accepted_at timestamptz;

delete from public.credit_installments
where loan_id in (select id from public.credit_loans);

delete from public.credit_loans;
delete from public.credit_cheques;
delete from public.credit_transactions;
delete from public.credit_accounts;

alter table public.credit_accounts
  alter column contact_phone set not null,
  alter column usage_purpose set not null,
  alter column terms_version set default '2026-06-v1',
  alter column terms_version set not null,
  alter column terms_accepted_at set not null;

alter table public.credit_accounts
  drop constraint if exists credit_accounts_contact_phone_check,
  drop constraint if exists credit_accounts_usage_purpose_check;

alter table public.credit_accounts
  add constraint credit_accounts_contact_phone_check
    check (contact_phone ~ '^\+?[0-9]{10,15}$'),
  add constraint credit_accounts_usage_purpose_check
    check (usage_purpose in ('general', 'transfer', 'cheque', 'saving'));

drop function if exists public.open_credit_account(uuid, text);

create or replace function public.open_credit_account(
  p_profile_id uuid,
  p_account_code text,
  p_contact_phone text,
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
  v_phone text;
begin
  if auth.role() <> 'service_role' then raise exception 'Sunucu yetkisi gerekir.'; end if;
  if p_terms_accepted is not true then raise exception 'Hesap acilis sozlesmesi kabul edilmelidir.'; end if;

  v_phone := regexp_replace(coalesce(p_contact_phone, ''), '[^0-9+]', '', 'g');
  if v_phone !~ '^\+?[0-9]{10,15}$' then raise exception 'Telefon numarasi gecersiz.'; end if;
  if p_usage_purpose not in ('general', 'transfer', 'cheque', 'saving') then
    raise exception 'Hesap kullanim amaci gecersiz.';
  end if;

  select * into v_settings from public.credit_settings where id = 'main';
  if not v_settings.member_access_enabled then raise exception 'Kredi sistemi uyelere henuz acik degil.'; end if;

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
      contact_phone = v_phone, usage_purpose = p_usage_purpose,
      terms_version = '2026-06-v1', terms_accepted_at = now(),
      opened_at = now(), closed_at = null, updated_at = now()
    where id = v_account.id
    returning * into v_account;
  else
    insert into public.credit_accounts(
      profile_id, account_code, contact_phone, usage_purpose,
      terms_version, terms_accepted_at
    ) values (
      p_profile_id, p_account_code, v_phone, p_usage_purpose,
      '2026-06-v1', now()
    ) returning * into v_account;
  end if;

  return v_account;
end;
$$;

revoke all on function public.open_credit_account(uuid, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.open_credit_account(uuid, text, text, text, boolean)
  to service_role;

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
  if p_delta is null or p_delta = 0 or abs(p_delta) > 1000000 then
    raise exception 'Bakiye degisikligi gecersiz.';
  end if;
  v_reason := btrim(coalesce(p_reason, ''));
  if char_length(v_reason) < 5 or char_length(v_reason) > 300 then
    raise exception 'Islem gerekcesi 5 ile 300 karakter arasinda olmalidir.';
  end if;

  select * into v_admin from public.profiles where id = p_admin_profile_id;
  if not found or v_admin.status <> 'active'
     or not (v_admin.role = 'super_admin' or 'super_admin' = any(v_admin.roles)) then
    raise exception 'Admin yetkisi gerekir.';
  end if;

  select * into v_account from public.credit_accounts
  where id = p_account_id and status = 'active' for update;
  if not found then raise exception 'Aktif kredi hesabi bulunamadi.'; end if;

  v_after := v_account.balance + p_delta;
  if v_after < 0 or v_after > 100000000 then
    raise exception 'Hesap bakiyesi izin verilen araligin disina cikamaz.';
  end if;

  update public.credit_accounts
  set balance = v_after, updated_at = now()
  where id = v_account.id
  returning * into v_account;

  insert into public.credit_transactions(
    account_id, kind, amount, balance_after, reference, metadata
  ) values (
    v_account.id, 'admin_adjustment', abs(p_delta), v_after,
    v_reason,
    jsonb_build_object(
      'direction', case when p_delta > 0 then 'credit' else 'debit' end,
      'admin_profile_id', p_admin_profile_id,
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

revoke all on function public.admin_adjust_credit_balance(uuid, uuid, bigint, text)
  from public, anon, authenticated;
grant execute on function public.admin_adjust_credit_balance(uuid, uuid, bigint, text)
  to service_role;
