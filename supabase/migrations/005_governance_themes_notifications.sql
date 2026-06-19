alter table public.profiles
  add column if not exists theme_preference text not null default 'dark';

alter table public.profiles
  drop constraint if exists profiles_theme_preference_check;

alter table public.profiles
  add constraint profiles_theme_preference_check
  check (theme_preference in ('dark', 'light', 'blue', 'green', 'pink'));

alter table public.applications
  add column if not exists applicant_profile_id uuid references public.profiles(id) on delete cascade,
  add column if not exists target_committee_id uuid references public.committees(id) on delete set null,
  add column if not exists requested_role public.app_role default 'member'::public.app_role,
  add column if not exists decided_by uuid references public.profiles(id) on delete set null,
  add column if not exists decided_at timestamptz,
  add column if not exists decision_note text not null default '';

alter table public.applications
  alter column status set default 'new'::public.application_status,
  alter column notes set default '';

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  title text not null,
  body text not null default '',
  category text not null default 'system',
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_category_length check (char_length(category) between 2 and 40),
  constraint notifications_title_length check (char_length(title) between 2 and 140)
);

alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
drop policy if exists notifications_update_own on public.notifications;

create policy notifications_select_own
  on public.notifications
  for select
  using (recipient_id = (select auth.uid()));

create policy notifications_update_own
  on public.notifications
  for update
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

grant select, update on public.notifications to authenticated;

create or replace function private.can_manage_members()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
as $$
  select private.has_any_role(array['super_admin','president','vice_president','presidential_aide']::public.app_role[]);
$$;

create or replace function private.can_manage_admissions()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
as $$
  select private.has_any_role(array['super_admin','president','vice_president','presidential_aide','discipline_chair','youth_chair']::public.app_role[]);
$$;

create or replace function private.can_manage_announcements()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
as $$
  select private.has_any_role(array['super_admin','president','vice_president','presidential_aide']::public.app_role[]);
$$;

create or replace function private.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
begin
  if auth.role() = 'service_role' or current_setting('app.bypass_profile_protection', true) = 'on' then
    return new;
  end if;

  if private.has_any_role(array['super_admin']::public.app_role[]) then
    return new;
  end if;

  if new.id = auth.uid()
    and new.role is not distinct from old.role
    and new.roles is not distinct from old.roles
    and new.status is not distinct from old.status
    and new.committee_id is not distinct from old.committee_id
    and new.email is not distinct from old.email then
    return new;
  end if;

  if private.has_any_role(array['president']::public.app_role[])
    and not ('super_admin'::public.app_role = any(coalesce(old.roles, array[]::public.app_role[])))
    and not ('super_admin'::public.app_role = any(coalesce(new.roles, array[]::public.app_role[])))
    and old.role <> 'super_admin'::public.app_role
    and new.role <> 'super_admin'::public.app_role then
    return new;
  end if;

  if private.has_any_role(array['vice_president']::public.app_role[])
    and not ('super_admin'::public.app_role = any(coalesce(old.roles, array[]::public.app_role[])))
    and not ('president'::public.app_role = any(coalesce(old.roles, array[]::public.app_role[])))
    and not ('super_admin'::public.app_role = any(coalesce(new.roles, array[]::public.app_role[])))
    and not ('president'::public.app_role = any(coalesce(new.roles, array[]::public.app_role[])))
    and old.role not in ('super_admin'::public.app_role, 'president'::public.app_role)
    and new.role not in ('super_admin'::public.app_role, 'president'::public.app_role) then
    return new;
  end if;

  raise exception 'Bu profil alanlarini duzenleme yetkiniz yok.';
end;
$$;

