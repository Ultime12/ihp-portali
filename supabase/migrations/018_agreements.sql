create table if not exists public.agreements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  proposer_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null default 'member',
  target_profile_id uuid references public.profiles(id) on delete set null,
  target_committee_id uuid references public.committees(id) on delete set null,
  file_name text not null default '',
  file_mime text not null default '',
  file_data text not null default '',
  status text not null default 'pending',
  signed_by uuid references public.profiles(id) on delete set null,
  signed_at timestamptz,
  rejected_by uuid references public.profiles(id) on delete set null,
  rejected_at timestamptz,
  decision_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.agreements
  drop constraint if exists agreements_target_type_allowed,
  drop constraint if exists agreements_status_allowed,
  drop constraint if exists agreements_title_length,
  drop constraint if exists agreements_body_or_file_required;

alter table public.agreements
  add constraint agreements_target_type_allowed
  check (target_type in ('member', 'discipline', 'youth')),
  add constraint agreements_status_allowed
  check (status in ('pending', 'signed', 'rejected', 'cancelled')),
  add constraint agreements_title_length
  check (char_length(title) between 3 and 160),
  add constraint agreements_body_or_file_required
  check (char_length(btrim(body)) > 0 or char_length(file_data) > 0);

alter table public.agreements enable row level security;

drop trigger if exists agreements_updated_at on public.agreements;
create trigger agreements_updated_at
  before update on public.agreements
  for each row execute procedure public.set_updated_at();

create index if not exists agreements_proposer_id_idx
  on public.agreements(proposer_id);
create index if not exists agreements_target_profile_id_idx
  on public.agreements(target_profile_id);
create index if not exists agreements_target_committee_id_idx
  on public.agreements(target_committee_id);
create index if not exists agreements_status_created_at_idx
  on public.agreements(status, created_at desc);

create or replace function private.agreement_committee_id(target_name text)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select id
  from public.committees
  where name = target_name
  limit 1;
$$;

