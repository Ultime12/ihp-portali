create policy credit_settings_deny_member_read
  on public.credit_settings for select to authenticated
  using (false);

create policy credit_cron_runs_deny_member_read
  on public.credit_cron_runs for select to authenticated
  using (false);

create index credit_settings_updated_by_idx
  on public.credit_settings(updated_by)
  where updated_by is not null;
