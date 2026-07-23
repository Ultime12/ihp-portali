begin;

create or replace function private.calculate_weekly_role_allowance(
  p_roles public.app_role[],
  p_primary_role public.app_role,
  p_role_allowances jsonb
)
returns bigint
language sql
immutable
security invoker
set search_path = ''
as $$
  with normalized_roles as (
    select distinct role_name
    from unnest(
      case
        when p_roles is null or cardinality(p_roles) = 0 then array[p_primary_role]
        when p_primary_role is null or p_primary_role = any(p_roles) then p_roles
        else p_roles || p_primary_role
      end
    ) as role_rows(role_name)
    where role_name is not null
  ), paid_roles as (
    select
      role_name,
      greatest(0, coalesce((p_role_allowances ->> role_name::text)::bigint, 0)) as amount
    from normalized_roles
  ), eligible_roles as (
    select role_name, amount
    from paid_roles
    where amount > 0
      and (
        role_name <> 'member'::public.app_role
        or not exists (
          select 1
          from paid_roles other_role
          where other_role.role_name <> 'member'::public.app_role
            and other_role.amount > 0
        )
      )
  ), ranked_roles as (
    select
      role_name,
      amount,
      row_number() over (order by amount desc, role_name::text) as salary_rank
    from eligible_roles
  )
  select coalesce(sum(
    case
      when salary_rank = 1 then amount
      else (round((amount::numeric * 0.30) / 10000) * 10000)::bigint
    end
  ), 0)::bigint
  from ranked_roles;
$$;

revoke all on function private.calculate_weekly_role_allowance(public.app_role[], public.app_role, jsonb)
  from public, anon, authenticated;
grant execute on function private.calculate_weekly_role_allowance(public.app_role[], public.app_role, jsonb)
  to service_role;

do $migration$
declare
  schedule_definition text;
  old_allowance_calculation text := $old$
        select coalesce(max(coalesce((v_settings.role_allowances ->> role_name::text)::bigint, 0)), 0)
        into v_allowance
        from unnest(coalesce(v_account.roles, array[v_account.role])) as roles(role_name)
        where (v_settings.role_allowances ->> role_name::text) is not null;
$old$;
  new_allowance_calculation text := $new$
        select private.calculate_weekly_role_allowance(
          v_account.roles,
          v_account.role,
          v_settings.role_allowances
        ) into v_allowance;
$new$;
begin
  select pg_get_functiondef('public.process_credit_schedules()'::regprocedure)
  into schedule_definition;

  if position(new_allowance_calculation in schedule_definition) > 0 then
    return;
  end if;
  if position(old_allowance_calculation in schedule_definition) = 0 then
    raise exception 'Haftalik rutbe odemesi hesaplama blogu bulunamadi.';
  end if;

  execute replace(schedule_definition, old_allowance_calculation, new_allowance_calculation);
end;
$migration$;

commit;
