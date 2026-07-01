revoke all on public.governance_proposals from anon;
revoke all on public.governance_sponsors from anon;
revoke all on public.governance_electorate from anon;
revoke all on public.governance_votes from anon;
revoke all on public.governance_recusals from anon;
revoke all on public.elections from anon;
revoke all on public.election_candidates from anon;
revoke all on public.election_ballots from anon;
revoke all on public.agreement_delegations from anon;

revoke insert, update, delete, truncate, references, trigger on public.governance_proposals from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.governance_sponsors from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.governance_electorate from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.governance_votes from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.governance_recusals from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.elections from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.election_candidates from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.election_ballots from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.agreement_delegations from authenticated;

grant select on
  public.governance_proposals,
  public.governance_sponsors,
  public.governance_electorate,
  public.governance_votes,
  public.governance_recusals,
  public.elections,
  public.election_candidates,
  public.election_ballots,
  public.agreement_delegations
to authenticated;

revoke all on function private.can_manage_discipline() from public;
revoke all on function private.can_manage_investigations() from public;
revoke all on function private.can_view_discipline() from public;
revoke all on function private.can_review_application(uuid, public.app_role) from public;
revoke all on function private.can_sign_agreement(text, uuid, uuid) from public;

grant execute on function private.can_manage_discipline() to authenticated, service_role;
grant execute on function private.can_manage_investigations() to authenticated, service_role;
grant execute on function private.can_view_discipline() to authenticated, service_role;
grant execute on function private.can_review_application(uuid, public.app_role) to authenticated, service_role;
grant execute on function private.can_sign_agreement(text, uuid, uuid) to authenticated, service_role;