create or replace function private.notify_user(
  target_profile_id uuid,
  notification_title text,
  notification_body text default '',
  notification_category text default 'system',
  notification_link text default null,
  notification_actor uuid default auth.uid()
)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
begin
  if target_profile_id is null then
    return;
  end if;

  insert into public.notifications(recipient_id, actor_id, title, body, category, link)
  values (
    target_profile_id,
    notification_actor,
    left(coalesce(notification_title, 'Bildirim'), 140),
    coalesce(notification_body, ''),
    left(coalesce(notification_category, 'system'), 40),
    notification_link
  );
exception
  when foreign_key_violation then
    return;
end;
$$;

create or replace function private.committee_for_roles(profile_roles public.app_role[])
returns uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  committee_name text;
  committee_id uuid;
begin
  if coalesce(profile_roles, array[]::public.app_role[]) && array['discipline_chair','discipline_vice_chair','discipline_member','discipline_admission_officer']::public.app_role[] then
    committee_name := 'Disiplin Kurulu';
  elsif coalesce(profile_roles, array[]::public.app_role[]) && array['youth_chair','youth_member']::public.app_role[] then
    committee_name := 'Gençlik Kolları';
  elsif coalesce(profile_roles, array[]::public.app_role[]) && array['spokesperson']::public.app_role[] then
    committee_name := 'Sosyal Medya Başkanlığı';
  elsif coalesce(profile_roles, array[]::public.app_role[]) && array['super_admin','president','vice_president','presidential_aide','chief_representative','representative']::public.app_role[] then
    committee_name := 'Yönetim Kurulu';
  else
    return null;
  end if;

  select id into committee_id
  from public.committees
  where name = committee_name
  limit 1;

  return committee_id;
end;
$$;

create or replace function private.refresh_committee_chairs()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.committees c
  set chair_profile_id = (
    select p.id
    from public.profiles p
    where p.status = 'active'::public.member_status
      and coalesce(p.roles, array[p.role]) && array['discipline_chair']::public.app_role[]
    order by p.updated_at desc nulls last, p.created_at asc
    limit 1
  )
  where c.name = 'Disiplin Kurulu';

  update public.committees c
  set chair_profile_id = (
    select p.id
    from public.profiles p
    where p.status = 'active'::public.member_status
      and coalesce(p.roles, array[p.role]) && array['youth_chair']::public.app_role[]
    order by p.updated_at desc nulls last, p.created_at asc
    limit 1
  )
  where c.name = 'Gençlik Kolları';

  update public.committees
  set chair_profile_id = null
  where name in ('Yönetim Kurulu', 'Sosyal Medya Başkanlığı');
end;
$$;

