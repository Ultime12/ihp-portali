-- Align future discipline workflows with the 19.07.2026 Discipline Regulation.
-- Existing rows remain readable as legacy records and are not retroactively
-- forced to satisfy fields that did not exist when they were created.

-- Article 71: every member starts at 100 points; the legal range is 0-120.
update public.profiles
set discipline_points = least(120, greatest(0, coalesce(discipline_points, 100)))
where discipline_points is null
   or discipline_points < 0
   or discipline_points > 120;

alter table public.profiles
  drop constraint if exists profiles_discipline_points_range;

alter table public.profiles
  add constraint profiles_discipline_points_range
  check (discipline_points between 0 and 120);

update public.discipline_records
set points_before = least(120, greatest(0, points_before))
where points_before is not null
  and (points_before < 0 or points_before > 120);

update public.discipline_records
set points_after = least(120, greatest(0, points_after))
where points_after is not null
  and (points_after < 0 or points_after > 120);

alter table public.discipline_records
  drop constraint if exists discipline_records_points_before_range,
  drop constraint if exists discipline_records_points_after_range;

alter table public.discipline_records
  add constraint discipline_records_points_before_range
    check (points_before is null or points_before between 0 and 120),
  add constraint discipline_records_points_after_range
    check (points_after is null or points_after between 0 and 120);

-- Articles 21-23: only the DK portal creates a verified, attributable complaint.
alter table public.complaints
  add column if not exists regulation_version text not null default 'legacy',
  add column if not exists event_date date,
  add column if not exists learned_at date,
  add column if not exists late_filing_reason text,
  add column if not exists requested_outcome text,
  add column if not exists source_channel text not null default 'legacy',
  add column if not exists linked_investigation_id uuid,
  add column if not exists preliminary_outcome text,
  add column if not exists preliminary_reviewed_at timestamptz,
  add column if not exists preliminary_reviewed_by uuid references public.profiles(id) on delete set null;

alter table public.complaints
  alter column regulation_version set default '2026-07-19',
  alter column source_channel set default 'dk_portal';

alter table public.complaints
  drop constraint if exists complaints_description_length,
  drop constraint if exists complaints_regulation_20260719_required,
  drop constraint if exists complaints_requested_outcome_length,
  drop constraint if exists complaints_late_filing_reason_length,
  drop constraint if exists complaints_preliminary_outcome_allowed,
  drop constraint if exists complaints_source_channel_allowed;

alter table public.complaints
  add constraint complaints_description_length
    check (char_length(description) between 10 and 12000),
  add constraint complaints_requested_outcome_length
    check (requested_outcome is null or char_length(requested_outcome) between 3 and 2000),
  add constraint complaints_late_filing_reason_length
    check (late_filing_reason is null or char_length(late_filing_reason) between 10 and 2000),
  add constraint complaints_preliminary_outcome_allowed
    check (preliminary_outcome is null or preliminary_outcome in ('investigation_opened', 'evidence_requested', 'rejected', 'forwarded')),
  add constraint complaints_source_channel_allowed
    check (source_channel in ('legacy', 'dk_portal')),
  add constraint complaints_regulation_20260719_required
    check (
      regulation_version <> '2026-07-19'
      or (
        accused_profile_id is not null
        and event_date is not null
        and learned_at is not null
        and event_date <= created_at::date
        and learned_at <= created_at::date
        and (
          learned_at >= created_at::date - 30
          or char_length(btrim(coalesce(late_filing_reason, ''))) >= 10
        )
        and char_length(btrim(coalesce(evidence_note, ''))) >= 3
        and char_length(btrim(coalesce(requested_outcome, ''))) >= 3
        and source_channel = 'dk_portal'
      )
    );

-- Browser clients may read authorized rows, but official applications are
-- created by the authenticated server endpoint after validation.
drop policy if exists complaints_insert_own on public.complaints;
revoke insert on table public.complaints from anon, authenticated;

create index if not exists complaints_learned_at_idx
  on public.complaints(learned_at desc)
  where learned_at is not null;

-- Articles 27-35: numbered case, seven-day investigation and 3/5-day defense.
create sequence if not exists private.investigation_case_number_seq;

alter table public.investigations
  add column if not exists regulation_version text not null default 'legacy',
  add column if not exists case_number text,
  add column if not exists source_complaint_id uuid references public.complaints(id) on delete set null,
  add column if not exists classification text,
  add column if not exists alleged_articles text[] not null default '{}'::text[],
  add column if not exists evidence_summary text,
  add column if not exists due_at timestamptz,
  add column if not exists extension_days integer not null default 0,
  add column if not exists extension_reason text,
  add column if not exists notice_sent_at timestamptz,
  add column if not exists defense_due_at timestamptz,
  add column if not exists defense_extension_reason text,
  add column if not exists defense_extended_at timestamptz,
  add column if not exists defense_extended_by uuid references public.profiles(id) on delete set null,
  add column if not exists hearing_required boolean not null default false,
  add column if not exists hearing_scheduled_at timestamptz,
  add column if not exists hearing_method text,
  add column if not exists hearing_attendee_ids uuid[] not null default '{}'::uuid[],
  add column if not exists hearing_evidence_list text[] not null default '{}'::text[],
  add column if not exists hearing_held_at timestamptz;

update public.investigations
set case_number = 'DK-ARSIV-' || upper(left(replace(id::text, '-', ''), 12))
where case_number is null;

alter table public.investigations
  alter column case_number set not null,
  alter column regulation_version set default '2026-07-19';

alter table public.investigations
  drop constraint if exists investigations_description_length,
  drop constraint if exists investigations_case_number_unique,
  drop constraint if exists investigations_classification_allowed,
  drop constraint if exists investigations_extension_days_range,
  drop constraint if exists investigations_defense_extension_reason_length,
  drop constraint if exists investigations_hearing_method_length,
  drop constraint if exists investigations_hearing_timeline,
  drop constraint if exists investigations_regulation_20260719_required;

alter table public.investigations
  add constraint investigations_description_length
    check (char_length(description) between 10 and 12000),
  add constraint investigations_case_number_unique unique (case_number),
  add constraint investigations_classification_allowed
    check (classification is null or classification in ('light', 'medium', 'heavy', 'very_heavy', 'expulsion')),
  add constraint investigations_extension_days_range
    check (extension_days between 0 and 5),
  add constraint investigations_defense_extension_reason_length
    check (defense_extension_reason is null or char_length(defense_extension_reason) between 10 and 2000),
  add constraint investigations_hearing_method_length
    check (hearing_method is null or char_length(hearing_method) between 3 and 300),
  add constraint investigations_hearing_timeline
    check (hearing_held_at is null or hearing_scheduled_at is not null),
  add constraint investigations_regulation_20260719_required
    check (
      regulation_version <> '2026-07-19'
      or (
        classification is not null
        and cardinality(alleged_articles) > 0
        and char_length(btrim(coalesce(evidence_summary, ''))) >= 3
        and due_at is not null
        and notice_sent_at is not null
        and defense_due_at is not null
        and due_at >= created_at
        and defense_due_at >= notice_sent_at
        and (
          classification not in ('heavy', 'very_heavy', 'expulsion')
          or hearing_required
        )
      )
    );

create or replace function private.prepare_20260719_investigation()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  defense_days integer;
begin
  if new.case_number is null or btrim(new.case_number) = '' then
    new.case_number := format(
      'DK-%s-%s',
      to_char(coalesce(new.created_at, now()), 'YYYY'),
      lpad(nextval('private.investigation_case_number_seq')::text, 6, '0')
    );
  end if;

  if new.regulation_version = '2026-07-19' then
    defense_days := case
      when new.classification in ('heavy', 'very_heavy', 'expulsion') then 5
      else 3
    end;
    new.due_at := coalesce(new.due_at, coalesce(new.created_at, now()) + interval '7 days');
    new.notice_sent_at := coalesce(new.notice_sent_at, now());
    new.defense_due_at := coalesce(new.defense_due_at, new.notice_sent_at + make_interval(days => defense_days));
    if new.classification in ('heavy', 'very_heavy', 'expulsion') then
      new.hearing_required := true;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.prepare_20260719_investigation() from public, anon, authenticated;
grant execute on function private.prepare_20260719_investigation() to service_role;

drop trigger if exists prepare_20260719_investigation on public.investigations;
create trigger prepare_20260719_investigation
  before insert or update of regulation_version, classification, due_at, notice_sent_at, defense_due_at
  on public.investigations
  for each row execute function private.prepare_20260719_investigation();

create index if not exists investigations_due_at_idx
  on public.investigations(due_at)
  where status in ('open', 'reviewing');

create index if not exists investigations_source_complaint_id_idx
  on public.investigations(source_complaint_id)
  where source_complaint_id is not null;

alter table public.complaints
  drop constraint if exists complaints_linked_investigation_id_fkey;

alter table public.complaints
  add constraint complaints_linked_investigation_id_fkey
  foreign key (linked_investigation_id) references public.investigations(id) on delete set null;

create index if not exists complaints_linked_investigation_id_idx
  on public.complaints(linked_investigation_id)
  where linked_investigation_id is not null;

-- Articles 65-70 and 75-82: reasoned decisions and fixed point tiers.
alter table public.discipline_records
  add column if not exists regulation_version text not null default 'legacy',
  add column if not exists point_tier text not null default 'legacy',
  add column if not exists repeat_offense boolean not null default false,
  add column if not exists deciding_role text,
  add column if not exists violated_articles text[] not null default '{}'::text[],
  add column if not exists accepted_evidence_summary text,
  add column if not exists notified_at timestamptz,
  add column if not exists appeal_deadline timestamptz,
  add column if not exists appeal_authority_role text,
  add column if not exists expulsion_proposal_required boolean not null default false,
  add column if not exists profile_before jsonb,
  add column if not exists profile_after jsonb;

alter table public.discipline_records
  alter column regulation_version set default '2026-07-19',
  alter column point_tier set default 'none';

alter table public.discipline_records
  drop constraint if exists discipline_records_point_tier_allowed,
  drop constraint if exists discipline_records_deciding_role_allowed,
  drop constraint if exists discipline_records_appeal_authority_allowed,
  drop constraint if exists discipline_records_regulation_20260719_required;

alter table public.discipline_records
  add constraint discipline_records_point_tier_allowed
    check (point_tier in ('legacy', 'none', 'light_1', 'light_2', 'medium_1', 'medium_2', 'heavy_1', 'heavy_2', 'very_heavy', 'extraordinary')),
  add constraint discipline_records_deciding_role_allowed
    check (deciding_role is null or deciding_role in ('super_admin', 'discipline_chair', 'discipline_vice_chair', 'discipline_member')),
  add constraint discipline_records_appeal_authority_allowed
    check (appeal_authority_role is null or appeal_authority_role in ('discipline_chair', 'discipline_vice_chair')),
  add constraint discipline_records_regulation_20260719_required
    check (
      regulation_version <> '2026-07-19'
      or sanction_effect = 'reward_points'
      or point_delta > 0
      or decision_status <> 'decided'::public.discipline_status
      or (
        investigation_id is not null
        and cardinality(violated_articles) > 0
        and char_length(btrim(coalesce(accepted_evidence_summary, ''))) >= 3
        and deciding_role is not null
        and notified_at is not null
        and (
          appeal_authority_role is null
          or appeal_deadline is not null
        )
      )
    );

create or replace function private.prepare_20260719_discipline_decision()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  creator_roles public.app_role[];
  expected_delta integer;
  is_reward boolean;
  requires_hearing boolean;
  hearing_completed timestamptz;
