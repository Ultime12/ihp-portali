drop policy if exists profile_committees_insert_managers on public.profile_committees;
drop policy if exists profile_committees_update_managers on public.profile_committees;
drop policy if exists profile_committees_delete_managers on public.profile_committees;

create policy profile_committees_insert_full_managers
  on public.profile_committees
  for insert
  to authenticated
  with check (private.has_any_role(array['super_admin','president']::public.app_role[]));

create policy profile_committees_update_full_managers
  on public.profile_committees
  for update
  to authenticated
  using (private.has_any_role(array['super_admin','president']::public.app_role[]))
  with check (private.has_any_role(array['super_admin','president']::public.app_role[]));

create policy profile_committees_delete_full_managers
  on public.profile_committees
  for delete
  to authenticated
  using (private.has_any_role(array['super_admin','president']::public.app_role[]));
