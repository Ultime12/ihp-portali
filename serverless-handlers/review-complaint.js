import { emailProfile } from "../server/mail.js";

const COMPLAINT_MANAGERS = new Set(["super_admin", "discipline_chair", "discipline_vice_chair", "discipline_member"]);
const OVERRIDE_MANAGERS = new Set(["super_admin", "discipline_chair"]);
const VALID_STATUSES = new Set(["new", "reviewing", "resolved", "rejected", "closed"]);
const VALID_PRIORITIES = new Set(["normal", "important", "urgent"]);
const VALID_PRELIMINARY_OUTCOMES = new Set(["investigation_opened", "evidence_requested", "rejected", "forwarded"]);
const CURRENT_REGULATION_VERSION = "2026-07-19";

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
  if (!profile || profile.status !== "active" || profile.is_system_account) return null;
  const roles = Array.isArray(profile.roles) && profile.roles.length ? profile.roles : [profile.role];
  return { authUser, profile, roles };
}

function hasAny(roles, allowed) {
  return roles.some((role) => allowed.has(role));
}

function parseDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function utcDateOnly(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function rolesOf(profile) {
  const roles = Array.isArray(profile?.roles) && profile.roles.length ? [...profile.roles] : [];
  if (profile?.role && !roles.includes(profile.role)) roles.unshift(profile.role);
  return [...new Set(roles.filter(Boolean))];
}

function isComplaintAssignee(profile) {
  if (!profile || profile.status !== "active" || profile.is_system_account) return false;
  return rolesOf(profile).some((role) => ["discipline_chair", "discipline_vice_chair", "discipline_member"].includes(role));
}

async function notify(profileId, actorId, title, body) {
  if (!profileId) return;
  await supabaseRequest("/rest/v1/notifications", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      recipient_id: profileId,
      actor_id: actorId,
      title,
      body,
      category: "complaint",
      link: "https://dk.ihp.org.tr/#/portal/complaints"
    })
  }).catch(() => undefined);
  await emailProfile(supabaseRequest, profileId, {
    subject: title,
    title,
    body,
    actionUrl: "https://dk.ihp.org.tr/#/portal/complaints",
    actionLabel: "Sikayetleri ac"
  }).catch(() => undefined);
}

async function audit(actorId, complaintId, summary, details = {}) {
  await supabaseRequest("/rest/v1/audit_logs", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      action: "update",
      actor_id: actorId,
      target_type: "complaints",
      target_id: complaintId,
      details: { summary, ...details }
    })
  }).catch(() => undefined);
}