create or replace function private.assign_position(
  target_profile_id uuid,
  position_title text,
  committee_name text,
  authority smallint,
  position_description text default null,
  singleton boolean default false
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  target_committee_id uuid;
begin
  select id into target_committee_id
  from public.committees
  where name = committee_name
  limit 1;

  if singleton then
    update public.positions
    set assigned_profile_id = target_profile_id,
        committee_id = target_committee_id,
        authority_level = authority,
        description = coalesce(position_description, position_title || ' sorumluluğu.'),
        status = 'active'::public.position_status,
        assigned_at = current_date
    where title = position_title;

    if found then
      return;
    end if;
  end if;

  insert into public.positions(title, assigned_profile_id, committee_id, authority_level, description, status, assigned_at)
  values (
    position_title,
    target_profile_id,
    target_committee_id,
    authority,
    coalesce(position_description, position_title || ' sorumluluğu.'),
    'active'::public.position_status,
    current_date
  );
end;
$$;

create or replace function private.sync_positions_for_profile(target_profile_id uuid, profile_roles public.app_role[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  delete from public.positions
  where assigned_profile_id = target_profile_id
    and title = any(array[
      'Başkan',
      'Başkan Yardımcısı',
      'Başkan Yaveri',
      'Disiplin Kurulu Başkanı',
      'Disiplin Kurulu Başkan Yardımcısı',
      'Disiplin Kurulu Üyesi',
      'Gençlik Kolları Başkanı',
      'Gençlik Kurulu Başkanı',
      'Gençlik Kolları Üyesi',
      'Parti Sözcüsü',
      'Baş Temsilci',
      'Temsilci'
    ]);

  if coalesce(profile_roles, array[]::public.app_role[]) && array['president']::public.app_role[] then
    perform private.assign_position(target_profile_id, 'Başkan', 'Yönetim Kurulu', 10::smallint, 'Partinin genel koordinasyonu.', true);
  end if;
  if coalesce(profile_roles, array[]::public.app_role[]) && array['vice_president']::public.app_role[] then
    perform private.assign_position(target_profile_id, 'Başkan Yardımcısı', 'Yönetim Kurulu', 9::smallint, 'Başkana destek ve üye düzenleme yetkisi.', true);
  end if;
  if coalesce(profile_roles, array[]::public.app_role[]) && array['presidential_aide']::public.app_role[] then
    perform private.assign_position(target_profile_id, 'Başkan Yaveri', 'Yönetim Kurulu', 8::smallint, 'Başkanlık koordinasyonuna destek.', true);
  end if;
  if coalesce(profile_roles, array[]::public.app_role[]) && array['discipline_chair']::public.app_role[] then
    perform private.assign_position(target_profile_id, 'Disiplin Kurulu Başkanı', 'Disiplin Kurulu', 8::smallint, 'Disiplin kurulunu yönetir.', true);
  end if;
  if coalesce(profile_roles, array[]::public.app_role[]) && array['discipline_vice_chair']::public.app_role[] then
    perform private.assign_position(target_profile_id, 'Disiplin Kurulu Başkan Yardımcısı', 'Disiplin Kurulu', 7::smallint, 'Disiplin kurulu başkanına destek olur.', true);
  end if;
  if coalesce(profile_roles, array[]::public.app_role[]) && array['discipline_member']::public.app_role[] then
    perform private.assign_position(target_profile_id, 'Disiplin Kurulu Üyesi', 'Disiplin Kurulu', 5::smallint, 'Disiplin kurulunda inceleme yapar.', false);
  end if;
  if coalesce(profile_roles, array[]::public.app_role[]) && array['youth_chair']::public.app_role[] then
    perform private.assign_position(target_profile_id, 'Gençlik Kolları Başkanı', 'Gençlik Kolları', 7::smallint, 'Gençlik kolları çalışmalarını koordine eder.', true);
  end if;
  if coalesce(profile_roles, array[]::public.app_role[]) && array['youth_member']::public.app_role[] then
    perform private.assign_position(target_profile_id, 'Gençlik Kolları Üyesi', 'Gençlik Kolları', 3::smallint, 'Gençlik kolları çalışmalarına katılır.', false);
  end if;
  if coalesce(profile_roles, array[]::public.app_role[]) && array['spokesperson']::public.app_role[] then
    perform private.assign_position(target_profile_id, 'Parti Sözcüsü', 'Sosyal Medya Başkanlığı', 3::smallint, 'Sosyal medya etiketi ve sözcüsü.', true);
  end if;
  if coalesce(profile_roles, array[]::public.app_role[]) && array['chief_representative']::public.app_role[] then
    perform private.assign_position(target_profile_id, 'Baş Temsilci', 'Yönetim Kurulu', 6::smallint, 'Temsilci atamalarını koordine eder.', true);
  end if;
  if coalesce(profile_roles, array[]::public.app_role[]) && array['representative']::public.app_role[] then
    perform private.assign_position(target_profile_id, 'Temsilci', 'Yönetim Kurulu', 4::smallint, 'Üyeleri temsil eder.', false);
  end if;
end;
$$;

do $$
begin
  if exists (select 1 from public.committees where name = 'Gençlik Kurulu')
     and not exists (select 1 from public.committees where name = 'Gençlik Kolları') then
    update public.committees
    set name = 'Gençlik Kolları',
        description = 'Gençlik kolları etkinlik, sosyal çalışma ve katılım süreçlerini koordine eder.',
        status = 'active'
    where name = 'Gençlik Kurulu';
  end if;

  if exists (select 1 from public.committees where name = 'Duyuru ve İletişim Birimi')
     and not exists (select 1 from public.committees where name = 'Sosyal Medya Başkanlığı') then
    update public.committees
    set name = 'Sosyal Medya Başkanlığı',
        description = 'Sosyal medya etiketi ve görünürlük alanıdır; ek yönetim yetkisi vermez.',
        chair_profile_id = null,
        status = 'active'
    where name = 'Duyuru ve İletişim Birimi';
  end if;
end $$;

insert into public.committees(name, description, status, notes)
values
  ('Disiplin Kurulu', 'Uyarı, ceza ve disiplin süreçlerini yetki sınırlarıyla yönetir.', 'active', ''),
  ('Yönetim Kurulu', 'Başkanı olmayan eşit kurul yapısı; yönetim ve temsil rollerini bir arada gösterir.', 'active', ''),
  ('Gençlik Kolları', 'Gençlik kolları etkinlik, sosyal çalışma ve katılım süreçlerini koordine eder.', 'active', ''),
  ('Sosyal Medya Başkanlığı', 'Sosyal medya etiketi ve görünürlük alanıdır; ek yönetim yetkisi vermez.', 'active', '')
on conflict (name) do update
set description = excluded.description,
    status = 'active';

update public.committees
set status = 'passive'
where name in ('Üye Alım Birimi', 'Portal ve Sistem Birimi', 'Duyuru ve İletişim Birimi', 'Gençlik Kurulu');

update public.committees
set chair_profile_id = null
where name in ('Yönetim Kurulu', 'Sosyal Medya Başkanlığı');

update public.positions set title = 'Gençlik Kolları Başkanı' where title = 'Gençlik Kurulu Başkanı';
update public.positions set title = 'Gençlik Kolları Üyesi' where title = 'Gençlik Kurulu Üyesi';

update public.profiles p
set committee_id = private.committee_for_roles(
  case
    when p.roles is null or cardinality(p.roles) = 0 then array[p.role]
    when p.role = any(p.roles) then p.roles
    else p.roles || p.role
  end
)
where p.committee_id is distinct from private.committee_for_roles(
  case
    when p.roles is null or cardinality(p.roles) = 0 then array[p.role]
    when p.role = any(p.roles) then p.roles
    else p.roles || p.role
  end
);

do $$
declare
  profile_row record;
  all_roles public.app_role[];
begin
  for profile_row in select * from public.profiles loop
    all_roles := case
      when profile_row.roles is null or cardinality(profile_row.roles) = 0 then array[profile_row.role]
      when profile_row.role = any(profile_row.roles) then profile_row.roles
      else profile_row.roles || profile_row.role
    end;
    perform private.sync_positions_for_profile(profile_row.id, all_roles);
  end loop;
  perform private.refresh_committee_chairs();
end $$;

create or replace function private.sync_profile_governance()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  all_roles public.app_role[];
  old_roles public.app_role[];
  target_committee uuid;
begin
  all_roles := case
    when new.roles is null or cardinality(new.roles) = 0 then array[new.role]
    when new.role = any(new.roles) then new.roles
    else new.roles || new.role
  end;

  target_committee := private.committee_for_roles(all_roles);

  if tg_op in ('INSERT', 'UPDATE') and new.committee_id is distinct from target_committee then
    perform set_config('app.bypass_profile_protection', 'on', true);
    update public.profiles
    set committee_id = target_committee
    where id = new.id
      and committee_id is distinct from target_committee;
  end if;

  perform private.sync_positions_for_profile(new.id, all_roles);
  perform private.refresh_committee_chairs();

  if tg_op = 'INSERT' then
    perform private.notify_user(new.id, 'Portal hesabınız hazır', 'Profiliniz oluşturuldu. Rolleriniz: ' || array_to_string(all_roles, ', '), 'profile', '#/portal/settings');
  elsif tg_op = 'UPDATE' then
    old_roles := case
      when old.roles is null or cardinality(old.roles) = 0 then array[old.role]
      when old.role = any(old.roles) then old.roles
      else old.roles || old.role
    end;

    if all_roles is distinct from old_roles then
      perform private.notify_user(new.id, 'Rolleriniz güncellendi', 'Yeni rolleriniz: ' || array_to_string(all_roles, ', '), 'role', '#/portal/members');
    elsif new.status is distinct from old.status then
      perform private.notify_user(new.id, 'Üyelik durumunuz güncellendi', 'Yeni durum: ' || new.status::text, 'profile', '#/portal/settings');
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_profile_governance_after_change on public.profiles;
create trigger sync_profile_governance_after_change
  after insert or update of role, roles, status, committee_id on public.profiles
  for each row
  when (pg_trigger_depth() < 2)
  execute function private.sync_profile_governance();

create or replace function private.can_review_application(target_committee uuid, requested public.app_role)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'auth'
as $$
declare
  target_name text;
begin
  if private.has_any_role(array['super_admin','president','vice_president','presidential_aide']::public.app_role[]) then
    return true;
  end if;

  select name into target_name
  from public.committees
  where id = target_committee;

  if target_name = 'Disiplin Kurulu'
     and private.has_any_role(array['discipline_chair']::public.app_role[]) then
    return true;
  end if;

  if target_name = 'Gençlik Kolları'
     and private.has_any_role(array['youth_chair']::public.app_role[]) then
    return true;
  end if;

  return false;
end;
$$;

create or replace function private.prepare_application_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
begin
  new.applicant_profile_id := coalesce(new.applicant_profile_id, auth.uid());
  new.created_by := coalesce(new.created_by, auth.uid());
  new.target_committee_id := coalesce(new.target_committee_id, new.suggested_committee_id);
  new.suggested_committee_id := coalesce(new.suggested_committee_id, new.target_committee_id);
  new.notes := coalesce(new.notes, '');
  new.decision_note := coalesce(new.decision_note, '');
  new.status := coalesce(new.status, 'new'::public.application_status);
  new.requested_role := coalesce(new.requested_role, 'member'::public.app_role);

  if new.candidate_label is null or btrim(new.candidate_label) = '' then
    select display_name into new.candidate_label
    from public.profiles
    where id = new.applicant_profile_id;
  end if;

  return new;
end;
$$;

drop trigger if exists prepare_application_before_insert on public.applications;
create trigger prepare_application_before_insert
  before insert on public.applications
  for each row
  execute function private.prepare_application_insert();

drop policy if exists applications_select_authorized on public.applications;
drop policy if exists applications_insert_authorized on public.applications;
drop policy if exists applications_insert_authenticated on public.applications;
drop policy if exists applications_update_authorized on public.applications;
drop policy if exists applications_update_reviewers on public.applications;
drop policy if exists applications_delete_authorized on public.applications;

create policy applications_select_authorized
  on public.applications
  for select
  using (
    applicant_profile_id = (select auth.uid())
    or created_by = (select auth.uid())
    or private.can_review_application(coalesce(target_committee_id, suggested_committee_id), requested_role)
  );

create policy applications_insert_authenticated
  on public.applications
  for insert
  with check (
    (select auth.uid()) is not null
    and applicant_profile_id = (select auth.uid())
    and created_by = (select auth.uid())
    and status = 'new'::public.application_status
  );

create policy applications_update_reviewers
  on public.applications
  for update
  using (private.can_review_application(coalesce(target_committee_id, suggested_committee_id), requested_role))
  with check (private.can_review_application(coalesce(target_committee_id, suggested_committee_id), requested_role));

create policy applications_delete_authorized
  on public.applications
  for delete
  using (
    (applicant_profile_id = (select auth.uid()) and status = 'new'::public.application_status)
    or private.can_review_application(coalesce(target_committee_id, suggested_committee_id), requested_role)
  );

create or replace function private.apply_application_decision()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  all_roles public.app_role[];
  target_role public.app_role;
begin
  if new.status is not distinct from old.status
     and new.decision_note is not distinct from old.decision_note then
    return new;
  end if;

  if new.status = 'accepted'::public.application_status and new.applicant_profile_id is not null then
    target_role := coalesce(new.requested_role, 'member'::public.app_role);

    select case
      when p.roles is null or cardinality(p.roles) = 0 then array[p.role]
      when p.role = any(p.roles) then p.roles
      else p.roles || p.role
    end
    into all_roles
    from public.profiles p
    where p.id = new.applicant_profile_id;

    all_roles := array(
      select distinct role_value
      from unnest(array_append(coalesce(all_roles, array[]::public.app_role[]), target_role)) as role_value
    );

    perform set_config('app.bypass_profile_protection', 'on', true);

    update public.profiles
    set roles = all_roles,
        role = case when role in ('member'::public.app_role, 'guest'::public.app_role) then target_role else role end,
        status = 'active'::public.member_status
    where id = new.applicant_profile_id;

    perform private.notify_user(
      new.applicant_profile_id,
      'Başvurunuz kabul edildi',
      coalesce(new.decision_note, 'Başvurunuz onaylandı.'),
      'application',
      '#/portal/applications',
      new.decided_by
    );
  elsif new.status = 'rejected'::public.application_status and new.applicant_profile_id is not null then
    perform private.notify_user(
      new.applicant_profile_id,
      'Başvurunuz reddedildi',
      coalesce(nullif(new.decision_note, ''), 'Başvuru sonucu güncellendi.'),
      'application',
      '#/portal/applications',
      new.decided_by
    );
  elsif new.status = 'reviewing'::public.application_status and new.applicant_profile_id is not null then
    perform private.notify_user(
      new.applicant_profile_id,
      'Başvurunuz incelemede',
      'Başvurunuz yetkili kurul tarafından inceleniyor.',
      'application',
      '#/portal/applications',
      new.decided_by
    );
  end if;

  return new;
end;
$$;

drop trigger if exists apply_application_decision_after_update on public.applications;
create trigger apply_application_decision_after_update
  after update of status, decision_note on public.applications
  for each row
  execute function private.apply_application_decision();

create or replace function private.notify_discipline_record()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
begin
  perform private.notify_user(
    new.member_id,
    case when tg_op = 'INSERT' then 'Disiplin kaydı oluşturuldu' else 'Disiplin kaydı güncellendi' end,
    coalesce(new.record_type, 'Kayit') || ': ' || coalesce(new.reason, ''),
    'discipline',
    '#/portal/discipline',
    new.created_by
  );
  return new;
end;
$$;

drop trigger if exists notify_discipline_record_after_change on public.discipline_records;
create trigger notify_discipline_record_after_change
  after insert or update of record_type, reason, decision_status, action_taken on public.discipline_records
  for each row
  execute function private.notify_discipline_record();

drop policy if exists regulations_insert_upper_management on public.regulations;
drop policy if exists regulations_insert_super_admin on public.regulations;
drop policy if exists regulations_update_upper_management on public.regulations;
drop policy if exists regulations_update_super_admin on public.regulations;
drop policy if exists regulations_delete_upper_management on public.regulations;
drop policy if exists regulations_delete_super_admin on public.regulations;

create policy regulations_insert_super_admin
  on public.regulations
  for insert
  with check (private.has_any_role(array['super_admin']::public.app_role[]));

create policy regulations_update_super_admin
  on public.regulations
  for update
  using (private.has_any_role(array['super_admin']::public.app_role[]))
  with check (private.has_any_role(array['super_admin']::public.app_role[]));

create policy regulations_delete_super_admin
  on public.regulations
  for delete
  using (private.has_any_role(array['super_admin']::public.app_role[]));
