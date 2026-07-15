create schema if not exists private;
create extension if not exists pg_net;

alter table public.profiles
  add column if not exists push_notifications_enabled boolean not null default false;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  app_scope text not null default 'main',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_length check (char_length(endpoint) between 20 and 2000),
  constraint push_subscriptions_p256dh_length check (char_length(p256dh) between 40 and 300),
  constraint push_subscriptions_auth_length check (char_length(auth) between 8 and 200),
  constraint push_subscriptions_app_scope check (app_scope in ('main', 'dk', 'finance', 'mail'))
);

create index if not exists push_subscriptions_profile_id_idx
  on public.push_subscriptions(profile_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions to service_role;

create table if not exists public.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  status text not null default 'pending',
  error_message text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  constraint push_deliveries_status check (status in ('pending', 'sent', 'failed')),
  constraint push_deliveries_error_length check (error_message is null or char_length(error_message) <= 500),
  constraint push_deliveries_notification_subscription_unique unique (notification_id, subscription_id)
);

create index if not exists push_deliveries_notification_id_idx
  on public.push_deliveries(notification_id);

create index if not exists push_deliveries_subscription_id_idx
  on public.push_deliveries(subscription_id);

alter table public.push_deliveries enable row level security;
revoke all on public.push_deliveries from anon, authenticated;
grant select, insert, update, delete on public.push_deliveries to service_role;

create or replace function private.mobile_push_webhook_secret()
returns text
language sql
security definer
set search_path = vault, public
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'push_webhook_secret'
  order by created_at desc
  limit 1;
$$;

revoke all on function private.mobile_push_webhook_secret() from public, anon, authenticated;

create or replace function private.notify_mobile_push_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public, private, vault, net
as $$
declare
  webhook_secret text;
  push_enabled boolean;
begin
  select p.push_notifications_enabled
    into push_enabled
  from public.profiles p
  where p.id = new.recipient_id
  limit 1;

  if push_enabled is not true then
    return new;
  end if;

  if not exists (
    select 1
    from public.push_subscriptions s
    where s.profile_id = new.recipient_id
  ) then
    return new;
  end if;

  webhook_secret := private.mobile_push_webhook_secret();
  if webhook_secret is null or char_length(webhook_secret) < 32 then
    return new;
  end if;

  perform net.http_post(
    url := 'https://ihp.org.tr/api/push?delivery=1',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || webhook_secret,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('notification_id', new.id),
    timeout_milliseconds := 5000
  );

  return new;
exception
  when others then
    return new;
end;
$$;

revoke all on function private.notify_mobile_push_after_insert() from public, anon, authenticated;

drop trigger if exists notify_mobile_push_after_insert on public.notifications;
create trigger notify_mobile_push_after_insert
after insert on public.notifications
for each row
execute function private.notify_mobile_push_after_insert();