begin
  if new.regulation_version <> '2026-07-19' then
    return new;
  end if;

  is_reward := coalesce(new.sanction_effect, 'none') = 'reward_points'
    or coalesce(new.point_delta, 0) > 0;
  if is_reward or new.decision_status <> 'decided'::public.discipline_status then
    return new;
  end if;

  select i.hearing_required, i.hearing_held_at
  into requires_hearing, hearing_completed
  from public.investigations i
  where i.id = new.investigation_id;

  if coalesce(requires_hearing, false) and hearing_completed is null then
    raise exception 'Agir veya cok agir dosyada durusma islemi tamamlanmadan disiplin karari kaydedilemez.';
  end if;

  expected_delta := case new.point_tier
    when 'none' then 0
    when 'light_1' then -5
    when 'light_2' then -10
    when 'medium_1' then -15
    when 'medium_2' then -20
    when 'heavy_1' then -25
    when 'heavy_2' then -35
    when 'very_heavy' then -50
    when 'extraordinary' then -60
    else null
  end;

  if expected_delta is null then
    raise exception '19.07.2026 yonetmeligine uygun ceza kademesi secilmelidir.';
  end if;
  if new.repeat_offense and new.point_tier = 'none' then
    raise exception 'Tekrar artirimi puansiz karara uygulanamaz.';
  end if;
  if new.repeat_offense then
    expected_delta := expected_delta - 5;
  end if;
  if coalesce(new.point_delta, 0) <> expected_delta then
    raise exception 'Ceza puani secilen yonetmelik kademesiyle uyusmuyor.';
  end if;

  select case
    when p.roles && array['discipline_chair']::public.app_role[] then 'discipline_chair'
    when p.roles && array['discipline_vice_chair']::public.app_role[] then 'discipline_vice_chair'
    when p.roles && array['discipline_member']::public.app_role[] then 'discipline_member'
    when p.roles && array['super_admin']::public.app_role[] then 'super_admin'
    when p.role = 'discipline_chair'::public.app_role then 'discipline_chair'
    when p.role = 'discipline_vice_chair'::public.app_role then 'discipline_vice_chair'
    when p.role = 'discipline_member'::public.app_role then 'discipline_member'
    when p.role = 'super_admin'::public.app_role then 'super_admin'
    else null
  end,
  case
    when p.roles is null or cardinality(p.roles) = 0 then array[p.role]
    when p.role = any(p.roles) then p.roles
    else p.roles || p.role
  end
  into new.deciding_role, creator_roles
  from public.profiles p
  where p.id = new.created_by;

  if new.deciding_role is null then
    raise exception 'Karari veren DK makami belirlenemedi.';
  end if;

  new.appeal_authority_role := case new.deciding_role
    when 'discipline_member' then 'discipline_vice_chair'
    when 'discipline_vice_chair' then 'discipline_chair'
    when 'super_admin' then 'discipline_chair'
    else null
  end;
  new.notified_at := coalesce(new.notified_at, now());
  new.appeal_deadline := case
    when new.appeal_authority_role is null then null
    else coalesce(new.appeal_deadline, new.notified_at + interval '3 days')
  end;
  new.expulsion_proposal_required := new.point_tier = 'extraordinary'
    or coalesce(new.points_after, 1) = 0;

  return new;
end;
$$;

revoke all on function private.prepare_20260719_discipline_decision() from public, anon, authenticated;
grant execute on function private.prepare_20260719_discipline_decision() to service_role;

drop trigger if exists prepare_20260719_discipline_decision on public.discipline_records;
create trigger prepare_20260719_discipline_decision
  before insert or update of regulation_version, point_tier, repeat_offense, point_delta, decision_status, created_by, points_after
  on public.discipline_records
  for each row execute function private.prepare_20260719_discipline_decision();

create index if not exists discipline_records_appeal_deadline_idx
  on public.discipline_records(appeal_deadline)
  where appeal_status = 'none' and appeal_deadline is not null;

create index if not exists discipline_records_point_tier_idx
  on public.discipline_records(point_tier, created_at desc)
  where point_tier <> 'legacy';

-- Article 112: current-version applications, investigations, decisions and
-- their evidence remain in the institutional archive.
create or replace function private.protect_20260719_discipline_archive()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  protected_record boolean := false;
begin
  if tg_table_name in ('complaints', 'investigations', 'discipline_records') then
    protected_record := old.regulation_version = '2026-07-19';
  elsif tg_table_name = 'case_attachments' then
    protected_record :=
      exists (
        select 1 from public.complaints c
        where c.id = old.complaint_id and c.regulation_version = '2026-07-19'
      )
      or exists (
        select 1 from public.investigations i
        where i.id = old.investigation_id and i.regulation_version = '2026-07-19'
      )
      or exists (
        select 1 from public.discipline_records d
        where d.id = old.discipline_record_id and d.regulation_version = '2026-07-19'
      );
  end if;

  if protected_record then
    raise exception '19.07.2026 yonetmeligine tabi disiplin arsivi kalici olarak silinemez.';
  end if;
  return old;
end;
$$;

revoke all on function private.protect_20260719_discipline_archive() from public, anon, authenticated;
grant execute on function private.protect_20260719_discipline_archive() to service_role;

drop trigger if exists protect_20260719_complaint_archive on public.complaints;
create trigger protect_20260719_complaint_archive
  before delete on public.complaints
  for each row execute function private.protect_20260719_discipline_archive();

drop trigger if exists protect_20260719_investigation_archive on public.investigations;
create trigger protect_20260719_investigation_archive
  before delete on public.investigations
  for each row execute function private.protect_20260719_discipline_archive();

drop trigger if exists protect_20260719_decision_archive on public.discipline_records;
create trigger protect_20260719_decision_archive
  before delete on public.discipline_records
  for each row execute function private.protect_20260719_discipline_archive();

drop trigger if exists protect_20260719_evidence_archive on public.case_attachments;
create trigger protect_20260719_evidence_archive
  before delete on public.case_attachments
  for each row execute function private.protect_20260719_discipline_archive();

-- The 19.07.2026 Credit and Compensation Regulation replaces arbitrary
-- financial sanctions with a closed tariff and an auditable damage matrix.
create table if not exists public.discipline_credit_tariffs (
  code text primary key,
  category text not null,
  title text not null,
  amount bigint not null check (amount between 10000 and 1000000),
  recipient_mode text not null check (recipient_mode in ('victim', 'system', 'victim_or_system')),
  next_code text references public.discipline_credit_tariffs(code) on delete restrict,
  regulation_version text not null default '2026-07-19',
  sort_order integer not null default 0
);

insert into public.discipline_credit_tariffs(code, category, title, amount, recipient_mode, next_code, sort_order)
values
  ('K-01', 'insult', 'Kaba veya kucumseyici soz', 10000, 'victim', 'K-02', 10),
  ('K-02', 'insult', 'Dogrudan hakaret', 25000, 'victim', 'K-03', 20),
  ('K-03', 'insult', 'Acik kufur veya kufur kisaltmasi', 50000, 'victim', 'K-04', 30),
  ('K-04', 'insult', 'Aileye veya yakinlara yonelik agir kufur', 100000, 'victim', 'K-05', 40),
  ('K-05', 'insult', 'Tehdit iceren agir kufur', 200000, 'victim', null, 50),
  ('T-01', 'threat', 'Belirsiz veya hafif tehdit', 75000, 'victim', 'T-02', 60),
  ('T-02', 'threat', 'Acik zarar verme tehdidi', 200000, 'victim', 'T-03', 70),
  ('T-03', 'threat', 'Sistematik tehdit, santaj veya baski', 500000, 'victim', 'T-04', 80),
  ('T-04', 'threat', 'Planli, cok agir ve birden fazla eylemli tehdit', 1000000, 'victim', null, 90),
  ('G-01', 'privacy', 'Gizli konusmayi izinsiz paylasma', 100000, 'victim_or_system', 'G-02', 100),
  ('G-02', 'privacy', 'Sorusturma veya durusma belgesini paylasma', 200000, 'system', 'G-03', 110),
  ('G-03', 'privacy', 'Kisisel bilgiyi izinsiz paylasma', 300000, 'victim', 'G-04', 120),
  ('G-04', 'privacy', 'Bilgiyi zarar verme amaciyla genis bicimde yayma', 500000, 'victim', null, 130),
  ('D-01', 'evidence', 'Delili saklama, silme veya degistirme', 250000, 'system', 'D-02', 140),
  ('D-02', 'evidence', 'Sahte ekran goruntusu veya belge uretme', 500000, 'system', 'D-03', 150),
  ('D-03', 'evidence', 'Taniga baski veya yalan ifade verdirmeye calisma', 500000, 'victim_or_system', 'D-04', 160),
  ('D-04', 'evidence', 'Planli ve toplu delil karartma', 1000000, 'system', null, 170),
  ('S-01', 'system', 'Yetkisiz kredi aktarimi veya hesap islemi', 250000, 'system', 'S-02', 180),
  ('S-02', 'system', 'Kredi kayitlarini manipule etme veya sahte bakiye uretme', 500000, 'system', 'S-03', 190),
  ('S-03', 'system', 'Hesap, secim veya kurum sistemini planli ele gecirme girisimi', 1000000, 'system', null, 200)
on conflict (code) do update
set category = excluded.category,
    title = excluded.title,
    amount = excluded.amount,
    recipient_mode = excluded.recipient_mode,
    next_code = excluded.next_code,
    regulation_version = excluded.regulation_version,
    sort_order = excluded.sort_order;

create table if not exists public.discipline_compensation_tariffs (
  code text primary key,
  damage_level text not null check (damage_level in ('limited', 'significant', 'heavy')),
  title text not null,
  amount bigint not null check (amount in (25000, 50000, 75000, 100000, 150000, 200000, 250000, 350000, 500000)),
  minimum_independent_outcomes integer not null default 1 check (minimum_independent_outcomes between 1 and 2),
  regulation_version text not null default '2026-07-19',
  sort_order integer not null default 0
);

insert into public.discipline_compensation_tariffs(code, damage_level, title, amount, minimum_independent_outcomes, sort_order)
values
  ('C-25', 'limited', 'Tek, dusuk etkili ve kisa sureli zarar', 25000, 1, 10),
  ('C-50', 'limited', 'Iki dogrulanmis sinirli sonuc', 50000, 1, 20),
  ('C-75', 'limited', 'Uc dogrulanmis sinirli sonuc', 75000, 1, 30),
  ('C-100', 'significant', 'Gorev, hizmet veya onemli yetkinin kisa sureli kaybi', 100000, 1, 40),
  ('C-150', 'significant', 'Zararin birden fazla gruba veya surece yansimasi', 150000, 1, 50),
  ('C-200', 'significant', 'Onemli kredi kaybi ve belirgin itibar sonucu', 200000, 1, 60),
  ('C-250', 'heavy', 'Uzun sureli gorev veya hesap kaybi ve onemli sonuc', 250000, 1, 70),
  ('C-350', 'heavy', 'Kisisel bilginin genis yayimi veya kalici kurum ici etki', 350000, 1, 80),
  ('C-500', 'heavy', 'Birden fazla agir sonucun birlikte kanitlanmasi', 500000, 2, 90)
on conflict (code) do update
set damage_level = excluded.damage_level,
    title = excluded.title,
    amount = excluded.amount,
    minimum_independent_outcomes = excluded.minimum_independent_outcomes,
    regulation_version = excluded.regulation_version,
    sort_order = excluded.sort_order;

alter table public.discipline_credit_tariffs enable row level security;
alter table public.discipline_compensation_tariffs enable row level security;

drop policy if exists discipline_credit_tariffs_select_authenticated on public.discipline_credit_tariffs;
create policy discipline_credit_tariffs_select_authenticated
  on public.discipline_credit_tariffs for select to authenticated using (true);

