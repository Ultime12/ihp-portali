create index if not exists agreement_delegations_delegated_by_idx
  on public.agreement_delegations(delegated_by);
create index if not exists agreements_authorized_by_idx
  on public.agreements(authorized_by);
create index if not exists agreements_executive_proposal_id_idx
  on public.agreements(executive_proposal_id);
create index if not exists agreements_rejected_by_idx
  on public.agreements(rejected_by);
create index if not exists agreements_signed_by_idx
  on public.agreements(signed_by);
create index if not exists election_ballots_candidate_idx
  on public.election_ballots(election_id, candidate_id);
create index if not exists election_ballots_voter_id_idx
  on public.election_ballots(voter_id);
create index if not exists election_candidates_profile_id_idx
  on public.election_candidates(profile_id);
create index if not exists elections_created_by_idx
  on public.elections(created_by);
create index if not exists elections_runoff_of_idx
  on public.elections(runoff_of);
create index if not exists elections_winner_profile_id_idx
  on public.elections(winner_profile_id);
create index if not exists governance_electorate_profile_id_idx
  on public.governance_electorate(profile_id);
create index if not exists governance_proposals_proposed_by_idx
  on public.governance_proposals(proposed_by);
create index if not exists governance_proposals_target_agreement_id_idx
  on public.governance_proposals(target_agreement_id);
create index if not exists governance_proposals_target_regulation_id_idx
  on public.governance_proposals(target_regulation_id);
create index if not exists governance_recusals_profile_id_idx
  on public.governance_recusals(profile_id);
create index if not exists governance_sponsors_profile_id_idx
  on public.governance_sponsors(profile_id);
create index if not exists governance_votes_voter_id_idx
  on public.governance_votes(voter_id);
create index if not exists investigations_defense_closed_by_idx
  on public.investigations(defense_closed_by);
