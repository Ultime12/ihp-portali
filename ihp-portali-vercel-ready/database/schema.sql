-- İstiklal Hürriyet Partisi (İHP) Portalı
-- Supabase SQL Editor içinde tek seferde çalıştırılabilir.
-- Not: Bu şema Supabase Auth ile birlikte çalışır. Kullanıcılar auth.users tablosunda oluşur,
-- profil kayıtları trigger ile public.profiles tablosuna düşer.

create extension if not exists pgcrypto;

-- ENUM tipleri
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('uye', 'temsilci', 'yonetici', 'baskan_yardimcisi', 'genel_baskan');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.announcement_visibility AS ENUM ('public', 'members');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.application_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.election_status AS ENUM ('draft', 'open', 'closed', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.vote_choice AS ENUM ('yes', 'no', 'abstain');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.committee_type AS ENUM ('executive', 'discipline');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.investigation_status AS ENUM ('investigating', 'defense_waiting', 'decided', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Temel yardımcı fonksiyonlar
create or replace function public.role_rank(p_role public.user_role)
returns integer
language sql
immutable
as $$
  select case p_role
    when 'genel_baskan' then 50
    when 'baskan_yardimcisi' then 40
    when 'yonetici' then 30
    when 'temsilci' then 20
    when 'uye' then 10
    else 0
  end;
$$;

-- Tablolar
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  class_name text,
  role public.user_role not null default 'uye',
  duty text default 'Üye',
  joined_at timestamptz not null default now(),
  badges text[] not null default '{}'::text[],
  discipline_score integer not null default 100 check (discipline_score between 0 and 150),
  avatar_url text,
  is_executive_member boolean not null default false,
  is_discipline_member boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leadership_officials (
  id uuid primary key default gen_random_uuid(),
  role_title text not null,
  full_name text not null,
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  category text not null default 'Genel',
  pinned boolean not null default false,
  visibility public.announcement_visibility not null default 'public',
  published boolean not null default true,
  author_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text not null default 'Genel',
  start_at timestamptz not null,
  end_at timestamptz,
  location text,
  is_game_event boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_participants (
  event_id uuid references public.events(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  status text not null default 'accepted' check (status in ('accepted', 'declined', 'maybe')),
  created_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  class_name text not null,
  applicant_email text,
  join_reason text not null,
  interests text,
  status public.application_status not null default 'pending',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.discipline_records (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  changed_by uuid references public.profiles(id) on delete set null,
  delta integer not null check (delta between -100 and 100),
  reason text not null,
  previous_score integer not null,
  new_score integer not null,
  created_at timestamptz not null default now()
);

create table if not exists public.elections (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status public.election_status not null default 'draft',
  start_at timestamptz,
  end_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.election_candidates (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  statement text,
  created_at timestamptz not null default now(),
  unique (election_id, member_id)
);

create table if not exists public.election_votes (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  candidate_id uuid not null references public.election_candidates(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (election_id, voter_id)
);

create table if not exists public.executive_decisions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  status public.election_status not null default 'open',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.executive_votes (
  decision_id uuid references public.executive_decisions(id) on delete cascade,
  voter_id uuid references public.profiles(id) on delete cascade,
  vote public.vote_choice not null,
  comment text,
  created_at timestamptz not null default now(),
  primary key (decision_id, voter_id)
);

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  committee public.committee_type not null,
  title text not null,
  meeting_at timestamptz not null,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.discipline_investigations (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  opened_by uuid references public.profiles(id) on delete set null,
  title text not null,
  description text not null,
  defense_text text,
  status public.investigation_status not null default 'investigating',
  decision_text text,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.game_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  game_name text not null,
  description text,
  start_at timestamptz not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  game_name text not null,
  status public.election_status not null default 'open',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.game_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  game_name text not null,
  captain_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (name, game_name)
);

create table if not exists public.game_team_members (
  team_id uuid references public.game_teams(id) on delete cascade,
  member_id uuid references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (team_id, member_id)
);

create table if not exists public.champions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  game_name text not null,
  member_id uuid references public.profiles(id) on delete set null,
  team_name text,
  achieved_at date not null default current_date,
  created_at timestamptz not null default now()
);

-- Güncelleme zamanı trigger'ı
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

drop trigger if exists set_announcements_updated_at on public.announcements;
create trigger set_announcements_updated_at before update on public.announcements for each row execute function public.set_updated_at();

drop trigger if exists set_events_updated_at on public.events;
create trigger set_events_updated_at before update on public.events for each row execute function public.set_updated_at();

drop trigger if exists set_elections_updated_at on public.elections;
create trigger set_elections_updated_at before update on public.elections for each row execute function public.set_updated_at();

drop trigger if exists set_executive_decisions_updated_at on public.executive_decisions;
create trigger set_executive_decisions_updated_at before update on public.executive_decisions for each row execute function public.set_updated_at();

drop trigger if exists set_discipline_investigations_updated_at on public.discipline_investigations;
create trigger set_discipline_investigations_updated_at before update on public.discipline_investigations for each row execute function public.set_updated_at();

drop trigger if exists set_game_events_updated_at on public.game_events;
create trigger set_game_events_updated_at before update on public.game_events for each row execute function public.set_updated_at();

drop trigger if exists set_tournaments_updated_at on public.tournaments;
create trigger set_tournaments_updated_at before update on public.tournaments for each row execute function public.set_updated_at();

-- Auth user oluşunca profil oluştur
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, class_name, role, duty, badges)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1), 'Yeni Üye'),
    nullif(new.raw_user_meta_data->>'class_name', ''),
    'uye',
    'Üye',
    array['Yeni Üye']
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Yetki yardımcıları. RLS içinde recursive profile okuma probleminden kaçınmak için SECURITY DEFINER.
create or replace function public.my_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then null
    else (select p.role from public.profiles p where p.id = auth.uid())
  end;
$$;

create or replace function public.has_min_role(required_role public.user_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and public.role_rank(public.my_role()) >= public.role_rank(required_role);
$$;

create or replace function public.is_executive_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.is_executive_member = true or p.role in ('yonetici', 'baskan_yardimcisi', 'genel_baskan'))
  );
$$;

create or replace function public.is_discipline_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.is_discipline_member = true or p.role in ('yonetici', 'baskan_yardimcisi', 'genel_baskan'))
  );
