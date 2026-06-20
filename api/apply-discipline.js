import { emailProfile } from "./_mail.js";

const SANCTION_MANAGERS = new Set(["super_admin", "president", "discipline_chair", "discipline_vice_chair", "discipline_member"]);
const PROTECTED_ROLES = new Set(["super_admin", "president", "vice_president"]);
const VALID_EFFECTS = new Set(["none", "points_only", "reward_points", "remove_roles", "suspend_member", "party_suspension", "passive_member"]);
const POINT_MIN = 0;
const POINT_MAX = 200;
const POINT_DELTA_LIMIT = 100;
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

function suspensionUntil(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function canAffectTarget(actorRoles, targetRoles) {
  if (actorRoles.includes("super_admin")) return true;
  if (targetRoles.some((role) => PROTECTED_ROLES.has(role) || role === "discipline_chair")) return false;
  if (actorRoles.includes("discipline_chair")) {
    return true;
  }
  if (actorRoles.includes("discipline_vice_chair")) {
    return !targetRoles.some((role) => ["discipline_chair", "discipline_vice_chair"].includes(role));
  }
  if (actorRoles.includes("discipline_member")) {
    return !targetRoles.some((role) => ["discipline_chair", "discipline_vice_chair", "discipline_member"].includes(role));
  }
  return false;
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
  if (!actor || !hasAny(actor.roles, SANCTION_MANAGERS)) {
    return json(response, 403, { error: "Disiplin yaptirimi uygulama yetkiniz yok." });
  }

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

  if (!memberId || !VALID_EFFECTS.has(effect) || pointDelta === null) {
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

  const targetRoles = rolesOf(target);
  const isPointPenalty = effect === "points_only" && pointDelta < 0;
  const chairProtectedPointPenalty =
    isPointPenalty &&
    actor.roles.includes("discipline_chair") &&
    targetRoles.some((role) => ["president", "vice_president"].includes(role)) &&
    !targetRoles.includes("super_admin");
  if (!isReward && (!disciplineRecord || !disciplineRecord.investigation_id) && !chairProtectedPointPenalty) {
    return json(response, 400, { error: "Ceza yaptirimi icin once sorusturmaya bagli disiplin kaydi gerekir." });
  }
  if (
    isReward &&
    !actor.roles.includes("super_admin") &&
    !actor.roles.includes("president") &&
    !actor.roles.includes("discipline_chair")
  ) {
    return json(response, 403, { error: "Odul puanini yalnizca admin, baskan veya disiplin kurulu baskani verebilir." });
  }
  if (!isReward) {
    if (!actor.roles.includes("super_admin") && hasAny(targetRoles, PROTECTED_ROLES) && !chairProtectedPointPenalty) {
      return json(response, 403, { error: "Baskan, baskan yardimcisi veya admin yetkisi disiplin kaydindan alinamaz." });
    }
    if (!chairProtectedPointPenalty && !canAffectTarget(actor.roles, targetRoles)) {
      return json(response, 403, { error: "Disiplin hiyerarsisi bu yaptirima izin vermiyor." });
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

  if (!Object.keys(payload).length) {
    return json(response, 400, { error: "Uygulanacak sistem islemi bulunamadi." });
  }

  const patchResponse = await supabaseRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(memberId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  const patched = await patchResponse.json().catch(() => null);
  if (!patchResponse.ok) {
    return json(response, patchResponse.status, {
      error: patched?.message || "Yaptirim uygulanamadi."
    });
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
    sanction_until: sanctionUntil
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
    await notify(
      memberId,
      actor.authUser.id,
      "Disiplin yaptirimi uygulandi",
      `${effect === "remove_roles" ? "Yetkileriniz guncellendi" : "Uyelik durumunuz veya disiplin puaniniz guncellendi"}.${pointText}${suspensionText} Kararname: ${reason}`
    );
  }

  return json(response, 200, {
    ok: true,
    profile: patched?.[0] || null,
    disciplineRecord: savedDisciplineRecord,
    points: { before: pointsBefore, after: pointsAfter, delta: pointDelta }
  });
}
