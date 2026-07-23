create or replace function private.can_access_unassigned_investigation_as_opener(
  p_investigation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.investigations i
      where i.id = p_investigation_id
        and i.opened_by = auth.uid()
        and i.assigned_to is null
    );
$$;

revoke all on function private.can_access_unassigned_investigation_as_opener(uuid)
  from public, anon;
grant execute on function private.can_access_unassigned_investigation_as_opener(uuid)
  to authenticated, service_role;

create or replace function private.can_access_case_attachment(
  p_complaint_id uuid,
  p_investigation_id uuid,
  p_discipline_record_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_access_20260719_discipline_case(
    p_complaint_id,
    p_investigation_id,
    p_discipline_record_id
  )
  or (
    p_investigation_id is not null
    and private.can_access_unassigned_investigation_as_opener(p_investigation_id)
  );
$$;

revoke all on function private.can_access_case_attachment(uuid, uuid, uuid)
  from public, anon;
grant execute on function private.can_access_case_attachment(uuid, uuid, uuid)
  to authenticated, service_role;

drop policy if exists investigations_select_authorized on public.investigations;
create policy investigations_select_authorized
  on public.investigations
  for select
  to authenticated
  using (
    private.can_access_20260719_discipline_case(null, id, null)
    or private.can_access_unassigned_investigation_as_opener(id)
  );

notify pgrst, 'reload schema';
