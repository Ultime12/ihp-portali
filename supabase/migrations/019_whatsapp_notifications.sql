create schema if not exists private;
create extension if not exists pg_net;

alter table public.profiles
  add column if not exists whatsapp_phone text,
  add column if not exists whatsapp_notifications_enabled boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_whatsapp_phone_format'
  ) then
    alter table public.profiles
      add constraint profiles_whatsapp_phone_format
      check (whatsapp_phone is null or whatsapp_phone ~ '^[1-9][0-9]{9,14}$') not valid;
    alter table public.profiles validate constraint profiles_whatsapp_phone_format;
  end if;
end $$;

create table if not exists private.integration_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

revoke all on private.integration_settings from anon, authenticated;

insert into private.integration_settings(key, value)
values
  ('whatsapp_graph_version', 'v20.0'),
  ('whatsapp_template_name', 'portal_notification'),
  ('whatsapp_template_language', 'tr')
on conflict (key) do nothing;

create or replace function private.integration_setting(setting_key text)
returns text
language sql
security definer
set search_path = private, public
as $$
  select value from private.integration_settings where key = setting_key limit 1;
$$;

create or replace function private.integration_secret(secret_name text)
returns text
language sql
security definer
set search_path = vault, public
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = secret_name
  order by created_at desc
  limit 1;
$$;

create or replace function private.notify_whatsapp_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public, private, vault, net
as $$
declare
  recipient record;
  access_token text;
  phone_number_id text;
  graph_version text;
  template_name text;
  template_language text;
begin
  select display_name, whatsapp_phone, whatsapp_notifications_enabled
    into recipient
  from public.profiles
  where id = new.recipient_id
  limit 1;

  if recipient.whatsapp_notifications_enabled is not true or recipient.whatsapp_phone is null then
    return new;
  end if;

  access_token := private.integration_secret('whatsapp_access_token');
  phone_number_id := private.integration_setting('whatsapp_phone_number_id');
  graph_version := coalesce(private.integration_setting('whatsapp_graph_version'), 'v20.0');
  template_name := coalesce(private.integration_setting('whatsapp_template_name'), 'portal_notification');
  template_language := coalesce(private.integration_setting('whatsapp_template_language'), 'tr');

  if access_token is null or length(access_token) < 20 or phone_number_id is null or length(phone_number_id) < 5 then
    return new;
  end if;

  perform net.http_post(
    url := format('https://graph.facebook.com/%s/%s/messages', graph_version, phone_number_id),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || access_token,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'messaging_product', 'whatsapp',
      'recipient_type', 'individual',
      'to', recipient.whatsapp_phone,
      'type', 'template',
      'template', jsonb_build_object(
        'name', template_name,
        'language', jsonb_build_object('code', template_language)
      )
    ),
    timeout_milliseconds := 5000
  );

  return new;
exception
  when others then
    return new;
end;
$$;

drop trigger if exists notify_whatsapp_after_insert on public.notifications;
create trigger notify_whatsapp_after_insert
after insert on public.notifications
for each row
execute function private.notify_whatsapp_after_insert();
