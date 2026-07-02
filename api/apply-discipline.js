import { randomInt } from "node:crypto";
import { emailProfile } from "../server/mail.js";

const DISCIPLINE_DECISION_ROLES = new Set(["discipline_chair", "discipline_vice_chair", "discipline_member"]);
const REWARD_ROLES = new Set(["president", "discipline_chair", "discipline_vice_chair", "discipline_member"]);
const PROTECTED_ROLES = new Set(["super_admin"]);
const VALID_EFFECTS = new Set(["none", "points_only", "reward_points", "remove_roles", "suspend_member", "party_suspension", "passive_member"]);
const POINT_MIN = 0;
const POINT_MAX = 200;
const POINT_DELTA_LIMIT = 100;
const CREDIT_FINE_MAX = 100_000_000;
const SUSPENSION_DAY_MIN = 1;
const SUSPENSION_DAY_MAX = 365;

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
  const rows = await response.json().catch(() => []);
  return response.ok ? rows?.[0] || null : null;
}

function rolesOf(profile) {
  const roles = Array.isArray(profile?.roles) && profile.roles.length ? [...profile.roles] : [];
  if (profile?.role && !roles.includes(profile.role)) roles.unshift(profile.role);
  return [...new Set(roles.filter(Boolean))];
}

function primaryRole(roles) {
  const priority = [
    "super_admin",
    "president",
    "vice_president",
    "presidential_aide",
    "discipline_chair",
    "discipline_vice_chair",
    "youth_chair",
    "spokesperson",
    "chief_representative",
    "representative",
    "discipline_member",
    "youth_member",
    "member"
  ];
  return priority.find((role) => roles.includes(role)) || roles[0] || "member";
}

function disciplinePointsOf(profile) {
  const value = Number(profile?.discipline_points);
  return Number.isFinite(value) ? value : 100;
}

function clampPoints(value) {
  return Math.max(POINT_MIN, Math.min(POINT_MAX, value));
}

function normalizePointDelta(value) {
  if (value === undefined || value === null || value === "") return 0;
  const delta = Number(value);
  if (!Number.isInteger(delta) || delta < -POINT_DELTA_LIMIT || delta > POINT_DELTA_LIMIT) return null;
  return delta;
}

function normalizeSuspensionDays(value) {
  if (value === undefined || value === null || value === "") return null;
  const days = Number(value);
  if (!Number.isInteger(days) || days < SUSPENSION_DAY_MIN || days > SUSPENSION_DAY_MAX) return null;
  return days;
}

function normalizeCreditFineAmount(value) {
  if (value === undefined || value === null || value === "") return 0;
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount < 0 || amount > CREDIT_FINE_MAX) return null;
  return amount;
}

function normalizeCreditFineInstallments(value, amount) {
  if (!amount) return 1;
  const installments = Number(value || 1);
  if (!Number.isInteger(installments) || installments < 1 || installments > 12 || installments > amount) return null;
  return installments;
}