create or replace function private.can_sign_agreement(
  agreement_target_type text,
  agreement_target_profile_id uuid,
  agreement_target_committee_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'auth'
as $$
declare
  committee_name text;
begin
  if private.has_any_role(array['super_admin']::public.app_role[]) then
    return true;
  end if;

  if agreement_target_type = 'member' then
    return agreement_target_profile_id = auth.uid();
  end if;

  select name into committee_name
  from public.committees
  where id = agreement_target_committee_id
  limit 1;

  if agreement_target_type = 'discipline' or committee_name = 'Disiplin Kurulu' then
    return private.has_any_role(array['discipline_chair']::public.app_role[]);
  end if;

  if agreement_target_type = 'youth' or committee_name = 'Gençlik Kolları' then
    return private.has_any_role(array['youth_chair']::public.app_role[]);
  end if;

  return false;
end;
$$;

create or replace function private.prepare_agreement_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
begin
  new.proposer_id := coalesce(new.proposer_id, auth.uid());
  new.status := 'pending';
  new.body := coalesce(new.body, '');
  new.file_name := coalesce(new.file_name, '');
  new.file_mime := coalesce(new.file_mime, '');
  new.file_data := coalesce(new.file_data, '');
  new.decision_note := '';
  new.signed_by := null;
  new.signed_at := null;
  new.rejected_by := null;
  new.rejected_at := null;

  if new.proposer_id is distinct from auth.uid() then
    raise exception 'Antlaşmayı yalnızca kendi adınıza sunabilirsiniz.';
  end if;

  if new.target_type = 'member' then
    if new.target_profile_id is null then
      raise exception 'Antlaşma sunulacak üye seçilmelidir.';
    end if;
    if new.target_profile_id = new.proposer_id then
      raise exception 'Kişi kendisine antlaşma sunamaz.';
    end if;
    new.target_committee_id := null;
  elsif new.target_type = 'discipline' then
    new.target_profile_id := null;
    new.target_committee_id := coalesce(new.target_committee_id, private.agreement_committee_id('Disiplin Kurulu'));
  elsif new.target_type = 'youth' then
    new.target_profile_id := null;
    new.target_committee_id := coalesce(new.target_committee_id, private.agreement_committee_id('Gençlik Kolları'));
  else
    raise exception 'Antlaşma hedefi geçersiz.';
  end if;

  if new.target_type in ('discipline', 'youth') and new.target_committee_id is null then
    raise exception 'Hedef kurul bulunamadı.';
  end if;

  return new;
end;
$$;

create or replace function private.enforce_agreement_update()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.title is distinct from old.title
     or new.body is distinct from old.body
     or new.proposer_id is distinct from old.proposer_id
     or new.target_type is distinct from old.target_type
     or new.target_profile_id is distinct from old.target_profile_id
     or new.target_committee_id is distinct from old.target_committee_id
     or new.file_name is distinct from old.file_name
     or new.file_mime is distinct from old.file_mime
     or new.file_data is distinct from old.file_data then
    raise exception 'İmzaya sunulan antlaşma metni veya hedefi değiştirilemez.';
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  if old.status <> 'pending' then
    raise exception 'Sonuçlanmış antlaşma tekrar değiştirilemez.';
  end if;

  if new.status = 'signed' then
    if not private.can_sign_agreement(old.target_type, old.target_profile_id, old.target_committee_id) then
      raise exception 'Bu antlaşmayı imzalama yetkiniz yok.';
    end if;
    new.signed_by := auth.uid();
    new.signed_at := now();
    new.rejected_by := null;
    new.rejected_at := null;
  elsif new.status = 'rejected' then
    if not private.can_sign_agreement(old.target_type, old.target_profile_id, old.target_committee_id) then
      raise exception 'Bu antlaşmayı reddetme yetkiniz yok.';
    end if;
    new.rejected_by := auth.uid();
    new.rejected_at := now();
    new.signed_by := null;
    new.signed_at := null;
  elsif new.status = 'cancelled' then
    if old.proposer_id <> auth.uid()
       and not private.has_any_role(array['super_admin']::public.app_role[]) then
      raise exception 'Antlaşmayı yalnızca sunan kişi veya super admin iptal edebilir.';
    end if;
    new.signed_by := null;
    new.signed_at := null;
    new.rejected_by := null;
    new.rejected_at := null;
  else
    raise exception 'Antlaşma durumu geçersiz.';
  end if;

  new.decision_note := coalesce(new.decision_note, '');
  return new;
end;
$$;

drop trigger if exists prepare_agreement_before_insert on public.agreements;
create trigger prepare_agreement_before_insert
  before insert on public.agreements
  for each row execute function private.prepare_agreement_insert();

drop trigger if exists enforce_agreement_before_update on public.agreements;
create trigger enforce_agreement_before_update
  before update on public.agreements
  for each row execute function private.enforce_agreement_update();

create or replace function private.notify_agreement_created()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  target_title text;
  signer_roles public.app_role[];
begin
  if new.target_type = 'member' then
    perform private.notify_user(
      new.target_profile_id,
      'Yeni antlaşma imza bekliyor',
      new.title,
      'agreement',
      '#/portal/agreements',
      new.proposer_id
    );
    return new;
  end if;

  if new.target_type = 'discipline' then
    target_title := 'Disiplin Kurulu';
    signer_roles := array['discipline_chair']::public.app_role[];
  elsif new.target_type = 'youth' then
    target_title := 'Gençlik Kolları';
    signer_roles := array['youth_chair']::public.app_role[];
  else
    return new;
  end if;

  insert into public.notifications(recipient_id, actor_id, title, body, category, link)
  select
    p.id,
    new.proposer_id,
    target_title || ' için yeni antlaşma',
    left(coalesce(new.title, 'Antlaşma'), 220),
    'agreement',
    '#/portal/agreements'
  from public.profiles p
  where p.status = 'active'
    and p.id <> new.proposer_id
    and coalesce(p.roles, array[p.role]) && signer_roles;

  return new;
end;
$$;

create or replace function private.notify_agreement_decision()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  actor_id uuid;
  decision_title text;
  decision_body text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  actor_id := coalesce(new.signed_by, new.rejected_by, auth.uid());
  decision_title := case
    when new.status = 'signed' then 'Antlaşma imzalandı'
    when new.status = 'rejected' then 'Antlaşma reddedildi'
    when new.status = 'cancelled' then 'Antlaşma iptal edildi'
    else 'Antlaşma güncellendi'
  end;
  decision_body := new.title || case
    when coalesce(new.decision_note, '') <> '' then ' - ' || new.decision_note
    else ''
  end;

  perform private.notify_user(
    new.proposer_id,
    decision_title,
    decision_body,
    'agreement',
    '#/portal/agreements',
    actor_id
  );

  if new.target_type = 'member' and new.target_profile_id is not null and new.target_profile_id <> new.proposer_id then
    perform private.notify_user(
      new.target_profile_id,
      decision_title,
      decision_body,
      'agreement',
      '#/portal/agreements',
      actor_id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists notify_agreement_created_after_insert on public.agreements;
create trigger notify_agreement_created_after_insert
  after insert on public.agreements
  for each row execute function private.notify_agreement_created();

drop trigger if exists notify_agreement_decision_after_update on public.agreements;
create trigger notify_agreement_decision_after_update
  after update of status, decision_note on public.agreements
  for each row execute function private.notify_agreement_decision();

drop trigger if exists audit_agreements on public.agreements;
create trigger audit_agreements
  after insert or update on public.agreements
  for each row execute procedure private.write_audit_log();

drop policy if exists agreements_select_authorized on public.agreements;
drop policy if exists agreements_insert_own on public.agreements;
drop policy if exists agreements_update_authorized on public.agreements;
drop policy if exists agreements_delete_authorized on public.agreements;

create policy agreements_select_authorized
  on public.agreements
  for select
  to authenticated
  using (
    proposer_id = (select auth.uid())
    or target_profile_id = (select auth.uid())
    or signed_by = (select auth.uid())
    or rejected_by = (select auth.uid())
    or private.can_sign_agreement(target_type, target_profile_id, target_committee_id)
  );

create policy agreements_insert_own
  on public.agreements
  for insert
  to authenticated
  with check (
    proposer_id = (select auth.uid())
    and status = 'pending'
  );

create policy agreements_update_authorized
  on public.agreements
  for update
  to authenticated
  using (
    private.can_sign_agreement(target_type, target_profile_id, target_committee_id)
    or proposer_id = (select auth.uid())
  )
  with check (
    private.can_sign_agreement(target_type, target_profile_id, target_committee_id)
    or proposer_id = (select auth.uid())
  );

create policy agreements_delete_authorized
  on public.agreements
  for delete
  to authenticated
  using (
    private.has_any_role(array['super_admin']::public.app_role[])
    or (proposer_id = (select auth.uid()) and status in ('pending', 'cancelled'))
  );

grant select, insert, update, delete on public.agreements to authenticated;
grant all on public.agreements to service_role;
grant execute on function private.can_sign_agreement(text, uuid, uuid) to authenticated, service_role;
