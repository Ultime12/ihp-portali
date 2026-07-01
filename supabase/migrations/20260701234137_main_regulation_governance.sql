-- Ana Yonetmelik uyum katmani:
-- savunma hakki, kurumsal arsiv, Yurutme Kurulu kararlari, secimler ve antlasmalar.

alter table public.investigations
  add column if not exists defense_status text not null default 'pending',
  add column if not exists defense_text text not null default '',
  add column if not exists defense_submitted_at timestamptz,
  add column if not exists defense_closed_by uuid references public.profiles(id) on delete set null,
  add column if not exists defense_closed_at timestamptz,
  add column if not exists defense_note text not null default '',
  add column if not exists recused_profile_ids uuid[] not null default '{}'::uuid[],
  add column if not exists recusal_note text not null default '';

alter table public.investigations
  drop constraint if exists investigations_defense_status_allowed;

alter table public.investigations
  add constraint investigations_defense_status_allowed
  check (defense_status in ('pending', 'submitted', 'not_submitted'));

update public.investigations
set
  defense_status = case
    when btrim(coalesce(defense_text, '')) <> '' then 'submitted'
    when status in ('closed', 'cancelled') then 'not_submitted'
    else 'pending'
  end,
  defense_submitted_at = case
    when btrim(coalesce(defense_text, '')) <> '' then coalesce(defense_submitted_at, updated_at, created_at)
    else defense_submitted_at
  end,
  defense_closed_at = case
    when status in ('closed', 'cancelled') and btrim(coalesce(defense_text, '')) = ''
      then coalesce(defense_closed_at, updated_at, created_at)
    else defense_closed_at
  end;

create or replace function private.can_manage_discipline()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
as $$
  select private.has_any_role(array[
    'discipline_chair',
    'discipline_vice_chair',
    'discipline_member'
  ]::public.app_role[]);
$$;

create or replace function private.can_manage_investigations()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
as $$
  select private.has_any_role(array[
    'discipline_chair',
    'discipline_vice_chair',
    'discipline_member'
  ]::public.app_role[]);
$$;

create or replace function private.can_view_discipline()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
as $$
  select private.has_any_role(array[
    'discipline_chair',
    'discipline_vice_chair',
    'discipline_member'
  ]::public.app_role[]);
$$;

create or replace function private.enforce_discipline_record_hierarchy()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $$
declare
  actor_roles public.app_role[];
  target_roles public.app_role[];
  is_reward boolean;
begin
  if new.decision_status = 'decided'::public.discipline_status
     and btrim(coalesce(new.decree_text, '')) = '' then
    raise exception 'Kararname metni zorunludur.';
  end if;

  is_reward :=
    coalesce(new.sanction_effect, 'none') = 'reward_points'
    or coalesce(new.point_delta, 0) > 0;

  if new.decision_status = 'decided'::public.discipline_status
     and not is_reward
     and new.investigation_id is null then
    raise exception 'Ceza kararnamesi için önce soruşturma seçilmelidir.';
  end if;

  if auth.uid() is null then
    return new;
  end if;

  actor_roles := private.current_app_roles();

  select case
    when profile.roles is null or cardinality(profile.roles) = 0 then array[profile.role]
    when profile.role = any(profile.roles) then profile.roles
    else profile.roles || profile.role
  end
  into target_roles
  from public.profiles profile
  where profile.id = new.member_id;

  if target_roles is null then
    raise exception 'İlgili üye bulunamadı.';
  end if;

  if target_roles && array['super_admin']::public.app_role[] then
    raise exception 'Teknik admin hesabı parti disiplin sürecinin dışında tutulur.';
  end if;

  if is_reward then
    if actor_roles && array[
      'president',
      'discipline_chair',
      'discipline_vice_chair',
      'discipline_member'
    ]::public.app_role[] then
      return new;
    end if;
    raise exception 'Ödül kararı için Başkan veya Disiplin Kurulu yetkisi gerekir.';
  end if;

  if not (
    actor_roles && array[
      'discipline_chair',
      'discipline_vice_chair',
      'discipline_member'
    ]::public.app_role[]
  ) then
    raise exception 'Disiplin kararı için Disiplin Kurulu yetkisi gerekir.';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_discipline_record_hierarchy() from public;
grant execute on function private.enforce_discipline_record_hierarchy() to authenticated, service_role;

create or replace function private.enforce_investigation_defense_before_penalty()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $$
declare
  defense_state text;
  member_state text;
  is_reward boolean;
