create policy game_credit_requests_deny_client_access
  on public.game_credit_requests
  for all
  to anon, authenticated
  using (false)
  with check (false);
