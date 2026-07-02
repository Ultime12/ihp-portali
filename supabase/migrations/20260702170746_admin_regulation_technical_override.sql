drop policy if exists regulations_insert_super_admin on public.regulations;
create policy regulations_insert_super_admin
  on public.regulations
  for insert
  to authenticated
  with check (private.has_any_role(array['super_admin']::public.app_role[]));

drop policy if exists regulations_update_super_admin on public.regulations;
create policy regulations_update_super_admin
  on public.regulations
  for update
  to authenticated
  using (private.has_any_role(array['super_admin']::public.app_role[]))
  with check (private.has_any_role(array['super_admin']::public.app_role[]));

drop policy if exists regulations_delete_super_admin on public.regulations;
create policy regulations_delete_super_admin
  on public.regulations
  for delete
  to authenticated
  using (private.has_any_role(array['super_admin']::public.app_role[]));

grant insert, update, delete on public.regulations to authenticated;
