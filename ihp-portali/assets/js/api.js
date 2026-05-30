import { supabase, isSupabaseConfigured } from "./supabaseClient.js";

export function ensureSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase bağlantısı yapılandırılmadı.");
  }
  return supabase;
}

export async function fetchAnnouncements({ limit = 20, publicOnly = false } = {}) {
  const client = ensureSupabase();
  let query = client
    .from("announcements")
    .select("*, author:profiles(full_name, role)")
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (publicOnly) query = query.eq("published", true);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createAnnouncement(payload) {
  const client = ensureSupabase();
  const { data: { user } } = await client.auth.getUser();
  const { data, error } = await client.from("announcements").insert({ ...payload, author_id: user.id }).select().single();
  if (error) throw error;
  return data;
}

export async function updateAnnouncement(id, payload) {
  const client = ensureSupabase();
  const { error } = await client.from("announcements").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deleteAnnouncement(id) {
  const client = ensureSupabase();
  const { error } = await client.from("announcements").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchEvents({ limit = 50 } = {}) {
  const client = ensureSupabase();
  const { data, error } = await client
    .from("events")
    .select("*, creator:profiles(full_name)")
    .order("start_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function createEvent(payload) {
  const client = ensureSupabase();
  const { data: { user } } = await client.auth.getUser();
  const { data, error } = await client.from("events").insert({ ...payload, created_by: user.id }).select().single();
  if (error) throw error;
  return data;
}

export async function joinEvent(eventId, status = "accepted") {
  const client = ensureSupabase();
  const { data: { user } } = await client.auth.getUser();
  const { error } = await client
    .from("event_participants")
    .upsert({ event_id: eventId, profile_id: user.id, status }, { onConflict: "event_id,profile_id" });
  if (error) throw error;
}

export async function fetchOfficials() {
  const client = ensureSupabase();
  const { data, error } = await client.from("leadership_officials").select("*").order("sort_order", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function fetchProfiles() {
  const client = ensureSupabase();
  const { data, error } = await client.from("profiles").select("*").order("role", { ascending: false }).order("full_name");
  if (error) throw error;
  return data || [];
}

export async function updateProfileAdmin(id, payload) {
  const client = ensureSupabase();
  const { error } = await client.from("profiles").update(payload).eq("id", id);
  if (error) throw error;
}

export async function updateOwnProfile(payload) {
  const client = ensureSupabase();
  const { data, error } = await client.rpc("update_own_profile", {
    p_full_name: payload.full_name,
    p_class_name: payload.class_name,
    p_avatar_url: payload.avatar_url || null,
  });
  if (error) throw error;
  return data;
}

export async function fetchDisciplineHistory(memberId = null) {
  const client = ensureSupabase();
  let query = client
    .from("discipline_records")
    .select("*, member:profiles!discipline_records_member_id_fkey(full_name), changed_by_profile:profiles!discipline_records_changed_by_fkey(full_name)")
    .order("created_at", { ascending: false });
  if (memberId) query = query.eq("member_id", memberId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function adjustDiscipline(memberId, delta, reason) {
  const client = ensureSupabase();
  const { data, error } = await client.rpc("adjust_discipline", {
    p_member_id: memberId,
    p_delta: Number(delta),
    p_reason: reason,
  });
  if (error) throw error;
  return data;
}

export async function createApplication(payload) {
  const client = ensureSupabase();
  const { data, error } = await client.from("applications").insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function fetchApplications() {
  const client = ensureSupabase();
  const { data, error } = await client.from("applications").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function updateApplicationStatus(id, status) {
  const client = ensureSupabase();
  const { error } = await client.from("applications").update({ status, reviewed_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function fetchElections() {
  const client = ensureSupabase();
  const { data, error } = await client.from("elections").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createElection(payload) {
  const client = ensureSupabase();
  const { data: { user } } = await client.auth.getUser();
  const { data, error } = await client.from("elections").insert({ ...payload, created_by: user.id }).select().single();
  if (error) throw error;
  return data;
}

export async function fetchCandidates(electionId) {
  const client = ensureSupabase();
  const { data, error } = await client
    .from("election_candidates")
    .select("*, member:profiles(full_name, role, duty)")
    .eq("election_id", electionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function becomeCandidate(electionId, statement) {
  const client = ensureSupabase();
  const { data: { user } } = await client.auth.getUser();
  const { error } = await client.from("election_candidates").insert({ election_id: electionId, member_id: user.id, statement });
  if (error) throw error;
}

export async function voteCandidate(electionId, candidateId) {
  const client = ensureSupabase();
  const { data: { user } } = await client.auth.getUser();
  const { error } = await client.from("election_votes").insert({ election_id: electionId, voter_id: user.id, candidate_id: candidateId });
  if (error) throw error;
}

export async function electionResults(electionId) {
  const client = ensureSupabase();
  const { data, error } = await client.rpc("election_results", { p_election_id: electionId });
  if (error) throw error;
  return data || [];
}

export async function fetchExecutiveDecisions() {
  const client = ensureSupabase();
  const { data, error } = await client
    .from("executive_decisions")
    .select("*, creator:profiles(full_name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createExecutiveDecision(payload) {
  const client = ensureSupabase();
  const { data: { user } } = await client.auth.getUser();
  const { error } = await client.from("executive_decisions").insert({ ...payload, created_by: user.id });
  if (error) throw error;
}

export async function voteExecutiveDecision(decisionId, vote, comment = "") {
  const client = ensureSupabase();
  const { data: { user } } = await client.auth.getUser();
  const { error } = await client.from("executive_votes").upsert(
    { decision_id: decisionId, voter_id: user.id, vote, comment },
    { onConflict: "decision_id,voter_id" },
  );
  if (error) throw error;
}

export async function fetchMeetings(committee) {
  const client = ensureSupabase();
  const { data, error } = await client.from("meetings").select("*").eq("committee", committee).order("meeting_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createMeeting(payload) {
  const client = ensureSupabase();
  const { data: { user } } = await client.auth.getUser();
  const { error } = await client.from("meetings").insert({ ...payload, created_by: user.id });
  if (error) throw error;
}

export async function fetchInvestigations() {
  const client = ensureSupabase();
  const { data, error } = await client
    .from("discipline_investigations")
    .select("*, member:profiles!discipline_investigations_member_id_fkey(full_name), opened_by_profile:profiles!discipline_investigations_opened_by_fkey(full_name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createInvestigation(payload) {
  const client = ensureSupabase();
  const { data: { user } } = await client.auth.getUser();
  const { error } = await client.from("discipline_investigations").insert({ ...payload, opened_by: user.id });
  if (error) throw error;
}

export async function updateInvestigation(id, payload) {
  const client = ensureSupabase();
  const { error } = await client.from("discipline_investigations").update(payload).eq("id", id);
  if (error) throw error;
}

export async function fetchGameData() {
  const client = ensureSupabase();
  const [events, tournaments, teams, champions] = await Promise.all([
    client.from("game_events").select("*").order("start_at", { ascending: true }),
    client.from("tournaments").select("*").order("created_at", { ascending: false }),
    client.from("game_teams").select("*, captain:profiles(full_name)").order("created_at", { ascending: false }),
    client.from("champions").select("*, member:profiles(full_name)").order("achieved_at", { ascending: false }),
  ]);
  for (const result of [events, tournaments, teams, champions]) if (result.error) throw result.error;
  return { events: events.data || [], tournaments: tournaments.data || [], teams: teams.data || [], champions: champions.data || [] };
}

export async function createGameEvent(payload) {
  const client = ensureSupabase();
  const { data: { user } } = await client.auth.getUser();
  const { error } = await client.from("game_events").insert({ ...payload, created_by: user.id });
  if (error) throw error;
}

export async function createTournament(payload) {
  const client = ensureSupabase();
  const { data: { user } } = await client.auth.getUser();
  const { error } = await client.from("tournaments").insert({ ...payload, created_by: user.id });
  if (error) throw error;
}

export async function createTeam(payload) {
  const client = ensureSupabase();
  const { data: { user } } = await client.auth.getUser();
  const { error } = await client.from("game_teams").insert({ ...payload, captain_id: user.id });
  if (error) throw error;
}

export async function adminCreateUser(payload) {
  const client = ensureSupabase();
  const { data, error } = await client.functions.invoke("admin-create-user", { body: payload });
  if (error) throw error;
  return data;
}

export async function adminDeleteUser(userId) {
  const client = ensureSupabase();
  const { data, error } = await client.functions.invoke("admin-delete-user", { body: { user_id: userId } });
  if (error) throw error;
  return data;
}
