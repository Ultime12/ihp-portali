alter table public.mail_settings
  add column if not exists max_attachments smallint not null default 10,
  add column if not exists max_attachment_bytes integer not null default 15728640,
  add column if not exists max_message_attachment_bytes integer not null default 26214400;

alter table public.mail_settings
  drop constraint if exists mail_settings_body_limit,
  drop constraint if exists mail_settings_max_attachments_check,
  drop constraint if exists mail_settings_max_attachment_bytes_check,
  drop constraint if exists mail_settings_max_message_attachment_bytes_check;

alter table public.mail_settings
  add constraint mail_settings_body_limit
    check (max_body_chars between 1000 and 60000),
  add constraint mail_settings_max_attachments_check
    check (max_attachments between 0 and 10),
  add constraint mail_settings_max_attachment_bytes_check
    check (max_attachment_bytes between 1048576 and 20971520),
  add constraint mail_settings_max_message_attachment_bytes_check
    check (max_message_attachment_bytes between 1048576 and 31457280);

update public.mail_settings
set member_daily_external_limit = 10,
    max_body_chars = greatest(max_body_chars, 60000),
    max_attachments = 10,
    max_attachment_bytes = 15728640,
    max_message_attachment_bytes = 26214400,
    updated_at = now()
where id = 'main';

alter table public.mail_messages
  add column if not exists body_html text,
  add column if not exists batch_id uuid not null default gen_random_uuid(),
  add column if not exists to_addresses text[] not null default '{}',
  add column if not exists cc_addresses text[] not null default '{}',
  add column if not exists bcc_addresses text[] not null default '{}',
  add column if not exists reply_to_message_id uuid references public.mail_messages(id) on delete set null,
  add column if not exists scheduled_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists sender_folder text not null default 'sent',
  add column if not exists recipient_folder text not null default 'inbox',
  add column if not exists sender_starred boolean not null default false,
  add column if not exists recipient_starred boolean not null default false,
  add column if not exists sender_deleted_at timestamptz,
  add column if not exists recipient_deleted_at timestamptz;

alter table public.mail_messages
  drop constraint if exists mail_messages_subject_length,
  drop constraint if exists mail_messages_body_length,
  drop constraint if exists mail_messages_delivery_status,
  drop constraint if exists mail_messages_attachment_count,
  drop constraint if exists mail_messages_sender_folder_check,
  drop constraint if exists mail_messages_recipient_folder_check,
  drop constraint if exists mail_messages_schedule_check;

alter table public.mail_messages
  add constraint mail_messages_subject_length
    check (
      (delivery_status = 'draft' and char_length(subject) between 0 and 200)
      or (delivery_status <> 'draft' and char_length(subject) between 1 and 200)
    ),
  add constraint mail_messages_body_length
    check (
      (delivery_status = 'draft' and char_length(body_text) between 0 and 60000)
      or (delivery_status <> 'draft' and char_length(body_text) between 1 and 60000)
    ),
  add constraint mail_messages_delivery_status
    check (delivery_status in ('draft', 'scheduled', 'queued', 'sent', 'delivered', 'received', 'failed', 'bounced', 'cancelled')),
  add constraint mail_messages_attachment_count
    check (attachment_count between 0 and 10),
  add constraint mail_messages_sender_folder_check
    check (sender_folder in ('draft', 'scheduled', 'sent', 'archive', 'trash')),
  add constraint mail_messages_recipient_folder_check
    check (recipient_folder in ('inbox', 'archive', 'trash', 'spam')),
  add constraint mail_messages_schedule_check
    check (
      (delivery_status = 'scheduled' and scheduled_at is not null)
      or delivery_status <> 'scheduled'
    );

update public.mail_messages
set sender_folder = case
      when delivery_status = 'draft' then 'draft'
      when delivery_status = 'scheduled' then 'scheduled'
      else 'sent'
    end,
    recipient_folder = 'inbox',
    to_addresses = case
      when cardinality(to_addresses) = 0 then array[lower(recipient_address)]
      else to_addresses
    end;

create index if not exists mail_messages_sender_folder_created_idx
  on public.mail_messages (sender_profile_id, sender_folder, created_at desc)
  where sender_deleted_at is null;

