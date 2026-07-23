import { emailProfile } from "../server/mail.js";
import { sendDisciplineMailboxMessage } from "../server/mailbox-api.js";

const CURRENT_REGULATION_VERSION = "2026-07-19";
const VALID_EFFECTS = new Set([
  "none",
  "points_only",
  "reward_points",
  "remove_roles",
  "suspend_member",
  "party_suspension",
  "passive_member"
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
    `/rest/v1/profiles?id=eq.${encodeURIComponent(authUser.id)}&select=id,display_name,role,roles,status&limit=1`
  );
  const [profile] = await profileResponse.json().catch(() => []);
  if (!profile || profile.status !== "active") return null;

  const roles = Array.isArray(profile.roles) && profile.roles.length ? [...profile.roles] : [];
  if (profile.role && !roles.includes(profile.role)) roles.unshift(profile.role);
  return { authUser, profile, roles };
}

async function rpc(name, body) {
  const response = await supabaseRequest(`/rest/v1/rpc/${name}`, {
    method: "POST",
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.message || "Disiplin kararı uygulanamadı.");
    error.status = response.status;
    throw error;
  }
  return Array.isArray(payload) ? payload[0] : payload;
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function cleanTextArray(value, limit = 20) {
  const source = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(source.map((item) => String(item).trim()).filter(Boolean))].slice(0, limit);
}

function cleanInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isInteger(number) ? number : fallback;
}

function hasAnyRole(roles, allowed) {
  return roles.some((role) => allowed.has(role));
}

async function manageStoredRecord(actor, body) {
  const action = String(body.action || "");
  const recordId = String(body.recordId || "");
  if (!recordId) {
    return { status: 400, body: { error: "Disiplin kaydi kimligi eksik." } };
  }

  const recordResponse = await supabaseRequest(
    `/rest/v1/discipline_records?id=eq.${encodeURIComponent(recordId)}&select=id,regulation_version,archived,notes&limit=1`
  );
  const [record] = await recordResponse.json().catch(() => []);
  if (!recordResponse.ok || !record) {
    return { status: 404, body: { error: "Disiplin kaydi bulunamadi." } };
  }

  if (action === "archive") {
    const allowed = new Set(["super_admin", "discipline_chair", "discipline_vice_chair", "discipline_member"]);
    if (!hasAnyRole(actor.roles, allowed)) {
      return { status: 403, body: { error: "Disiplin kaydini arsivleme yetkiniz yok." } };
    }
    if (record.archived) return { status: 200, body: { ok: true, disciplineRecord: record } };

    const archiveNote = `Arsivleyen: ${actor.profile.display_name || "Yetkili"} - ${new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}`;
    const updateResponse = await supabaseRequest(
      `/rest/v1/discipline_records?id=eq.${encodeURIComponent(recordId)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          archived: true,
          notes: cleanText([record.notes, archiveNote].filter(Boolean).join("\n"), 12000)
        })
      }
    );
    const updated = await updateResponse.json().catch(() => null);
    if (!updateResponse.ok) {
      return { status: updateResponse.status, body: { error: updated?.message || "Disiplin kaydi arsivlenemedi." } };
    }
    await supabaseRequest("/rest/v1/audit_logs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        action: "archive",
        actor_id: actor.authUser.id,
        target_type: "discipline_records",
        target_id: recordId,
        details: { summary: "Disiplin kaydi arsivlendi" }
      })
    }).catch(() => undefined);
    return { status: 200, body: { ok: true, disciplineRecord: updated?.[0] || null } };
  }

  if (!actor.roles.includes("super_admin")) {
    return { status: 403, body: { error: "Bu teknik islemi yalnizca Admin yapabilir." } };
  }
  if (record.regulation_version === CURRENT_REGULATION_VERSION) {
    return { status: 409, body: { error: "Guncel yonetmelik kaydi degistirilemez veya kalici silinemez." } };
  }

  if (action === "update_legacy") {
    const source = body.payload || {};
    const payload = {
      record_type: cleanText(source.record_type, 160),
      reason: cleanText(source.reason, 500),
      description: cleanText(source.description, 12000),
      decree_text: cleanText(source.decree_text, 50000),
      action_taken: cleanText(source.action_taken, 50000),
      privacy_level: ["own", "restricted", "private"].includes(source.privacy_level) ? source.privacy_level : "restricted"
    };
    const updateResponse = await supabaseRequest(
      `/rest/v1/discipline_records?id=eq.${encodeURIComponent(recordId)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(payload)
      }
    );
    const updated = await updateResponse.json().catch(() => null);
    if (!updateResponse.ok) {
      return { status: updateResponse.status, body: { error: updated?.message || "Arsiv kaydi duzeltilemedi." } };
    }
    return { status: 200, body: { ok: true, disciplineRecord: updated?.[0] || null } };
  }

  if (action === "delete_legacy") {
    const deleteResponse = await supabaseRequest(
      `/rest/v1/discipline_records?id=eq.${encodeURIComponent(recordId)}`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } }
    );
    if (!deleteResponse.ok) {
      const result = await deleteResponse.json().catch(() => null);
      return { status: deleteResponse.status, body: { error: result?.message || "Arsiv kaydi silinemedi." } };
    }
    return { status: 200, body: { ok: true } };
  }

  return { status: 400, body: { error: "Disiplin kaydi islemi gecersiz." } };
}

