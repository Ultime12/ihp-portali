create or replace function private.can_add_case_attachment(
  p_complaint_id uuid,
  p_investigation_id uuid,
  p_discipline_record_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return false;
  end if;

  if private.has_any_role(array['super_admin', 'discipline_chair']::public.app_role[]) then
    return true;
  end if;

  if p_complaint_id is not null then
    return exists (
      select 1
      from public.complaints c
      where c.id = p_complaint_id
        and c.complainant_profile_id = v_uid
    );
  end if;

  if p_investigation_id is not null then
    return exists (
      select 1
      from public.investigations i
      where i.id = p_investigation_id
        and (
          i.assigned_to = v_uid
          or (i.opened_by = v_uid and i.assigned_to is null)
        )
    );
  end if;

  if p_discipline_record_id is not null then
    return exists (
      select 1
      from public.discipline_records d
      left join public.investigations i on i.id = d.investigation_id
      where d.id = p_discipline_record_id
        and (
          d.created_by = v_uid
          or i.assigned_to = v_uid
        )
    );
  end if;

  return false;
end;
$$;

revoke all on function private.can_add_case_attachment(uuid, uuid, uuid)
  from public, anon;
grant execute on function private.can_add_case_attachment(uuid, uuid, uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';
