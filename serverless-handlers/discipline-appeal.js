import { emailProfile } from "../server/mail.js";

const VALID_ACTIONS = new Set(["appeal", "accept", "reject", "remand"]);

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
  const roles = Array.isArray(profile.roles) && profile.roles.length ? [...profile.roles] : [];
  if (profile.role && !roles.includes(profile.role)) roles.unshift(profile.role);
  return { authUser, profile, roles };
}

async function fetchSingle(path) {
  const response = await supabaseRequest(path);
  const [row] = await response.json().catch(() => []);
  return response.ok ? row || null : null;
}

async function rpc(name, body) {
  const response = await supabaseRequest(`/rest/v1/rpc/${name}`, {
    method: "POST",
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.message || "İtiraz işlemi tamamlanamadı.");
    error.status = response.status;
    throw error;
  }
  return Array.isArray(payload) ? payload[0] : payload;
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
      link: "https://dk.ihp.org.tr/#/portal/discipline"
    })
  }).catch(() => undefined);
  await emailProfile(supabaseRequest, profileId, {
    from: "İHP Disiplin Kurulu <dk@ihp.org.tr>",
    subject: `İHP Disiplin Kurulu: ${title}`,
    title,
    body,
    actionUrl: "https://dk.ihp.org.tr/#/portal/discipline",
    actionLabel: "Disiplin kaydını aç",
    senderLabel: "İHP Disiplin Kurulu",
    force: true
  }).catch(() => undefined);
}

async function notifyAppealAuthority(actorId, record, body) {
  const authorityRole = record.appeal_authority_role;
  if (!authorityRole) return;
  const response = await supabaseRequest("/rest/v1/profiles?status=eq.active&select=id,role,roles");
  const profiles = await response.json().catch(() => []);
  if (!response.ok || !Array.isArray(profiles)) return;
  await Promise.allSettled(
    profiles
      .filter((profile) => {
        const roles = Array.isArray(profile.roles) && profile.roles.length ? profile.roles : [profile.role];
        return roles.includes("super_admin") || roles.includes(authorityRole);
      })
      .map((profile) => notify(profile.id, actorId, "Yeni disiplin itirazı", body))
  );
}

async function audit(actorId, recordId, summary, details = {}) {
  await supabaseRequest("/rest/v1/audit_logs", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      action: "discipline_appeal_20260719",
      actor_id: actorId,
      target_type: "discipline_records",
      target_id: recordId,
      details: { summary, ...details }
    })
  }).catch(() => undefined);
}

function statusForError(error) {
  const message = String(error?.message || "");
  if (/yalnizca|yalnızca|yetki|makami|makamı/i.test(message)) return 403;
  if (/bulunamadi|bulunamadı/i.test(message)) return 404;
  return error?.status && error.status < 500 ? error.status : 400;
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return json(response, 405, { error: "Yalnızca POST isteği kabul edilir." });
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return json(response, 500, { error: "Sunucu yapılandırması eksik." });
  }

  const actor = await authenticateActor(request);
  if (!actor) return json(response, 401, { error: "Geçerli üye oturumu bulunamadı." });

  const { id, action } = request.body || {};
  if (!id || !VALID_ACTIONS.has(action)) {
    return json(response, 400, { error: "İtiraz bilgisi geçersiz." });
  }
  const text = String(action === "appeal" ? request.body?.appealText : request.body?.decisionNote || "").trim();
  if (text.length < 10) {
    return json(response, 400, { error: "İtiraz veya karar gerekçesi en az 10 karakter olmalıdır." });
  }

  const record = await fetchSingle(
    `/rest/v1/discipline_records?id=eq.${encodeURIComponent(id)}&select=id,member_id,record_type,reason,sanction_effect,point_delta,appeal_authority_role&limit=1`
  );
  if (!record) return json(response, 404, { error: "Disiplin kaydı bulunamadı." });
  if (action === "appeal" && (record.sanction_effect === "reward_points" || Number(record.point_delta || 0) > 0)) {
    return json(response, 400, { error: "Ödül puanı kayıtlarına itiraz edilemez." });
  }

  try {
    const result = await rpc("manage_20260719_discipline_appeal", {
      p_actor_profile_id: actor.authUser.id,
      p_record_id: id,
      p_action: action,
      p_text: text.slice(0, 4000)
    });

    if (action === "appeal") {
      await audit(actor.authUser.id, id, "Disiplin itirazı açıldı", {
        appeal_authority_role: record.appeal_authority_role
      });
      await notifyAppealAuthority(actor.authUser.id, record, `${record.reason}\n\n${text.slice(0, 1200)}`);
    } else {
      const accepted = action === "accept" || action === "remand";
      const title = accepted
        ? action === "remand" ? "Disiplin itirazınız kabul edildi ve dosya yeniden açıldı" : "Disiplin itirazınız kabul edildi"
        : "Disiplin itirazınız reddedildi";
      await audit(actor.authUser.id, id, title, {
        appeal_action: action,
        refunded: result?.refunded || 0,
        refund_outstanding: result?.refundOutstanding || 0
      });
      await notify(record.member_id, actor.authUser.id, title, text.slice(0, 2000));
    }

    const updated = await fetchSingle(
      `/rest/v1/discipline_records?id=eq.${encodeURIComponent(id)}&select=*&limit=1`
    );
    return json(response, 200, { ok: true, record: updated, result });
  } catch (error) {
    return json(response, statusForError(error), {
      error: error.message || "İtiraz işlemi tamamlanamadı."
    });
  }
}
