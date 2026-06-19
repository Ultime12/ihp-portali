-- İHP öğrenci topluluğu portalı
-- Kişisel veri içermeyen temel şema, RLS politikaları ve anonim başlangıç kayıtları.

create extension if not exists pgcrypto;

create type public.app_role as enum (
  'super_admin',
  'president',
  'vice_president',
  'spokesperson',
  'discipline_chair',
  'discipline_member',
  'youth_chair',
  'youth_member',
  'admission_officer',
  'member',
  'guest'
);

create type public.member_status as enum (
  'active',
  'passive',
  'suspended',
  'left',
  'pending'
);

create type public.position_status as enum (
  'active',
  'vacant',
  'transferred',
  'suspended'
);

create type public.content_status as enum (
  'draft',
  'published',
  'archived'
);

create type public.discipline_status as enum (
  'draft',
  'reviewing',
  'decided',
  'appealed',
  'closed'
);

create type public.application_status as enum (
  'new',
  'reviewing',
  'accepted',
  'rejected'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Yeni Üye',
  role public.app_role not null default 'member',
  status public.member_status not null default 'pending',
  joined_at date not null default current_date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (char_length(display_name) between 2 and 48),
  constraint profiles_anonymous_display_name check (
    display_name ~ '^(Üye [0-9]+|Yeni Üye|Yetkili Üye|Disiplin Yetkilisi|Süper Admin|Başkan|Başkan Yardımcısı|Parti Sözcüsü|Disiplin Kurulu Başkanı|Disiplin Kurulu Üyesi|Gençlik Kurulu Başkanı|Gençlik Kurulu Üyesi|Üye Alım Sorumlusu|Misafir Üye)$'
  )
);

create table public.committees (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null,
  chair_profile_id uuid references public.profiles(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'passive')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column committee_id uuid references public.committees(id) on delete set null;

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  assigned_profile_id uuid references public.profiles(id) on delete set null,
  committee_id uuid references public.committees(id) on delete set null,
  authority_level smallint not null default 1 check (authority_level between 1 and 10),
  description text not null,
  status public.position_status not null default 'vacant',
  assigned_at date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  category text not null,
  audience text not null default 'all_members',
  priority text not null default 'normal' check (priority in ('normal', 'important', 'urgent')),
  status public.content_status not null default 'draft',
  pinned boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.discipline_records (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete restrict,
  record_type text not null,
  reason text not null,
  description text not null,
  evidence_note text not null default '',
  severity text not null default 'low' check (severity in ('low', 'medium', 'high')),
  decision_status public.discipline_status not null default 'draft',
  action_taken text not null default '',
  privacy_level text not null default 'restricted' check (privacy_level in ('member', 'restricted', 'strict')),
  defense_text text not null default '',
  appeal_text text not null default '',
  notes text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  candidate_label text not null,
  status public.application_status not null default 'new',
  notes text not null default '',
  suggested_committee_id uuid references public.committees(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint applications_candidate_label_length check (char_length(candidate_label) between 2 and 48),
  constraint applications_anonymous_candidate_label check (candidate_label ~ '^Aday [0-9]+$')
);

create table public.regulations (
  id uuid primary key default gen_random_uuid(),
  title text not null unique,
  content text not null,
  sort_order smallint not null default 0,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.youth_activities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  status text not null default 'planned' check (status in ('planned', 'active', 'completed', 'archived')),
  starts_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.portal_settings (
  id text primary key default 'main',
  portal_name text not null default 'İHP Topluluk Portalı',
  short_description text not null default 'Öğrenciler arasında dayanışma, düzen ve sosyal etkileşim için topluluk portalı.',
  notifications_enabled boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  target_type text not null,
  target_id text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_upper_management()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() = any (
    array['super_admin', 'president', 'vice_president']::public.app_role[]
  ), false);
$$;

create or replace function public.can_manage_members()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() = any (
    array['super_admin', 'president', 'vice_president', 'admission_officer']::public.app_role[]
  ), false);
$$;

create or replace function public.can_manage_announcements()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() = any (
    array['super_admin', 'president', 'vice_president', 'spokesperson', 'youth_chair']::public.app_role[]
  ), false);
$$;

create or replace function public.can_view_discipline()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() = any (
    array['super_admin', 'president', 'vice_president', 'discipline_chair', 'discipline_member']::public.app_role[]
  ), false);
