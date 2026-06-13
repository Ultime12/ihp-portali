drop policy if exists executive_committee_members_manage_presidency on public.executive_committee_members;

create policy executive_committee_members_insert_presidency
  on public.executive_committee_members
  for insert
  to authenticated
  with check (private.has_any_role(array['super_admin', 'president']::public.app_role[]));

create policy executive_committee_members_update_presidency
  on public.executive_committee_members
  for update
  to authenticated
  using (private.has_any_role(array['super_admin', 'president']::public.app_role[]))
  with check (private.has_any_role(array['super_admin', 'president']::public.app_role[]));

create policy executive_committee_members_delete_presidency
  on public.executive_committee_members
  for delete
  to authenticated
  using (private.has_any_role(array['super_admin', 'president']::public.app_role[]));

create index if not exists executive_committee_members_added_by_idx
  on public.executive_committee_members(added_by);
