create extension if not exists pg_cron;

create or replace function private.run_credit_schedules()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.process_credit_schedules();
end;
$$;

revoke all on function private.run_credit_schedules() from public, anon, authenticated;

do $$
declare
  v_job_id bigint;
begin
  select jobid
  into v_job_id
  from cron.job
  where jobname = 'ihp-credit-schedules'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$$;

select cron.schedule(
  'ihp-credit-schedules',
  '* * * * *',
  'select private.run_credit_schedules();'
);
