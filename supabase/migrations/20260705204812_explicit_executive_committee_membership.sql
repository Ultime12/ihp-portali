create or replace function private.is_executive_member(candidate_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = candidate_id
      and profile.status = 'active'
      and coalesce(profile.is_system_account, false) = false
      and exists (
        select 1
        from public.executive_committee_members member
        where member.profile_id = profile.id
      )
  );
$$;

revoke all on function private.is_executive_member(uuid) from public;
grant execute on function private.is_executive_member(uuid) to authenticated, service_role;
