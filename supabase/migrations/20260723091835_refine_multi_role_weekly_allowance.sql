begin;

create or replace function private.calculate_weekly_role_allowance(
  p_roles public.app_role[],
  p_primary_role public.app_role,
  p_role_allowances jsonb,
  p_additional_role_allowance_basis_points integer
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
  ), hierarchy_filtered_roles as (
    select role_name
    from normalized_roles current_role
    where not (
      current_role.role_name = 'discipline_member'::public.app_role
      and exists (
        select 1 from normalized_roles higher_role
        where higher_role.role_name in (
          'discipline_chair'::public.app_role,
          'discipline_vice_chair'::public.app_role
        )
      )
    )
    and not (
      current_role.role_name = 'discipline_vice_chair'::public.app_role
      and exists (
        select 1 from normalized_roles higher_role
        where higher_role.role_name = 'discipline_chair'::public.app_role
      )
    )
    and not (
      current_role.role_name = 'youth_member'::public.app_role
      and exists (
        select 1 from normalized_roles higher_role
        where higher_role.role_name = 'youth_chair'::public.app_role
      )
    )
  ), paid_roles as (
    select
      role_name,
      greatest(0, coalesce((p_role_allowances ->> role_name::text)::bigint, 0)) as amount
    from hierarchy_filtered_roles
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
  ), settings as (
    select least(10000, greatest(0, coalesce(p_additional_role_allowance_basis_points, 3000)))::numeric as additional_basis_points
  )
  select coalesce(sum(
    case
      when salary_rank = 1 then amount
      when role_name in (
        'chief_representative'::public.app_role,
        'representative'::public.app_role
      ) then round((amount::numeric * settings.additional_basis_points) / 10000)::bigint
      else (
        round(((amount::numeric * settings.additional_basis_points) / 10000) / 10000) * 10000
      )::bigint
    end
  ), 0)::bigint
  from ranked_roles
  cross join settings;
$$;

comment on function private.calculate_weekly_role_allowance(public.app_role[], public.app_role, jsonb, integer) is
  'Pays the highest independent role in full, applies the configured rate to other roles, and removes subordinate DK/youth duplicates.';

revoke all on function private.calculate_weekly_role_allowance(public.app_role[], public.app_role, jsonb, integer)
  from public, anon, authenticated;
grant execute on function private.calculate_weekly_role_allowance(public.app_role[], public.app_role, jsonb, integer)
  to service_role;

commit;
