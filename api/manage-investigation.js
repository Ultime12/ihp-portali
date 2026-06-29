import { emailProfile } from "./_mail.js";

const INVESTIGATION_MANAGERS = new Set(["super_admin", "discipline_chair", "discipline_vice_chair", "discipline_member"]);
const PROTECTED_ROLES = new Set(["president", "vice_president"]);
const VALID_ACTIONS = new Set(["create", "claim", "transfer", "reviewing", "closed", "cancelled", "update", "delete"]);

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
    `/rest/v1/profiles?id=eq.${encodeURIComponent(authUser.id)}&select=id,role,roles,status&limit=1`
  );
  const [profile] = await profileResponse.json().catch(() => []);
  if (!profile || profile.status !== "active") return null;

  const roles = Array.isArray(profile.roles) && profile.roles.length ? profile.roles : [profile.role];
  return { authUser, profile, roles };
}

function hasAny(roles, allowed) {
  return roles.some((role) => allowed.has(role));
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
  if (actorRoles.includes("super_admin")) {
    return disciplineRank(targetRoles) > 0 && !targetRoles.includes("super_admin");
  }
  const actorRank = disciplineRank(actorRoles);
  const targetRank = disciplineRank(targetRoles);
  return actorRank > 0 && targetRank > 0 && actorRank > targetRank;
}