$$;

create or replace function public.can_manage_discipline()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() = any (
    array['super_admin', 'discipline_chair']::public.app_role[]
  ), false);
$$;

create or replace function public.can_manage_admissions()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() = any (
    array['super_admin', 'president', 'vice_president', 'admission_officer']::public.app_role[]
  ), false);
$$;

create or replace function public.can_manage_youth()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() = any (
    array['super_admin', 'president', 'vice_president', 'youth_chair']::public.app_role[]
  ), false);
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', 'Yeni Üye'),
    'pending'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role public.app_role;
begin
  -- Güvenli sunucu fonksiyonlarında kullanılan service_role RLS'yi atlar.
  if auth.uid() is null then
    return new;
  end if;

  actor_role := public.current_app_role();

  if auth.uid() = old.id and (
    new.role is distinct from old.role
    or new.status is distinct from old.status
    or new.committee_id is distinct from old.committee_id
  ) then
    raise exception 'Kullanıcı kendi rol veya durum yetkisini değiştiremez.';
  end if;

  if new.role is distinct from old.role then
    if actor_role = 'super_admin' then
      return new;
    end if;

    if actor_role = 'president'
      and old.role not in ('super_admin', 'president')
      and new.role not in ('super_admin', 'president') then
      return new;
    end if;

    if actor_role = 'vice_president'
      and old.role not in ('super_admin', 'president', 'vice_president')
      and new.role not in ('super_admin', 'president', 'vice_president', 'discipline_chair') then
      return new;
    end if;

    if actor_role = 'admission_officer'
      and old.role in ('member', 'guest')
      and new.role in ('member', 'guest') then
      return new;
    end if;

    raise exception 'Seçilen rolü atamak için yetkiniz bulunmuyor.';
  end if;

  if (
    new.status is distinct from old.status
    or new.committee_id is distinct from old.committee_id
  ) and (
    actor_role not in ('super_admin', 'president', 'vice_president', 'admission_officer')
    or old.role in ('super_admin', 'president')
  ) then
    raise exception 'Profil durumunu değiştirmek için yetkiniz bulunmuyor.';
  end if;

  return new;
end;
$$;

