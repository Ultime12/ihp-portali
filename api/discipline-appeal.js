import { emailProfile } from "../server/mail.js";

const APPEAL_MANAGERS = new Set(["super_admin", "discipline_chair"]);
const VALID_ACTIONS = new Set(["appeal", "accept", "reject"]);

function isRewardRecord(record) {
  const recordType = String(record?.record_type || "").toLocaleLowerCase("tr-TR");
  return (
    record?.sanction_effect === "reward_points" ||
    Number(record?.point_delta || 0) > 0 ||
    recordType.includes("ödül")
  );
}

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

async function fetchSingle(path) {
  const response = await supabaseRequest(path);
  const [row] = await response.json().catch(() => []);
  return response.ok ? row || null : null;
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
      link: "#/portal/discipline"
    })
  }).catch(() => undefined);
  await emailProfile(supabaseRequest, profileId, {
    subject: title,
    title,
    body,
    actionUrl: "#/portal/discipline",
    actionLabel: "Disiplin kaydini ac"
  }).catch(() => undefined);
}

async function notifyAppealManagers(actorId, recordId, body) {
  const response = await supabaseRequest(
    "/rest/v1/profiles?status=eq.active&select=id,role,roles"
  );
  const rows = await response.json().catch(() => []);
  if (!response.ok || !Array.isArray(rows)) return;
  await Promise.all(
    rows
      .filter((profile) => {
        const roles = Array.isArray(profile.roles) && profile.roles.length ? profile.roles : [profile.role];
        return roles.some((role) => APPEAL_MANAGERS.has(role));
      })
      .map((profile) => notify(profile.id, actorId, "Yeni disiplin itirazı", body || `Kayıt: ${recordId}`))
  );
}

async function audit(actorId, recordId, summary, details = {}) {
  await supabaseRequest("/rest/v1/audit_logs", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      action: "update",
      actor_id: actorId,
      target_type: "discipline_records",
      target_id: recordId,
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
  if (!actor) return json(response, 401, { error: "Oturum bulunamadi." });

  const { id, action, appealText = "", decisionNote = "" } = request.body || {};
  if (!id || !VALID_ACTIONS.has(action)) {
    return json(response, 400, { error: "Itiraz bilgisi gecersiz." });
  }

  const record = await fetchSingle(
    `/rest/v1/discipline_records?id=eq.${encodeURIComponent(id)}&select=*&limit=1`
  );
  if (!record) return json(response, 404, { error: "Disiplin kaydi bulunamadi." });

  const appealStatus = record.appeal_status || (record.decision_status === "appealed" ? "submitted" : "none");

  if (action === "appeal") {
    if (record.member_id !== actor.authUser.id) {
      return json(response, 403, { error: "Yalnizca kendi disiplin kaydiniza itiraz edebilirsiniz." });
    }
    if (isRewardRecord(record)) {
      return json(response, 400, { error: "Odul puani kayitlarina itiraz edilemez." });
    }
    if (record.archived || record.decision_status !== "decided" || appealStatus !== "none") {
      return json(response, 400, { error: "Bu kayit icin yeni itiraz acilamaz." });
    }
    const cleanAppeal = String(appealText || "").trim();
    if (cleanAppeal.length < 10) {
      return json(response, 400, { error: "Itiraz gerekcesi en az 10 karakter olmali." });
    }

    const updateResponse = await supabaseRequest(`/rest/v1/discipline_records?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        appeal_text: cleanAppeal.slice(0, 1600),
        appeal_status: "submitted",
        appealed_at: new Date().toISOString(),
        decision_status: "appealed"
      })
    });
    const updated = await updateResponse.json().catch(() => null);
    if (!updateResponse.ok) {
      return json(response, updateResponse.status, { error: updated?.message || "Itiraz kaydedilemedi." });
    }

    await audit(actor.authUser.id, id, "Disiplin itirazi acildi");
    await notifyAppealManagers(actor.authUser.id, id, cleanAppeal.slice(0, 220));
    return json(response, 200, { ok: true, record: updated?.[0] || null });
  }

  if (!hasAny(actor.roles, APPEAL_MANAGERS)) {
    return json(response, 403, { error: "İtiraz kararını Disiplin Kurulu Başkanı veya teknik Admin verebilir." });
  }
  if (appealStatus !== "submitted") {
    return json(response, 400, { error: "Karara baglanacak acik itiraz yok." });
  }
  const cleanDecision = String(decisionNote || "").trim();
  if (!cleanDecision) return json(response, 400, { error: "Itiraz karari icin not zorunludur." });

  const accepted = action === "accept";
  const patch = {
    appeal_status: accepted ? "accepted" : "rejected",
    appeal_decision_note: cleanDecision.slice(0, 900),
    appeal_decided_by: actor.authUser.id,
    appeal_decided_at: new Date().toISOString(),
    decision_status: "closed",
    archived: accepted,
    notes: accepted
      ? `${record.notes || ""}\nItiraz kabul edildi; ceza iptal edildi.`
      : `${record.notes || ""}\nItiraz reddedildi; ayni cezaya tekrar itiraz acilamaz.`
  };

  const updateResponse = await supabaseRequest(`/rest/v1/discipline_records?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(patch)
  });
  const updated = await updateResponse.json().catch(() => null);
  if (!updateResponse.ok) {
    return json(response, updateResponse.status, { error: updated?.message || "Itiraz karari kaydedilemedi." });
  }

  await audit(actor.authUser.id, id, accepted ? "Disiplin itirazi kabul edildi" : "Disiplin itirazi reddedildi", {
    appeal_status: patch.appeal_status
  });
  await notify(
    record.member_id,
    actor.authUser.id,
    accepted ? "Disiplin itirazınız kabul edildi" : "Disiplin itirazınız reddedildi",
    cleanDecision
  );

  return json(response, 200, { ok: true, record: updated?.[0] || null });
}
