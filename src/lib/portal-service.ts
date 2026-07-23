import {
  downloadStorageObject,
  getSession,
  removeStorageObject,
  restRequest,
  serverRequest,
  uploadStorageObject
} from "./supabase.js";

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
  const mainPortalOwnData = Boolean(globalThis.__IHP_MAIN_PORTAL_OWN_DATA__);
  const currentProfileId = getSession()?.user?.id || "";
  const ownComplaintFilter = currentProfileId
    ? `&complainant_profile_id=eq.${encodeURIComponent(currentProfileId)}`
    : "&complainant_profile_id=is.null";
  const [profiles, announcements, disciplines, positions, committees, auditLogs, applications, youth, complaints, investigations] =
    await Promise.all([
      list("profiles", "select=id,status"),
      list("announcements", "select=*&order=created_at.desc&limit=6"),
      mainPortalOwnData
        ? Promise.resolve([])
        : list("discipline_records", "select=id,decision_status,created_at&archived=eq.false"),
      list("positions", "select=*,committees!positions_committee_id_fkey(name),profiles!positions_assigned_profile_id_fkey(display_name)&order=authority_level.desc"),
      list("committees", "select=id,name,status&status=eq.active"),
      list("audit_logs", "select=*,actor:profiles!audit_logs_actor_id_fkey(display_name)&order=created_at.desc&limit=6"),
      list("applications", "select=id,status,created_at"),
      list("youth_activities", "select=id,status,created_at"),
      list("complaints", `select=id,status,created_at${mainPortalOwnData ? ownComplaintFilter : ""}`),
      mainPortalOwnData
        ? Promise.resolve([])
        : list("investigations", "select=id,status,created_at")
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
  list("discipline_records", "select=*,profiles!discipline_records_member_id_fkey(display_name),creator:profiles!discipline_records_created_by_fkey(display_name),investigation:investigations!discipline_records_investigation_id_fkey(id,title,status),attachments:case_attachments!case_attachments_discipline_record_id_fkey(id,file_name,object_path,content_type,size_bytes,created_at)&order=created_at.desc");

export const loadApplications = () =>
  list(
    "applications",
    "select=*,applicant:profiles!applications_applicant_profile_id_fkey(id,display_name,email,roles,role),target_committee:committees!applications_target_committee_id_fkey(id,name),committees!applications_suggested_committee_id_fkey(id,name),decider:profiles!applications_decided_by_fkey(display_name),claimer:profiles!applications_claimed_by_fkey(display_name)&order=created_at.desc"
  );

export const loadComplaints = () => {
  const currentProfileId = getSession()?.user?.id || "";
  const ownFilter = globalThis.__IHP_MAIN_PORTAL_OWN_DATA__
    ? `complainant_profile_id=eq.${encodeURIComponent(currentProfileId)}&`
    : "";
  return list(
    "complaints",
    `${ownFilter}select=*,complainant:profiles!complaints_complainant_profile_id_fkey(id,display_name,email),accused:profiles!complaints_accused_profile_id_fkey(id,display_name,email),assignee:profiles!complaints_assigned_to_fkey(id,display_name),decider:profiles!complaints_decided_by_fkey(id,display_name),attachments:case_attachments!case_attachments_complaint_id_fkey(id,file_name,object_path,content_type,size_bytes,created_at)&order=created_at.desc`
  );
};

export const loadInvestigations = () =>
  list(
    "investigations",
    "select=*,subject:profiles!investigations_subject_profile_id_fkey(id,display_name,email,roles,role),opener:profiles!investigations_opened_by_fkey(id,display_name),assignee:profiles!investigations_assigned_to_fkey(id,display_name,role,roles),decider:profiles!investigations_decided_by_fkey(id,display_name),source_complaint:complaints!investigations_source_complaint_id_fkey(id,subject,status,complainant_profile_id,accused_profile_id),attachments:case_attachments!case_attachments_investigation_id_fkey(id,file_name,object_path,content_type,size_bytes,created_at)&order=created_at.desc"
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
  const result = await serverRequest("/api/review-complaint", {
    method: "POST",
    body: JSON.stringify({ action: "create", ...payload })
  });
  return result?.complaint ? [result.complaint] : [];
}

const CASE_ATTACHMENT_BUCKET = "case-attachments";
const CASE_ATTACHMENT_MAX_COUNT = 10;
const CASE_ATTACHMENT_MAX_SIZE = 6 * 1024 * 1024;
const CASE_ATTACHMENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain"
]);
const CASE_ATTACHMENT_EXTENSION_TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain"
};
const CASE_PARENT_COLUMNS = {
  complaint: "complaint_id",
  investigation: "investigation_id",
  discipline: "discipline_record_id"
};