function statusForError(error) {
  const message = String(error?.message || "");
  if (/yetki|yalnizca|yalnızca|tarafi|tarafı|karar veremez|hedefi olamaz/i.test(message)) return 403;
  if (/bulunamadi|bulunamadı/i.test(message)) return 404;
  if (/daha once|daha önce|yalnizca bir|yalnızca bir|unique/i.test(message)) return 409;
  return error?.status && error.status < 500 ? error.status : 400;
}

async function sendDecisionMessages(actorId, result) {
  const record = result?.record;
  if (!record?.member_id) return;

  const isReward = record.sanction_effect === "reward_points" || Number(record.point_delta || 0) > 0;
  const financialTotal = Number(result?.loan?.total_due || 0);
  const title = isReward ? "Ödül puanı kaydedildi" : "Hakkınızda disiplin kararnamesi yazıldı";
  const body = isReward
    ? `+${record.point_delta} puan verildi. Güncel disiplin puanınız ${record.points_after}.\n\n${record.decree_text}`
    : [
        `Karar türü: ${record.record_type}`,
        `Puan: ${record.points_before} -> ${record.points_after} (${record.point_delta})`,
        financialTotal > 0 ? `Kredi borcu: ${financialTotal.toLocaleString("tr-TR")} kredi` : "",
        record.appeal_deadline
          ? `İtiraz sonu: ${new Date(record.appeal_deadline).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}`
          : "",
        "",
        "Kararname:",
        record.decree_text
      ].filter(Boolean).join("\n");

  await Promise.allSettled([
    emailProfile(supabaseRequest, record.member_id, {
      from: "İHP Disiplin Kurulu <dk@ihp.org.tr>",
      subject: `İHP Disiplin Kurulu: ${title}`,
      title,
      body,
      actionUrl: "https://dk.ihp.org.tr/#/portal/discipline",
      actionLabel: "Disiplin kaydını aç",
      senderLabel: "İHP Disiplin Kurulu",
      idempotencyKey: `discipline-decision-${record.id}`,
      force: true
    }),
    sendDisciplineMailboxMessage(record.member_id, {
      subject: `İHP Disiplin Kurulu: ${title}`,
      body
    })
  ]);
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

  const body = request.body || {};
  if (["archive", "update_legacy", "delete_legacy"].includes(String(body.action || ""))) {
    const result = await manageStoredRecord(actor, body);
    return json(response, result.status, result.body);
  }
  const effect = String(body.effect || "none");
  if (!body.memberId || !VALID_EFFECTS.has(effect)) {
    return json(response, 400, { error: "Disiplin kararı bilgileri geçersiz." });
  }

  const isReward = effect === "reward_points" || cleanInteger(body.pointDelta) > 0;
  if (!isReward) {
    if (!body.investigationId) {
      return json(response, 400, { error: "Ceza kararnamesi için açık bir soruşturma seçilmelidir." });
    }
    const investigationResponse = await supabaseRequest(
      `/rest/v1/investigations?id=eq.${encodeURIComponent(body.investigationId)}&select=id,subject_profile_id,opened_by,status&limit=1`
    );
    const [investigation] = await investigationResponse.json().catch(() => []);
    if (!investigationResponse.ok || !investigation) {
      return json(response, 404, { error: "İlgili soruşturma bulunamadı." });
    }
    if (investigation.subject_profile_id !== body.memberId) {
      return json(response, 400, { error: "Soruşturma ile ceza verilecek üye eşleşmiyor." });
    }
    if (!["open", "reviewing"].includes(investigation.status)) {
      return json(response, 409, { error: "Yalnızca açık bir soruşturma için ceza kararnamesi yazılabilir." });
    }
    if (!actor.roles.includes("super_admin") && investigation.opened_by !== actor.authUser.id) {
      return json(response, 403, { error: "Disiplin cezasını yalnızca soruşturmayı açan yetkili verebilir." });
    }
  }

  const payload = {
    memberId: String(body.memberId),
    investigationId: body.investigationId || null,
    effect,
    pointTier: String(body.pointTier || "none"),
    pointDelta: cleanInteger(body.pointDelta),
    recordType: cleanText(body.recordType || (effect === "reward_points" ? "Ödül" : "Disiplin kararı"), 160),
    reason: cleanText(body.reason || "Disiplin kararnamesi", 500),
    description: cleanText(body.description || body.reason || "Disiplin kararnamesi", 12000),
    decreeText: cleanText(body.decreeText || body.reason, 50000),
    acceptedEvidenceSummary: cleanText(body.acceptedEvidenceSummary, 12000),
    violatedArticles: cleanTextArray(body.violatedArticles),
    sanctionDays: body.sanctionDays === null || body.sanctionDays === "" ? null : cleanInteger(body.sanctionDays),
    tariffCode: cleanText(body.tariffCode, 20) || null,
    aggravatingFactors: cleanTextArray(body.aggravatingFactors, 10),
    recipientType: cleanText(body.recipientType, 20) || null,
    recipientProfileId: body.recipientProfileId || null,
    compensationAmount: cleanInteger(body.compensationAmount),
    compensationEvidence: cleanText(body.compensationEvidence, 12000),
    financialInstallments: cleanInteger(body.financialInstallments, 1),
    financialDueDays: 3,
    regulationVersion: CURRENT_REGULATION_VERSION
  };

  try {
    const result = await rpc("apply_20260719_discipline_decision_amount", {
      p_actor_profile_id: actor.authUser.id,
      p_payload: payload
    });
    await sendDecisionMessages(actor.authUser.id, result);

    const profileResponse = await supabaseRequest(
      `/rest/v1/profiles?id=eq.${encodeURIComponent(body.memberId)}&select=id,role,roles,status,discipline_points,suspended_until&limit=1`
    );
    const [profile] = await profileResponse.json().catch(() => []);
    return json(response, 200, {
      ok: true,
      profile: profile || null,
      disciplineRecord: result?.record || null,
      creditFineDebt: result?.loan || null,
      points: result?.points || null,
      executiveProposalId: result?.executiveProposalId || null
    });
  } catch (error) {
    return json(response, statusForError(error), {
      error: error.message || "Disiplin kararı uygulanamadı."
    });
  }
}