drop policy if exists discipline_compensation_tariffs_select_authenticated on public.discipline_compensation_tariffs;
create policy discipline_compensation_tariffs_select_authenticated
  on public.discipline_compensation_tariffs for select to authenticated using (true);

grant select on public.discipline_credit_tariffs, public.discipline_compensation_tariffs to authenticated;
grant all on public.discipline_credit_tariffs, public.discipline_compensation_tariffs to service_role;

-- Authorised representation and temporary measures are first-class case
-- records rather than free-form notes.
create table if not exists public.discipline_case_representatives (
  id uuid primary key default gen_random_uuid(),
  investigation_id uuid not null references public.investigations(id) on delete restrict,
  member_id uuid not null references public.profiles(id) on delete restrict,
  representative_id uuid not null references public.profiles(id) on delete restrict,
  authorization_text text not null check (char_length(authorization_text) between 10 and 4000),
  authorised_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  check (member_id <> representative_id)
);

create unique index if not exists discipline_case_representatives_active_idx
  on public.discipline_case_representatives(investigation_id, member_id)
  where revoked_at is null;

create table if not exists public.discipline_temporary_measures (
  id uuid primary key default gen_random_uuid(),
  investigation_id uuid not null references public.investigations(id) on delete restrict,
  member_id uuid not null references public.profiles(id) on delete restrict,
  measure_type text not null check (measure_type in ('message_restriction', 'system_access', 'role_suspension', 'membership_suspension')),
  reason text not null check (char_length(reason) between 10 and 4000),
  status text not null default 'pending_executive' check (status in ('pending_executive', 'approved', 'rejected', 'expired', 'revoked')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  approval_due_at timestamptz not null default (now() + interval '24 hours'),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text not null default '',
  profile_before jsonb not null default '{}'::jsonb
);

alter table public.discipline_case_representatives enable row level security;
alter table public.discipline_temporary_measures enable row level security;
revoke insert, update, delete on public.discipline_case_representatives, public.discipline_temporary_measures from anon, authenticated;
grant select on public.discipline_case_representatives, public.discipline_temporary_measures to authenticated;
grant all on public.discipline_case_representatives, public.discipline_temporary_measures to service_role;

drop policy if exists discipline_case_representatives_select_authorized on public.discipline_case_representatives;
create policy discipline_case_representatives_select_authorized
  on public.discipline_case_representatives for select to authenticated
  using (
    member_id = (select auth.uid())
    or representative_id = (select auth.uid())
    or exists (
      select 1 from public.investigations i
      where i.id = investigation_id
        and (i.subject_profile_id = (select auth.uid()) or i.assigned_to = (select auth.uid()))
    )
    or private.has_any_role(array['super_admin', 'discipline_chair']::public.app_role[])
  );

drop policy if exists discipline_temporary_measures_select_authorized on public.discipline_temporary_measures;
create policy discipline_temporary_measures_select_authorized
  on public.discipline_temporary_measures for select to authenticated
  using (
    member_id = (select auth.uid())
    or created_by = (select auth.uid())
    or private.has_any_role(array['super_admin', 'discipline_chair']::public.app_role[])
    or private.is_executive_member((select auth.uid()))
  );

-- The system account is an institutional ledger, never a DK member's wallet.
create table if not exists public.institutional_credit_treasury (
  id text primary key default 'main' check (id = 'main'),
  balance bigint not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

insert into public.institutional_credit_treasury(id) values ('main')
on conflict (id) do nothing;

create table if not exists public.institutional_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  amount bigint not null check (amount <> 0),
  balance_after bigint not null check (balance_after >= 0),
  entry_type text not null check (entry_type in ('discipline_principal', 'discipline_tax', 'discipline_refund', 'correction')),
  discipline_record_id uuid references public.discipline_records(id) on delete restrict,
  credit_loan_id uuid references public.credit_loans(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.institutional_credit_treasury enable row level security;
alter table public.institutional_credit_ledger enable row level security;
revoke all on public.institutional_credit_treasury, public.institutional_credit_ledger from anon, authenticated;
grant all on public.institutional_credit_treasury, public.institutional_credit_ledger to service_role;

alter table public.credit_accounts
  add column if not exists transfer_restricted boolean not null default false,
  add column if not exists transfer_restriction_reason text not null default '';

alter table public.discipline_records
  add column if not exists financial_tariff_code text references public.discipline_credit_tariffs(code) on delete restrict,
  add column if not exists financial_base_amount bigint not null default 0,
  add column if not exists financial_aggravating_factors text[] not null default '{}'::text[],
  add column if not exists financial_recipient_type text,
  add column if not exists financial_recipient_profile_id uuid references public.profiles(id) on delete restrict,
  add column if not exists compensation_code text references public.discipline_compensation_tariffs(code) on delete restrict,
  add column if not exists compensation_amount bigint not null default 0,
  add column if not exists compensation_evidence text,
  add column if not exists financial_tax_basis_points integer not null default 0,
  add column if not exists financial_tax_amount bigint not null default 0,
  add column if not exists financial_due_at timestamptz,
  add column if not exists financial_decision_summary text,
  add column if not exists is_effective boolean not null default true,
  add column if not exists reversed_at timestamptz,
  add column if not exists reversed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reversal_reason text,
  add column if not exists executive_proposal_id uuid references public.governance_proposals(id) on delete set null;

alter table public.discipline_records
  drop constraint if exists discipline_records_credit_fine_amount_check,
  drop constraint if exists discipline_records_credit_fine_installments_check,
  drop constraint if exists discipline_records_sanction_effect_allowed,
  drop constraint if exists discipline_records_financial_recipient_type_allowed,
  drop constraint if exists discipline_records_financial_20260719_required;

alter table public.discipline_records
  add constraint discipline_records_credit_fine_amount_check
    check (credit_fine_amount between 0 and 1000000),
  add constraint discipline_records_credit_fine_installments_check
    check (credit_fine_installments between 1 and 3),
  add constraint discipline_records_sanction_effect_allowed
    check (sanction_effect in ('none', 'points_only', 'reward_points', 'remove_roles', 'suspend_member', 'party_suspension', 'passive_member', 'executive_proposal')),
  add constraint discipline_records_financial_recipient_type_allowed
    check (financial_recipient_type is null or financial_recipient_type in ('victim', 'system')),
  add constraint discipline_records_financial_20260719_required
    check (
      regulation_version <> '2026-07-19'
      or (credit_fine_amount = 0 and compensation_amount = 0)
      or (
        financial_recipient_type is not null
        and financial_due_at is not null
        and financial_tax_basis_points between 0 and 5000
        and financial_tax_amount >= 0
        and char_length(btrim(coalesce(financial_decision_summary, ''))) >= 10
        and (
          financial_recipient_type = 'system'
          or financial_recipient_profile_id is not null
        )
      )
    );

alter table public.credit_loans
  add column if not exists regulation_version text not null default 'legacy',
  add column if not exists tariff_code text references public.discipline_credit_tariffs(code) on delete restrict,
  add column if not exists base_amount bigint not null default 0,
  add column if not exists aggravating_factors text[] not null default '{}'::text[],
  add column if not exists compensation_code text references public.discipline_compensation_tariffs(code) on delete restrict,
  add column if not exists compensation_amount bigint not null default 0,
  add column if not exists recipient_type text,
  add column if not exists recipient_profile_id uuid references public.profiles(id) on delete restrict,
  add column if not exists tax_basis_points integer not null default 0,
  add column if not exists tax_amount bigint not null default 0,
  add column if not exists original_due_at timestamptz,
  add column if not exists extension_reason text,
  add column if not exists extension_granted_at timestamptz,
  add column if not exists extension_granted_by uuid references public.profiles(id) on delete set null,
  add column if not exists reversed_at timestamptz,
  add column if not exists reversed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reversal_reason text,
  add column if not exists refunded_amount bigint not null default 0;

alter table public.credit_loans
  drop constraint if exists credit_loans_status_check,
  drop constraint if exists credit_loans_discipline_20260719_required;

alter table public.credit_loans
  add constraint credit_loans_status_check
    check (status in ('pending', 'approved', 'rejected', 'paid', 'delinquent', 'cancelled', 'reversed')),
  add constraint credit_loans_discipline_20260719_required
    check (
      source <> 'discipline_fine'
      or regulation_version <> '2026-07-19'
      or (
        installment_count between 1 and 3
        and interest_basis_points = 0
        and base_amount between 0 and 1000000
        and compensation_amount between 0 and 500000
        and principal = base_amount + compensation_amount
        and total_due = principal + tax_amount
        and recipient_type in ('victim', 'system')
        and original_due_at is not null
      )
    );

alter table public.credit_installments
  add column if not exists principal_amount bigint not null default 0,
  add column if not exists tax_amount bigint not null default 0,
  add column if not exists recipient_amount bigint not null default 0;

alter table public.credit_installments
  drop constraint if exists credit_installments_status_check,
  drop constraint if exists credit_installments_breakdown_check;

alter table public.credit_installments
  add constraint credit_installments_status_check
    check (status in ('pending', 'paid', 'delinquent', 'cancelled', 'refunded')),
  add constraint credit_installments_breakdown_check
    check (
      (principal_amount = 0 and tax_amount = 0 and recipient_amount = 0)
      or (
        principal_amount >= 0
        and tax_amount >= 0
        and recipient_amount = principal_amount
        and amount = principal_amount + tax_amount
      )
    );

alter table public.credit_transactions
  drop constraint if exists credit_transactions_kind_check;

alter table public.credit_transactions
  add constraint credit_transactions_kind_check check (kind in (
    'account_opened', 'transfer_out', 'transfer_in', 'transfer_tax',
    'transfer_reserve', 'transfer_refund', 'weekly_allowance',
    'cheque_issue', 'cheque_redeem', 'loan_disbursement', 'loan_repayment',
    'discipline_fine_repayment', 'discipline_compensation_receipt',
    'discipline_refund', 'balance_forfeit', 'admin_adjustment',
    'game_entry', 'game_reward', 'assistant_message', 'assistant_weekly',
    'assistant_refund', 'finance_deposit', 'finance_withdrawal',
    'finance_portfolio_fee'
  ));

create index if not exists credit_loans_discipline_due_idx
  on public.credit_loans(status, original_due_at)
  where source = 'discipline_fine' and regulation_version = '2026-07-19';

create index if not exists discipline_records_financial_recipient_idx
  on public.discipline_records(financial_recipient_profile_id)
  where financial_recipient_profile_id is not null;

create or replace function private.discipline_rank(profile_roles public.app_role[])
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when profile_roles && array['discipline_chair']::public.app_role[] then 3
    when profile_roles && array['discipline_vice_chair']::public.app_role[] then 2
    when profile_roles && array['discipline_member']::public.app_role[] then 1
    else 0
  end;
$$;

create or replace function private.ensure_20260719_credit_account(candidate_profile_id uuid)
returns public.credit_accounts
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_account public.credit_accounts%rowtype;
  v_code text;
  v_attempt integer;
begin
  select * into v_account
  from public.credit_accounts
  where profile_id = candidate_profile_id
  for update;

  if found then
    if v_account.status <> 'active' then
      update public.credit_accounts
      set status = 'active',
          closed_at = null,
          terms_version = '2026-07-19-discipline-credit',
          terms_accepted_at = coalesce(terms_accepted_at, now()),
          updated_at = now()
      where id = v_account.id
      returning * into v_account;
    end if;
    return v_account;
  end if;

  for v_attempt in 1..30 loop
    v_code := 'IHP' || lpad(floor(random() * 1000000000)::bigint::text, 9, '0');
    begin
      insert into public.credit_accounts(
        profile_id,
        account_code,
        balance,
        status,
        usage_purpose,
        terms_version,
        terms_accepted_at
      ) values (
        candidate_profile_id,
        v_code,
        0,
        'active',
        'general',
        '2026-07-19-discipline-credit',
        now()
      )
      returning * into v_account;
      return v_account;
    exception when unique_violation then
      null;
    end;
  end loop;

  raise exception 'Benzersiz IHP kredi hesabi olusturulamadi.';
end;
$$;

revoke all on function private.discipline_rank(public.app_role[]) from public, anon, authenticated;
revoke all on function private.ensure_20260719_credit_account(uuid) from public, anon, authenticated;
grant execute on function private.discipline_rank(public.app_role[]) to service_role;
grant execute on function private.ensure_20260719_credit_account(uuid) to service_role;

create or replace function public.apply_20260719_discipline_decision(
  p_actor_profile_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_target public.profiles%rowtype;
  v_investigation public.investigations%rowtype;
  v_source_complaint public.complaints%rowtype;
  v_record public.discipline_records%rowtype;
  v_loan public.credit_loans%rowtype;
  v_debtor_account public.credit_accounts%rowtype;
  v_recipient_account public.credit_accounts%rowtype;
  v_recipient_profile public.profiles%rowtype;
  v_tariff public.discipline_credit_tariffs%rowtype;
  v_next_tariff public.discipline_credit_tariffs%rowtype;
  v_compensation public.discipline_compensation_tariffs%rowtype;
  v_actor_roles public.app_role[];
  v_target_roles public.app_role[];
  v_next_roles public.app_role[];
  v_recipient_roles public.app_role[];
  v_member_id uuid;
  v_investigation_id uuid;
  v_effect text;
  v_point_tier text;
  v_record_type text;
  v_reason text;
  v_description text;
  v_decree_text text;
  v_evidence_summary text;
  v_compensation_evidence text;
  v_violated_articles text[];
  v_aggravating_factors text[];
  v_expected_delta integer := 0;
  v_requested_reward integer := 0;
  v_points_before integer;
  v_points_after integer;
  v_repeat_offense boolean := false;
  v_is_reward boolean := false;
  v_actor_rank integer;
  v_target_rank integer;
  v_sanction_days integer;
  v_sanction_until timestamptz;
  v_profile_before jsonb;
  v_profile_after jsonb;
  v_executive_proposal_id uuid;
  v_recipient_type text;
  v_recipient_profile_id uuid;
  v_requested_tariff_code text;
  v_applied_tariff_code text;
  v_compensation_code text;
  v_base_amount bigint := 0;
  v_compensation_amount bigint := 0;
  v_principal bigint := 0;
  v_tax_basis_points integer := 0;
  v_tax_amount bigint := 0;
  v_total_due bigint := 0;
  v_installment_count integer := 1;
  v_due_days integer := 3;
  v_due_at timestamptz;
  v_independent_outcomes integer := 1;
  v_piece_principal bigint;
  v_piece_tax bigint;
  v_remaining_principal bigint;
  v_remaining_tax bigint;
  v_installment_principal bigint;
  v_installment_tax bigint;
  v_index integer;
  v_direct_dk_removal boolean := false;
begin
  if current_user <> 'service_role' then
    raise exception 'Sunucu yetkisi gerekir.';
  end if;
  if p_actor_profile_id is null or p_payload is null then
    raise exception 'Karar verisi eksik.';
  end if;

  select * into v_actor
  from public.profiles
  where id = p_actor_profile_id
  for update;

  if not found or v_actor.status <> 'active' then
    raise exception 'Aktif karar yetkilisi bulunamadi.';
  end if;

  v_actor_roles := case
    when v_actor.roles is null or cardinality(v_actor.roles) = 0 then array[v_actor.role]
    when v_actor.role = any(v_actor.roles) then v_actor.roles
    else v_actor.roles || v_actor.role
  end;

  if not (v_actor_roles && array[
    'super_admin', 'discipline_chair', 'discipline_vice_chair', 'discipline_member'
  ]::public.app_role[]) then
    raise exception 'Disiplin karari icin DK yetkisi gerekir.';
  end if;

  v_member_id := nullif(p_payload ->> 'memberId', '')::uuid;
  v_investigation_id := nullif(p_payload ->> 'investigationId', '')::uuid;
  v_effect := coalesce(nullif(p_payload ->> 'effect', ''), 'none');
  v_point_tier := coalesce(nullif(p_payload ->> 'pointTier', ''), 'none');
  v_record_type := left(coalesce(nullif(btrim(p_payload ->> 'recordType'), ''), 'Disiplin karari'), 160);
  v_reason := left(coalesce(nullif(btrim(p_payload ->> 'reason'), ''), 'Disiplin kararnamesi'), 500);
  v_description := left(coalesce(nullif(btrim(p_payload ->> 'description'), ''), v_reason), 12000);
  v_decree_text := left(coalesce(btrim(p_payload ->> 'decreeText'), ''), 50000);
  v_evidence_summary := left(coalesce(btrim(p_payload ->> 'acceptedEvidenceSummary'), ''), 12000);
  v_requested_reward := coalesce(nullif(p_payload ->> 'pointDelta', '')::integer, 0);
  v_is_reward := v_effect = 'reward_points' or v_requested_reward > 0;

  if v_effect not in ('none', 'points_only', 'reward_points', 'remove_roles', 'suspend_member', 'party_suspension', 'passive_member') then
    raise exception 'Gecersiz disiplin yaptirimi.';
  end if;

  if v_member_id is null or char_length(v_decree_text) < 10 then
    raise exception 'Ilgili uye ve gerekceli kararname metni zorunludur.';
  end if;

  select * into v_target
  from public.profiles
  where id = v_member_id
  for update;

  if not found or v_target.is_system_account then
    raise exception 'Disiplin hedefi olarak gecerli uye bulunamadi.';
  end if;

  v_target_roles := case
    when v_target.roles is null or cardinality(v_target.roles) = 0 then array[v_target.role]
    when v_target.role = any(v_target.roles) then v_target.roles
    else v_target.roles || v_target.role
  end;

  if v_target_roles && array['super_admin']::public.app_role[] then
    raise exception 'Teknik Admin hesabi disiplin hedefi olamaz.';
  end if;

  v_points_before := least(120, greatest(0, coalesce(v_target.discipline_points, 100)));
  v_actor_rank := private.discipline_rank(v_actor_roles);
  v_target_rank := private.discipline_rank(v_target_roles);

  select coalesce(array_agg(distinct btrim(value)) filter (where btrim(value) <> ''), '{}'::text[])
  into v_violated_articles
  from jsonb_array_elements_text(coalesce(p_payload -> 'violatedArticles', '[]'::jsonb));

  select coalesce(array_agg(distinct btrim(value)) filter (where btrim(value) <> ''), '{}'::text[])
  into v_aggravating_factors
  from jsonb_array_elements_text(coalesce(p_payload -> 'aggravatingFactors', '[]'::jsonb));

  if v_is_reward then
    if not (v_actor_roles && array['super_admin', 'discipline_chair']::public.app_role[]) then
      raise exception 'Odul puanini yalnizca DK Baskani veya teknik Admin verebilir.';
    end if;
    if v_requested_reward < 1 or v_requested_reward > 120 - v_points_before then
      raise exception 'Odul puani 120 ust sinirini asamaz.';
    end if;
    v_expected_delta := v_requested_reward;
    v_points_after := v_points_before + v_expected_delta;
    v_point_tier := 'none';
    v_effect := 'reward_points';
    v_violated_articles := '{}'::text[];
    v_evidence_summary := null;
  else
    if v_investigation_id is null then
      raise exception 'Ceza karari icin once sorusturma secilmelidir.';
    end if;
    if cardinality(v_violated_articles) = 0 or char_length(v_evidence_summary) < 3 then
      raise exception 'Ihlal maddeleri ve kabul edilen delillerin ozeti zorunludur.';
    end if;

    select * into v_investigation
    from public.investigations
    where id = v_investigation_id
    for update;

    if not found or v_investigation.subject_profile_id <> v_member_id then
      raise exception 'Sorusturma ilgili uye ile eslesmiyor.';
    end if;
    if v_investigation.status not in ('open', 'reviewing') then
      raise exception 'Yalnizca acik veya incelemedeki sorusturma karara baglanabilir.';
    end if;
    if not (v_actor_roles && array['super_admin']::public.app_role[])
       and v_investigation.assigned_to is distinct from p_actor_profile_id then
      raise exception 'Karar vermeden once sorusturma sorumlulugu alinmalidir.';
    end if;
    if p_actor_profile_id = v_member_id
       or p_actor_profile_id = any(coalesce(v_investigation.recused_profile_ids, '{}'::uuid[])) then
      raise exception 'Dosyanin tarafi veya cekilmis yetkili bu sorusturmada karar veremez.';
    end if;

    if v_investigation.source_complaint_id is not null then
      select * into v_source_complaint
      from public.complaints
      where id = v_investigation.source_complaint_id;
      if found and p_actor_profile_id in (v_source_complaint.complainant_profile_id, v_source_complaint.accused_profile_id) then
        raise exception 'Sikayetin tarafi bu dosyada karar veremez.';
      end if;
    end if;

    if v_investigation.defense_status = 'pending' then
      raise exception 'Savunma suresi tamamlanmadan karar verilemez.';
    end if;
    if coalesce(v_investigation.hearing_required, false) and v_investigation.hearing_held_at is null then
      raise exception 'Zorunlu durusma tamamlanmadan karar verilemez.';
    end if;

    v_expected_delta := case v_point_tier
      when 'none' then 0
      when 'light_1' then -5
      when 'light_2' then -10
      when 'medium_1' then -15
      when 'medium_2' then -20
      when 'heavy_1' then -25
      when 'heavy_2' then -35
      when 'very_heavy' then -50
      when 'extraordinary' then -60
      else null
    end;
    if v_expected_delta is null then
      raise exception 'Yonetmelige uygun ceza kademesi secilmelidir.';
    end if;

    select exists (
      select 1
      from public.discipline_records previous
      where previous.member_id = v_member_id
        and previous.regulation_version = '2026-07-19'
        and previous.is_effective
        and previous.point_delta < 0
        and previous.violated_articles && v_violated_articles
        and previous.decision_status in ('decided'::public.discipline_status, 'closed'::public.discipline_status)
    ) into v_repeat_offense;

    if v_repeat_offense and v_point_tier <> 'none' then
      v_expected_delta := v_expected_delta - 5;
    end if;
    v_points_after := greatest(0, v_points_before + v_expected_delta);
    if v_effect = 'none' and v_expected_delta <> 0 then
      v_effect := 'points_only';
    end if;
  end if;

  if v_target.status = 'left' and (
    v_expected_delta <> 0
    or v_effect not in ('none', 'points_only')
    or nullif(p_payload ->> 'tariffCode', '') is not null
    or nullif(p_payload ->> 'compensationCode', '') is not null
  ) then
    raise exception 'Ayrilmis uye hakkinda dosya arsiv karariyla sonuclanabilir; yeni puan, gorev veya kredi yaptirimi uygulanamaz.';
  end if;

  v_profile_before := jsonb_build_object(
    'role', v_target.role,
    'roles', v_target_roles,
    'status', v_target.status,
    'discipline_points', v_points_before,
    'committee_id', v_target.committee_id,
    'suspended_until', v_target.suspended_until,
    'suspension_note', v_target.suspension_note
  );

  if v_expected_delta <> 0 then
    update public.profiles
    set discipline_points = v_points_after,
        updated_at = now()
    where id = v_member_id;
  end if;

  if not v_is_reward and v_effect = 'remove_roles' then
    v_direct_dk_removal := (
      v_target_rank > 0
      and (
        v_actor_roles && array['super_admin']::public.app_role[]
        or v_actor_rank > v_target_rank
      )
    );

    if v_direct_dk_removal then
      select coalesce(array_agg(role_name), '{}'::public.app_role[])
      into v_next_roles
      from unnest(v_target_roles) role_name
      where role_name not in ('discipline_chair'::public.app_role, 'discipline_vice_chair'::public.app_role, 'discipline_member'::public.app_role);

      if cardinality(v_next_roles) = 0 then
        v_next_roles := array['member']::public.app_role[];
      elsif not ('member'::public.app_role = any(v_next_roles)) then
        v_next_roles := v_next_roles || 'member'::public.app_role;
      end if;

      update public.profiles
      set roles = v_next_roles,
          role = case
            when 'president'::public.app_role = any(v_next_roles) then 'president'::public.app_role
            when 'vice_president'::public.app_role = any(v_next_roles) then 'vice_president'::public.app_role
            when 'presidential_aide'::public.app_role = any(v_next_roles) then 'presidential_aide'::public.app_role
            when 'spokesperson'::public.app_role = any(v_next_roles) then 'spokesperson'::public.app_role
            when 'chief_representative'::public.app_role = any(v_next_roles) then 'chief_representative'::public.app_role
            when 'representative'::public.app_role = any(v_next_roles) then 'representative'::public.app_role
            when 'credit_officer'::public.app_role = any(v_next_roles) then 'credit_officer'::public.app_role
            else 'member'::public.app_role
          end,
          updated_at = now()
      where id = v_member_id;
    else
      insert into public.governance_proposals(
        proposal_type, title, summary, proposed_content, metadata, proposed_by, status, is_secret
      ) values (
        'executive_decision',
        'Disiplin karari: kalici gorev degerlendirmesi',
        left(v_reason, 1600),
        v_decree_text,
        jsonb_build_object(
          'source', 'discipline_20260719',
          'member_id', v_member_id,
          'investigation_id', v_investigation_id,
          'requested_effect', v_effect
        ),
        p_actor_profile_id,
        'collecting_support',
        true
      ) returning id into v_executive_proposal_id;
      v_effect := 'executive_proposal';
    end if;
  elsif not v_is_reward and v_effect in ('suspend_member', 'party_suspension') then
    if not (v_actor_roles && array['super_admin', 'discipline_chair']::public.app_role[]) then
      raise exception 'Gecici tedbiri yalnizca DK Baskani veya teknik Admin uygulayabilir.';
    end if;
    v_sanction_days := coalesce(nullif(p_payload ->> 'sanctionDays', '')::integer, 1);
    if v_sanction_days < 1 or v_sanction_days > 365 then
      raise exception 'Uzaklastirma suresi 1-365 gun arasinda olmalidir.';
    end if;
    v_sanction_until := now() + make_interval(days => v_sanction_days);
    update public.profiles
    set status = 'suspended',
        suspended_until = v_sanction_until,
        suspension_note = v_decree_text,
        updated_at = now()
    where id = v_member_id;

    insert into public.discipline_temporary_measures(
      investigation_id, member_id, measure_type, reason, created_by, profile_before
    ) values (
      v_investigation_id, v_member_id, 'membership_suspension', v_decree_text,
      p_actor_profile_id, v_profile_before
    );
  elsif not v_is_reward and v_effect = 'passive_member' then
    insert into public.governance_proposals(
      proposal_type, title, summary, proposed_content, metadata, proposed_by, status, is_secret
    ) values (
      'executive_decision',
      'Disiplin karari: uyelik durumu degerlendirmesi',
      left(v_reason, 1600),
      v_decree_text,
      jsonb_build_object(
        'source', 'discipline_20260719',
        'member_id', v_member_id,
        'investigation_id', v_investigation_id,
        'requested_effect', v_effect
      ),
      p_actor_profile_id,
      'collecting_support',
      true
    ) returning id into v_executive_proposal_id;
    v_effect := 'executive_proposal';
  end if;

  if not v_is_reward and (v_point_tier = 'extraordinary' or v_points_after = 0) and v_executive_proposal_id is null then
    insert into public.governance_proposals(
      proposal_type, title, summary, proposed_content, metadata, proposed_by, status, is_secret
    ) values (
      'executive_decision',
      'Disiplin karari: uyelikten cikarma onerisi',
      left(v_reason, 1600),
      v_decree_text,
      jsonb_build_object(
        'source', 'discipline_20260719',
        'member_id', v_member_id,
        'investigation_id', v_investigation_id,
        'point_tier', v_point_tier,
        'points_after', v_points_after
      ),
      p_actor_profile_id,
      'collecting_support',
      true
    ) returning id into v_executive_proposal_id;
  end if;

  v_requested_tariff_code := nullif(upper(btrim(p_payload ->> 'tariffCode')), '');
  v_compensation_code := nullif(upper(btrim(p_payload ->> 'compensationCode')), '');
  v_compensation_evidence := left(coalesce(btrim(p_payload ->> 'compensationEvidence'), ''), 12000);
  v_independent_outcomes := coalesce(nullif(p_payload ->> 'independentHeavyOutcomes', '')::integer, 1);

  if not v_is_reward and v_requested_tariff_code is not null then
    select * into v_tariff
    from public.discipline_credit_tariffs
    where code = v_requested_tariff_code;
    if not found then
      raise exception 'Gecerli kredi ceza tarifesi bulunamadi.';
    end if;

    if cardinality(v_aggravating_factors) >= 2 and v_tariff.next_code is not null then
      select * into v_next_tariff
      from public.discipline_credit_tariffs
      where code = v_tariff.next_code;
      v_tariff := v_next_tariff;
    end if;
    v_applied_tariff_code := v_tariff.code;
    v_base_amount := v_tariff.amount;
  end if;

  if not v_is_reward and v_compensation_code is not null then
    select * into v_compensation
    from public.discipline_compensation_tariffs
    where code = v_compensation_code;
    if not found then
      raise exception 'Gecerli tazminat zarar kademesi bulunamadi.';
    end if;
    if char_length(v_compensation_evidence) < 10 then
      raise exception 'Tazminat icin dogrulanabilir zarar aciklamasi zorunludur.';
    end if;
    if v_independent_outcomes < v_compensation.minimum_independent_outcomes then
      raise exception 'Secilen tazminat icin yeterli bagimsiz agir zarar sonucu bulunmuyor.';
    end if;
    v_compensation_amount := v_compensation.amount;
  end if;

  v_principal := v_base_amount + v_compensation_amount;
  if v_principal > 0 then
    v_recipient_type := nullif(lower(btrim(p_payload ->> 'recipientType')), '');
    v_recipient_profile_id := nullif(p_payload ->> 'recipientProfileId', '')::uuid;

    if v_requested_tariff_code is not null then
      if v_tariff.recipient_mode = 'victim' then
        v_recipient_type := 'victim';
      elsif v_tariff.recipient_mode = 'system' then
        v_recipient_type := 'system';
      elsif v_recipient_type not in ('victim', 'system') then
        raise exception 'Karma tarifede magdur veya sistem alicisi secilmelidir.';
      end if;
    elsif v_recipient_type not in ('victim', 'system') then
      raise exception 'Tazminat alicisi secilmelidir.';
    end if;

    if v_recipient_type = 'victim' then
      if v_recipient_profile_id is null or v_recipient_profile_id = v_member_id then
        raise exception 'Gecerli magdur hesabi secilmelidir.';
      end if;
      select * into v_recipient_profile
      from public.profiles
      where id = v_recipient_profile_id
        and not is_system_account
        and status in ('active', 'passive', 'suspended')
      for update;
      if not found then
        raise exception 'Magdur profili bulunamadi.';
      end if;
      v_recipient_roles := case
        when v_recipient_profile.roles is null or cardinality(v_recipient_profile.roles) = 0 then array[v_recipient_profile.role]
        when v_recipient_profile.role = any(v_recipient_profile.roles) then v_recipient_profile.roles
        else v_recipient_profile.roles || v_recipient_profile.role
      end;
      if v_recipient_profile_id = p_actor_profile_id
         or v_recipient_profile_id = v_investigation.assigned_to
         or v_recipient_roles && array['discipline_chair', 'discipline_vice_chair', 'discipline_member']::public.app_role[] then
        raise exception 'DK gorevlisi veya karar verici finansal odeme alicisi olamaz.';
      end if;
      v_recipient_account := private.ensure_20260719_credit_account(v_recipient_profile_id);
    else
      v_recipient_profile_id := null;
    end if;

    select coalesce(transfer_tax_basis_points, 0)
    into v_tax_basis_points
    from public.credit_settings
    where id = 'main';
    v_tax_basis_points := least(5000, greatest(0, coalesce(v_tax_basis_points, 0)));
    v_tax_amount := ceil(v_principal::numeric * v_tax_basis_points / 10000)::bigint;
    v_total_due := v_principal + v_tax_amount;
    v_installment_count := coalesce(nullif(p_payload ->> 'financialInstallments', '')::integer, 1);
    v_due_days := 3;
    if v_installment_count < 1 or v_installment_count > 3 then
      raise exception 'Finansal borc en fazla uc taksit olabilir.';
    end if;
    v_due_at := now() + make_interval(days => v_due_days);
    v_debtor_account := private.ensure_20260719_credit_account(v_member_id);
  end if;

  select jsonb_build_object(
    'role', p.role,
    'roles', p.roles,
    'status', p.status,
    'discipline_points', p.discipline_points,
    'committee_id', p.committee_id,
    'suspended_until', p.suspended_until,
    'suspension_note', p.suspension_note
  ) into v_profile_after
  from public.profiles p
  where p.id = v_member_id;

  insert into public.discipline_records(
    member_id,
    record_type,
    reason,
    description,
    evidence_note,
    severity,
    decision_status,
    action_taken,
    decree_text,
    privacy_level,
    created_by,
    investigation_id,
    point_delta,
    points_before,
    points_after,
    sanction_effect,
    sanction_days,
    sanction_until,
    regulation_version,
    point_tier,
    repeat_offense,
    violated_articles,
    accepted_evidence_summary,
    expulsion_proposal_required,
    profile_before,
    profile_after,
    credit_fine_amount,
    credit_fine_installments,
    financial_tariff_code,
    financial_base_amount,
    financial_aggravating_factors,
    financial_recipient_type,
    financial_recipient_profile_id,
    compensation_code,
    compensation_amount,
    compensation_evidence,
    financial_tax_basis_points,
    financial_tax_amount,
    financial_due_at,
    financial_decision_summary,
    executive_proposal_id
  ) values (
    v_member_id,
    v_record_type,
    v_reason,
    v_description,
    v_evidence_summary,
    case
      when v_point_tier in ('very_heavy', 'extraordinary') then 'high'
      when v_point_tier in ('heavy_1', 'heavy_2') then 'high'
      when v_point_tier in ('medium_1', 'medium_2') then 'medium'
      else 'low'
    end,
    'decided',
    v_decree_text,
    v_decree_text,
    'restricted',
    p_actor_profile_id,
    v_investigation_id,
    v_expected_delta,
    v_points_before,
    v_points_after,
    v_effect,
    v_sanction_days,
    v_sanction_until,
    '2026-07-19',
    v_point_tier,
    v_repeat_offense,
    v_violated_articles,
    v_evidence_summary,
    (not v_is_reward and (v_point_tier = 'extraordinary' or v_points_after = 0)),
    v_profile_before,
    v_profile_after,
    v_base_amount,
    v_installment_count,
    v_applied_tariff_code,
    v_base_amount,
    v_aggravating_factors,
    v_recipient_type,
    v_recipient_profile_id,
    v_compensation_code,
    v_compensation_amount,
    nullif(v_compensation_evidence, ''),
    v_tax_basis_points,
    v_tax_amount,
    v_due_at,
    case when v_principal > 0 then left(
      format(
        'Tarife: %s; temel: %s; tazminat: %s; vergi: %s; toplam: %s; alici: %s; vade: %s; taksit: %s',
        coalesce(v_applied_tariff_code, 'yok'), v_base_amount, v_compensation_amount,
        v_tax_amount, v_total_due, v_recipient_type, v_due_at, v_installment_count
      ),
      4000
    ) else null end,
    v_executive_proposal_id
  ) returning * into v_record;

  if v_principal > 0 then
    insert into public.credit_loans(
      account_id,
      principal,
      interest_basis_points,
      total_due,
      paid_amount,
      term_days,
      installment_count,
      status,
      decided_by,
      decided_at,
      decision_note,
      due_at,
      source,
      discipline_record_id,
      created_by,
      regulation_version,
      tariff_code,
      base_amount,
      aggravating_factors,
      compensation_code,
      compensation_amount,
      recipient_type,
      recipient_profile_id,
      tax_basis_points,
      tax_amount,
      original_due_at
    ) values (
      v_debtor_account.id,
      v_principal,
      0,
      v_total_due,
      0,
      v_due_days + ((v_installment_count - 1) * 7),
      v_installment_count,
      'approved',
      p_actor_profile_id,
      now(),
      left(v_decree_text, 600),
      v_due_at + make_interval(days => (v_installment_count - 1) * 7),
      'discipline_fine',
      v_record.id,
      p_actor_profile_id,
      '2026-07-19',
      v_applied_tariff_code,
      v_base_amount,
      v_aggravating_factors,
      v_compensation_code,
      v_compensation_amount,
      v_recipient_type,
      v_recipient_profile_id,
      v_tax_basis_points,
      v_tax_amount,
      v_due_at
    ) returning * into v_loan;

    v_piece_principal := ceil(v_principal::numeric / v_installment_count)::bigint;
    v_piece_tax := ceil(v_tax_amount::numeric / v_installment_count)::bigint;
    v_remaining_principal := v_principal;
    v_remaining_tax := v_tax_amount;

    for v_index in 1..v_installment_count loop
      v_installment_principal := least(v_piece_principal, v_remaining_principal);
      v_installment_tax := least(v_piece_tax, v_remaining_tax);
      insert into public.credit_installments(
        loan_id,
        installment_no,
        amount,
        due_at,
        principal_amount,
        tax_amount,
        recipient_amount
      ) values (
        v_loan.id,
        v_index,
        v_installment_principal + v_installment_tax,
        v_due_at + make_interval(days => (v_index - 1) * 7),
        v_installment_principal,
        v_installment_tax,
        v_installment_principal
      );
      v_remaining_principal := v_remaining_principal - v_installment_principal;
      v_remaining_tax := v_remaining_tax - v_installment_tax;
    end loop;

    update public.discipline_records
    set credit_fine_debt_id = v_loan.id
    where id = v_record.id
    returning * into v_record;
  end if;

  insert into public.notifications(recipient_id, actor_id, title, body, category, link)
  values (
    v_member_id,
    p_actor_profile_id,
    case when v_is_reward then 'Odul puani kaydedildi' else 'Disiplin kararnamesi yazildi' end,
    case when v_is_reward then
      format('+%s puan verildi. Guncel disiplin puani: %s.', v_expected_delta, v_points_after)
    else
      format(
        'Karar %s dosyasina kaydedildi. Puan: %s -> %s. Finansal borc: %s kredi.',
        coalesce(v_investigation.case_number, v_investigation_id::text),
        v_points_before,
        v_points_after,
        v_total_due
      )
    end,
    case when v_is_reward then 'reward' else 'discipline' end,
    'https://dk.ihp.org.tr/#/portal/discipline'
  );

  insert into public.audit_logs(action, actor_id, target_type, target_id, details)
  values (
    'discipline_decision_20260719',
    p_actor_profile_id,
    'discipline_records',
    v_record.id::text,
    jsonb_build_object(
      'summary', case when v_is_reward then 'Odul puani kaydedildi' else '19.07.2026 yonetmeligine gore disiplin karari uygulandi' end,
      'member_id', v_member_id,
      'investigation_id', v_investigation_id,
      'point_tier', v_point_tier,
      'point_delta', v_expected_delta,
      'tariff_code', v_applied_tariff_code,
      'credit_loan_id', v_loan.id,
      'executive_proposal_id', v_executive_proposal_id
    )
  );

  return jsonb_build_object(
    'record', to_jsonb(v_record),
    'loan', case when v_loan.id is null then null else to_jsonb(v_loan) end,
    'points', jsonb_build_object('before', v_points_before, 'after', v_points_after, 'delta', v_expected_delta),
    'executiveProposalId', v_executive_proposal_id
  );
end;
$$;

revoke all on function public.apply_20260719_discipline_decision(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.apply_20260719_discipline_decision(uuid, jsonb) to service_role;

-- Accepted appeals reverse the effective decision. If a recipient cannot repay
-- an already collected amount immediately, the refund remains an explicit
-- institutional receivable instead of disappearing from the record.
create table if not exists public.discipline_credit_refunds (
  id uuid primary key default gen_random_uuid(),
  discipline_record_id uuid not null references public.discipline_records(id) on delete restrict,
  credit_loan_id uuid not null references public.credit_loans(id) on delete restrict,
  debtor_profile_id uuid not null references public.profiles(id) on delete restrict,
  recipient_type text not null check (recipient_type in ('victim', 'system')),
  recipient_profile_id uuid references public.profiles(id) on delete restrict,
  principal_amount bigint not null default 0 check (principal_amount >= 0),
  tax_amount bigint not null default 0 check (tax_amount >= 0),
  refunded_amount bigint not null default 0 check (refunded_amount >= 0),
  outstanding_amount bigint not null default 0 check (outstanding_amount >= 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  note text not null default '',
  unique (discipline_record_id)
);

alter table public.discipline_credit_refunds enable row level security;
revoke all on public.discipline_credit_refunds from anon, authenticated;
grant select on public.discipline_credit_refunds to authenticated;
grant all on public.discipline_credit_refunds to service_role;

drop policy if exists discipline_credit_refunds_select_authorized on public.discipline_credit_refunds;
create policy discipline_credit_refunds_select_authorized
  on public.discipline_credit_refunds for select to authenticated
  using (
    debtor_profile_id = (select auth.uid())
    or recipient_profile_id = (select auth.uid())
    or private.has_any_role(array['super_admin', 'discipline_chair']::public.app_role[])
  );

drop index if exists public.discipline_records_one_per_investigation_idx;
create unique index discipline_records_one_effective_per_investigation_idx
  on public.discipline_records(investigation_id)
  where investigation_id is not null and is_effective;

create or replace function private.reverse_20260719_discipline_decision(
  p_record_id uuid,
  p_actor_profile_id uuid,
  p_reason text,
  p_reopen_investigation boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_record public.discipline_records%rowtype;
  v_profile public.profiles%rowtype;
  v_loan public.credit_loans%rowtype;
  v_debtor public.credit_accounts%rowtype;
  v_recipient public.credit_accounts%rowtype;
  v_treasury public.institutional_credit_treasury%rowtype;
  v_before_roles public.app_role[];
  v_after_roles public.app_role[];
  v_refund_principal bigint := 0;
  v_refund_tax bigint := 0;
  v_available_principal bigint := 0;
  v_available_tax bigint := 0;
  v_refunded bigint := 0;
  v_outstanding bigint := 0;
  v_balance_after bigint;
begin
  select * into v_record
  from public.discipline_records
  where id = p_record_id
  for update;
  if not found or v_record.regulation_version <> '2026-07-19' or not v_record.is_effective then
    raise exception 'Geri alinabilir etkin disiplin karari bulunamadi.';
  end if;

  select * into v_profile
  from public.profiles
  where id = v_record.member_id
  for update;
  if not found then
    raise exception 'Kararin ilgili uyesi bulunamadi.';
  end if;

  if coalesce(v_record.point_delta, 0) <> 0 then
    update public.profiles
    set discipline_points = least(
          120,
          greatest(0, discipline_points + (coalesce(v_record.points_before, discipline_points) - coalesce(v_record.points_after, discipline_points)))
        ),
        updated_at = now()
    where id = v_record.member_id;
  end if;

  if v_record.sanction_effect = 'remove_roles'
     and v_record.profile_before is not null
     and v_record.profile_after is not null then
    select coalesce(array_agg(value::public.app_role), '{}'::public.app_role[])
    into v_before_roles
    from jsonb_array_elements_text(coalesce(v_record.profile_before -> 'roles', '[]'::jsonb));
    select coalesce(array_agg(value::public.app_role), '{}'::public.app_role[])
    into v_after_roles
    from jsonb_array_elements_text(coalesce(v_record.profile_after -> 'roles', '[]'::jsonb));

    if v_profile.roles = v_after_roles and cardinality(v_before_roles) > 0 then
      update public.profiles
      set roles = v_before_roles,
          role = coalesce(nullif(v_record.profile_before ->> 'role', '')::public.app_role, v_profile.role),
          updated_at = now()
      where id = v_record.member_id;
    end if;
  end if;

  if v_record.sanction_effect in ('suspend_member', 'party_suspension')
     and v_profile.status = 'suspended'::public.member_status
     and v_record.profile_before is not null then
    update public.profiles
    set status = coalesce(nullif(v_record.profile_before ->> 'status', '')::public.member_status, 'active'::public.member_status),
        suspended_until = nullif(v_record.profile_before ->> 'suspended_until', '')::timestamptz,
        suspension_note = coalesce(v_record.profile_before ->> 'suspension_note', ''),
        updated_at = now()
    where id = v_record.member_id;

    update public.discipline_temporary_measures
    set status = 'revoked',
        decided_by = p_actor_profile_id,
        decided_at = now(),
        decision_note = left(coalesce(p_reason, 'Itiraz kabul edildi.'), 2000)
    where investigation_id = v_record.investigation_id
      and member_id = v_record.member_id
      and status in ('pending_executive', 'approved');
  end if;

  if v_record.credit_fine_debt_id is not null then
    select * into v_loan
    from public.credit_loans
    where id = v_record.credit_fine_debt_id
    for update;

    if found then
      select coalesce(sum(principal_amount), 0), coalesce(sum(tax_amount), 0)
      into v_refund_principal, v_refund_tax
      from public.credit_installments
      where loan_id = v_loan.id and status = 'paid';

      update public.credit_installments
      set status = case when status = 'paid' then 'refunded' else 'cancelled' end
      where loan_id = v_loan.id and status in ('pending', 'delinquent', 'paid');

      select * into v_debtor
      from public.credit_accounts
      where id = v_loan.account_id
      for update;

      if v_refund_principal > 0 and v_loan.recipient_type = 'victim' then
        select * into v_recipient
        from public.credit_accounts
        where profile_id = v_loan.recipient_profile_id
        for update;
        if found then
          v_available_principal := least(v_refund_principal, v_recipient.balance);
          if v_available_principal > 0 then
            update public.credit_accounts
            set balance = balance - v_available_principal,
                updated_at = now()
            where id = v_recipient.id;
            insert into public.credit_transactions(account_id, counterparty_account_id, kind, amount, balance_after, reference, metadata)
            values (
              v_recipient.id, v_debtor.id, 'discipline_refund', v_available_principal,
              v_recipient.balance - v_available_principal,
              'Kabul edilen disiplin itirazi iadesi',
              jsonb_build_object('record_id', v_record.id, 'loan_id', v_loan.id, 'direction', 'out')
            );
          end if;
        end if;
      elsif v_refund_principal > 0 and v_loan.recipient_type = 'system' then
        select * into v_treasury
        from public.institutional_credit_treasury
        where id = 'main'
        for update;
        v_available_principal := least(v_refund_principal, v_treasury.balance);
        if v_available_principal > 0 then
          update public.institutional_credit_treasury
          set balance = balance - v_available_principal, updated_at = now()
          where id = 'main';
          insert into public.institutional_credit_ledger(amount, balance_after, entry_type, discipline_record_id, credit_loan_id, metadata)
          values (
            -v_available_principal, v_treasury.balance - v_available_principal,
            'discipline_refund', v_record.id, v_loan.id,
            jsonb_build_object('component', 'principal')
          );
        end if;
      end if;

      select * into v_treasury
      from public.institutional_credit_treasury
      where id = 'main'
      for update;
      v_available_tax := least(v_refund_tax, v_treasury.balance);
      if v_available_tax > 0 then
        update public.institutional_credit_treasury
        set balance = balance - v_available_tax, updated_at = now()
        where id = 'main';
        insert into public.institutional_credit_ledger(amount, balance_after, entry_type, discipline_record_id, credit_loan_id, metadata)
        values (
          -v_available_tax, v_treasury.balance - v_available_tax,
          'discipline_refund', v_record.id, v_loan.id,
          jsonb_build_object('component', 'tax')
        );
      end if;

      v_refunded := v_available_principal + v_available_tax;
      v_outstanding := (v_refund_principal + v_refund_tax) - v_refunded;
      if v_refunded > 0 then
        update public.credit_accounts
        set balance = balance + v_refunded,
            updated_at = now()
        where id = v_debtor.id
        returning balance into v_balance_after;
        insert into public.credit_transactions(account_id, kind, amount, balance_after, reference, metadata)
        values (
          v_debtor.id, 'discipline_refund', v_refunded, v_balance_after,
          'Kabul edilen disiplin itirazi iadesi',
          jsonb_build_object('record_id', v_record.id, 'loan_id', v_loan.id, 'direction', 'in')
        );
      end if;

      insert into public.discipline_credit_refunds(
        discipline_record_id,
        credit_loan_id,
        debtor_profile_id,
        recipient_type,
        recipient_profile_id,
        principal_amount,
        tax_amount,
        refunded_amount,
        outstanding_amount,
        status,
        created_by,
        paid_at,
        note
      ) values (
        v_record.id,
        v_loan.id,
        v_record.member_id,
        v_loan.recipient_type,
        v_loan.recipient_profile_id,
        v_refund_principal,
        v_refund_tax,
        v_refunded,
        v_outstanding,
        case when v_outstanding = 0 then 'paid' else 'pending' end,
        p_actor_profile_id,
        case when v_outstanding = 0 then now() else null end,
        left(coalesce(p_reason, ''), 2000)
      )
      on conflict (discipline_record_id) do update
      set refunded_amount = excluded.refunded_amount,
          outstanding_amount = excluded.outstanding_amount,
          status = excluded.status,
          paid_at = excluded.paid_at,
          note = excluded.note;

      update public.credit_loans
      set status = 'reversed',
          reversed_at = now(),
          reversed_by = p_actor_profile_id,
          reversal_reason = left(coalesce(p_reason, ''), 2000),
          refunded_amount = v_refunded
      where id = v_loan.id;

      update public.credit_accounts
      set transfer_restricted = false,
          transfer_restriction_reason = '',
          updated_at = now()
      where id = v_loan.account_id
        and not exists (
          select 1
          from public.credit_loans other_loan
          where other_loan.account_id = v_loan.account_id
            and other_loan.id <> v_loan.id
            and other_loan.source = 'discipline_fine'
            and other_loan.regulation_version = '2026-07-19'
            and other_loan.status = 'delinquent'
        );
    end if;
  end if;

  update public.discipline_records
  set is_effective = false,
      reversed_at = now(),
      reversed_by = p_actor_profile_id,
      reversal_reason = left(coalesce(p_reason, ''), 2000),
      archived = true,
      decision_status = 'closed'
  where id = v_record.id;

  if p_reopen_investigation and v_record.investigation_id is not null then
    update public.investigations
    set status = 'reviewing',
        decided_by = null,
        decided_at = null,
        decision_note = 'Itiraz kabul edildi; dosya yeniden incelemeye gonderildi.',
        updated_at = now()
    where id = v_record.investigation_id;
  end if;

  return jsonb_build_object(
    'recordId', v_record.id,
    'refunded', v_refunded,
    'refundOutstanding', v_outstanding,
    'investigationReopened', p_reopen_investigation
  );
end;
$$;

create or replace function public.manage_20260719_discipline_appeal(
  p_actor_profile_id uuid,
  p_record_id uuid,
  p_action text,
  p_text text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_record public.discipline_records%rowtype;
  v_actor_roles public.app_role[];
  v_required_role public.app_role;
  v_reversal jsonb;
begin
  if current_user <> 'service_role' then
    raise exception 'Sunucu yetkisi gerekir.';
  end if;
  if p_action not in ('appeal', 'accept', 'reject', 'remand') then
    raise exception 'Gecersiz itiraz islemi.';
  end if;
  if char_length(btrim(coalesce(p_text, ''))) < 10 then
    raise exception 'Itiraz veya karar gerekcesi en az on karakter olmalidir.';
  end if;

  select * into v_actor from public.profiles where id = p_actor_profile_id for update;
  if not found or v_actor.status <> 'active' then
    raise exception 'Aktif yetkili bulunamadi.';
  end if;
  v_actor_roles := case
    when v_actor.roles is null or cardinality(v_actor.roles) = 0 then array[v_actor.role]
    when v_actor.role = any(v_actor.roles) then v_actor.roles
    else v_actor.roles || v_actor.role
  end;

  select * into v_record
  from public.discipline_records
  where id = p_record_id
  for update;
  if not found or v_record.regulation_version <> '2026-07-19' then
    raise exception '19.07.2026 yonetmeligine tabi disiplin karari bulunamadi.';
  end if;

  if p_action = 'appeal' then
    if v_record.member_id <> p_actor_profile_id then
      raise exception 'Yalnizca kendi disiplin karariniza itiraz edebilirsiniz.';
    end if;
    if v_record.sanction_effect = 'reward_points' or v_record.point_delta > 0 then
      raise exception 'Odul puani kaydina itiraz edilemez.';
    end if;
    if not v_record.is_effective or v_record.decision_status <> 'decided'::public.discipline_status
       or v_record.appeal_status <> 'none' then
      raise exception 'Bu karar icin yeni itiraz acilamaz.';
    end if;
    if v_record.appeal_authority_role is null then
      raise exception 'DK Baskani karari kurum ici disiplin hiyerarsisinde kesindir.';
    end if;
    if v_record.appeal_deadline is null or v_record.appeal_deadline < now() then
      raise exception 'Uc gunluk itiraz suresi sona ermistir.';
    end if;

    update public.discipline_records
    set appeal_text = left(btrim(p_text), 4000),
        appeal_status = 'submitted',
        appealed_at = now(),
        decision_status = 'appealed'
    where id = p_record_id;

    return jsonb_build_object('recordId', p_record_id, 'appealStatus', 'submitted');
  end if;

  if v_record.appeal_status <> 'submitted' then
    raise exception 'Karara baglanacak acik itiraz bulunmuyor.';
  end if;

  v_required_role := nullif(v_record.appeal_authority_role, '')::public.app_role;
  if not (v_actor_roles && array['super_admin']::public.app_role[])
     and (v_required_role is null or not (v_required_role = any(v_actor_roles))) then
    raise exception 'Bu itirazi yalnizca kayitta belirtilen ust DK makami karara baglayabilir.';
  end if;

  if p_action = 'reject' then
    update public.discipline_records
    set appeal_status = 'rejected',
        appeal_decision_note = left(btrim(p_text), 4000),
        appeal_decided_by = p_actor_profile_id,
        appeal_decided_at = now(),
        decision_status = 'closed'
    where id = p_record_id;
    return jsonb_build_object('recordId', p_record_id, 'appealStatus', 'rejected');
  end if;

  v_reversal := private.reverse_20260719_discipline_decision(
    p_record_id,
    p_actor_profile_id,
    p_text,
    p_action = 'remand'
  );

  update public.discipline_records
  set appeal_status = 'accepted',
      appeal_decision_note = left(btrim(p_text), 4000),
      appeal_decided_by = p_actor_profile_id,
      appeal_decided_at = now(),
      decision_status = 'closed'
  where id = p_record_id;

  return v_reversal || jsonb_build_object(
    'appealStatus', 'accepted',
    'outcome', case when p_action = 'remand' then 'remanded' else 'cancelled' end
  );
end;
$$;

revoke all on function private.reverse_20260719_discipline_decision(uuid, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.manage_20260719_discipline_appeal(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function private.reverse_20260719_discipline_decision(uuid, uuid, text, boolean) to service_role;
grant execute on function public.manage_20260719_discipline_appeal(uuid, uuid, text, text) to service_role;

-- Current-version case files are visible only to a party, the assigned
-- official, an authorised representative, the DK Chair and technical Admin.
create or replace function private.can_access_20260719_discipline_case(
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
        and (
          c.complainant_profile_id = v_uid
          or c.accused_profile_id = v_uid
          or c.assigned_to = v_uid
          or (
            c.regulation_version <> '2026-07-19'
            and private.has_any_role(array['discipline_vice_chair', 'discipline_member']::public.app_role[])
          )
        )
    );
  end if;

  if p_investigation_id is not null then
    return exists (
      select 1
      from public.investigations i
      left join public.complaints c on c.id = i.source_complaint_id
      where i.id = p_investigation_id
        and (
          i.subject_profile_id = v_uid
          or i.assigned_to = v_uid
          or c.complainant_profile_id = v_uid
          or c.accused_profile_id = v_uid
          or exists (
            select 1
            from public.discipline_case_representatives r
            where r.investigation_id = i.id
              and r.representative_id = v_uid
              and r.revoked_at is null
          )
          or (
            i.regulation_version <> '2026-07-19'
            and private.has_any_role(array['discipline_vice_chair', 'discipline_member']::public.app_role[])
          )
        )
    );
  end if;

  if p_discipline_record_id is not null then
    return exists (
      select 1
      from public.discipline_records d
      left join public.investigations i on i.id = d.investigation_id
      left join public.complaints c on c.id = i.source_complaint_id
      where d.id = p_discipline_record_id
        and (
          d.member_id = v_uid
          or d.created_by = v_uid
          or i.assigned_to = v_uid
          or c.complainant_profile_id = v_uid
          or c.accused_profile_id = v_uid
          or (
            d.appeal_authority_role = 'discipline_vice_chair'
            and private.has_any_role(array['discipline_vice_chair']::public.app_role[])
          )
          or exists (
            select 1
            from public.discipline_case_representatives r
            where r.investigation_id = i.id
              and r.representative_id = v_uid
              and r.revoked_at is null
          )
          or (
            d.regulation_version <> '2026-07-19'
            and private.has_any_role(array['discipline_vice_chair', 'discipline_member']::public.app_role[])
          )
        )
    );
  end if;

  return false;
end;
$$;

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
  );
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
      select 1 from public.complaints c
      where c.id = p_complaint_id and c.complainant_profile_id = v_uid
    );
  end if;
  if p_investigation_id is not null then
    return exists (
      select 1 from public.investigations i
      where i.id = p_investigation_id
        and (i.subject_profile_id = v_uid or i.assigned_to = v_uid)
    );
  end if;
  if p_discipline_record_id is not null then
    return exists (
      select 1 from public.discipline_records d
      left join public.investigations i on i.id = d.investigation_id
      where d.id = p_discipline_record_id
        and (d.created_by = v_uid or i.assigned_to = v_uid)
    );
  end if;
  return false;
end;
$$;

revoke all on function private.can_access_20260719_discipline_case(uuid, uuid, uuid) from public, anon;
revoke all on function private.can_access_case_attachment(uuid, uuid, uuid) from public, anon;
revoke all on function private.can_add_case_attachment(uuid, uuid, uuid) from public, anon;
grant execute on function private.can_access_20260719_discipline_case(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function private.can_access_case_attachment(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function private.can_add_case_attachment(uuid, uuid, uuid) to authenticated, service_role;

drop policy if exists complaints_select_authorized on public.complaints;
create policy complaints_select_authorized
  on public.complaints for select to authenticated
  using (private.can_access_20260719_discipline_case(id, null, null));

drop policy if exists investigations_select_authorized on public.investigations;
create policy investigations_select_authorized
  on public.investigations for select to authenticated
  using (private.can_access_20260719_discipline_case(null, id, null));

drop policy if exists discipline_select_own_or_authorized on public.discipline_records;
create policy discipline_select_own_or_authorized
  on public.discipline_records for select to authenticated
  using (private.can_access_20260719_discipline_case(null, null, id));

revoke insert, update on public.complaints, public.investigations, public.discipline_records from anon, authenticated;

-- Credit-system complaints are generated by the scheduler, while member
-- complaints continue to come exclusively through the DK endpoint.
alter table public.complaints
  drop constraint if exists complaints_source_channel_allowed;
alter table public.complaints
  add constraint complaints_source_channel_allowed
    check (source_channel in ('legacy', 'dk_portal', 'credit_system'));

create or replace function private.prepare_20260719_credit_complaint()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() = 'service_role'
     and new.subject ilike 'IHP Kredi Sistemi%' then
    new.regulation_version := '2026-07-19';
    new.source_channel := 'credit_system';
    new.event_date := coalesce(new.event_date, current_date);
    new.learned_at := coalesce(new.learned_at, current_date);
    new.evidence_note := coalesce(nullif(btrim(new.evidence_note), ''), 'Kredi taksiti ve sistem vade kaydi.');
    new.requested_outcome := coalesce(nullif(btrim(new.requested_outcome), ''), 'Geciken odemenin disiplin yonetmeligine gore incelenmesi.');
  end if;
  return new;
end;
$$;

revoke all on function private.prepare_20260719_credit_complaint() from public, anon, authenticated;
grant execute on function private.prepare_20260719_credit_complaint() to service_role;

drop trigger if exists prepare_20260719_credit_complaint on public.complaints;
create trigger prepare_20260719_credit_complaint
  before insert on public.complaints
  for each row execute function private.prepare_20260719_credit_complaint();

-- Manual installment payment distributes the principal to the recorded
-- victim or institutional treasury and books tax separately.
create or replace function public.pay_credit_installment(p_profile_id uuid, p_installment_id uuid)
returns public.credit_installments
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_settings public.credit_settings%rowtype;
  v_installment public.credit_installments%rowtype;
  v_loan public.credit_loans%rowtype;
  v_account public.credit_accounts%rowtype;
  v_recipient public.credit_accounts%rowtype;
  v_treasury_balance bigint;
  v_kind text;
  v_reference text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Sunucu yetkisi gerekir.';
  end if;
  select * into v_settings from public.credit_settings where id = 'main';
  if not v_settings.member_access_enabled then
    raise exception 'Kredi sistemi uyelere henuz acik degil.';
  end if;

  select i.* into v_installment
  from public.credit_installments i
  join public.credit_loans l on l.id = i.loan_id
  join public.credit_accounts a on a.id = l.account_id
  join public.profiles p on p.id = a.profile_id
  where i.id = p_installment_id
    and a.profile_id = p_profile_id
    and a.status = 'active'
    and p.status = 'active'
  for update of i;
  if not found or v_installment.status not in ('pending', 'delinquent') then
    raise exception 'Odenebilir taksit bulunamadi.';
  end if;

  select * into v_loan from public.credit_loans where id = v_installment.loan_id for update;
  select * into v_account from public.credit_accounts where id = v_loan.account_id for update;
  if v_account.balance < v_installment.amount then
    raise exception 'Taksit icin bakiye yetersiz.';
  end if;

  update public.credit_accounts
  set balance = balance - v_installment.amount, updated_at = now()
  where id = v_account.id;

  if v_loan.source = 'discipline_fine' and v_loan.regulation_version = '2026-07-19' then
    if v_loan.recipient_type = 'victim' and v_installment.principal_amount > 0 then
      v_recipient := private.ensure_20260719_credit_account(v_loan.recipient_profile_id);
      update public.credit_accounts
      set balance = balance + v_installment.principal_amount, updated_at = now()
      where id = v_recipient.id;
      insert into public.credit_transactions(
        account_id, counterparty_account_id, kind, amount, balance_after, reference, metadata
      ) values (
        v_recipient.id, v_account.id, 'discipline_compensation_receipt',
        v_installment.principal_amount, v_recipient.balance + v_installment.principal_amount,
        'Disiplin karari odemesi ' || v_installment.id::text,
        jsonb_build_object('loan_id', v_loan.id, 'installment_id', v_installment.id)
      );
    elsif v_loan.recipient_type = 'system' and v_installment.principal_amount > 0 then
      update public.institutional_credit_treasury
      set balance = balance + v_installment.principal_amount, updated_at = now()
      where id = 'main'
      returning balance into v_treasury_balance;
      insert into public.institutional_credit_ledger(
        amount, balance_after, entry_type, discipline_record_id, credit_loan_id, metadata
      ) values (
        v_installment.principal_amount, v_treasury_balance, 'discipline_principal',
        v_loan.discipline_record_id, v_loan.id,
        jsonb_build_object('installment_id', v_installment.id)
      );
    end if;

    if v_installment.tax_amount > 0 then
      update public.institutional_credit_treasury
      set balance = balance + v_installment.tax_amount, updated_at = now()
      where id = 'main'
      returning balance into v_treasury_balance;
      insert into public.institutional_credit_ledger(
        amount, balance_after, entry_type, discipline_record_id, credit_loan_id, metadata
      ) values (
        v_installment.tax_amount, v_treasury_balance, 'discipline_tax',
        v_loan.discipline_record_id, v_loan.id,
        jsonb_build_object('installment_id', v_installment.id)
      );
    end if;
    v_kind := 'discipline_fine_repayment';
    v_reference := 'Disiplin kredi borcu taksiti ' || v_installment.id::text;
  else
    v_kind := case when v_loan.source = 'discipline_fine' then 'discipline_fine_repayment' else 'loan_repayment' end;
    v_reference := case when v_loan.source = 'discipline_fine' then 'Disiplin para cezasi taksiti ' else 'Taksit ' end
      || v_installment.id::text;
  end if;

  update public.credit_installments
  set status = 'paid', paid_at = now()
  where id = v_installment.id
  returning * into v_installment;

  update public.credit_loans
  set paid_amount = paid_amount + v_installment.amount,
      status = case when paid_amount + v_installment.amount >= total_due then 'paid' else 'approved' end
  where id = v_loan.id;

  insert into public.credit_transactions(account_id, kind, amount, balance_after, reference, metadata)
  values (
    v_account.id,
    v_kind,
    v_installment.amount,
    v_account.balance - v_installment.amount,
    v_reference,
    jsonb_build_object('manual', true, 'loan_id', v_loan.id, 'source', v_loan.source)
  );

  if v_loan.source = 'discipline_fine' and v_loan.regulation_version = '2026-07-19'
     and not exists (
       select 1
       from public.credit_loans l
       where l.account_id = v_account.id
         and l.id <> v_loan.id
         and l.source = 'discipline_fine'
         and l.regulation_version = '2026-07-19'
         and l.status = 'delinquent'
     )
     and not exists (
       select 1
       from public.credit_installments i
       where i.loan_id = v_loan.id
         and i.id <> v_installment.id
         and i.status = 'delinquent'
     ) then
    update public.credit_accounts
    set transfer_restricted = false,
        transfer_restriction_reason = '',
        updated_at = now()
    where id = v_account.id;
  end if;

  return v_installment;
end;
$$;

revoke all on function public.pay_credit_installment(uuid, uuid) from public, anon, authenticated;
grant execute on function public.pay_credit_installment(uuid, uuid) to service_role;

-- Once the scheduler creates the first overdue complaint, the remaining debt
-- becomes immediately due and uses the same complaint instead of duplicating it.
create or replace function private.enforce_20260719_discipline_default()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_loan public.credit_loans%rowtype;
begin
  if pg_trigger_depth() > 1 or new.complaint_id is null or old.complaint_id is not null then
    return new;
  end if;
  select * into v_loan from public.credit_loans where id = new.loan_id for update;
  if not found or v_loan.source <> 'discipline_fine' or v_loan.regulation_version <> '2026-07-19' then
    return new;
  end if;

  update public.credit_installments
  set status = 'delinquent',
      due_at = least(due_at, now()),
      complaint_id = new.complaint_id
  where loan_id = v_loan.id
    and status in ('pending', 'delinquent');

  update public.credit_loans
  set status = 'delinquent', due_at = now()
  where id = v_loan.id;

  update public.credit_accounts
  set transfer_restricted = true,
      transfer_restriction_reason = '19.07.2026 DK kredi borcu vadesinde odenmedi.',
      updated_at = now()
  where id = v_loan.account_id;
  return new;
end;
$$;

revoke all on function private.enforce_20260719_discipline_default() from public, anon, authenticated;
grant execute on function private.enforce_20260719_discipline_default() to service_role;

drop trigger if exists enforce_20260719_discipline_default on public.credit_installments;
create trigger enforce_20260719_discipline_default
  after update of complaint_id on public.credit_installments
  for each row execute function private.enforce_20260719_discipline_default();

create or replace function public.process_20260719_discipline_deadlines()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_measure public.discipline_temporary_measures%rowtype;
  v_roles public.app_role[];
  v_expired integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Sunucu yetkisi gerekir.';
  end if;
  for v_measure in
    select *
    from public.discipline_temporary_measures
    where status = 'pending_executive' and approval_due_at <= now()
    for update skip locked
  loop
    select coalesce(array_agg(value::public.app_role), array['member']::public.app_role[])
    into v_roles
    from jsonb_array_elements_text(coalesce(v_measure.profile_before -> 'roles', '["member"]'::jsonb)) values_list(value);

    update public.profiles
    set role = coalesce(nullif(v_measure.profile_before ->> 'role', '')::public.app_role, 'member'::public.app_role),
        roles = v_roles,
        status = coalesce(nullif(v_measure.profile_before ->> 'status', '')::public.member_status, 'active'::public.member_status),
        discipline_points = coalesce(nullif(v_measure.profile_before ->> 'discipline_points', '')::integer, discipline_points),
        committee_id = nullif(v_measure.profile_before ->> 'committee_id', '')::uuid,
        suspended_until = nullif(v_measure.profile_before ->> 'suspended_until', '')::timestamptz,
        suspension_note = coalesce(v_measure.profile_before ->> 'suspension_note', ''),
        updated_at = now()
    where id = v_measure.member_id;

    update public.discipline_temporary_measures
    set status = 'expired',
        decided_at = now(),
        decision_note = 'Yurutme Kurulu 24 saat icinde onaylamadigi icin tedbir kendiliginden sona erdi.'
    where id = v_measure.id;
    v_expired := v_expired + 1;
  end loop;
  return jsonb_build_object('expiredTemporaryMeasures', v_expired);
end;
$$;

revoke all on function public.process_20260719_discipline_deadlines() from public, anon, authenticated;
grant execute on function public.process_20260719_discipline_deadlines() to service_role;

create or replace function private.run_credit_schedules()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.process_credit_schedules();
  perform public.process_20260719_discipline_deadlines();
end;
$$;

revoke all on function private.run_credit_schedules() from public, anon, authenticated;