function safeObjectFileName(fileName: string) {
  const normalized = fileName
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.slice(0, 90) || "ek-dosya";
}

function caseAttachmentContentType(file: File) {
  if (CASE_ATTACHMENT_TYPES.has(file.type)) return file.type;
  const extension = String(file.name || "").split(".").pop()?.toLowerCase() || "";
  return CASE_ATTACHMENT_EXTENSION_TYPES[extension] || file.type || "";
}

export function validateCaseAttachmentFiles(files: File[], existingCount = 0) {
  if (existingCount + files.length > CASE_ATTACHMENT_MAX_COUNT) {
    throw new Error(`Bir dosyaya en fazla ${CASE_ATTACHMENT_MAX_COUNT} ek yÃ¼klenebilir.`);
  }
  for (const file of files) {
    if (!CASE_ATTACHMENT_TYPES.has(caseAttachmentContentType(file))) {
      throw new Error(`${file.name}: Bu dosya tÃ¼rÃ¼ desteklenmiyor.`);
    }
    if (file.size < 1 || file.size > CASE_ATTACHMENT_MAX_SIZE) {
      throw new Error(`${file.name}: Dosya 6 MB veya daha kÃ¼Ã§Ã¼k olmalÄ±.`);
    }
  }
}

export async function uploadCaseAttachments(
  parentType: keyof typeof CASE_PARENT_COLUMNS,
  parentId: string,
  selectedFiles: File[]
) {
  const parentColumn = CASE_PARENT_COLUMNS[parentType];
  const profileId = getSession()?.user?.id || "";
  const files = Array.from(selectedFiles || []);
  if (!parentColumn || !parentId || !profileId || !files.length) return [];

  const existing = await list(
    "case_attachments",
    `${parentColumn}=eq.${encodeURIComponent(parentId)}&select=id`
  );
  validateCaseAttachmentFiles(files, existing.length);

  const pendingRows: Array<Record<string, string | number>> = [];
  const uploadedPaths: string[] = [];
  try {
    for (const file of files) {
      const uniqueId = globalThis.crypto?.randomUUID?.()
        || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const objectPath = [
        profileId,
        parentType,
        parentId,
        `${uniqueId}-${safeObjectFileName(file.name)}`
      ].join("/");
      const contentType = caseAttachmentContentType(file);

      await uploadStorageObject(CASE_ATTACHMENT_BUCKET, objectPath, file, contentType);
      uploadedPaths.push(objectPath);
      pendingRows.push({
        [parentColumn]: parentId,
        uploaded_by: profileId,
        file_name: file.name.slice(0, 180),
        object_path: objectPath,
        content_type: contentType,
        size_bytes: file.size
      });
    }

    return await restRequest("case_attachments", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(pendingRows)
    });
  } catch (error) {
    await Promise.allSettled(
      uploadedPaths.map((objectPath) => removeStorageObject(CASE_ATTACHMENT_BUCKET, objectPath))
    );
    throw error;
  }
}

export async function downloadCaseAttachment(attachment) {
  const blob = await downloadStorageObject(
    CASE_ATTACHMENT_BUCKET,
    String(attachment?.object_path || "")
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = String(attachment?.file_name || "ihp-ek-dosya");
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
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

export async function manageDisciplineRecord(payload: Record<string, any>) {
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