begin
  is_reward :=
    coalesce(new.sanction_effect, 'none') = 'reward_points'
    or coalesce(new.point_delta, 0) > 0;

  select status into member_state
  from public.profiles
  where id = new.member_id;

  if member_state = 'left'
     and (
       coalesce(new.point_delta, 0) <> 0
       or coalesce(new.sanction_effect, 'none') <> 'none'
       or coalesce(new.credit_fine_amount, 0) <> 0
     ) then
    raise exception 'Partiden ayrılan kişi hakkında görev, puan veya mali yaptırım uygulanamaz.';
  end if;

  if is_reward then
    return new;
  end if;

  if new.investigation_id is null then
    raise exception 'Disiplin kaydı geçerli bir soruşturmaya bağlanmalıdır.';
  end if;

  select defense_status
  into defense_state
  from public.investigations
  where id = new.investigation_id
    and subject_profile_id = new.member_id;

  if defense_state is null then
    raise exception 'Disiplin kaydı geçerli bir soruşturmaya bağlanmalıdır.';
  end if;

  if defense_state = 'pending' then
    raise exception 'Savunma hakkı tamamlanmadan disiplin kararı kaydedilemez.';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_investigation_defense_before_penalty() from public;

drop trigger if exists enforce_investigation_defense_before_penalty on public.discipline_records;
create trigger enforce_investigation_defense_before_penalty
  before insert or update of
    investigation_id,
    member_id,
    decision_status,
    point_delta,
    sanction_effect,
    credit_fine_amount
  on public.discipline_records
  for each row execute function private.enforce_investigation_defense_before_penalty();

alter table public.discipline_records
  drop constraint if exists discipline_records_member_id_fkey,
  add constraint discipline_records_member_id_fkey
    foreign key (member_id) references public.profiles(id) on delete restrict;

alter table public.investigations
  drop constraint if exists investigations_subject_profile_id_fkey,
  add constraint investigations_subject_profile_id_fkey
    foreign key (subject_profile_id) references public.profiles(id) on delete restrict;

alter table public.agreements
  drop constraint if exists agreements_proposer_id_fkey,
  add constraint agreements_proposer_id_fkey
    foreign key (proposer_id) references public.profiles(id) on delete restrict;

create or replace function private.is_executive_member(candidate_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = candidate_id
      and profile.status = 'active'
      and coalesce(profile.is_system_account, false) = false
      and (
        (
          case
            when profile.roles is null or cardinality(profile.roles) = 0 then array[profile.role]
            when profile.role = any(profile.roles) then profile.roles
            else profile.roles || profile.role
          end
        ) &&
          array['president', 'vice_president', 'presidential_aide']::public.app_role[]
        or exists (
          select 1
          from public.executive_committee_members extra
          where extra.profile_id = profile.id
        )
      )
  );
$$;

revoke all on function private.is_executive_member(uuid) from public;
grant execute on function private.is_executive_member(uuid) to authenticated, service_role;

