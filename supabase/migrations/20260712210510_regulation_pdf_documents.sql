alter table public.regulations
  add column if not exists pdf_path text,
  add column if not exists pdf_file_name text,
  add column if not exists pdf_byte_size integer,
  add column if not exists pdf_uploaded_at timestamptz,
  add column if not exists pdf_uploaded_by uuid references public.profiles(id) on delete set null;

alter table public.regulations
  drop constraint if exists regulations_pdf_metadata_check;

alter table public.regulations
  add constraint regulations_pdf_metadata_check check (
    (pdf_path is null and pdf_file_name is null and pdf_byte_size is null)
    or (
      pdf_path is not null
      and pdf_file_name is not null
      and lower(pdf_file_name) like '%.pdf'
      and pdf_byte_size between 1 and 26214400
    )
  );

create index if not exists regulations_pdf_uploaded_by_idx
  on public.regulations (pdf_uploaded_by)
  where pdf_uploaded_by is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('regulation-documents', 'regulation-documents', false, 26214400, array['application/pdf'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists regulation_documents_select_members on storage.objects;
create policy regulation_documents_select_members
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'regulation-documents'
    and (
      private.has_any_role(array['super_admin']::public.app_role[])
      or exists (
        select 1
        from public.profiles profile
        where profile.id = (select auth.uid())
          and profile.status <> 'left'
          and profile.is_system_account = false
      )
    )
  );

drop policy if exists regulation_documents_insert_admin on storage.objects;
create policy regulation_documents_insert_admin
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'regulation-documents'
    and private.has_any_role(array['super_admin']::public.app_role[])
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists regulation_documents_delete_admin on storage.objects;
create policy regulation_documents_delete_admin
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'regulation-documents'
    and private.has_any_role(array['super_admin']::public.app_role[])
  );

comment on column public.regulations.pdf_path is
  'Private Supabase Storage path for the published PDF rendering of this regulation.';
