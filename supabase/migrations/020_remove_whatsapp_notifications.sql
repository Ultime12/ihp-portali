drop trigger if exists notify_whatsapp_after_insert on public.notifications;
drop function if exists private.notify_whatsapp_after_insert();
drop function if exists private.integration_secret(text);
drop function if exists private.integration_setting(text);
drop table if exists private.integration_settings;

alter table public.profiles
  drop constraint if exists profiles_whatsapp_phone_format,
  drop column if exists whatsapp_phone,
  drop column if exists whatsapp_notifications_enabled;