async function createComplaint(actor, body, response) {
  const accusedProfileId = String(body.accusedProfileId || "");
  const subject = String(body.subject || "").trim();
  const description = String(body.description || "").trim();
  const evidenceNote = String(body.evidenceNote || "").trim();
  const requestedOutcome = String(body.requestedOutcome || "").trim();
  const lateFilingReason = String(body.lateFilingReason || "").trim();
  const priority = String(body.priority || "normal");
  const eventDate = parseDateOnly(body.eventDate);
  const learnedAt = parseDateOnly(body.learnedAt);
  const today = utcDateOnly();
  const earliestAllowed = new Date(today);
  earliestAllowed.setUTCDate(earliestAllowed.getUTCDate() - 30);

  if (!accusedProfileId || accusedProfileId === actor.authUser.id) {
    return json(response, 400, { error: "Şikâyet edilen aktif üye seçilmelidir; kişi kendisini şikâyet edemez." });
  }
  if (subject.length < 3 || subject.length > 140 || description.length < 10 || description.length > 12000) {
    return json(response, 400, { error: "Şikâyet başlığı veya olay açıklaması geçersiz." });
  }
  if (evidenceNote.length < 3 || evidenceNote.length > 1200 || requestedOutcome.length < 3 || requestedOutcome.length > 2000) {
    return json(response, 400, { error: "Kanıt açıklaması ve başvuru talebi zorunludur." });
  }
  if (!VALID_PRIORITIES.has(priority) || !eventDate || !learnedAt) {
    return json(response, 400, { error: "Şikâyet tarihi veya öncelik bilgisi geçersiz." });
  }
  if (eventDate > today || learnedAt > today || eventDate > learnedAt) {
    return json(response, 400, { error: "Olay tarihi gelecekte olamaz ve öğrenme tarihinden sonra olamaz." });
  }
  if (learnedAt < earliestAllowed && (lateFilingReason.length < 10 || lateFilingReason.length > 2000)) {
    return json(response, 400, { error: "30 günlük süre aşıldıysa doğrulanabilir haklı neden açıklanmalıdır." });
  }

  const targetResponse = await supabaseRequest(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(accusedProfileId)}&select=id,status,is_system_account&limit=1`
  );
  const [target] = await targetResponse.json().catch(() => []);
  if (!targetResponse.ok || !target || target.status !== "active" || target.is_system_account) {
    return json(response, 404, { error: "Şikâyet edilen aktif üye bulunamadı." });
  }

  const insertResponse = await supabaseRequest("/rest/v1/complaints", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      complainant_profile_id: actor.authUser.id,
      created_by: actor.authUser.id,
      accused_profile_id: accusedProfileId,
      subject,
      description,
      evidence_note: evidenceNote,
      requested_outcome: requestedOutcome,
      late_filing_reason: lateFilingReason || null,
      event_date: String(body.eventDate),
      learned_at: String(body.learnedAt),
      priority,
      status: "new",
      regulation_version: CURRENT_REGULATION_VERSION,
      source_channel: "dk_portal"
    })
  });
  const inserted = await insertResponse.json().catch(() => null);
  if (!insertResponse.ok) {
    return json(response, insertResponse.status, { error: inserted?.message || "Şikâyet kaydedilemedi." });
  }

  const complaint = inserted?.[0] || null;
  await audit(actor.authUser.id, complaint?.id || accusedProfileId, "Resmî DK portalı şikâyeti oluşturuldu", {
    accused_profile_id: accusedProfileId,
    regulation_version: CURRENT_REGULATION_VERSION
  });
  return json(response, 200, { ok: true, complaint });
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
  if (!actor) {
    return json(response, 401, { error: "Geçerli üye oturumu bulunamadı." });
  }
  if (request.body?.action === "create") {
    if (String(request.headers["x-ihp-portal"] || "").toLowerCase() !== "discipline") {
      return json(response, 403, { error: "Resmî disiplin şikâyeti yalnızca dk.ihp.org.tr üzerinden oluşturulabilir." });
    }
    return createComplaint(actor, request.body || {}, response);
  }
  if (!hasAny(actor.roles, COMPLAINT_MANAGERS)) {
    return json(response, 403, { error: "Sikayet islemek icin disiplin kurulu yetkisi gerekir." });
  }

  const {
    id,
    status = "reviewing",
    decisionNote = "",
    claim = false,
    targetEdit = false,
    assignedTo
  } = request.body || {};
  const preliminaryOutcome = String(request.body?.preliminaryOutcome || "");
  if (!id || !VALID_STATUSES.has(status)) {
    return json(response, 400, { error: "Sikayet bilgisi gecersiz." });
  }
  if (preliminaryOutcome && !VALID_PRELIMINARY_OUTCOMES.has(preliminaryOutcome)) {
    return json(response, 400, { error: "Ön inceleme kararı geçersiz." });
  }
  if (targetEdit && !actor.roles.includes("super_admin")) {
    return json(response, 403, { error: "Sikayet sorumlusunu yalnizca admin degistirebilir." });
  }

  const complaintResponse = await supabaseRequest(
    `/rest/v1/complaints?id=eq.${encodeURIComponent(id)}&select=*&limit=1`
  );
  const [complaint] = await complaintResponse.json().catch(() => []);
  if (!complaintResponse.ok || !complaint) {
    return json(response, 404, { error: "Sikayet bulunamadi." });
  }

  if (
    complaint.complainant_profile_id === actor.authUser.id ||
    complaint.accused_profile_id === actor.authUser.id
  ) {
    return json(response, 403, {
      error: "Şikâyetin tarafı olan kişi bu kaydın sorumluluğunu alamaz veya kayıt hakkında işlem yapamaz."
    });
  }

  const assignedToOther = complaint.assigned_to && complaint.assigned_to !== actor.authUser.id;
  if (assignedToOther && !hasAny(actor.roles, OVERRIDE_MANAGERS)) {
    return json(response, 403, { error: "Bu sikayet baska bir yetkili tarafindan ustlenilmis." });
  }
  const outcomeStatus = {
    investigation_opened: "reviewing",
    evidence_requested: "reviewing",
    rejected: "rejected",
    forwarded: "closed"
  }[preliminaryOutcome];
  const effectiveStatus = outcomeStatus || (targetEdit && request.body?.status === undefined ? complaint.status : status);

  const patch = {
    status: effectiveStatus,
    decision_note: decisionNote || complaint.decision_note || null
  };
  if (preliminaryOutcome) {
    if (!String(decisionNote || "").trim()) {
      return json(response, 400, { error: "Ön inceleme kararı için gerekçe veya istek metni zorunludur." });
    }
    patch.preliminary_outcome = preliminaryOutcome;
    patch.preliminary_reviewed_at = new Date().toISOString();
    patch.preliminary_reviewed_by = actor.authUser.id;
  }

  let nextAssigneeProfile = null;
  const requestedAssignedTo = assignedTo === undefined ? undefined : String(assignedTo || "");
  if (targetEdit && requestedAssignedTo !== undefined) {
    if (requestedAssignedTo) {
      const targetResponse = await supabaseRequest(
        `/rest/v1/profiles?id=eq.${encodeURIComponent(requestedAssignedTo)}&select=id,display_name,role,roles,status,is_system_account&limit=1`
      );
      [nextAssigneeProfile] = await targetResponse.json().catch(() => []);
      if (!targetResponse.ok || !isComplaintAssignee(nextAssigneeProfile)) {
        return json(response, 404, { error: "Sorumlu yalnizca aktif DK personeli olabilir." });
      }
      if ([complaint.complainant_profile_id, complaint.accused_profile_id].includes(requestedAssignedTo)) {
        return json(response, 400, { error: "Şikâyetin tarafı olan kişi bu kayda sorumlu atanamaz." });
      }
    }
    patch.assigned_to = requestedAssignedTo || null;
    patch.assigned_at = requestedAssignedTo ? new Date().toISOString() : null;
  }

  if (claim) {
    if (complaint.assigned_to === actor.authUser.id) {
      return json(response, 409, { error: "Bu sikayetin sorumlulugu zaten sizdedir." });
    }
    patch.assigned_to = actor.authUser.id;
    patch.assigned_at = new Date().toISOString();
  }

  if (!targetEdit && !claim) {
    if (!complaint.assigned_to) {
      return json(response, 409, { error: "Islem yapmadan once sikayetin sorumlulugu alinmalidir." });
    }
    if (complaint.assigned_to !== actor.authUser.id) {
      return json(response, 403, { error: "Bu sikayette yalnizca kaydin sorumlusu islem yapabilir." });
    }
  }

  if (!targetEdit && ["resolved", "rejected", "closed"].includes(effectiveStatus)) {
    if (!String(decisionNote || "").trim()) {
      return json(response, 400, { error: "Sonuc icin karar notu zorunludur." });
    }
    patch.decided_by = actor.authUser.id;
    patch.decided_at = new Date().toISOString();
  }

  const updateResponse = await supabaseRequest(`/rest/v1/complaints?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(patch)
  });
  const updated = await updateResponse.json().catch(() => null);
  if (!updateResponse.ok) {
    return json(response, updateResponse.status, {
      error: updated?.message || "Sikayet guncellenemedi."
    });
  }

  const summary = assignedToOther && claim
    ? "Sikayet sorumlulugu disiplin kurulu baskani tarafindan devralindi"
    : claim
      ? "Sikayet sorumlulugu alindi"
    : targetEdit
      ? "Sikayet sorumlusu admin tarafindan guncellendi"
      : preliminaryOutcome
        ? `Şikâyet ön incelemesi ${preliminaryOutcome} kararıyla tamamlandı`
        : `Sikayet durumu ${effectiveStatus} olarak guncellendi`;
  await audit(actor.authUser.id, id, summary, {
    old_status: complaint.status,
    new_status: effectiveStatus,
    old_assigned_to: complaint.assigned_to,
    new_assigned_to: Object.prototype.hasOwnProperty.call(patch, "assigned_to")
      ? patch.assigned_to
      : complaint.assigned_to,
    old_accused_profile_id: complaint.accused_profile_id,
    new_accused_profile_id: complaint.accused_profile_id
  });

  if (targetEdit && Object.prototype.hasOwnProperty.call(patch, "assigned_to") && complaint.assigned_to && complaint.assigned_to !== patch.assigned_to) {
    await notify(
      complaint.assigned_to,
      actor.authUser.id,
      "Sikayet sorumlulugunuz degisti",
      decisionNote || "Ustlendiginiz sikayetin sorumlusu admin tarafindan degistirildi."
    );
  }

  if (targetEdit && patch.assigned_to) {
    await notify(
      patch.assigned_to,
      actor.authUser.id,
      "Sikayet size atandi",
      decisionNote || "Bir sikayet kaydi admin tarafindan size atandi."
    );
  }

  if (assignedToOther && claim) {
    await notify(
      complaint.assigned_to,
      actor.authUser.id,
      "Şikayet sorumluluğu devredildi",
      "Üstlendiğiniz şikayet disiplin kurulu başkanı tarafından devralındı."
    );
  }

  await notify(
    complaint.complainant_profile_id,
    actor.authUser.id,
    preliminaryOutcome === "evidence_requested"
      ? "Şikâyetiniz için ek bilgi istendi"
      : preliminaryOutcome === "forwarded"
        ? "Şikâyetiniz yetkili organa gönderildi"
        : preliminaryOutcome === "rejected"
          ? "Şikâyetiniz hakkında ön inceleme kararı verildi"
          : effectiveStatus === "reviewing"
            ? "Şikayetiniz incelemeye alındı"
            : "Şikayetiniz güncellendi",
    decisionNote || "Şikayet kaydınız disiplin kurulu tarafından güncellendi."
  );

  return json(response, 200, { ok: true, complaint: updated?.[0] || null });
}
