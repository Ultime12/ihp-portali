const COMPLAINT_MANAGERS = new Set(["super_admin", "discipline_chair", "discipline_vice_chair", "discipline_member"]);
const OVERRIDE_MANAGERS = new Set(["super_admin", "discipline_chair"]);
const VALID_STATUSES = new Set(["new", "reviewing", "resolved", "rejected", "closed"]);

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
      link: "#/portal/complaints"
    })
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
  if (!actor || !hasAny(actor.roles, COMPLAINT_MANAGERS)) {
    return json(response, 403, { error: "Sikayet islemek icin disiplin kurulu yetkisi gerekir." });
  }

  const { id, status = "reviewing", decisionNote = "", claim = false } = request.body || {};
  if (!id || !VALID_STATUSES.has(status)) {
    return json(response, 400, { error: "Sikayet bilgisi gecersiz." });
  }

  const complaintResponse = await supabaseRequest(
    `/rest/v1/complaints?id=eq.${encodeURIComponent(id)}&select=*&limit=1`
  );
  const [complaint] = await complaintResponse.json().catch(() => []);
  if (!complaintResponse.ok || !complaint) {
    return json(response, 404, { error: "Sikayet bulunamadi." });
  }

  const assignedToOther = complaint.assigned_to && complaint.assigned_to !== actor.authUser.id;
  if (assignedToOther && !hasAny(actor.roles, OVERRIDE_MANAGERS)) {
    return json(response, 403, { error: "Bu sikayet baska bir yetkili tarafindan ustlenilmis." });
  }
  const shouldAssignToActor = claim || !complaint.assigned_to || assignedToOther;

  const patch = {
    status,
    decision_note: decisionNote || complaint.decision_note || null
  };

  if (shouldAssignToActor) {
    patch.assigned_to = actor.authUser.id;
    patch.assigned_at = new Date().toISOString();
  }

  if (["resolved", "rejected", "closed"].includes(status)) {
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

  const summary = assignedToOther && shouldAssignToActor
    ? "Sikayet sorumlulugu disiplin kurulu baskani tarafindan devralindi"
    : claim || !complaint.assigned_to
      ? "Sikayet sorumlulugu alindi"
    : `Sikayet durumu ${status} olarak guncellendi`;
  await audit(actor.authUser.id, id, summary, {
    old_status: complaint.status,
    new_status: status,
    old_assigned_to: complaint.assigned_to,
    new_assigned_to: patch.assigned_to || complaint.assigned_to
  });

  if (assignedToOther && shouldAssignToActor) {
    await notify(
      complaint.assigned_to,
      actor.authUser.id,
      "Åikayet sorumluluÄŸu devredildi",
      "ÃœstlendiÄŸiniz ÅŸikayet disiplin kurulu baÅŸkanÄ± tarafÄ±ndan devralÄ±ndÄ±."
    );
  }

  await notify(
    complaint.complainant_profile_id,
    actor.authUser.id,
    status === "reviewing" ? "Åikayetiniz incelemeye alÄ±ndÄ±" : "Åikayetiniz gÃ¼ncellendi",
    decisionNote || "Åikayet kaydÄ±nÄ±z disiplin kurulu tarafÄ±ndan gÃ¼ncellendi."
  );

  return json(response, 200, { ok: true, complaint: updated?.[0] || null });
}
