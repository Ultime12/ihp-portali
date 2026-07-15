create table if not exists public.case_attachments (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid references public.complaints(id) on delete cascade,
  investigation_id uuid references public.investigations(id) on delete cascade,
  discipline_record_id uuid references public.discipline_records(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  file_name text not null,
  object_path text not null unique,
  content_type text not null,
  size_bytes bigint not null,
  created_at timestamptz not null default now(),
  constraint case_attachments_one_parent check (
    num_nonnulls(complaint_id, investigation_id, discipline_record_id) = 1
  ),
  constraint case_attachments_file_name_length check (
    char_length(file_name) between 1 and 180
  ),
  constraint case_attachments_content_type_length check (
    char_length(content_type) between 1 and 120
  ),
  constraint case_attachments_size_limit check (
    size_bytes between 1 and 6291456
  )
);

create index if not exists case_attachments_complaint_id_idx
  on public.case_attachments(complaint_id, created_at);
create index if not exists case_attachments_investigation_id_idx
  on public.case_attachments(investigation_id, created_at);
create index if not exists case_attachments_discipline_record_id_idx
  on public.case_attachments(discipline_record_id, created_at);
create index if not exists case_attachments_uploaded_by_idx
  on public.case_attachments(uploaded_by);

create or replace function private.can_access_case_attachment(
  p_complaint_id uuid,
  p_investigation_id uuid,
  p_discipline_record_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    return false;
  end if;

  if private.has_any_role(array['super_admin']::public.app_role[]) then
    return true;
  end if;

  if p_complaint_id is not null then
    return exists (
      select 1
      from public.complaints c
      where c.id = p_complaint_id
        and (
          c.complainant_profile_id = auth.uid()
          or private.has_any_role(array[
            'discipline_chair',
            'discipline_vice_chair',
            'discipline_member'
          ]::public.app_role[])
        )
    );
  end if;

  if p_investigation_id is not null then
    return exists (
      select 1
      from public.investigations i
      where i.id = p_investigation_id
        and (
          i.subject_profile_id = auth.uid()
          or private.has_any_role(array[
            'discipline_chair',
            'discipline_vice_chair',
            'discipline_member'
          ]::public.app_role[])
        )
    );
  end if;

  if p_discipline_record_id is not null then
    return exists (
      select 1
      from public.discipline_records d
      where d.id = p_discipline_record_id
        and (
          d.member_id = auth.uid()
          or private.has_any_role(array[
            'discipline_chair',
            'discipline_vice_chair',
            'discipline_member'
          ]::public.app_role[])
        )
    );
  end if;

  return false;
end;
$$;

create or replace function private.can_add_case_attachment(
  p_complaint_id uuid,
  p_investigation_id uuid,
  p_discipline_record_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    return false;
  end if;

  if private.has_any_role(array['super_admin']::public.app_role[]) then
    return true;
  end if;

  if p_complaint_id is not null then
    return exists (
      select 1
      from public.complaints c
      where c.id = p_complaint_id
        and c.complainant_profile_id = auth.uid()
    );
  end if;

  if p_investigation_id is not null or p_discipline_record_id is not null then
    return private.has_any_role(array[
      'discipline_chair',
      'discipline_vice_chair',
      'discipline_member'
    ]::public.app_role[]);
  end if;

  return false;
end;
$$;

create or replace function private.enforce_case_attachment_limit()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  attachment_count integer;
  legacy_count integer := 0;
  parent_key text;
begin
  parent_key := coalesce(
    new.complaint_id::text,
    new.investigation_id::text,
    new.discipline_record_id::text
  );
  perform pg_advisory_xact_lock(hashtextextended(parent_key, 0));

  select count(*)
  into attachment_count
  from public.case_attachments a
  where a.complaint_id is not distinct from new.complaint_id
    and a.investigation_id is not distinct from new.investigation_id
    and a.discipline_record_id is not distinct from new.discipline_record_id;

  if new.complaint_id is not null then
    select case when btrim(coalesce(evidence_file, '')) <> '' then 1 else 0 end
    into legacy_count
    from public.complaints
    where id = new.complaint_id;
  elsif new.investigation_id is not null then
    select case when btrim(coalesce(evidence_file, '')) <> '' then 1 else 0 end
    into legacy_count
    from public.investigations
    where id = new.investigation_id;
  end if;

  if attachment_count + coalesce(legacy_count, 0) >= 10 then
    raise exception 'Bir dosyaya en fazla 10 ek yüklenebilir.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_case_attachment_limit_before_insert
  on public.case_attachments;
create trigger enforce_case_attachment_limit_before_insert
  before insert on public.case_attachments
  for each row execute function private.enforce_case_attachment_limit();

alter table public.case_attachments enable row level security;

drop policy if exists case_attachments_select_authorized
  on public.case_attachments;
create policy case_attachments_select_authorized
  on public.case_attachments
  for select
  to authenticated
  using (
    private.can_access_case_attachment(
      complaint_id,
      investigation_id,
      discipline_record_id
    )
  );

drop policy if exists case_attachments_insert_authorized
  on public.case_attachments;
create policy case_attachments_insert_authorized
  on public.case_attachments
  for insert
  to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and private.can_add_case_attachment(
      complaint_id,
      investigation_id,
      discipline_record_id
    )
  );

drop policy if exists case_attachments_delete_admin
  on public.case_attachments;
create policy case_attachments_delete_admin
  on public.case_attachments
  for delete
  to authenticated
  using (private.has_any_role(array['super_admin']::public.app_role[]));

grant select, insert, delete on public.case_attachments to authenticated;
revoke update, truncate on public.case_attachments from anon, authenticated;

revoke all on function private.can_access_case_attachment(uuid, uuid, uuid)
  from public;
revoke all on function private.can_add_case_attachment(uuid, uuid, uuid)
  from public;
revoke all on function private.enforce_case_attachment_limit()
  from public;
grant execute on function private.can_access_case_attachment(uuid, uuid, uuid)
  to authenticated, service_role;
grant execute on function private.can_add_case_attachment(uuid, uuid, uuid)
  to authenticated, service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'case-attachments',
  'case-attachments',
  false,
  6291456,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists case_attachment_objects_insert_own
  on storage.objects;
create policy case_attachment_objects_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'case-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists case_attachment_objects_select_authorized
  on storage.objects;
create policy case_attachment_objects_select_authorized
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'case-attachments'
    and exists (
      select 1
      from public.case_attachments a
      where a.object_path = name
    )
  );

drop policy if exists case_attachment_objects_delete_unlinked_own
  on storage.objects;
create policy case_attachment_objects_delete_unlinked_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'case-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (
      select 1
      from public.case_attachments a
      where a.object_path = name
    )
  );

notify pgrst, 'reload schema';