function canAffectTarget(actorRoles, targetRoles) {
  if (actorRoles.includes("super_admin")) return true;
  if (targetRoles.some((role) => PROTECTED_ROLES.has(role))) return false;
  const actorRank = disciplineRank(actorRoles);
  const targetRank = disciplineRank(targetRoles);
  if (!actorRank) return false;
  return targetRank === 0 || targetRank < actorRank;
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
      category: "discipline",
      link: "#/portal/investigations"
    })
  }).catch(() => undefined);
  await emailProfile(supabaseRequest, profileId, {
    subject: title,
    title,
    body,
    actionUrl: "#/portal/investigations",
    actionLabel: "Sorusturmalari ac"
  }).catch(() => undefined);
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
  if (!actor || !hasAny(actor.roles, INVESTIGATION_MANAGERS)) {
    return json(response, 403, { error: "Sorusturma islemi icin disiplin kurulu yetkisi gerekir." });
  }

  const body = request.body || {};
  const action = String(body.action || "");
  if (!VALID_ACTIONS.has(action)) {
    return json(response, 400, { error: "Sorusturma islemi gecersiz." });
  }

  if (action === "create") {
    const subjectProfileId = String(body.subjectProfileId || "");
    const title = String(body.title || "").trim();
    const description = String(body.description || "").trim();
    if (!subjectProfileId || title.length < 3 || description.length < 10) {
      return json(response, 400, { error: "Sorusturma bilgileri eksik." });
    }

    const subject = await fetchSingle(
      `/rest/v1/profiles?id=eq.${encodeURIComponent(subjectProfileId)}&select=id,role,roles,status&limit=1`
    );
    if (!subject) return json(response, 404, { error: "Ilgili uye bulunamadi." });
    if (!canAffectTarget(actor.roles, rolesOf(subject))) {
      return json(response, 403, { error: "Disiplin hiyerarsisi bu sorusturmaya izin vermiyor." });
    }

    const insertResponse = await supabaseRequest("/rest/v1/investigations", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        subject_profile_id: subjectProfileId,
        opened_by: actor.authUser.id,
        assigned_to: actor.authUser.id,
        assigned_at: new Date().toISOString(),
        status: "open",
        title: title.slice(0, 140),
        description: description.slice(0, 1600),
        evidence_note: String(body.evidenceNote || "").slice(0, 1200),
        evidence_file: String(body.evidenceFile || ""),
        evidence_filename: String(body.evidenceFilename || "").slice(0, 180)
      })
    });
    const inserted = await insertResponse.json().catch(() => null);
    if (!insertResponse.ok) {
      return json(response, insertResponse.status, { error: inserted?.message || "Sorusturma acilamadi." });
    }

    const investigation = inserted?.[0] || null;
    await audit(actor.authUser.id, investigation?.id || subjectProfileId, "Sorusturma acildi", { subject_profile_id: subjectProfileId });
    await notify(subjectProfileId, actor.authUser.id, "Hakkinizda sorusturma acildi", title);
    return json(response, 200, { ok: true, investigation });
  }

  const id = String(body.id || "");
  if (!id) return json(response, 400, { error: "Sorusturma id eksik." });
  const investigation = await fetchSingle(`/rest/v1/investigations?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  if (!investigation) return json(response, 404, { error: "Sorusturma bulunamadi." });

  if (action === "delete") {
    if (!actor.roles.includes("super_admin")) {
      return json(response, 403, { error: "Sorusturmayi yalnizca admin silebilir." });
    }
    const deleteResponse = await supabaseRequest(`/rest/v1/investigations?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" }
    });
    if (!deleteResponse.ok) {
      const result = await deleteResponse.json().catch(() => ({}));
      return json(response, deleteResponse.status, { error: result.message || "Sorusturma silinemedi." });
    }
    await audit(actor.authUser.id, id, "Sorusturma admin tarafindan silindi", { old_status: investigation.status });
    await notify(investigation.subject_profile_id, actor.authUser.id, "Sorusturma kaydi silindi", "Hakkinizdaki sorusturma kaydi admin tarafindan kaldirildi.");
    return json(response, 200, { ok: true });
  }

  if (action === "update") {
    if (!actor.roles.includes("super_admin")) {
      return json(response, 403, { error: "Sorusturmayi yalnizca admin duzenleyebilir." });
    }
    const title = String(body.title || investigation.title || "").trim();
    const description = String(body.description || investigation.description || "").trim();
    if (title.length < 3 || description.length < 10) {
      return json(response, 400, { error: "Sorusturma basligi veya aciklamasi eksik." });
    }
    const patch = {
      title: title.slice(0, 140),
      description: description.slice(0, 1600),
      evidence_note: String(body.evidenceNote ?? investigation.evidence_note ?? "").slice(0, 1200),
      evidence_file: String(body.evidenceFile ?? investigation.evidence_file ?? ""),
      evidence_filename: String(body.evidenceFilename ?? investigation.evidence_filename ?? "").slice(0, 180)
    };
    const assignedToProvided = Object.prototype.hasOwnProperty.call(body, "assignedTo");
    let nextAssignee = investigation.assigned_to || null;
    if (assignedToProvided) {
      const assignedTo = String(body.assignedTo || "").trim();
      if (assignedTo) {
        const targetAssignee = await fetchProfileForAssignment(assignedTo);
        if (!targetAssignee) return json(response, 404, { error: "Atanacak sorusturmaci bulunamadi." });
        if (!isAssignableInvestigator(targetAssignee)) {
          return json(response, 400, { error: "Soruşturmacı yalnızca aktif DK personeli olabilir." });
        }
        nextAssignee = assignedTo;
        patch.assigned_to = assignedTo;
        if (assignedTo !== investigation.assigned_to) patch.assigned_at = new Date().toISOString();
      } else {
        nextAssignee = null;
        patch.assigned_to = null;
        patch.assigned_at = null;
      }
    }
    const updateResponse = await supabaseRequest(`/rest/v1/investigations?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch)
    });
    const updated = await updateResponse.json().catch(() => null);
    if (!updateResponse.ok) {
      return json(response, updateResponse.status, { error: updated?.message || "Sorusturma duzenlenemedi." });
    }
    const assigneeChanged = assignedToProvided && (investigation.assigned_to || null) !== (nextAssignee || null);
    await audit(actor.authUser.id, id, "Sorusturma admin tarafindan duzenlendi", {
      title: patch.title,
      old_assigned_to: assigneeChanged ? investigation.assigned_to : undefined,
      new_assigned_to: assigneeChanged ? nextAssignee : undefined
    });
    if (assigneeChanged && investigation.assigned_to) {
      await notify(
        investigation.assigned_to,
        actor.authUser.id,
        "Soruşturma sorumluluğunuz değişti",
        `${patch.title} soruşturması admin tarafından başka bir yetkiliye aktarıldı.`
      );
    }
    if (assigneeChanged && nextAssignee) {
      await notify(
        nextAssignee,
        actor.authUser.id,
        "Soruşturma size atandı",
        `${patch.title} soruşturması admin tarafından size atandı.`
      );
    }
    await notify(investigation.subject_profile_id, actor.authUser.id, "Sorusturma kaydi duzenlendi", patch.title);
    return json(response, 200, { ok: true, investigation: updated?.[0] || null });
  }

  if (["cancelled", "closed"].includes(investigation.status)) {
    return json(response, 400, { error: "Kapanmis sorusturma guncellenemez." });
  }

  const subject = await fetchSingle(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(investigation.subject_profile_id)}&select=id,role,roles,status&limit=1`
  );
  if (subject && !canAffectTarget(actor.roles, rolesOf(subject))) {
    return json(response, 403, { error: "Disiplin hiyerarsisi bu sorusturmaya izin vermiyor." });
  }

  const assignedToOther = investigation.assigned_to && investigation.assigned_to !== actor.authUser.id;
  const currentAssigneeRoles = assignedToOther ? await fetchProfileRoles(investigation.assigned_to) : [];

  if (action === "claim") {
    if (investigation.assigned_to === actor.authUser.id) {
      return json(response, 400, { error: "Bu sorusturma zaten sizin sorumlulugunuzda." });
    }
    if (assignedToOther && !canTakeResponsibility(actor.roles, currentAssigneeRoles)) {
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
    if (!canDelegateResponsibility(actor.roles, targetAssigneeRoles)) {
      return json(response, 403, { error: "Sorumluluk yalnizca DK hiyerarsisinde alt rutbeye devredilebilir." });
    }
  } else if (investigation.assigned_to !== actor.authUser.id) {
    return json(response, 403, { error: "Bu islem icin once sorusturma sorumlulugunu devralmalisiniz." });
  }

  if (action === "cancelled" && !hasAny(actor.roles, new Set(["super_admin", "discipline_chair"]))) {
    return json(response, 403, { error: "Sorusturmayi yalnizca DK baskani veya admin iptal edebilir." });
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
