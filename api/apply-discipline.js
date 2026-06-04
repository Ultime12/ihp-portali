const SANCTION_MANAGERS = new Set(["super_admin", "discipline_chair", "discipline_vice_chair"]);
const PROTECTED_ROLES = new Set(["super_admin", "president", "vice_president"]);
const VALID_EFFECTS = new Set(["remove_roles", "suspend_member", "passive_member"]);

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

function canAffectTarget(actorRoles, targetRoles) {
  if (actorRoles.includes("super_admin")) return true;
  if (targetRoles.some((role) => PROTECTED_ROLES.has(role) || role === "discipline_chair")) return false;
  if (actorRoles.includes("discipline_chair")) {
    return targetRoles.some((role) => ["discipline_vice_chair", "discipline_member"].includes(role));
  }
  if (actorRoles.includes("discipline_vice_chair")) {
    return targetRoles.includes("discipline_member") &&
      !targetRoles.some((role) => ["discipline_chair", "discipline_vice_chair"].includes(role));
  }
  return false;
}

async function notify(profileId, actorId, title, body) {
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

  const { memberId, effect, reason = "Disiplin kararnamesi" } = request.body || {};
  if (!memberId || !VALID_EFFECTS.has(effect)) {
    return json(response, 400, { error: "Yaptirim bilgisi gecersiz." });
  }
  if (!String(reason || "").trim()) {
    return json(response, 400, { error: "Kararname metni zorunludur." });
  }

  const profileResponse = await supabaseRequest(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(memberId)}&select=id,role,roles,status&limit=1`
  );
  const [target] = await profileResponse.json().catch(() => []);
  if (!profileResponse.ok || !target) {
    return json(response, 404, { error: "Uye bulunamadi." });
  }

  const targetRoles = rolesOf(target);
  if (hasAny(targetRoles, PROTECTED_ROLES)) {
    return json(response, 403, { error: "Baskan, baskan yardimcisi veya super admin yetkisi disiplin kaydindan alinamaz." });
  }
  if (!canAffectTarget(actor.roles, targetRoles)) {
    return json(response, 403, { error: "Disiplin hiyerarsisi bu yaptirima izin vermiyor." });
  }

  const nextRoles = actor.roles.includes("super_admin")
    ? ["member"]
    : targetRoles.filter((role) => !["discipline_vice_chair", "discipline_member"].includes(role));
  if (!nextRoles.length) nextRoles.push("member");

  const payload =
    effect === "remove_roles"
      ? { role: primaryRole(nextRoles), roles: nextRoles, status: "active", committee_id: null }
      : effect === "suspend_member"
        ? { status: "suspended" }
        : { status: "passive" };

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
    if (actor.roles.includes("super_admin")) {
      await supabaseRequest(`/rest/v1/profile_committees?profile_id=eq.${encodeURIComponent(memberId)}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" }
      }).catch(() => undefined);
    } else {
      const committeeResponse = await supabaseRequest("/rest/v1/committees?name=eq.Disiplin%20Kurulu&select=id&limit=1");
      const [committee] = await committeeResponse.json().catch(() => []);
      if (committee?.id) {
        await supabaseRequest(
          `/rest/v1/profile_committees?profile_id=eq.${encodeURIComponent(memberId)}&committee_id=eq.${encodeURIComponent(committee.id)}`,
          { method: "DELETE", headers: { Prefer: "return=minimal" } }
        ).catch(() => undefined);
      }
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
        summary: effect === "remove_roles" ? "Disiplin yaptırımıyla yetki alındı" : "Disiplin yaptırımıyla üyelik durumu güncellendi",
        old_roles: targetRoles,
        new_roles: payload.roles || targetRoles,
        effect
      }
    })
  }).catch(() => undefined);

  await notify(
    memberId,
    actor.authUser.id,
    "Disiplin yapt\u0131r\u0131m\u0131 uyguland\u0131",
    `${effect === "remove_roles" ? "Disiplin kurulu yetkiniz g\u00fcncellendi" : "\u00dcyelik durumunuz g\u00fcncellendi"}. Kararname: ${reason}`
  );

  return json(response, 200, { ok: true, profile: patched?.[0] || null });
}
