alter table public.profiles
  add column if not exists portal_email text;

set local app.bypass_profile_protection = 'on';

create or replace function private.next_portal_email(
  p_profile_id uuid,
  p_login_email text,
  p_member_code text
)
returns text
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_local text;
  v_candidate text;
  v_suffix text;
begin
  v_local := lower(split_part(coalesce(p_login_email, ''), '@', 1));
  v_local := regexp_replace(v_local, '[^a-z0-9._-]+', '-', 'g');
  v_local := regexp_replace(v_local, '^[._-]+|[._-]+$', '', 'g');

  if char_length(v_local) < 2 then
    v_local := 'uye-' || coalesce(nullif(p_member_code, ''), left(replace(p_profile_id::text, '-', ''), 8));
  end if;

  v_local := left(v_local, 48);
  v_candidate := v_local || '@ihp.org.tr';

  if exists (
    select 1
    from public.profiles p
    where lower(p.portal_email) = lower(v_candidate)
      and p.id is distinct from p_profile_id
  ) then
    v_suffix := coalesce(nullif(p_member_code, ''), right(replace(p_profile_id::text, '-', ''), 8));
    v_candidate := left(v_local, 48 - char_length(v_suffix) - 1) || '-' || v_suffix || '@ihp.org.tr';
  end if;

  return lower(v_candidate);
end;
$$;

create or replace function private.assign_portal_email()
returns trigger
language plpgsql
security invoker
set search_path to 'public', 'auth'
as $$
begin
  if tg_op = 'UPDATE'
     and auth.uid() = old.id
     and new.portal_email is distinct from old.portal_email then
    new.portal_email := old.portal_email;
  end if;

  if coalesce(new.is_system_account, false) or new.status::text = 'left' then
    new.portal_email := null;
    return new;
  end if;

  if new.portal_email is null
     or lower(new.portal_email) !~ '^[a-z0-9][a-z0-9._-]{0,62}@ihp[.]org[.]tr$' then
    new.portal_email := private.next_portal_email(new.id, new.email, new.member_code);
  else
    new.portal_email := lower(btrim(new.portal_email));
  end if;

  return new;
end;
$$;

drop trigger if exists assign_portal_email_before_write on public.profiles;
create trigger assign_portal_email_before_write
  before insert or update of email, status, is_system_account, member_code, portal_email
  on public.profiles
  for each row
  execute function private.assign_portal_email();

update public.profiles
set portal_email = null
where coalesce(is_system_account, false)
   or status::text = 'left';

update public.profiles
set portal_email = private.next_portal_email(id, email, member_code)
where not coalesce(is_system_account, false)
  and status::text <> 'left'
  and portal_email is null;

create unique index if not exists profiles_portal_email_unique_idx
  on public.profiles (lower(portal_email))
  where portal_email is not null;

alter table public.profiles
  drop constraint if exists profiles_portal_email_format;

alter table public.profiles
  add constraint profiles_portal_email_format
  check (
    portal_email is null
    or lower(portal_email) ~ '^[a-z0-9][a-z0-9._-]{0,62}@ihp[.]org[.]tr$'
  );

create table if not exists public.mail_settings (
  id text primary key default 'main',
  domain text not null default 'ihp.org.tr',
  external_sending_enabled boolean not null default true,
  member_daily_external_limit smallint not null default 5,
  global_daily_external_limit smallint not null default 90,
  max_subject_chars smallint not null default 160,
  max_body_chars integer not null default 10000,
  updated_at timestamptz not null default now(),
  constraint mail_settings_singleton check (id = 'main'),
  constraint mail_settings_domain check (domain = 'ihp.org.tr'),
  constraint mail_settings_member_limit check (member_daily_external_limit between 0 and 25),
  constraint mail_settings_global_limit check (global_daily_external_limit between 0 and 100),
  constraint mail_settings_subject_limit check (max_subject_chars between 40 and 200),
  constraint mail_settings_body_limit check (max_body_chars between 1000 and 20000)
);

insert into public.mail_settings (id)
values ('main')
on conflict (id) do nothing;

create table if not exists public.mail_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null default gen_random_uuid(),
  sender_profile_id uuid references public.profiles(id) on delete set null,
  recipient_profile_id uuid references public.profiles(id) on delete set null,
  sender_address text not null,
  recipient_address text not null,
  subject text not null,
  body_text text not null,
  direction text not null,
  delivery_status text not null default 'received',
  resend_email_id text,
  external_message_id text,
  webhook_id text,
  attachment_count smallint not null default 0,
  read_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint mail_messages_subject_length check (char_length(subject) between 1 and 200),
  constraint mail_messages_body_length check (char_length(body_text) between 1 and 20000),
  constraint mail_messages_direction check (direction in ('internal', 'inbound', 'external_outbound')),
  constraint mail_messages_delivery_status check (delivery_status in ('queued', 'sent', 'delivered', 'received', 'failed', 'bounced')),
  constraint mail_messages_attachment_count check (attachment_count between 0 and 25),
  constraint mail_messages_participants check (
    (direction = 'internal' and sender_profile_id is not null and recipient_profile_id is not null)
    or (direction = 'inbound' and recipient_profile_id is not null)
    or (direction = 'external_outbound' and sender_profile_id is not null)
  )
);

create index if not exists mail_messages_recipient_created_idx
  on public.mail_messages (recipient_profile_id, created_at desc);

create index if not exists mail_messages_sender_created_idx
  on public.mail_messages (sender_profile_id, created_at desc);

create index if not exists mail_messages_external_daily_idx
  on public.mail_messages (direction, created_at desc)
  where direction = 'external_outbound';

create unique index if not exists mail_messages_webhook_recipient_unique_idx
  on public.mail_messages (webhook_id, recipient_profile_id)
  where webhook_id is not null;

alter table public.mail_settings enable row level security;
alter table public.mail_messages enable row level security;

drop policy if exists mail_messages_select_participant on public.mail_messages;
create policy mail_messages_select_participant
  on public.mail_messages
  for select
  to authenticated
  using (
    sender_profile_id = (select auth.uid())
    or recipient_profile_id = (select auth.uid())
  );

revoke all on public.mail_settings from anon, authenticated;
revoke all on public.mail_messages from anon, authenticated;
grant all on public.mail_settings to service_role;
grant all on public.mail_messages to service_role;
grant select on public.mail_messages to authenticated;

comment on column public.profiles.portal_email is
  'Portal icinde kullanilan kurumsal IHP posta adresi; giris e-postasindan bagimsizdir.';

comment on table public.mail_messages is
  'Portal ici, disaridan gelen ve Resend ile disari giden uye postalarini saklar.';
