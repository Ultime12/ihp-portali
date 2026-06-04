create index if not exists applications_applicant_profile_id_idx
  on public.applications(applicant_profile_id);

create index if not exists applications_decided_by_idx
  on public.applications(decided_by);

create index if not exists applications_target_committee_id_idx
  on public.applications(target_committee_id);

create index if not exists notifications_actor_id_idx
  on public.notifications(actor_id);

create index if not exists notifications_recipient_id_idx
  on public.notifications(recipient_id);

create index if not exists profile_committees_assigned_by_idx
  on public.profile_committees(assigned_by);

create index if not exists profile_committees_committee_id_idx
  on public.profile_committees(committee_id);

drop policy if exists profile_committees_write_managers on public.profile_committees;

create policy profile_committees_insert_managers
  on public.profile_committees
  for insert
  to authenticated
  with check (private.can_manage_members());

create policy profile_committees_update_managers
  on public.profile_committees
  for update
  to authenticated
  using (private.can_manage_members())
  with check (private.can_manage_members());

create policy profile_committees_delete_managers
  on public.profile_committees
  for delete
  to authenticated
  using (private.can_manage_members());