create index if not exists mail_messages_sender_batch_idx
  on public.mail_messages (sender_profile_id, batch_id, created_at desc);

create index if not exists mail_messages_recipient_folder_created_idx
  on public.mail_messages (recipient_profile_id, recipient_folder, created_at desc)
  where recipient_deleted_at is null;

create index if not exists mail_messages_scheduled_idx
  on public.mail_messages (scheduled_at)
  where delivery_status = 'scheduled' and cancelled_at is null;

create table if not exists public.mail_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.mail_messages(id) on delete cascade,
  uploader_profile_id uuid references public.profiles(id) on delete set null,
  storage_path text,
  external_attachment_id text,
  file_name text not null,
  content_type text not null default 'application/octet-stream',
  byte_size integer not null,
  content_disposition text not null default 'attachment',
  content_id text,
  source text not null default 'portal',
  created_at timestamptz not null default now(),
  constraint mail_attachments_file_name_check
    check (char_length(file_name) between 1 and 240 and file_name !~ '[\\/]'),
  constraint mail_attachments_size_check
    check (byte_size between 1 and 15728640),
  constraint mail_attachments_disposition_check
    check (content_disposition in ('attachment', 'inline')),
  constraint mail_attachments_source_check
    check (source in ('portal', 'resend')),
  constraint mail_attachments_location_check
    check (
      (source = 'portal' and storage_path is not null and external_attachment_id is null)
      or (source = 'resend' and external_attachment_id is not null and storage_path is null)
    )
);

create index if not exists mail_attachments_message_idx
  on public.mail_attachments (message_id, created_at asc);

create unique index if not exists mail_attachments_external_unique_idx
  on public.mail_attachments (message_id, external_attachment_id)
  where external_attachment_id is not null;

create table if not exists public.mail_aliases (
  address text primary key,
  label text not null,
  required_role text,
  owner_profile_id uuid references public.profiles(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mail_aliases_address_check
    check (lower(address) ~ '^[a-z0-9][a-z0-9._-]{0,62}@ihp[.]org[.]tr$'),
  constraint mail_aliases_owner_check
    check (required_role is not null or owner_profile_id is not null)
);

insert into public.mail_aliases (address, label, required_role)
values
  ('dk@ihp.org.tr', 'Disiplin Kurulu', 'discipline_chair'),
  ('baskan@ihp.org.tr', 'Başkanlık', 'president')
on conflict (address) do update
set label = excluded.label,
    required_role = excluded.required_role,
    active = true,
    updated_at = now();

alter table public.mail_attachments enable row level security;
alter table public.mail_aliases enable row level security;

drop policy if exists mail_attachments_select_participant on public.mail_attachments;
create policy mail_attachments_select_participant
  on public.mail_attachments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.mail_messages m
      where m.id = mail_attachments.message_id
        and (
          m.sender_profile_id = (select auth.uid())
          or m.recipient_profile_id = (select auth.uid())
        )
    )
  );

drop policy if exists mail_aliases_select_active on public.mail_aliases;
create policy mail_aliases_select_active
  on public.mail_aliases
  for select
  to authenticated
  using (active);

revoke all on public.mail_attachments from anon, authenticated;
revoke all on public.mail_aliases from anon, authenticated;
grant select on public.mail_attachments to authenticated;
grant select on public.mail_aliases to authenticated;
grant all on public.mail_attachments to service_role;
grant all on public.mail_aliases to service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values ('mail-attachments', 'mail-attachments', false, 15728640)
on conflict (id) do update
set public = false,
    file_size_limit = 15728640;

drop policy if exists mail_attachment_owner_insert on storage.objects;
create policy mail_attachment_owner_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'mail-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists mail_attachment_owner_select on storage.objects;
create policy mail_attachment_owner_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'mail-attachments'
    and owner_id = (select auth.uid())::text
  );

drop policy if exists mail_attachment_owner_delete on storage.objects;
create policy mail_attachment_owner_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'mail-attachments'
    and owner_id = (select auth.uid())::text
  );

comment on table public.mail_attachments is
  'Portal posta iletilerinin private Storage veya Resend kaynakli dosya ekleri.';

comment on table public.mail_aliases is
  'Rol veya profil sahipligine gore kullanilabilen kurumsal IHP gonderici adresleri.';
