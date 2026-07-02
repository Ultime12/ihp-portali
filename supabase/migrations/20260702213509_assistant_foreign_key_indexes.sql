create index if not exists assistant_settings_updated_by_idx
  on public.assistant_settings(updated_by);

create index if not exists assistant_subscriptions_account_id_idx
  on public.assistant_subscriptions(account_id);

create index if not exists assistant_requests_account_id_idx
  on public.assistant_requests(account_id);
