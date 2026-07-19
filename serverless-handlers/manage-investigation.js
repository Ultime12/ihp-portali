import { emailProfile } from "../server/mail.js";
import { sendDisciplineMailboxMessage } from "../server/mailbox-api.js";

const INVESTIGATION_MANAGERS = new Set(["super_admin", "discipline_chair", "discipline_vice_chair", "discipline_member"]);
const PROTECTED_ROLES = new Set(["super_admin"]);
const VALID_CLASSIFICATIONS = new Set(["light", "medium", "heavy", "very_heavy", "expulsion"]);
const CURRENT_REGULATION_VERSION = "2026-07-19";
const VALID_ACTIONS = new Set([
  "create",
  "claim",
  "transfer",
  "extend",
  "extend_defense",
  "schedule_hearing",
  "complete_hearing",
  "reviewing",
  "closed",
  "cancelled",
  "submit_defense",
  "close_defense",
  "recuse",
  "update",
  "delete"
]);

function json(response, status, body) {
  return response.status(status).json(body);
}

async function supabaseRequest(path, options = {}) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
}

async function authenticateActor(request) {
  const bearer = request.headers.authorization || "";
  if (!bearer.startsWith("Bearer ")) return null;

  const token = bearer.slice(7);
  const authResponse = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`
    }
  });
  if (!authResponse.ok) return null;

  const authUser = await authResponse.json();
  const profileResponse = await supabaseRequest(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(authUser.id)}&select=id,role,roles,status,is_system_account&limit=1`
  );
  const [profile] = await profileResponse.json().catch(() => []);
  if (!profile) return null;
  const roles = Array.isArray(profile.roles) && profile.roles.length ? profile.roles : [profile.role];
  if (profile.status === "left" || (profile.is_system_account && !roles.includes("super_admin"))) return null;
  return { authUser, profile, roles };
}

function hasAny(roles, allowed) {
  return roles.some((role) => allowed.has(role));
}

function normalizedArticles(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(source.map((item) => String(item).trim()).filter(Boolean))].slice(0, 20);
}

function addDays(value, days) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function rolesOf(profile) {
  const roles = Array.isArray(profile?.roles) && profile.roles.length ? [...profile.roles] : [];
  if (profile?.role && !roles.includes(profile.role)) roles.unshift(profile.role);
  return [...new Set(roles.filter(Boolean))];
}

function disciplineRank(roles) {
  if (roles.includes("discipline_chair")) return 3;
  if (roles.includes("discipline_vice_chair")) return 2;
  if (roles.includes("discipline_member")) return 1;
  return 0;
}

function canTakeResponsibility(actorRoles, assigneeRoles) {
  if (actorRoles.includes("super_admin")) return true;
  if (!assigneeRoles?.length) return actorRoles.includes("discipline_chair");
  if (assigneeRoles.includes("super_admin")) return false;
  const actorRank = disciplineRank(actorRoles);
  const assigneeRank = disciplineRank(assigneeRoles);
  return actorRank > 0 && assigneeRank > 0 && actorRank > assigneeRank;
}

function canDelegateResponsibility(actorRoles, targetRoles) {
  if (actorRoles.includes("super_admin")) return disciplineRank(targetRoles) > 0;
  const actorRank = disciplineRank(actorRoles);
  const targetRank = disciplineRank(targetRoles);
  return actorRank > 0 && targetRank > 0 && actorRank > targetRank;
}

function canAffectTarget(actorRoles, targetRoles) {
  if (targetRoles.some((role) => PROTECTED_ROLES.has(role))) return false;
  if (actorRoles.includes("super_admin")) return true;
  const actorRank = disciplineRank(actorRoles);
  const targetRank = disciplineRank(targetRoles);
  if (!actorRank) return false;
  return targetRank === 0 || targetRank < actorRank;
}

function canOpenInvestigationFor(actorRoles, targetRoles) {
  if (targetRoles.some((role) => PROTECTED_ROLES.has(role))) return false;
  if (actorRoles.includes("super_admin")) return true;
  return disciplineRank(actorRoles) > 0;
}

async function fetchSingle(path) {
  const response = await supabaseRequest(path);
  const [row] = await response.json().catch(() => []);
  return response.ok ? row || null : null;
}

async function fetchProfileRoles(profileId) {
  if (!profileId) return [];
  const profile = await fetchSingle(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(profileId)}&select=id,role,roles,status,is_system_account&limit=1`
  );
  if (!profile || profile.status !== "active" || profile.is_system_account) return [];
  return rolesOf(profile);
}

async function fetchProfileForAssignment(profileId) {
  if (!profileId) return null;
  return fetchSingle(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(profileId)}&select=id,display_name,role,roles,status,is_system_account&limit=1`
  );
}