create trigger protect_profile_privileges_before_update
  before update on public.profiles
  for each row execute procedure public.protect_profile_privileges();

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_id text;
begin
  if tg_op = 'DELETE' then
    row_id := old.id::text;
  else
    row_id := new.id::text;
  end if;
  insert into public.audit_logs (action, actor_id, target_type, target_id, details)
  values (
    lower(tg_op),
    auth.uid(),
    tg_table_name,
    row_id,
    jsonb_build_object('operation', tg_op)
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute procedure public.set_updated_at();
create trigger committees_updated_at before update on public.committees
  for each row execute procedure public.set_updated_at();
create trigger positions_updated_at before update on public.positions
  for each row execute procedure public.set_updated_at();
create trigger announcements_updated_at before update on public.announcements
  for each row execute procedure public.set_updated_at();
create trigger discipline_records_updated_at before update on public.discipline_records
  for each row execute procedure public.set_updated_at();
create trigger applications_updated_at before update on public.applications
  for each row execute procedure public.set_updated_at();
create trigger youth_activities_updated_at before update on public.youth_activities
  for each row execute procedure public.set_updated_at();
create trigger portal_settings_updated_at before update on public.portal_settings
  for each row execute procedure public.set_updated_at();

create trigger audit_profiles after update on public.profiles
  for each row execute procedure public.write_audit_log();
create trigger audit_committees after insert or update on public.committees
  for each row execute procedure public.write_audit_log();
create trigger audit_positions after insert or update on public.positions
  for each row execute procedure public.write_audit_log();
create trigger audit_announcements after insert or update on public.announcements
  for each row execute procedure public.write_audit_log();
create trigger audit_discipline_records after insert or update on public.discipline_records
  for each row execute procedure public.write_audit_log();
create trigger audit_applications after insert or update on public.applications
  for each row execute procedure public.write_audit_log();
create trigger audit_regulations after update on public.regulations
  for each row execute procedure public.write_audit_log();
create trigger audit_youth_activities after insert or update on public.youth_activities
  for each row execute procedure public.write_audit_log();
create trigger audit_portal_settings after update on public.portal_settings
  for each row execute procedure public.write_audit_log();

alter table public.profiles enable row level security;
alter table public.committees enable row level security;
alter table public.positions enable row level security;
alter table public.announcements enable row level security;
alter table public.discipline_records enable row level security;
alter table public.applications enable row level security;
alter table public.regulations enable row level security;
alter table public.youth_activities enable row level security;
alter table public.portal_settings enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles_select_own_or_managers"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.can_manage_members() or public.can_view_discipline());
create policy "profiles_insert_managers"
  on public.profiles for insert to authenticated
  with check (public.can_manage_members());
create policy "profiles_update_own_or_managers"
  on public.profiles for update to authenticated
  using (id = auth.uid() or public.can_manage_members())
  with check (id = auth.uid() or public.can_manage_members());

create policy "committees_select_authenticated"
  on public.committees for select to authenticated using (true);
create policy "committees_write_upper_management"
  on public.committees for all to authenticated
  using (public.is_upper_management())
  with check (public.is_upper_management());

create policy "positions_select_authenticated"
  on public.positions for select to authenticated using (true);
create policy "positions_write_upper_management"
  on public.positions for all to authenticated
  using (public.is_upper_management())
  with check (public.is_upper_management());

create policy "announcements_select_allowed"
  on public.announcements for select to authenticated
  using (
    public.can_manage_announcements()
    or (
      status = 'published'
      and (
        audience = 'all_members'
        or (audience = 'management' and public.is_upper_management())
        or (audience = 'discipline' and public.can_view_discipline())
        or (audience = 'youth' and public.current_app_role() = any (
          array['youth_chair', 'youth_member']::public.app_role[]
        ))
      )
    )
  );
create policy "announcements_write_authorized"
  on public.announcements for all to authenticated
  using (public.can_manage_announcements())
  with check (public.can_manage_announcements());

create policy "discipline_select_own_or_authorized"
  on public.discipline_records for select to authenticated
  using (member_id = auth.uid() or public.can_view_discipline());
create policy "discipline_insert_authorized"
  on public.discipline_records for insert to authenticated
  with check (public.can_manage_discipline());
create policy "discipline_update_authorized"
  on public.discipline_records for update to authenticated
  using (public.can_manage_discipline())
  with check (public.can_manage_discipline());

create policy "applications_manage_authorized"
  on public.applications for all to authenticated
  using (public.can_manage_admissions())
  with check (public.can_manage_admissions());

create policy "regulations_select_authenticated"
  on public.regulations for select to authenticated using (true);
create policy "regulations_write_upper_management"
  on public.regulations for all to authenticated
  using (public.is_upper_management())
  with check (public.is_upper_management());

create policy "youth_activities_select_authenticated"
  on public.youth_activities for select to authenticated using (true);
create policy "youth_activities_write_authorized"
  on public.youth_activities for all to authenticated
  using (public.can_manage_youth())
  with check (public.can_manage_youth());

create policy "portal_settings_select_authenticated"
  on public.portal_settings for select to authenticated using (true);
create policy "portal_settings_write_upper_management"
  on public.portal_settings for all to authenticated
  using (public.is_upper_management())
  with check (public.is_upper_management());

create policy "audit_logs_select_upper_management"
  on public.audit_logs for select to authenticated
  using (public.is_upper_management());

insert into public.committees (name, description) values
  ('Yönetim Kurulu', 'Topluluk düzeni, koordinasyon ve genel işleyişten sorumlu kurul.'),
  ('Disiplin Kurulu', 'Gizlilik içinde değerlendirme ve düzen süreçlerini yöneten kurul.'),
  ('Gençlik Kurulu', 'Sosyal çalışmalar ve gençlik etkinliklerini koordine eden kurul.'),
  ('Duyuru ve İletişim Birimi', 'Portal duyurularını ve topluluk içi bilgilendirmeyi düzenleyen birim.'),
  ('Üye Alım Birimi', 'Anonim aday başvurularını değerlendiren ve üyelik sürecini yöneten birim.'),
  ('Portal ve Sistem Birimi', 'Portalın düzenli işleyişini ve sistem geliştirmelerini takip eden birim.');

insert into public.positions (title, committee_id, authority_level, description, status)
select 'Başkan', id, 10, 'Topluluğun genel koordinasyonundan sorumlu görev.', 'vacant'
from public.committees where name = 'Yönetim Kurulu';
insert into public.positions (title, committee_id, authority_level, description, status)
select 'Başkan Yardımcısı', id, 9, 'Genel koordinasyonda başkanı destekleyen görev.', 'vacant'
from public.committees where name = 'Yönetim Kurulu';
insert into public.positions (title, committee_id, authority_level, description, status)
select 'Parti Sözcüsü', id, 7, 'Topluluk içi duyuru ve iletişim süreçlerinden sorumlu görev.', 'vacant'
from public.committees where name = 'Duyuru ve İletişim Birimi';
insert into public.positions (title, committee_id, authority_level, description, status)
select 'Disiplin Kurulu Başkanı', id, 8, 'Gizli disiplin süreçlerinin düzenli yürütülmesinden sorumlu görev.', 'vacant'
from public.committees where name = 'Disiplin Kurulu';
insert into public.positions (title, committee_id, authority_level, description, status)
select 'Gençlik Kurulu Başkanı', id, 7, 'Gençlik çalışmaları ve etkinlik koordinasyonundan sorumlu görev.', 'vacant'
from public.committees where name = 'Gençlik Kurulu';
insert into public.positions (title, committee_id, authority_level, description, status)
select 'Üye Alım Sorumlusu', id, 6, 'Anonim başvuruları değerlendiren ve üyelik akışını yöneten görev.', 'vacant'
from public.committees where name = 'Üye Alım Birimi';
insert into public.positions (title, committee_id, authority_level, description, status)
select 'Portal Sorumlusu', id, 6, 'Sistem düzenini ve portal geliştirmelerini takip eden görev.', 'vacant'
from public.committees where name = 'Portal ve Sistem Birimi';

insert into public.regulations (title, content, sort_order) values
  ('Genel Hükümler', 'Bu yönetmelik, İHP öğrenci topluluğu portalının düzenli, güvenli ve şeffaf biçimde işlemesini sağlayan temel rehberdir.', 1),
  ('Topluluk Tanımı', 'İHP gerçek bir siyasi parti veya resmi kurum değildir. Öğrenciler arasında sosyal etkileşim, dayanışma ve görev paylaşımı amacıyla kullanılan topluluk sistemidir.', 2),
  ('Amaç', 'Topluluk içinde sorumluluk, düzen, saygı ve katılım kültürünü güçlendirmek amaçlanır.', 3),
  ('Temel İlkeler', 'Eşitlik, saygı, adalet, şeffaflık, dayanışma, sorumluluk, katılım ve özgür fikir temel ilkelerdir.', 4),
  ('Üyelik', 'Üyelik süreci gizlilik ilkelerine uygun yürütülür. Portalda gerçek kişisel bilgiler herkese açık biçimde paylaşılmaz.', 5),
  ('Görevler', 'Görevler ihtiyaçlara ve yetkilendirmeye göre atanır, devredilir veya boş olarak ilan edilir.', 6),
  ('Kurullar', 'Kurullar kendi sorumluluk alanlarında düzenli çalışma ve koordinasyon sağlar.', 7),
  ('Disiplin Süreci', 'Disiplin süreçleri kişiyi küçük düşürmeden, sınırlı erişimle ve değerlendirme hakkı korunarak yürütülür.', 8),
  ('Duyurular', 'Topluluk içi bilgilendirmeler yetkili roller tarafından hedef kitle gözetilerek yayınlanır.', 9),
  ('Gizlilik', 'Portal verileri yalnızca gerekli yetkilere sahip kullanıcılar tarafından işlenir. Disiplin kayıtları özel koruma altındadır.', 10),
  ('Yürürlük', 'Bu rehber, portalda yayınlandığı tarihten itibaren topluluk içi işleyiş için uygulanır.', 11);

insert into public.portal_settings (id) values ('main');

grant usage on schema public to authenticated, service_role;
revoke all on all tables in schema public from anon;

grant select, update on public.profiles to authenticated;
grant select, insert, update on public.committees to authenticated;
grant select, insert, update on public.positions to authenticated;
grant select, insert, update on public.announcements to authenticated;
grant select, insert, update on public.discipline_records to authenticated;
grant select, insert, update on public.applications to authenticated;
grant select, insert, update on public.regulations to authenticated;
grant select, insert, update on public.youth_activities to authenticated;
grant select, insert, update on public.portal_settings to authenticated;
grant select on public.audit_logs to authenticated;

grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to authenticated, service_role;
