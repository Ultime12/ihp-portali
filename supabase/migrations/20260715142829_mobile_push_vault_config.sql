create or replace function public.mobile_push_public_key()
returns text
language sql
stable
security definer
set search_path = vault, pg_catalog
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'push_vapid_public_key'
  order by created_at desc
  limit 1;
$$;

revoke all on function public.mobile_push_public_key() from public, anon, authenticated;
grant execute on function public.mobile_push_public_key() to anon, authenticated, service_role;

create or replace function public.mobile_push_server_config()
returns table (
  vapid_public_key text,
  vapid_private_key text,
  webhook_secret text
)
language sql
stable
security definer
set search_path = vault, pg_catalog
as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'push_vapid_public_key' order by created_at desc limit 1),
    (select decrypted_secret from vault.decrypted_secrets where name = 'push_vapid_private_key' order by created_at desc limit 1),
    (select decrypted_secret from vault.decrypted_secrets where name = 'push_webhook_secret' order by created_at desc limit 1);
$$;

revoke all on function public.mobile_push_server_config() from public, anon, authenticated;
grant execute on function public.mobile_push_server_config() to service_role;
