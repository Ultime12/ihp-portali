create policy credit_scheduled_transfers_deny_client_access
  on public.credit_scheduled_transfers
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);
