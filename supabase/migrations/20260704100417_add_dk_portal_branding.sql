alter table public.portal_settings
  add column if not exists dk_logo_url text;

alter table public.portal_settings
  drop constraint if exists portal_settings_dk_logo_url_check;

alter table public.portal_settings
  add constraint portal_settings_dk_logo_url_check
  check (
    dk_logo_url is null
    or (
      char_length(dk_logo_url) <= 2000000
      and (
        dk_logo_url like 'data:image/%'
        or dk_logo_url like 'https://%'
      )
    )
  );

create or replace function private.protect_dk_portal_branding()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth', 'private'
as $$
begin
  if new.dk_logo_url is distinct from old.dk_logo_url
     and auth.uid() is not null
     and not private.has_any_role(array['super_admin']::public.app_role[]) then
    raise exception 'DK logosunu yalnızca Admin değiştirebilir.';
  end if;

  return new;
end;
$$;

revoke all on function private.protect_dk_portal_branding() from public, anon, authenticated;

drop trigger if exists protect_dk_portal_branding_before_update
  on public.portal_settings;

create trigger protect_dk_portal_branding_before_update
  before update of dk_logo_url on public.portal_settings
  for each row execute function private.protect_dk_portal_branding();