function suspensionUntil(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function canAffectTarget(actorRoles, targetRoles) {
  return (
    hasAny(actorRoles, DISCIPLINE_DECISION_ROLES) &&
    !targetRoles.some((role) => PROTECTED_ROLES.has(role))
  );
}

async function notify(profileId, actorId, title, body, category = "discipline") {
  await supabaseRequest("/rest/v1/notifications", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      recipient_id: profileId,
      actor_id: actorId,
      title,
      body,
      category,
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

async function rpc(name, body) {
  const response = await supabaseRequest(`/rest/v1/rpc/${name}`, {
    method: "POST",
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.message || "Sunucu islemi tamamlanamadi.");
    error.status = response.status;
    throw error;
  }
  return Array.isArray(payload) ? payload[0] : payload;
}

function randomCreditAccountCode() {
  return `IHP${String(randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
}

async function createCreditFineDebt({ actorId, recordId, memberId, amount, installments, note }) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await rpc("create_discipline_credit_fine", {
        p_actor_profile_id: actorId,
        p_discipline_record_id: recordId,
        p_member_profile_id: memberId,
        p_account_code: randomCreditAccountCode(),
        p_amount: amount,
        p_installment_count: installments,
        p_note: note
      });
    } catch (error) {
      if (!/duplicate|unique|account_code/i.test(error.message)) throw error;
    }
  }
  throw new Error("Para cezası için benzersiz kredi hesabı oluşturulamadı.");
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
  if (!actor) return json(response, 401, { error: "Geçerli üye oturumu bulunamadı." });

  const {
    memberId,
    disciplineRecordId,
    reason = "Disiplin kararnamesi",
    recordType,
    description,
    decreeText
  } = request.body || {};
  let effect = request.body?.effect || "none";
  const pointDelta = normalizePointDelta(request.body?.pointDelta);
  const sanctionDays = normalizeSuspensionDays(request.body?.sanctionDays);
  const creditFineAmount = normalizeCreditFineAmount(request.body?.creditFineAmount);
  const creditFineInstallments = normalizeCreditFineInstallments(request.body?.creditFineInstallments, creditFineAmount || 0);

  if (!memberId || !VALID_EFFECTS.has(effect) || pointDelta === null || creditFineAmount === null || creditFineInstallments === null) {
    return json(response, 400, { error: "Yaptirim bilgisi gecersiz." });
  }
  if (effect === "party_suspension" && sanctionDays === null) {
    return json(response, 400, { error: "Partiden uzaklastirma icin 1-365 gun arasi sure girilmelidir." });
  }
  if (!String(decreeText || reason || "").trim()) {
    return json(response, 400, { error: "Kararname metni zorunludur." });
  }

  if (effect === "none" && pointDelta !== 0) {
    effect = pointDelta > 0 ? "reward_points" : "points_only";
  }
  if (effect === "reward_points" && pointDelta <= 0) {
    return json(response, 400, { error: "Odul icin pozitif puan girilmelidir." });
  }
  if (effect !== "reward_points" && pointDelta > 0) {
    return json(response, 400, { error: "Pozitif puan yalnizca odul islemiyle verilebilir." });
  }
  const isReward = effect === "reward_points";
  if (isReward ? !hasAny(actor.roles, REWARD_ROLES) : !hasAny(actor.roles, DISCIPLINE_DECISION_ROLES)) {
    return json(response, 403, {
      error: isReward
        ? "Ödül kararını yalnızca Başkan veya Disiplin Kurulu verebilir."
        : "Disiplin yaptırımını yalnızca bağımsız Disiplin Kurulu uygulayabilir."
    });
  }
  const decreeBody = String(decreeText || reason || "").trim();
  const recordReason = String(description || request.body?.shortReason || (isReward ? "Odul puani" : "Disiplin kararnamesi")).trim();

  let disciplineRecord = null;
  if (disciplineRecordId) {
    const recordResponse = await supabaseRequest(
      `/rest/v1/discipline_records?id=eq.${encodeURIComponent(disciplineRecordId)}&select=id,member_id,investigation_id,record_type&limit=1`
    );
    const [record] = await recordResponse.json().catch(() => []);
    if (!recordResponse.ok || !record) {
      return json(response, 404, { error: "Disiplin kaydi bulunamadi." });
    }
    if (record.member_id !== memberId) {
      return json(response, 400, { error: "Disiplin kaydi ilgili uye ile eslesmiyor." });
    }
    disciplineRecord = record;
  }
  const profileResponse = await supabaseRequest(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(memberId)}&select=id,role,roles,status,discipline_points&limit=1`
  );
  const [target] = await profileResponse.json().catch(() => []);
  if (!profileResponse.ok || !target) {
    return json(response, 404, { error: "Uye bulunamadi." });
  }
  if (target.status === "left") {
    return json(response, 400, {
      error: "Partiden ayrılan kişi hakkında görev veya puan yaptırımı uygulanamaz; soruşturma yalnızca arşiv amacıyla sonuçlandırılabilir."
    });
  }

  const targetRoles = rolesOf(target);
  const isCreditFine = creditFineAmount > 0;
  if (!isReward && (!disciplineRecord || !disciplineRecord.investigation_id)) {
    return json(response, 400, { error: "Ceza yaptirimi icin once sorusturmaya bagli disiplin kaydi gerekir." });
  }
  if (!isReward) {
    const investigation = await fetchSingle(
      `/rest/v1/investigations?id=eq.${encodeURIComponent(disciplineRecord.investigation_id)}&select=id,subject_profile_id,defense_status&limit=1`
    );
    if (!investigation || investigation.subject_profile_id !== memberId) {
      return json(response, 400, { error: "Disiplin kaydının soruşturma bağlantısı geçersiz." });
    }
    if (investigation.defense_status === "pending") {
      return json(response, 400, {
        error: "Üyenin savunma hakkı tamamlanmadan disiplin yaptırımı uygulanamaz."
      });
    }
  }
  if (!isReward) {
    if (hasAny(targetRoles, PROTECTED_ROLES)) {
      return json(response, 403, { error: "Admin hesabi disiplin hiyerarsisi disinda korunur." });
    }
    if (!canAffectTarget(actor.roles, targetRoles)) {
      return json(response, 403, { error: "Bu yaptırım için Disiplin Kurulu yetkisi gerekir." });
    }
  }

  const nextRoles = targetRoles.filter((role) => role === "member");
  if (!nextRoles.length) nextRoles.push("member");

  const pointsBefore = disciplinePointsOf(target);
  const pointsAfter = pointDelta ? clampPoints(pointsBefore + pointDelta) : pointsBefore;
  const payload = {};
  const sanctionUntil = effect === "party_suspension" ? suspensionUntil(sanctionDays) : null;

  if (effect === "remove_roles") {
    Object.assign(payload, { role: primaryRole(nextRoles), roles: nextRoles, status: "active", committee_id: null, suspended_until: null, suspension_note: "" });
  } else if (effect === "suspend_member") {
    Object.assign(payload, { status: "suspended", suspended_until: null, suspension_note: decreeBody });
  } else if (effect === "party_suspension") {
    Object.assign(payload, { status: "suspended", suspended_until: sanctionUntil, suspension_note: decreeBody });
  } else if (effect === "passive_member") {
    Object.assign(payload, { status: "passive", suspended_until: null, suspension_note: "" });
  }

  if (pointDelta !== 0) {
    payload.discipline_points = pointsAfter;
  }

  if (!Object.keys(payload).length && !isCreditFine) {
    return json(response, 400, { error: "Uygulanacak sistem islemi bulunamadi." });
  }

  let patched = null;
  if (Object.keys(payload).length) {
    const patchResponse = await supabaseRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(memberId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload)
    });
    patched = await patchResponse.json().catch(() => null);
    if (!patchResponse.ok) {
      return json(response, patchResponse.status, {
        error: patched?.message || "Yaptirim uygulanamadi."
      });
    }
  }

  if (effect === "remove_roles") {
    await supabaseRequest(
      `/rest/v1/profile_committees?profile_id=eq.${encodeURIComponent(memberId)}`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } }
    ).catch(() => undefined);
  }

  let savedDisciplineRecord = null;
  const disciplinePayload = {
    point_delta: pointDelta,
    points_before: pointsBefore,
    points_after: pointsAfter,
    sanction_effect: effect,
    sanction_days: effect === "party_suspension" ? sanctionDays : null,
    sanction_until: sanctionUntil,
    credit_fine_amount: creditFineAmount,
    credit_fine_installments: creditFineInstallments
  };

  if (disciplineRecordId) {
    await supabaseRequest(`/rest/v1/discipline_records?id=eq.${encodeURIComponent(disciplineRecordId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(disciplinePayload)
    }).catch(() => undefined);
    savedDisciplineRecord = { id: disciplineRecordId };
  } else if (isReward) {
    const insertResponse = await supabaseRequest("/rest/v1/discipline_records", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        member_id: memberId,
        record_type: recordType || "\u00d6d\u00fcl",
        reason: recordReason || "Odul puani",
        description: recordReason || "Odul puani",
        severity: "low",
        decision_status: "decided",
        decree_text: decreeBody,
        action_taken: decreeBody,
        privacy_level: "restricted",
        created_by: actor.authUser.id,
        ...disciplinePayload
      })
    });
    const inserted = await insertResponse.json().catch(() => null);
    if (!insertResponse.ok) {
      return json(response, insertResponse.status, {
        error: inserted?.message || "Odul kaydi olusturulamadi."
      });
    }
    savedDisciplineRecord = inserted?.[0] || null;
  }

  let creditFineDebt = null;
  if (!isReward && creditFineAmount > 0) {
    const recordId = savedDisciplineRecord?.id || disciplineRecordId;
    if (!recordId) {
      return json(response, 400, { error: "Para cezası için disiplin kaydı bulunamadı." });
    }
    try {
      creditFineDebt = await createCreditFineDebt({
        actorId: actor.authUser.id,
        recordId,
        memberId,
        amount: creditFineAmount,
        installments: creditFineInstallments,
        note: decreeBody
      });
    } catch (error) {
      return json(response, error.status || 500, {
        error: error.message || "Para cezasi kredi borcu olarak olusturulamadi."
      });
    }
  }

  await supabaseRequest("/rest/v1/audit_logs", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      action: "update",
      actor_id: actor.authUser.id,
      target_type: "profiles",
      target_id: memberId,
      details: {
        summary: isReward
          ? "Disiplin oduluyle puan verildi"
          : effect === "remove_roles"
            ? "Disiplin yaptirimiyla yetki alindi"
            : "Disiplin yaptirimiyla uyelik durumu veya puani guncellendi",
        old_roles: targetRoles,
        new_roles: payload.roles || targetRoles,
        effect,
        sanction_days: effect === "party_suspension" ? sanctionDays : null,
        sanction_until: sanctionUntil,
        credit_fine_amount: creditFineAmount,
        credit_fine_installments: creditFineInstallments,
        credit_fine_debt_id: creditFineDebt?.id || null,
        point_delta: pointDelta,
        points_before: pointsBefore,
        points_after: pointsAfter
      }
    })
  }).catch(() => undefined);

  if (isReward) {
    await notify(
      memberId,
      actor.authUser.id,
      "Tebrikler! Odul puani kazandiniz",
      `+${pointDelta} puan kazandiniz. Guncel disiplin puaniniz: ${pointsAfter}. Kararname: ${reason}`,
      "reward"
    );
  } else {
    const pointText = pointDelta < 0
      ? ` ${Math.abs(pointDelta)} puan dusuldu. Guncel disiplin puaniniz: ${pointsAfter}.`
      : "";
    const suspensionText = effect === "party_suspension"
      ? ` Partiden uzaklastirma suresi: ${sanctionDays} gun. Bitis: ${new Date(sanctionUntil).toLocaleDateString("tr-TR")}.`
      : "";
    const fineText = creditFineAmount > 0
      ? ` ${creditFineAmount} kredi para cezasi kredi hesabinizda ${creditFineInstallments} taksit borc olarak gorunecek.`
      : "";
    await notify(
      memberId,
      actor.authUser.id,
      "Disiplin yaptirimi uygulandi",
      `${effect === "remove_roles" ? "Yetkileriniz guncellendi" : "Uyelik durumunuz veya disiplin puaniniz guncellendi"}.${pointText}${suspensionText}${fineText} Kararname: ${reason}`
    );
  }

  return json(response, 200, {
    ok: true,
    profile: patched?.[0] || target,
    disciplineRecord: savedDisciplineRecord,
    creditFineDebt,
    points: { before: pointsBefore, after: pointsAfter, delta: pointDelta }
  });
}