function isAssignableInvestigator(profile) {
  if (!profile || profile.status !== "active" || profile.is_system_account) return false;
  const roles = rolesOf(profile);
  return disciplineRank(roles) > 0 && !roles.includes("super_admin");
}

async function notify(profileId, actorId, title, body, { idempotencyKey = "" } = {}) {
  if (!profileId) return;
  await supabaseRequest("/rest/v1/notifications", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      recipient_id: profileId,
      actor_id: actorId,
      title,
      body,
      category: "discipline",
      link: "https://dk.ihp.org.tr/#/portal/investigations"
    })
  }).catch(() => undefined);
  await Promise.allSettled([
    emailProfile(supabaseRequest, profileId, {
      from: "İHP Disiplin Kurulu <dk@ihp.org.tr>",
      subject: `İHP Disiplin Kurulu: ${title}`,
      title,
      body,
      actionUrl: "https://dk.ihp.org.tr/#/portal/investigations",
      actionLabel: "Soruşturma kaydını aç",
      senderLabel: "İHP Disiplin Kurulu",
      idempotencyKey,
      force: true
    }),
    sendDisciplineMailboxMessage(profileId, {
      subject: `İHP Disiplin Kurulu: ${title}`,
      body
    })
  ]);
}

async function audit(actorId, investigationId, summary, details = {}) {
  await supabaseRequest("/rest/v1/audit_logs", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      action: "update",
      actor_id: actorId,
      target_type: "investigations",
      target_id: investigationId,
      details: { summary, ...details }
    })
  }).catch(() => undefined);
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return json(response, 405, { error: "Yalnizca POST istegi kabul edilir." });
  }

  if (
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_ANON_KEY ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return json(response, 500, { error: "Sunucu yapilandirmasi eksik." });
  }

  const actor = await authenticateActor(request);
  const body = request.body || {};
  const action = String(body.action || "");
  if (!actor) return json(response, 401, { error: "Geçerli üye oturumu bulunamadı." });
  if (!VALID_ACTIONS.has(action)) {
    return json(response, 400, { error: "Sorusturma islemi gecersiz." });
  }
  if (
    action !== "submit_defense" &&
    (actor.profile.status !== "active" || !hasAny(actor.roles, INVESTIGATION_MANAGERS))
  ) {
    return json(response, 403, { error: "Sorusturma islemi icin disiplin kurulu yetkisi gerekir." });
  }

  if (action === "create") {
    const subjectProfileId = String(body.subjectProfileId || "");
    const title = String(body.title || "").trim();
    const description = String(body.description || "").trim();
    const classification = String(body.classification || "");
    const allegedArticles = normalizedArticles(body.allegedArticles);
    const evidenceSummary = String(body.evidenceSummary || body.evidenceNote || "").trim();
    const sourceComplaintId = String(body.sourceComplaintId || "");
    if (
      !subjectProfileId ||
      title.length < 3 ||
      description.length < 10 ||
      description.length > 12000 ||
      !VALID_CLASSIFICATIONS.has(classification) ||
      !allegedArticles.length ||
      evidenceSummary.length < 3
    ) {
      return json(response, 400, { error: "Sorusturma bilgileri eksik." });
    }

    const subject = await fetchSingle(
      `/rest/v1/profiles?id=eq.${encodeURIComponent(subjectProfileId)}&select=id,role,roles,status,is_system_account&limit=1`
    );
    if (!subject) return json(response, 404, { error: "Ilgili uye bulunamadi." });
    if (subject.status !== "active" || subject.is_system_account) {
      return json(response, 400, { error: "Sorusturma yalnizca aktif gercek uyeler icin acilabilir." });
    }
    if (subject.id === actor.authUser.id) {
      return json(response, 400, { error: "Kisi kendi hakkinda sorusturma acamaz." });
    }
    if (!canOpenInvestigationFor(actor.roles, rolesOf(subject))) {
      return json(response, 403, { error: "Disiplin hiyerarsisi bu sorusturmaya izin vermiyor." });
    }

    let sourceComplaint = null;
    if (sourceComplaintId) {
      sourceComplaint = await fetchSingle(
        `/rest/v1/complaints?id=eq.${encodeURIComponent(sourceComplaintId)}&select=id,accused_profile_id,assigned_to,complainant_profile_id,status&limit=1`
      );
      if (!sourceComplaint || sourceComplaint.accused_profile_id !== subjectProfileId) {
        return json(response, 400, { error: "Kaynak şikâyet ile soruşturmanın ilgili üyesi eşleşmiyor." });
      }
      if (!actor.roles.includes("super_admin") && sourceComplaint.assigned_to !== actor.authUser.id) {
        return json(response, 403, { error: "Soruşturmayı yalnızca şikâyetin sorumlusu açabilir." });
      }
      if (sourceComplaint.complainant_profile_id === actor.authUser.id) {
        return json(response, 403, { error: "Şikâyeti yazan kişi aynı dosyada soruşturmacı olamaz." });
      }
    }

    const openedAt = new Date();
    const defenseDays = ["heavy", "very_heavy", "expulsion"].includes(classification) ? 5 : 3;

    const insertResponse = await supabaseRequest("/rest/v1/investigations", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        subject_profile_id: subjectProfileId,
        opened_by: actor.authUser.id,
        assigned_to: null,
        assigned_at: null,
        status: "open",
        title: title.slice(0, 140),
        description: description.slice(0, 12000),
        evidence_note: String(body.evidenceNote || evidenceSummary).slice(0, 1200),
        evidence_file: String(body.evidenceFile || ""),
        evidence_filename: String(body.evidenceFilename || "").slice(0, 180),
        defense_status: "pending",
        defense_text: "",
        defense_note: "",
        regulation_version: CURRENT_REGULATION_VERSION,
        source_complaint_id: sourceComplaintId || null,
        classification,
        alleged_articles: allegedArticles,
        evidence_summary: evidenceSummary.slice(0, 12000),
        due_at: addDays(openedAt, 7),
        notice_sent_at: openedAt.toISOString(),
        defense_due_at: addDays(openedAt, defenseDays),
        hearing_required: ["heavy", "very_heavy", "expulsion"].includes(classification)
      })
    });
    const inserted = await insertResponse.json().catch(() => null);
    if (!insertResponse.ok) {
      return json(response, insertResponse.status, { error: inserted?.message || "Sorusturma acilamadi." });
    }

    const investigation = inserted?.[0] || null;
    if (sourceComplaintId && investigation?.id) {
      await supabaseRequest(`/rest/v1/complaints?id=eq.${encodeURIComponent(sourceComplaintId)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          status: "reviewing",
          linked_investigation_id: investigation.id,
          preliminary_outcome: "investigation_opened",
          preliminary_reviewed_at: new Date().toISOString(),
          preliminary_reviewed_by: actor.authUser.id,
          decision_note: "Soruşturma açıldı."
        })
      }).catch(() => undefined);
    }
    await audit(actor.authUser.id, investigation?.id || subjectProfileId, "Sorusturma acildi", { subject_profile_id: subjectProfileId });
    await notify(
      subjectProfileId,
      actor.authUser.id,
      "Hakkınızda soruşturma açıldı",
      [
        `Dosya başlığı: ${title}`,
        investigation?.case_number ? `Dosya numarası: ${investigation.case_number}` : "",
        `Açılış tarihi: ${new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}`,
        `İsnat edilen maddeler: ${allegedArticles.join(", ")}`,
        `Savunma son tarihi: ${new Date(addDays(openedAt, defenseDays)).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}`,
        `Durum: Açık - savunma bekleniyor`,
        "",
        "Olay ve inceleme özeti:",
        description,
        body.evidenceNote ? `\nKanıt notu:\n${String(body.evidenceNote).slice(0, 1200)}` : "",
        "",
        "Savunmanızı ve dosyanın güncel durumunu Disiplin Kurulu sisteminden görüntüleyebilirsiniz."
      ].filter(Boolean).join("\n"),
      { idempotencyKey: investigation?.id ? `investigation-opened-${investigation.id}` : "" }
    );
    return json(response, 200, { ok: true, investigation });
  }

  const id = String(body.id || "");
  if (!id) return json(response, 400, { error: "Sorusturma id eksik." });
  const investigation = await fetchSingle(`/rest/v1/investigations?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  if (!investigation) return json(response, 404, { error: "Sorusturma bulunamadi." });
  const isAdmin = actor.roles.includes("super_admin");
  const sourceComplaint = investigation.source_complaint_id
    ? await fetchSingle(
        `/rest/v1/complaints?id=eq.${encodeURIComponent(investigation.source_complaint_id)}&select=id,complainant_profile_id,accused_profile_id&limit=1`
      )
    : null;
  const actorHasCaseConflict = investigation.subject_profile_id === actor.authUser.id ||
    sourceComplaint?.complainant_profile_id === actor.authUser.id;

  if (action !== "submit_defense" && actorHasCaseConflict) {
    return json(response, 403, {
      error: "Şikâyetçi veya hakkında soruşturma yürütülen kişi aynı dosyada kurul işlemi yapamaz."
    });
  }

  if (action === "extend") {
    if (!isAdmin && !actor.roles.includes("discipline_chair")) {
      return json(response, 403, { error: "Soruşturma süresini yalnızca Disiplin Kurulu Başkanı uzatabilir." });
    }
    if (["closed", "cancelled"].includes(investigation.status)) {
      return json(response, 400, { error: "Kapanmış soruşturmanın süresi uzatılamaz." });
    }
    if (Number(investigation.extension_days || 0) > 0) {
      return json(response, 409, { error: "Soruşturma süresi yalnızca bir kez uzatılabilir." });
    }
    const extensionDays = Number(body.extensionDays);
    const extensionReason = String(body.decisionNote || body.extensionReason || "").trim();
    if (!Number.isInteger(extensionDays) || extensionDays < 1 || extensionDays > 5 || extensionReason.length < 10) {
      return json(response, 400, { error: "Uzatma 1-5 gün arasında olmalı ve gerekçesi yazılmalıdır." });
    }
    const baseDueAt = investigation.due_at || addDays(investigation.created_at || new Date(), 7);
    const patch = {
      due_at: addDays(baseDueAt, extensionDays),
      extension_days: extensionDays,
      extension_reason: extensionReason.slice(0, 1200)
    };
    const updateResponse = await supabaseRequest(`/rest/v1/investigations?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch)
    });
    const updated = await updateResponse.json().catch(() => null);
    if (!updateResponse.ok) {
      return json(response, updateResponse.status, { error: updated?.message || "Soruşturma süresi uzatılamadı." });
    }
    await audit(actor.authUser.id, id, "Soruşturma süresi gerekçeli olarak uzatıldı", {
      extension_days: extensionDays,
      due_at: patch.due_at
    });
    await notify(
      investigation.subject_profile_id,
      actor.authUser.id,
      "Soruşturma süresi uzatıldı",
      `${extensionDays} günlük uzatma gerekçesi: ${extensionReason}`
    );
    return json(response, 200, { ok: true, investigation: updated?.[0] || null });
  }

  if (action === "extend_defense") {
    const canExtendDefense = isAdmin || actor.roles.includes("discipline_chair") || investigation.assigned_to === actor.authUser.id;
    if (!canExtendDefense) {
      return json(response, 403, { error: "Savunma ek süresini yalnızca dosya görevlisi veya Disiplin Kurulu Başkanı verebilir." });
    }
    if (["closed", "cancelled"].includes(investigation.status) || investigation.defense_status !== "pending") {
      return json(response, 400, { error: "Savunma aşaması açık olmayan dosyada ek süre verilemez." });
    }
    if (investigation.defense_extended_at) {
      return json(response, 409, { error: "Savunma için yalnızca bir kez ek süre verilebilir." });
    }
    const defenseDueAt = new Date(body.defenseDueAt || "");
    const currentDueAt = new Date(investigation.defense_due_at || 0);
    const extensionReason = String(body.decisionNote || body.extensionReason || "").trim();
    if (
      Number.isNaN(defenseDueAt.valueOf()) ||
      defenseDueAt.getTime() <= Date.now() ||
      (!Number.isNaN(currentDueAt.valueOf()) && defenseDueAt <= currentDueAt) ||
      extensionReason.length < 10 ||
      extensionReason.length > 2000
    ) {
      return json(response, 400, { error: "Yeni savunma tarihi mevcut süreden sonra olmalı ve doğrulanabilir mazeret yazılmalıdır." });
    }
    const patch = {
      defense_due_at: defenseDueAt.toISOString(),
      defense_extension_reason: extensionReason,
      defense_extended_at: new Date().toISOString(),
      defense_extended_by: actor.authUser.id
    };
    const updateResponse = await supabaseRequest(`/rest/v1/investigations?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch)
    });
    const updated = await updateResponse.json().catch(() => null);
    if (!updateResponse.ok) {
      return json(response, updateResponse.status, { error: updated?.message || "Savunma ek süresi kaydedilemedi." });
    }
    await audit(actor.authUser.id, id, "Doğrulanabilir mazeret nedeniyle bir defalık savunma ek süresi verildi", {
      defense_due_at: patch.defense_due_at
    });
    await notify(
      investigation.subject_profile_id,
      actor.authUser.id,
      "Savunma ek süresi verildi",
      `Yeni savunma son tarihi: ${defenseDueAt.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}\nGerekçe: ${extensionReason}`
    );
    return json(response, 200, { ok: true, investigation: updated?.[0] || null });
  }

  if (action === "delete") {
    if (!isAdmin) return json(response, 403, { error: "Soruşturmayı yalnızca teknik Admin kalıcı olarak silebilir." });
    if (investigation.regulation_version === CURRENT_REGULATION_VERSION) {
      return json(response, 409, { error: "19.07.2026 yönetmeliğine tabi soruşturma kayıtları kalıcı olarak silinemez." });
    }
    const deleteResponse = await supabaseRequest(`/rest/v1/investigations?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" }
    });
    if (!deleteResponse.ok) {
      const result = await deleteResponse.json().catch(() => ({}));
      return json(response, deleteResponse.status, { error: result.message || "Soruşturma silinemedi." });
    }
    await audit(actor.authUser.id, id, "Soruşturma teknik Admin tarafından kalıcı olarak silindi");
    return json(response, 200, { ok: true, deleted: true });
  }

  if (action === "update") {
    if (!isAdmin) return json(response, 403, { error: "Soruşturmayı yalnızca teknik Admin düzeltebilir." });
    const title = String(body.title || "").trim();
    const description = String(body.description || "").trim();
    const classification = String(body.classification || investigation.classification || "");
    const allegedArticles = normalizedArticles(body.allegedArticles || investigation.alleged_articles || []);
    const evidenceSummary = String(body.evidenceSummary || body.evidenceNote || investigation.evidence_summary || "").trim();
    if (
      title.length < 3 ||
      description.length < 10 ||
      description.length > 12000 ||
      (investigation.regulation_version === CURRENT_REGULATION_VERSION && (
        !VALID_CLASSIFICATIONS.has(classification) ||
        !allegedArticles.length ||
        evidenceSummary.length < 3
      ))
    ) {
      return json(response, 400, { error: "Soruşturma başlığı veya açıklaması eksik." });
    }
    const patch = {
      title: title.slice(0, 140),
      description: description.slice(0, 12000),
      evidence_note: evidenceSummary.slice(0, 1200),
      evidence_summary: evidenceSummary.slice(0, 12000),
      evidence_file: String(body.evidenceFile || ""),
      evidence_filename: String(body.evidenceFilename || "").slice(0, 180)
    };
    if (investigation.regulation_version === CURRENT_REGULATION_VERSION) {
      patch.classification = classification;
      patch.alleged_articles = allegedArticles;
      patch.hearing_required = ["heavy", "very_heavy", "expulsion"].includes(classification) || investigation.hearing_required;
    }
    const updateResponse = await supabaseRequest(`/rest/v1/investigations?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch)
    });
    const updated = await updateResponse.json().catch(() => null);
    if (!updateResponse.ok) {
      return json(response, updateResponse.status, { error: updated?.message || "Soruşturma düzeltilemedi." });
    }
    await audit(actor.authUser.id, id, "Soruşturma teknik Admin tarafından düzeltildi");
    return json(response, 200, { ok: true, investigation: updated?.[0] || null });
  }

  if (action === "submit_defense") {
    if (investigation.subject_profile_id !== actor.authUser.id) {
      return json(response, 403, { error: "Yalnızca kendi soruşturmanız için savunma sunabilirsiniz." });
    }
    if (["closed", "cancelled"].includes(investigation.status) || investigation.defense_status !== "pending") {
      return json(response, 400, { error: "Bu soruşturma için savunma aşaması kapalıdır." });
    }
    if (investigation.defense_due_at && new Date(investigation.defense_due_at).getTime() < Date.now()) {
      return json(response, 400, { error: "Savunma süresi sona ermiştir." });
    }
    const defenseText = String(body.defenseText || "").trim();
    if (defenseText.length < 20) {
      return json(response, 400, { error: "Savunma metni en az 20 karakter olmalıdır." });
    }
    const updateResponse = await supabaseRequest(`/rest/v1/investigations?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        defense_status: "submitted",
        defense_text: defenseText.slice(0, 12000),
        defense_submitted_at: new Date().toISOString(),
        defense_note: ""
      })
    });
    const updated = await updateResponse.json().catch(() => null);
    if (!updateResponse.ok) {
      return json(response, updateResponse.status, { error: updated?.message || "Savunma kaydedilemedi." });
    }
    await audit(actor.authUser.id, id, "Üye soruşturma savunmasını sundu");
    if (investigation.assigned_to) {
      await notify(investigation.assigned_to, actor.authUser.id, "Soruşturma savunması sunuldu", investigation.title);
    }
    return json(response, 200, { ok: true, investigation: updated?.[0] || null });
  }

  if (["cancelled", "closed"].includes(investigation.status)) {
    return json(response, 400, { error: "Kapanmis sorusturma guncellenemez." });
  }

  if (action === "recuse") {
    if (investigation.assigned_to !== actor.authUser.id) {
      return json(response, 403, { error: "Yalnızca sorumlu soruşturmacı çıkar çatışması nedeniyle çekilebilir." });
    }
    const recusalNote = String(body.decisionNote || "").trim();
    if (recusalNote.length < 10) {
      return json(response, 400, { error: "Çıkar çatışması açıklaması en az 10 karakter olmalıdır." });
    }
    const recusedIds = Array.isArray(investigation.recused_profile_ids)
      ? [...new Set([...investigation.recused_profile_ids, actor.authUser.id])]
      : [actor.authUser.id];
    const updateResponse = await supabaseRequest(`/rest/v1/investigations?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        assigned_to: null,
        assigned_at: null,
        status: "reviewing",
        recused_profile_ids: recusedIds,
        recusal_note: recusalNote.slice(0, 1200)
      })
    });
    const updated = await updateResponse.json().catch(() => null);
    if (!updateResponse.ok) {
      return json(response, updateResponse.status, { error: updated?.message || "Çekilme kaydedilemedi." });
    }
    await audit(actor.authUser.id, id, "Soruşturmacı çıkar çatışması nedeniyle dosyadan çekildi", {
      recusal_note: recusalNote.slice(0, 220)
    });
    return json(response, 200, { ok: true, investigation: updated?.[0] || null });
  }

  if (action === "close_defense") {
    if ((!isAdmin && investigation.assigned_to !== actor.authUser.id) || investigation.defense_status !== "pending") {
      return json(response, 403, { error: "Savunma aşamasını yalnızca sorumlu soruşturmacı kapatabilir." });
    }
    if (investigation.defense_due_at && new Date(investigation.defense_due_at).getTime() > Date.now()) {
      return json(response, 400, { error: "Savunma süresi dolmadan savunma sunulmadı işlemi yapılamaz." });
    }
    const defenseNote = String(body.decisionNote || "").trim();
    if (defenseNote.length < 10) {
      return json(response, 400, { error: "Savunmanın sunulmadığına ilişkin gerekçe en az 10 karakter olmalıdır." });
    }
    const updateResponse = await supabaseRequest(`/rest/v1/investigations?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        defense_status: "not_submitted",
        defense_closed_by: actor.authUser.id,
        defense_closed_at: new Date().toISOString(),
        defense_note: defenseNote.slice(0, 1200)
      })
    });
    const updated = await updateResponse.json().catch(() => null);
    if (!updateResponse.ok) {
      return json(response, updateResponse.status, { error: updated?.message || "Savunma aşaması kapatılamadı." });
    }
    await audit(actor.authUser.id, id, "Savunma sunulmadığı gerekçesiyle savunma aşaması kapatıldı", {
      defense_note: defenseNote.slice(0, 220)
    });
    await notify(investigation.subject_profile_id, actor.authUser.id, "Savunma aşaması kapatıldı", defenseNote.slice(0, 500));
    return json(response, 200, { ok: true, investigation: updated?.[0] || null });
  }

  const subject = await fetchSingle(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(investigation.subject_profile_id)}&select=id,role,roles,status,is_system_account&limit=1`
  );
  if (subject && (subject.is_system_account || !canOpenInvestigationFor(actor.roles, rolesOf(subject)))) {
    return json(response, 403, { error: "Disiplin hiyerarsisi bu sorusturmaya izin vermiyor." });
  }

  const assignedToOther = investigation.assigned_to && investigation.assigned_to !== actor.authUser.id;
  const currentAssigneeRoles = assignedToOther ? await fetchProfileRoles(investigation.assigned_to) : [];
  const legacyOpeningAssignment = Boolean(
    assignedToOther &&
    investigation.status === "open" &&
    investigation.assigned_to === investigation.opened_by
  );

  if (action === "claim") {
    if ((investigation.recused_profile_ids || []).includes(actor.authUser.id)) {
      return json(response, 403, { error: "Çıkar çatışması nedeniyle çekildiğiniz dosyayı yeniden devralamazsınız." });
    }
    if (investigation.assigned_to === actor.authUser.id) {
      return json(response, 400, { error: "Bu sorusturma zaten sizin sorumlulugunuzda." });
    }
    if (assignedToOther && !legacyOpeningAssignment && !canTakeResponsibility(actor.roles, currentAssigneeRoles)) {
      return json(response, 403, { error: "Disiplin hiyerarsisi bu sorumlulugu devralmaya izin vermiyor." });
    }
  } else if (action === "transfer") {
    const assignedTo = String(body.assignedTo || "");
    if (!assignedTo) return json(response, 400, { error: "Devredilecek yetkili secilmelidir." });
    if (assignedTo === actor.authUser.id) return json(response, 400, { error: "Sorumlulugu kendinize devredemezsiniz; devralma islemini kullanin." });
    if (assignedToOther && !canTakeResponsibility(actor.roles, currentAssigneeRoles)) {
      return json(response, 403, { error: "Disiplin hiyerarsisi bu sorumlulugu devretmeye izin vermiyor." });
    }
    const targetAssignee = await fetchProfileForAssignment(assignedTo);
    if (!targetAssignee) return json(response, 404, { error: "Devredilecek yetkili bulunamadi." });
    if (targetAssignee.status !== "active" || targetAssignee.is_system_account) {
      return json(response, 400, { error: "Sorumluluk yalnizca aktif DK personeline devredilebilir." });
    }
    const targetAssigneeRoles = rolesOf(targetAssignee);
    if ((investigation.recused_profile_ids || []).includes(targetAssignee.id)) {
      return json(response, 403, { error: "Çıkar çatışması nedeniyle çekilen kişi bu dosyaya yeniden atanamaz." });
    }
    if (
      targetAssignee.id === investigation.subject_profile_id ||
      targetAssignee.id === sourceComplaint?.complainant_profile_id
    ) {
      return json(response, 403, { error: "Taraf olan kişi aynı dosyada soruşturmacı olarak görevlendirilemez." });
    }
    if (!canDelegateResponsibility(actor.roles, targetAssigneeRoles)) {
      return json(response, 403, { error: "Sorumluluk yalnizca DK hiyerarsisinde alt rutbeye devredilebilir." });
    }
  } else if (!isAdmin && investigation.assigned_to !== actor.authUser.id) {
    return json(response, 403, { error: "Bu islem icin once sorusturma sorumlulugunu devralmalisiniz." });
  }

  if (action === "schedule_hearing") {
    const scheduledAt = new Date(body.scheduledAt || "");
    const hearingMethod = String(body.hearingMethod || "").trim();
    if (Number.isNaN(scheduledAt.valueOf()) || scheduledAt.getTime() <= Date.now() || hearingMethod.length < 3) {
      return json(response, 400, { error: "Duruşma tarihi gelecekte olmalı ve katılım yöntemi belirtilmelidir." });
    }
    const patch = {
      hearing_required: true,
      hearing_scheduled_at: scheduledAt.toISOString(),
      hearing_method: hearingMethod.slice(0, 300),
      hearing_attendee_ids: [],
      hearing_evidence_list: [],
      hearing_held_at: null
    };
    const updateResponse = await supabaseRequest(`/rest/v1/investigations?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch)
    });
    const updated = await updateResponse.json().catch(() => null);
    if (!updateResponse.ok) {
      return json(response, updateResponse.status, { error: updated?.message || "Duruşma planlanamadı." });
    }
    await audit(actor.authUser.id, id, "Duruşma planlandı", { hearing_scheduled_at: patch.hearing_scheduled_at });
    await notify(
      investigation.subject_profile_id,
      actor.authUser.id,
      "Soruşturma duruşması planlandı",
      `Dosya: ${investigation.case_number || investigation.title}\nTarih: ${scheduledAt.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}\nKatılım yöntemi: ${hearingMethod}`
    );
    return json(response, 200, { ok: true, investigation: updated?.[0] || null });
  }

  if (action === "complete_hearing") {
    if (!investigation.hearing_scheduled_at) {
      return json(response, 400, { error: "Önce duruşma tarihi ve katılım yöntemi planlanmalıdır." });
    }
    if (new Date(investigation.hearing_scheduled_at).getTime() > Date.now()) {
      return json(response, 400, { error: "Planlanan duruşma zamanı gelmeden duruşma tamamlandı olarak kaydedilemez." });
    }
    const attendeeIds = normalizedArticles(body.attendeeIds).filter((value) => /^[0-9a-f-]{36}$/i.test(value));
    const evidenceList = normalizedArticles(body.evidenceList);
    if (!attendeeIds.length || !evidenceList.length) {
      return json(response, 400, { error: "Duruşmaya katılanlar ve sunulan delillerin listesi zorunludur." });
    }
    const patch = {
      hearing_attendee_ids: attendeeIds,
      hearing_evidence_list: evidenceList,
      hearing_held_at: new Date().toISOString()
    };
    const updateResponse = await supabaseRequest(`/rest/v1/investigations?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch)
    });
    const updated = await updateResponse.json().catch(() => null);
    if (!updateResponse.ok) {
      return json(response, updateResponse.status, { error: updated?.message || "Duruşma işlem kaydı tamamlanamadı." });
    }
    await audit(actor.authUser.id, id, "Duruşma yapıldı; yalnızca zorunlu idarî bilgiler kaydedildi", {
      hearing_held_at: patch.hearing_held_at,
      attendee_count: attendeeIds.length,
      evidence_count: evidenceList.length
    });
    return json(response, 200, { ok: true, investigation: updated?.[0] || null });
  }

  if (action === "cancelled" && !actor.roles.some((role) => ["super_admin", "discipline_chair"].includes(role))) {
    return json(response, 403, { error: "Sorusturmayi yalnizca Disiplin Kurulu baskani iptal edebilir." });
  }
  if (action === "closed" && investigation.defense_status === "pending") {
    return json(response, 400, { error: "Savunma aşaması tamamlanmadan soruşturma kapatılamaz." });
  }
  if (action === "closed" && investigation.hearing_required && !investigation.hearing_held_at) {
    return json(response, 400, { error: "Zorunlu duruşma tamamlanmadan soruşturma kapatılamaz." });
  }

  const decisionNote = String(body.decisionNote || "").trim();
  if (["closed", "cancelled"].includes(action) && !decisionNote) {
    return json(response, 400, { error: "Kapatma veya iptal icin karar notu zorunludur." });
  }

  const patch = {
    status: ["claim", "transfer"].includes(action) ? "reviewing" : action,
    decision_note: decisionNote || investigation.decision_note || null
  };

  if (action === "claim") {
    patch.assigned_to = actor.authUser.id;
    patch.assigned_at = new Date().toISOString();
  }
  if (action === "transfer") {
    patch.assigned_to = String(body.assignedTo || "");
    patch.assigned_at = new Date().toISOString();
  }
  if (["closed", "cancelled"].includes(action)) {
    patch.decided_by = actor.authUser.id;
    patch.decided_at = new Date().toISOString();
  }

  const updateResponse = await supabaseRequest(`/rest/v1/investigations?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(patch)
  });
  const updated = await updateResponse.json().catch(() => null);
  if (!updateResponse.ok) {
    return json(response, updateResponse.status, { error: updated?.message || "Sorusturma guncellenemedi." });
  }

  const auditSummary = action === "claim"
    ? (assignedToOther ? "Sorusturma sorumlulugu hiyerarsiyle devralindi" : "Sorusturma sorumlulugu alindi")
    : action === "transfer"
      ? "Sorusturma sorumlulugu alt rutbeye devredildi"
      : `Sorusturma ${patch.status} durumuna alindi`;
  await audit(actor.authUser.id, id, auditSummary, {
    old_status: investigation.status,
    new_status: patch.status,
    old_assigned_to: investigation.assigned_to,
    new_assigned_to: patch.assigned_to || investigation.assigned_to
  });
  if (assignedToOther && patch.assigned_to) {
    await notify(
      investigation.assigned_to,
      actor.authUser.id,
      "Sorusturma sorumlulugu devredildi",
      action === "transfer"
        ? "Ustlendiginiz sorusturma hiyerarsiye gore baska bir DK personeline devredildi."
        : "Ustlendiginiz sorusturma ust DK yetkilisi tarafindan devralindi."
    );
  }
  if (action === "transfer" && patch.assigned_to) {
    await notify(
      patch.assigned_to,
      actor.authUser.id,
      "Soruşturma size devredildi",
      decisionNote || investigation.title || "Bir soruşturmanın sorumluluğu size devredildi."
    );
  }
  await notify(investigation.subject_profile_id, actor.authUser.id, "Sorusturmaniz guncellendi", decisionNote || "Sorusturma kaydiniz guncellendi.");

  return json(response, 200, { ok: true, investigation: updated?.[0] || null });
}