$$;

create or replace function public.is_election_open(p_election_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.elections e
    where e.id = p_election_id
      and e.status = 'open'
      and (e.start_at is null or now() >= e.start_at)
      and (e.end_at is null or now() <= e.end_at)
  );
$$;

-- Profil RPC: üye sadece güvenli alanlarını günceller.
create or replace function public.update_own_profile(
  p_full_name text,
  p_class_name text,
  p_avatar_url text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Oturum gerekli.';
  end if;

  update public.profiles
  set full_name = nullif(trim(p_full_name), ''),
      class_name = nullif(trim(p_class_name), ''),
      avatar_url = nullif(trim(p_avatar_url), '')
  where id = auth.uid()
  returning * into updated_profile;

  return updated_profile;
end;
$$;

-- Disiplin puanı RPC: geçmiş kaydıyla birlikte atomik güncelleme yapar.
create or replace function public.adjust_discipline(
  p_member_id uuid,
  p_delta integer,
  p_reason text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  old_score integer;
  new_score integer;
  caller_role public.user_role;
  target_role public.user_role;
  updated_profile public.profiles;
begin
  if not (public.is_discipline_user() or public.has_min_role('yonetici')) then
    raise exception 'Disiplin puanı güncelleme yetkiniz yok.';
  end if;
  if p_delta < -100 or p_delta > 100 then
    raise exception 'Puan değişimi -100 ile 100 arasında olmalıdır.';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'Sebep zorunludur.';
  end if;

  select role, discipline_score into target_role, old_score
  from public.profiles where id = p_member_id
  for update;

  if old_score is null then
    raise exception 'Üye bulunamadı.';
  end if;

  caller_role := public.my_role();
  if public.role_rank(caller_role) < public.role_rank(target_role) then
    raise exception 'Kendinizden üst roldeki kişinin puanını değiştiremezsiniz.';
  end if;

  new_score := greatest(0, least(150, old_score + p_delta));

  update public.profiles
  set discipline_score = new_score
  where id = p_member_id
  returning * into updated_profile;

  insert into public.discipline_records (member_id, changed_by, delta, reason, previous_score, new_score)
  values (p_member_id, auth.uid(), p_delta, trim(p_reason), old_score, new_score);

  return updated_profile;
end;
$$;

create or replace function public.submit_defense(
  p_investigation_id uuid,
  p_defense_text text
)
returns public.discipline_investigations
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_case public.discipline_investigations;
begin
  if auth.uid() is null then raise exception 'Oturum gerekli.'; end if;
  update public.discipline_investigations
  set defense_text = nullif(trim(p_defense_text), ''), status = 'defense_waiting'
  where id = p_investigation_id and member_id = auth.uid()
  returning * into updated_case;
  if updated_case.id is null then raise exception 'Dosya bulunamadı veya yetkiniz yok.'; end if;
  return updated_case;
end;
$$;

create or replace function public.election_results(p_election_id uuid)
returns table(candidate_id uuid, member_id uuid, full_name text, vote_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select c.id as candidate_id,
         c.member_id,
         p.full_name,
         count(v.id) as vote_count
  from public.election_candidates c
  join public.profiles p on p.id = c.member_id
  left join public.election_votes v on v.candidate_id = c.id
  where c.election_id = p_election_id
    and auth.uid() is not null
  group by c.id, c.member_id, p.full_name
  order by vote_count desc, p.full_name asc;
$$;

-- RLS aktifleştirme
alter table public.profiles enable row level security;
alter table public.leadership_officials enable row level security;
alter table public.announcements enable row level security;
alter table public.events enable row level security;
alter table public.event_participants enable row level security;
alter table public.applications enable row level security;
alter table public.discipline_records enable row level security;
alter table public.elections enable row level security;
alter table public.election_candidates enable row level security;
alter table public.election_votes enable row level security;
alter table public.executive_decisions enable row level security;
alter table public.executive_votes enable row level security;
alter table public.meetings enable row level security;
alter table public.discipline_investigations enable row level security;
alter table public.game_events enable row level security;
alter table public.tournaments enable row level security;
alter table public.game_teams enable row level security;
alter table public.game_team_members enable row level security;
alter table public.champions enable row level security;

-- Eski politikaları temizle
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- Profiles
create policy "profiles select authenticated" on public.profiles for select to authenticated using (true);
create policy "profiles update managers" on public.profiles for update to authenticated using (public.has_min_role('yonetici')) with check (public.has_min_role('yonetici'));
create policy "profiles delete managers" on public.profiles for delete to authenticated using (public.has_min_role('yonetici'));

-- Leadership public seed
create policy "leadership public select" on public.leadership_officials for select to anon, authenticated using (true);
create policy "leadership manage" on public.leadership_officials for all to authenticated using (public.has_min_role('yonetici')) with check (public.has_min_role('yonetici'));

-- Announcements
create policy "announcements select visible" on public.announcements for select to anon, authenticated using (
  (published = true and visibility = 'public')
  or (auth.uid() is not null and published = true and visibility = 'members')
  or public.has_min_role('yonetici')
);
create policy "announcements manage" on public.announcements for all to authenticated using (public.has_min_role('yonetici')) with check (public.has_min_role('yonetici'));

-- Events
create policy "events public select" on public.events for select to anon, authenticated using (true);
create policy "events create representatives" on public.events for insert to authenticated with check (public.has_min_role('temsilci'));
create policy "events update representatives" on public.events for update to authenticated using (public.has_min_role('temsilci')) with check (public.has_min_role('temsilci'));
create policy "events delete managers" on public.events for delete to authenticated using (public.has_min_role('yonetici'));

create policy "event participants select" on public.event_participants for select to authenticated using (
  profile_id = auth.uid() or public.has_min_role('yonetici')
);
create policy "event participants insert own" on public.event_participants for insert to authenticated with check (profile_id = auth.uid());
create policy "event participants update own" on public.event_participants for update to authenticated using (profile_id = auth.uid() or public.has_min_role('yonetici')) with check (profile_id = auth.uid() or public.has_min_role('yonetici'));
create policy "event participants delete own" on public.event_participants for delete to authenticated using (profile_id = auth.uid() or public.has_min_role('yonetici'));

-- Applications
create policy "applications insert public" on public.applications for insert to anon, authenticated with check (true);
create policy "applications manage select" on public.applications for select to authenticated using (public.has_min_role('yonetici'));
create policy "applications manage update" on public.applications for update to authenticated using (public.has_min_role('yonetici')) with check (public.has_min_role('yonetici'));
create policy "applications manage delete" on public.applications for delete to authenticated using (public.has_min_role('yonetici'));

-- Discipline
create policy "discipline records select own or committee" on public.discipline_records for select to authenticated using (
  member_id = auth.uid() or public.is_discipline_user() or public.has_min_role('yonetici')
);
create policy "discipline records insert committee" on public.discipline_records for insert to authenticated with check (public.is_discipline_user() or public.has_min_role('yonetici'));

-- Elections
create policy "elections select authenticated" on public.elections for select to authenticated using (true);
create policy "elections manage" on public.elections for all to authenticated using (public.has_min_role('yonetici')) with check (public.has_min_role('yonetici'));

create policy "candidates select authenticated" on public.election_candidates for select to authenticated using (true);
create policy "candidates insert self open" on public.election_candidates for insert to authenticated with check (
  member_id = auth.uid() and public.is_election_open(election_id)
);
create policy "candidates manage" on public.election_candidates for update to authenticated using (public.has_min_role('yonetici')) with check (public.has_min_role('yonetici'));
create policy "candidates delete self or manager" on public.election_candidates for delete to authenticated using (member_id = auth.uid() or public.has_min_role('yonetici'));

create policy "votes select own or manager" on public.election_votes for select to authenticated using (voter_id = auth.uid() or public.has_min_role('yonetici'));
create policy "votes insert own open" on public.election_votes for insert to authenticated with check (
  voter_id = auth.uid()
  and public.is_election_open(election_id)
  and exists (select 1 from public.election_candidates c where c.id = candidate_id and c.election_id = election_votes.election_id)
);

-- Executive board
create policy "executive decisions select board" on public.executive_decisions for select to authenticated using (public.is_executive_user());
create policy "executive decisions insert board" on public.executive_decisions for insert to authenticated with check (public.is_executive_user());
create policy "executive decisions update board" on public.executive_decisions for update to authenticated using (public.is_executive_user()) with check (public.is_executive_user());
create policy "executive decisions delete managers" on public.executive_decisions for delete to authenticated using (public.has_min_role('yonetici'));

create policy "executive votes select board" on public.executive_votes for select to authenticated using (public.is_executive_user());
create policy "executive votes upsert own board" on public.executive_votes for insert to authenticated with check (public.is_executive_user() and voter_id = auth.uid());
create policy "executive votes update own board" on public.executive_votes for update to authenticated using (public.is_executive_user() and voter_id = auth.uid()) with check (public.is_executive_user() and voter_id = auth.uid());

-- Meetings
create policy "meetings select committee" on public.meetings for select to authenticated using (
  (committee = 'executive' and public.is_executive_user()) or (committee = 'discipline' and public.is_discipline_user())
);
create policy "meetings insert committee" on public.meetings for insert to authenticated with check (
  (committee = 'executive' and public.is_executive_user()) or (committee = 'discipline' and public.is_discipline_user())
);
create policy "meetings update committee" on public.meetings for update to authenticated using (
  (committee = 'executive' and public.is_executive_user()) or (committee = 'discipline' and public.is_discipline_user())
) with check (
  (committee = 'executive' and public.is_executive_user()) or (committee = 'discipline' and public.is_discipline_user())
);

-- Discipline investigations
create policy "investigations select member or committee" on public.discipline_investigations for select to authenticated using (
  member_id = auth.uid() or public.is_discipline_user()
);
create policy "investigations insert committee" on public.discipline_investigations for insert to authenticated with check (public.is_discipline_user());
create policy "investigations update committee" on public.discipline_investigations for update to authenticated using (public.is_discipline_user()) with check (public.is_discipline_user());
create policy "investigations delete managers" on public.discipline_investigations for delete to authenticated using (public.has_min_role('yonetici'));

-- Gaming
create policy "game events select public" on public.game_events for select to anon, authenticated using (true);
create policy "game events manage reps" on public.game_events for all to authenticated using (public.has_min_role('temsilci')) with check (public.has_min_role('temsilci'));

create policy "tournaments select public" on public.tournaments for select to anon, authenticated using (true);
create policy "tournaments manage reps" on public.tournaments for all to authenticated using (public.has_min_role('temsilci')) with check (public.has_min_role('temsilci'));

create policy "game teams select public" on public.game_teams for select to anon, authenticated using (true);
create policy "game teams insert auth" on public.game_teams for insert to authenticated with check (captain_id = auth.uid() or public.has_min_role('temsilci'));
create policy "game teams update captain or reps" on public.game_teams for update to authenticated using (captain_id = auth.uid() or public.has_min_role('temsilci')) with check (captain_id = auth.uid() or public.has_min_role('temsilci'));
create policy "game teams delete captain or reps" on public.game_teams for delete to authenticated using (captain_id = auth.uid() or public.has_min_role('temsilci'));

create policy "game team members select public" on public.game_team_members for select to anon, authenticated using (true);
create policy "game team members insert own" on public.game_team_members for insert to authenticated with check (member_id = auth.uid());
create policy "game team members delete own" on public.game_team_members for delete to authenticated using (member_id = auth.uid() or public.has_min_role('temsilci'));

create policy "champions select public" on public.champions for select to anon, authenticated using (true);
create policy "champions manage reps" on public.champions for all to authenticated using (public.has_min_role('temsilci')) with check (public.has_min_role('temsilci'));

-- Performans indeksleri
create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_profiles_executive on public.profiles(is_executive_member);
create index if not exists idx_profiles_discipline on public.profiles(is_discipline_member);
create index if not exists idx_announcements_visibility on public.announcements(published, visibility, pinned, created_at desc);
create index if not exists idx_events_start_at on public.events(start_at);
create index if not exists idx_discipline_records_member on public.discipline_records(member_id, created_at desc);
create index if not exists idx_election_votes_election on public.election_votes(election_id, candidate_id);
create index if not exists idx_election_candidates_election on public.election_candidates(election_id);
create index if not exists idx_investigations_member on public.discipline_investigations(member_id);
create index if not exists idx_game_events_start_at on public.game_events(start_at);

create unique index if not exists idx_leadership_unique_seed on public.leadership_officials(role_title, full_name);
create unique index if not exists idx_announcements_unique_title_seed on public.announcements(title);

-- Sabit yönetim kadrosu seed'i
insert into public.leadership_officials (role_title, full_name, sort_order) values
  ('Genel Başkan', 'Tuna Mert Köse', 1),
  ('Başkan Yardımcısı', 'Yiğit Erşahin', 2),
  ('Başkan Yaveri', 'Oğuz Pamir Özmen', 3),
  ('Parti Sözcüsü', 'Emir Kaan Altuntaş', 4),
  ('Baş Temsilci', 'Özgün Gece', 5),
  ('Temsilci', 'Alp Kapıcıoğlu', 6),
  ('Temsilci', 'Arda Aydın', 7),
  ('Temsilci', 'Göktuğ', 8),
  ('Sosyal Medya Sorumlusu', 'Ateş Deniz', 9),
  ('Sosyal Medya Sorumlusu', 'Oğuz Pamir Özmen', 10)
on conflict do nothing;

insert into public.announcements (title, body, category, pinned, visibility, published)
values
  ('İHP Portalı açıldı', 'İstiklal Hürriyet Partisi dijital portalı duyuru, seçim, disiplin, yürütme kurulu ve oyun merkezi modülleriyle kullanıma hazırdır.', 'Genel', true, 'public', true),
  ('Oyun Merkezi aktif', 'Oyun etkinlikleri, turnuvalar, takımlar ve şampiyonlar tablosu portal içinde ayrı bir bölüm olarak yayına alınmıştır.', 'Oyun', false, 'public', true)
on conflict do nothing;

-- RPC izinleri
grant execute on function public.update_own_profile(text, text, text) to authenticated;
grant execute on function public.adjust_discipline(uuid, integer, text) to authenticated;
grant execute on function public.submit_defense(uuid, text) to authenticated;
grant execute on function public.election_results(uuid) to authenticated;