create table if not exists public.governance_proposals (
  id uuid primary key default gen_random_uuid(),
  proposal_type text not null,
  title text not null,
  summary text not null default '',
  proposed_content text not null default '',
  target_regulation_id uuid references public.regulations(id) on delete restrict,
  target_agreement_id uuid references public.agreements(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  proposed_by uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'collecting_support',
  is_secret boolean not null default false,
  required_ratio numeric(5,4) not null default 0.5000,
  voting_starts_at timestamptz,
  voting_ends_at timestamptz,
  electorate_count integer not null default 0,
  yes_count integer not null default 0,
  no_count integer not null default 0,
  abstain_count integer not null default 0,
  decided_at timestamptz,
  enacted_at timestamptz,
  cancellation_reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint governance_proposals_type_allowed
    check (proposal_type in (
      'executive_decision',
      'regulation_change',
      'temporary_rule',
      'election_schedule',
      'early_election',
      'agreement_approval'
    )),
  constraint governance_proposals_status_allowed
    check (status in ('collecting_support', 'voting', 'approved', 'rejected', 'cancelled')),
  constraint governance_proposals_title_length check (char_length(title) between 3 and 180),
  constraint governance_proposals_summary_length check (char_length(summary) <= 1600),
  constraint governance_proposals_content_length check (char_length(proposed_content) <= 50000),
  constraint governance_proposals_ratio_range check (required_ratio > 0 and required_ratio <= 1),
  constraint governance_proposals_vote_window check (
    voting_ends_at is null
    or voting_starts_at is null
    or voting_ends_at > voting_starts_at
  )
);

create table if not exists public.governance_sponsors (
  proposal_id uuid not null references public.governance_proposals(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (proposal_id, profile_id)
);

create table if not exists public.governance_electorate (
  proposal_id uuid not null references public.governance_proposals(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  is_president boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (proposal_id, profile_id)
);

create table if not exists public.governance_votes (
  proposal_id uuid not null references public.governance_proposals(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete restrict,
  vote text not null,
  created_at timestamptz not null default now(),
  primary key (proposal_id, voter_id),
  constraint governance_votes_value_allowed check (vote in ('yes', 'no', 'abstain'))
);

create table if not exists public.governance_recusals (
  proposal_id uuid not null references public.governance_proposals(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  reason text not null,
  created_at timestamptz not null default now(),
  primary key (proposal_id, profile_id),
  constraint governance_recusals_reason_length check (char_length(reason) between 10 and 1200)
);

create table if not exists public.elections (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid unique references public.governance_proposals(id) on delete restrict,
  title text not null,
  description text not null default '',
  status text not null default 'scheduled',
  nomination_starts_at timestamptz not null,
  nomination_ends_at timestamptz not null,
  voting_starts_at timestamptz not null,
  voting_ends_at timestamptz not null,
  winner_profile_id uuid references public.profiles(id) on delete restrict,
  runoff_of uuid references public.elections(id) on delete restrict,
  result_announced_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint elections_status_allowed
    check (status in ('scheduled', 'nominations', 'voting', 'closed', 'runoff_required', 'cancelled')),
  constraint elections_title_length check (char_length(title) between 3 and 180),
  constraint elections_timeline_valid check (
    nomination_ends_at > nomination_starts_at
    and voting_starts_at >= nomination_ends_at
    and voting_ends_at > voting_starts_at
  )
);

create table if not exists public.election_candidates (
  election_id uuid not null references public.elections(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  statement text not null default '',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  primary key (election_id, profile_id),
  constraint election_candidates_status_allowed check (status in ('active', 'withdrawn')),
  constraint election_candidates_statement_length check (char_length(statement) <= 1200)
);

create table if not exists public.election_ballots (
  election_id uuid not null references public.elections(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete restrict,
  candidate_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (election_id, voter_id),
  foreign key (election_id, candidate_id)
    references public.election_candidates(election_id, profile_id) on delete restrict
);

create table if not exists public.agreement_delegations (
  id uuid primary key default gen_random_uuid(),
  delegate_profile_id uuid not null references public.profiles(id) on delete restrict,
  delegated_by uuid not null references public.profiles(id) on delete restrict,
  authority_note text not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint agreement_delegations_note_length check (char_length(authority_note) between 5 and 800),
  constraint agreement_delegations_window check (ends_at is null or ends_at > starts_at)
);

alter table public.agreements
  add column if not exists purpose text not null default '',
  add column if not exists obligations text not null default '',
  add column if not exists effective_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists scope text not null default 'personal',
  add column if not exists requires_executive_approval boolean not null default false,
  add column if not exists executive_proposal_id uuid references public.governance_proposals(id) on delete restrict,
  add column if not exists authorized_by uuid references public.profiles(id) on delete set null,
  add column if not exists activated_at timestamptz;

alter table public.agreements
  drop constraint if exists agreements_target_type_allowed,
  drop constraint if exists agreements_status_allowed,
  drop constraint if exists agreements_scope_allowed,
  drop constraint if exists agreements_effective_window;

alter table public.agreements
  add constraint agreements_target_type_allowed
    check (target_type in ('member', 'discipline', 'youth', 'party')),
  add constraint agreements_status_allowed
    check (status in (
      'pending',
      'signed',
      'pending_executive',
      'active',
      'rejected',
      'cancelled',
      'expired',
      'terminated'
    )),
  add constraint agreements_scope_allowed
    check (scope in ('personal', 'committee', 'party')),
  add constraint agreements_effective_window
    check (expires_at is null or effective_at is null or expires_at > effective_at);

create index if not exists governance_proposals_status_created_idx
  on public.governance_proposals(status, created_at desc);
create index if not exists governance_proposals_type_status_idx
  on public.governance_proposals(proposal_type, status);
create index if not exists governance_votes_proposal_vote_idx
  on public.governance_votes(proposal_id, vote);
create index if not exists elections_status_timeline_idx
  on public.elections(status, voting_starts_at, voting_ends_at);
create index if not exists agreement_delegations_active_idx
  on public.agreement_delegations(delegate_profile_id, starts_at, ends_at, revoked_at);

drop trigger if exists governance_proposals_updated_at on public.governance_proposals;
create trigger governance_proposals_updated_at
  before update on public.governance_proposals
  for each row execute procedure public.set_updated_at();

drop trigger if exists elections_updated_at on public.elections;
create trigger elections_updated_at
  before update on public.elections
  for each row execute procedure public.set_updated_at();

alter table public.governance_proposals enable row level security;
alter table public.governance_sponsors enable row level security;
alter table public.governance_electorate enable row level security;
alter table public.governance_votes enable row level security;
alter table public.governance_recusals enable row level security;
alter table public.elections enable row level security;
alter table public.election_candidates enable row level security;
alter table public.election_ballots enable row level security;
alter table public.agreement_delegations enable row level security;

create policy governance_proposals_select_authenticated
  on public.governance_proposals for select to authenticated using (true);
create policy governance_sponsors_select_authenticated
  on public.governance_sponsors for select to authenticated using (true);
create policy governance_electorate_select_authenticated
  on public.governance_electorate for select to authenticated using (true);
create policy governance_votes_select_own
  on public.governance_votes for select to authenticated
  using (voter_id = (select auth.uid()));
create policy governance_recusals_select_authenticated
  on public.governance_recusals for select to authenticated using (true);
create policy elections_select_authenticated
  on public.elections for select to authenticated using (true);
create policy election_candidates_select_authenticated
  on public.election_candidates for select to authenticated using (true);
create policy election_ballots_select_own
  on public.election_ballots for select to authenticated
  using (voter_id = (select auth.uid()));
create policy agreement_delegations_select_authenticated
  on public.agreement_delegations for select to authenticated using (true);

grant select on public.governance_proposals to authenticated;
grant select on public.governance_sponsors to authenticated;
grant select on public.governance_electorate to authenticated;
grant select on public.governance_votes to authenticated;
grant select on public.governance_recusals to authenticated;
grant select on public.elections to authenticated;
grant select on public.election_candidates to authenticated;
grant select on public.election_ballots to authenticated;
grant select on public.agreement_delegations to authenticated;

grant all on public.governance_proposals to service_role;
grant all on public.governance_sponsors to service_role;
grant all on public.governance_electorate to service_role;
grant all on public.governance_votes to service_role;
grant all on public.governance_recusals to service_role;
grant all on public.elections to service_role;
grant all on public.election_candidates to service_role;
grant all on public.election_ballots to service_role;
grant all on public.agreement_delegations to service_role;

create or replace function private.can_review_application(
  target_committee uuid,
  requested public.app_role
)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'auth'
as $$
declare
  target_name text;
begin
  select name into target_name
  from public.committees
  where id = target_committee;

  if target_name = 'Disiplin Kurulu' then
    return private.has_any_role(array[
      'discipline_chair',
      'discipline_vice_chair',
      'discipline_member'
    ]::public.app_role[]);
  end if;

  if private.has_any_role(array['super_admin']::public.app_role[]) then
    return true;
  end if;

  if target_name in ('Yürütme Kurulu', 'Yönetim Kurulu')
     and private.has_any_role(array[
       'president',
       'vice_president',
       'presidential_aide'
     ]::public.app_role[]) then
    return true;
  end if;

  if exists (
    select 1
    from public.profile_committees membership
    where membership.profile_id = auth.uid()
      and membership.committee_id = target_committee
  ) and private.has_any_role(array[
    'president',
    'vice_president',
    'presidential_aide'
  ]::public.app_role[]) then
    return true;
  end if;

  if target_name = 'Gençlik Kolları'
     and private.has_any_role(array['youth_chair']::public.app_role[]) then
    return true;
  end if;

  return false;
end;
$$;

drop policy if exists regulations_insert_super_admin on public.regulations;
drop policy if exists regulations_update_super_admin on public.regulations;
drop policy if exists regulations_delete_super_admin on public.regulations;
revoke insert, update, delete on public.regulations from authenticated;

drop policy if exists investigations_delete_super_admin on public.investigations;
revoke delete on public.investigations from authenticated;

drop policy if exists discipline_delete_super_admin on public.discipline_records;
revoke delete on public.discipline_records from authenticated;

drop policy if exists applications_delete_authorized on public.applications;
create policy applications_delete_authorized
  on public.applications
  for delete
  to authenticated
  using (
    applicant_profile_id = (select auth.uid())
    and status = 'new'::public.application_status
  );

drop policy if exists complaints_select_authorized on public.complaints;
create policy complaints_select_authorized
  on public.complaints
  for select
  to authenticated
  using (
    complainant_profile_id = (select auth.uid())
    or accused_profile_id = (select auth.uid())
    or assigned_to = (select auth.uid())
    or private.has_any_role(array[
      'discipline_chair',
      'discipline_vice_chair',
      'discipline_member'
    ]::public.app_role[])
  );

drop policy if exists complaints_update_discipline on public.complaints;
create policy complaints_update_discipline
  on public.complaints
  for update
  to authenticated
  using (private.has_any_role(array[
    'discipline_chair',
    'discipline_vice_chair',
    'discipline_member'
  ]::public.app_role[]))
  with check (private.has_any_role(array[
    'discipline_chair',
    'discipline_vice_chair',
    'discipline_member'
  ]::public.app_role[]));

drop policy if exists complaints_delete_authorized on public.complaints;
create policy complaints_delete_authorized
  on public.complaints
  for delete
  to authenticated
  using (complainant_profile_id = (select auth.uid()) and status = 'new');

drop policy if exists agreements_insert_own on public.agreements;
drop policy if exists agreements_update_authorized on public.agreements;
drop policy if exists agreements_delete_authorized on public.agreements;
revoke insert, update, delete on public.agreements from authenticated;

create or replace function private.can_sign_agreement(
  agreement_target_type text,
  agreement_target_profile_id uuid,
  agreement_target_committee_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'auth'
as $$
declare
  committee_name text;
begin
  if agreement_target_type = 'member' then
    return agreement_target_profile_id = auth.uid();
  end if;

  if agreement_target_type = 'party' then
    return private.has_any_role(array['president']::public.app_role[])
      or exists (
        select 1
        from public.agreement_delegations delegation
        where delegation.delegate_profile_id = auth.uid()
          and delegation.revoked_at is null
          and delegation.starts_at <= now()
          and (delegation.ends_at is null or delegation.ends_at > now())
      );
  end if;

  select name into committee_name
  from public.committees
  where id = agreement_target_committee_id
  limit 1;

  if agreement_target_type = 'discipline' or committee_name = 'Disiplin Kurulu' then
    return private.has_any_role(array['discipline_chair']::public.app_role[]);
  end if;

  if agreement_target_type = 'youth' or committee_name = 'Gençlik Kolları' then
    return private.has_any_role(array['youth_chair']::public.app_role[]);
  end if;

  return false;
end;
$$;

drop policy if exists agreements_select_authorized on public.agreements;
create policy agreements_select_authorized
  on public.agreements
  for select
  to authenticated
  using (
    proposer_id = (select auth.uid())
    or target_profile_id = (select auth.uid())
    or signed_by = (select auth.uid())
    or rejected_by = (select auth.uid())
    or authorized_by = (select auth.uid())
    or private.can_sign_agreement(target_type, target_profile_id, target_committee_id)
    or (scope = 'party' and status in ('active', 'signed', 'expired', 'terminated'))
  );

drop trigger if exists prepare_agreement_before_insert on public.agreements;
drop trigger if exists enforce_agreement_before_update on public.agreements;

create or replace function private.notify_agreement_decision()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  actor_id uuid;
  decision_title text;
  decision_body text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  actor_id := coalesce(new.signed_by, new.rejected_by, new.authorized_by, auth.uid());
  decision_title := case
    when new.status = 'signed' then 'Antlaşma imzalandı'
    when new.status = 'pending_executive' then 'Antlaşma Yürütme Kurulu onayında'
    when new.status = 'active' then 'Antlaşma yürürlüğe girdi'
    when new.status = 'rejected' then 'Antlaşma reddedildi'
    when new.status = 'cancelled' then 'Antlaşma iptal edildi'
    when new.status = 'expired' then 'Antlaşmanın süresi doldu'
    when new.status = 'terminated' then 'Antlaşma sona erdirildi'
    else 'Antlaşma güncellendi'
  end;
  decision_body := new.title || case
    when coalesce(new.decision_note, '') <> '' then ' - ' || new.decision_note
    else ''
  end;

  perform private.notify_user(
    new.proposer_id,
    decision_title,
    decision_body,
    'agreement',
    '#/portal/agreements',
    actor_id
  );

  if new.target_type = 'member'
     and new.target_profile_id is not null
     and new.target_profile_id <> new.proposer_id then
    perform private.notify_user(
      new.target_profile_id,
      decision_title,
      decision_body,
      'agreement',
      '#/portal/agreements',
      actor_id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists audit_governance_proposals on public.governance_proposals;
create trigger audit_governance_proposals
  after insert or update on public.governance_proposals
  for each row execute procedure private.write_audit_log();

drop trigger if exists audit_elections on public.elections;
create trigger audit_elections
  after insert or update on public.elections
  for each row execute procedure private.write_audit_log();
