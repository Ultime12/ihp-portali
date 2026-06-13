drop policy if exists profiles_select_authenticated on public.profiles;

create policy profiles_select_authenticated
  on public.profiles
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or coalesce(is_system_account, false) = false
  );
