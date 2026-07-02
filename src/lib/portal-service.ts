import { getSession, restRequest, serverRequest } from "./supabase.js";

const tablePath = (table: string, query = "") => `${table}${query ? `?${query}` : ""}`;

const list = async (table: string, query = "select=*") =>
  restRequest(tablePath(table, query)).catch(() => []);

export async function getProfile() {
  const userId = getSession()?.user?.id;
  if (!userId) return null;
  const rows = await restRequest(
    tablePath("profiles", `id=eq.${encodeURIComponent(userId)}&select=*,committees!profiles_committee_id_fkey(id,name),profile_committees!profile_committees_profile_id_fkey(committee_id,role_in_committee,committee:committees(id,name,status))&limit=1`)
  );
  return rows?.[0] || null;
}

export async function loadDashboard() {
  const [profiles, announcements, disciplines, positions, committees, auditLogs, applications, youth, complaints, investigations] =
    await Promise.all([
      list("profiles", "select=id,status"),
      list("announcements", "select=*&order=created_at.desc&limit=6"),
      list("discipline_records", "select=id,decision_status,created_at&archived=eq.false"),
      list("positions", "select=*,committees!positions_committee_id_fkey(name),profiles!positions_assigned_profile_id_fkey(display_name)&order=authority_level.desc"),
      list("committees", "select=id,name,status&status=eq.active"),
      list("audit_logs", "select=*,actor:profiles!audit_logs_actor_id_fkey(display_name)&order=created_at.desc&limit=6"),
      list("applications", "select=id,status,created_at"),
      list("youth_activities", "select=id,status,created_at"),
      list("complaints", "select=id,status,created_at"),
      list("investigations", "select=id,status,created_at")
    ]);

  return { profiles, announcements, disciplines, positions, committees, auditLogs, applications, youth, complaints, investigations };
}

export const loadMembers = () =>
  list("profiles", "select=*,committees!profiles_committee_id_fkey(id,name),profile_committees!profile_committees_profile_id_fkey(committee_id,role_in_committee,committee:committees(id,name,status))&order=created_at.desc");

export const loadCommittees = () =>
  list("committees", "select=*,profiles!committees_chair_profile_id_fkey(display_name)&status=eq.active&order=name.asc");

export const loadPositions = () =>
  list("positions", "select=*,committees!positions_committee_id_fkey(name),profiles!positions_assigned_profile_id_fkey(display_name)&order=authority_level.desc");

export const loadAnnouncements = () =>
  list("announcements", "select=*&order=pinned.desc,created_at.desc");

export const loadDisciplineRecords = () =>
  list("discipline_records", "select=*,profiles!discipline_records_member_id_fkey(display_name),creator:profiles!discipline_records_created_by_fkey(display_name),investigation:investigations!discipline_records_investigation_id_fkey(id,title,status)&order=created_at.desc");

export const loadApplications = () =>
  list(
    "applications",
    "select=*,applicant:profiles!applications_applicant_profile_id_fkey(id,display_name,email,roles,role),target_committee:committees!applications_target_committee_id_fkey(id,name),committees!applications_suggested_committee_id_fkey(id,name),decider:profiles!applications_decided_by_fkey(display_name),claimer:profiles!applications_claimed_by_fkey(display_name)&order=created_at.desc"
  );

export const loadComplaints = () =>
  list(
    "complaints",
    "select=*,complainant:profiles!complaints_complainant_profile_id_fkey(id,display_name,email),accused:profiles!complaints_accused_profile_id_fkey(id,display_name,email),assignee:profiles!complaints_assigned_to_fkey(id,display_name),decider:profiles!complaints_decided_by_fkey(id,display_name)&order=created_at.desc"
  );

export const loadInvestigations = () =>
  list(
    "investigations",
    "select=*,subject:profiles!investigations_subject_profile_id_fkey(id,display_name,email,roles,role),opener:profiles!investigations_opened_by_fkey(id,display_name),assignee:profiles!investigations_assigned_to_fkey(id,display_name),decider:profiles!investigations_decided_by_fkey(id,display_name)&order=created_at.desc"
  );

export const loadRegulations = () =>
  list("regulations", "select=*&order=sort_order.asc");

export const loadNotifications = () =>
  list("notifications", "select=*&order=created_at.desc&limit=50");

export const loadYouthActivities = () =>
  list("youth_activities", "select=*,creator:profiles!youth_activities_created_by_fkey(display_name)&order=created_at.desc");

export const loadAuditLogs = () =>
  list("audit_logs", "select=*,actor:profiles!audit_logs_actor_id_fkey(display_name)&order=created_at.desc&limit=80");

export async function loadSettings() {
  const rows = await list("portal_settings", "id=eq.main&select=*&limit=1");
  return rows[0] || null;
}

export async function createAnnouncement(payload) {
  return restRequest("announcements", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
}

export async function createDisciplineRecord(payload) {
  return restRequest("discipline_records", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
}

export async function createApplication(payload) {
  return restRequest("applications", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
}

export async function createComplaint(payload) {
  return restRequest("complaints", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
}

export async function createRegulation(payload) {
  return restRequest("regulations", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
}

export async function createYouthActivity(payload) {
  return restRequest("youth_activities", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
}

export async function updateRecord(table: string, id: string, payload: Record<string, any>) {
  return restRequest(`${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
}

export async function deleteRecord(table: string, id: string) {
  return restRequest(`${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  });
}

export async function inviteMember(payload: Record<string, any>) {
  return serverRequest("/api/invite-member", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function manageMember(payload: Record<string, any>) {
  return serverRequest("/api/manage-member", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function deleteOwnAccount(payload: Record<string, any>) {
  return serverRequest("/api/manage-member", {
    method: "POST",
    body: JSON.stringify({ module: "account", action: "self_delete", ...payload })
  });
}

export async function reviewApplication(payload: Record<string, any>) {
  return serverRequest("/api/review-application", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function reviewComplaint(payload: Record<string, any>) {
  return serverRequest("/api/review-complaint", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function manageInvestigation(payload: Record<string, any>) {
  return serverRequest("/api/manage-investigation", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function disciplineAppeal(payload: Record<string, any>) {
  return serverRequest("/api/discipline-appeal", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function applyDisciplineSanction(payload: Record<string, any>) {
  return serverRequest("/api/apply-discipline", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function governanceAction(payload: Record<string, any>) {
  return serverRequest("/api/manage-member", {
    method: "POST",
    body: JSON.stringify({ module: "governance", ...payload })
  });
}

export async function agreementAction(payload: Record<string, any>) {
  return serverRequest("/api/manage-member", {
    method: "POST",
    body: JSON.stringify({ module: "agreement", ...payload })
  });
}
