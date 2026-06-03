const MANAGER_ROLES = new Set(["super_admin", "president", "vice_president"]);
const FULL_MANAGER_ROLES = new Set(["super_admin", "president"]);
const VALID_PROFILE_ROLES = new Set([
  "super_admin",
  "president",
  "vice_president",
  "presidential_aide",
  "spokesperson",
  "discipline_chair",
  "discipline_member",
  "youth_chair",
  "youth_member",
  "representative",
  "chief_representative",
  "member"
]);
const VALID_STATUSES = new Set(["active", "passive", "suspended", "left", "pending"]);
const DISPLAY_NAME_PATTERN = /^[\p{L}][\p{L} .'-]{1,47}$/u;
const INITIALS_PATTERN = /^[\p{L}0-9]{1,4}$/u;
const COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

function json(response, status, body) {
  return response.status(status).json(body);
}

async function supabaseRequest(path, options = {}) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  return fetch(`${url}${path}`, { ...options, headers });
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
  const [profile] = await profileResponse.json();
  if (!profile || profile.status !== "active") return null;
  const roles = Array.isArray(profile.roles) && profile.roles.length ? profile.roles : [profile.role];
  return { authUser, profile, roles };
}

function hasAny(roles, allowed) {
  return roles.some((role) => allowed.has(role));
}

async function getProfileById(id) {
  const response = await supabaseRequest(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=id,role,roles,status&limit=1`
  );
  const [profile] = await response.json().catch(() => []);
  return profile || null;
}

function normalizeRoles(input, actorRoles) {
  const values = Array.isArray(input) ? input : [input || "member"];
  const roles = [...new Set(values.map((role) => String(role).trim()).filter(Boolean))];
  if (!roles.length || roles.some((role) => !VALID_PROFILE_ROLES.has(role))) return null;
  if (roles.includes("super_admin") && !actorRoles.includes("super_admin")) return null;
  return roles;
}

function primaryRole(roles) {
  const priority = [
    "super_admin",
    "president",
    "vice_president",
    "presidential_aide",
    "discipline_chair",
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

function cleanProfilePayload(body, actorRoles) {
  const roles = normalizeRoles(body.roles || body.role, actorRoles);
  if (!roles) return null;
  if (!body.displayName || !DISPLAY_NAME_PATTERN.test(body.displayName)) return null;
  if (!VALID_STATUSES.has(body.status || "active")) return null;
  if (body.avatarInitials && !INITIALS_PATTERN.test(body.avatarInitials)) return null;
  if (body.avatarColor && !COLOR_PATTERN.test(body.avatarColor)) return null;
  if (body.avatarUrl && String(body.avatarUrl).length > 600) return null;

  return {
    display_name: body.displayName,
    role: primaryRole(roles),
    roles,
    status: body.status || "active",
    avatar_initials: body.avatarInitials || null,
    avatar_color: body.avatarColor || "#f3c969",
    avatar_url: body.avatarUrl || null
  };
}

function isProtectedForVice(profile) {
  const roles = Array.isArray(profile?.roles) && profile.roles.length ? profile.roles : [profile?.role];
  return roles.some((role) => role === "super_admin" || role === "president");
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
  if (!actor || !hasAny(actor.roles, MANAGER_ROLES)) {
    return json(response, 403, { error: "Bu islem icin baskan veya super admin yetkisi gerekir." });
  }

  const { action, id, password } = request.body || {};
  if (!id || !action) return json(response, 400, { error: "Eksik uye islemi." });

  if (action === "delete") {
    if (!hasAny(actor.roles, FULL_MANAGER_ROLES)) {
      return json(response, 403, { error: "Uye silmek icin baskan veya super admin yetkisi gerekir." });
    }
    if (id === actor.authUser.id) return json(response, 400, { error: "Kendi hesabinizi silemezsiniz." });
    const deleteResponse = await supabaseRequest(`/auth/v1/admin/users/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
    if (!deleteResponse.ok) {
      const result = await deleteResponse.json().catch(() => ({}));
      return json(response, deleteResponse.status, {
        error: result.msg || result.message || "Uye silinemedi."
      });
    }
    return json(response, 200, { ok: true, message: "Uye silindi." });
  }

  if (action !== "update") return json(response, 400, { error: "Gecersiz islem." });

  const viceOnly = !hasAny(actor.roles, FULL_MANAGER_ROLES) && actor.roles.includes("vice_president");
  if (viceOnly) {
    const target = await getProfileById(id);
    if (!target) return json(response, 404, { error: "Uye bulunamadi." });

    const requestedRoles = normalizeRoles(request.body.roles || request.body.role, actor.roles);
    if (!requestedRoles || isProtectedForVice(target) || requestedRoles.some((role) => role === "super_admin" || role === "president")) {
      return json(response, 403, { error: "Baskan yardimcisi super admin veya baskan rollerini yonetemez." });
    }
  }

  const payload = cleanProfilePayload(request.body, actor.roles);
  if (!payload) return json(response, 400, { error: "Uye bilgileri gecersiz." });

  if (viceOnly && payload.roles.some((role) => role === "super_admin" || role === "president")) {
    return json(response, 403, { error: "Baskan yardimcisi super admin veya baskan rollerini veremez." });
  }

  const patchResponse = await supabaseRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  const patched = await patchResponse.json().catch(() => null);
  if (!patchResponse.ok) {
    return json(response, patchResponse.status, {
      error: patched?.message || "Profil guncellenemedi."
    });
  }

  if (password) {
    if (!hasAny(actor.roles, FULL_MANAGER_ROLES)) {
      return json(response, 403, { error: "Sifre degistirmek icin baskan veya super admin yetkisi gerekir." });
    }
    if (String(password).length < 8) return json(response, 400, { error: "Sifre en az 8 karakter olmali." });
    const passwordResponse = await supabaseRequest(`/auth/v1/admin/users/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ password, email_confirm: true })
    });
    if (!passwordResponse.ok) {
      const result = await passwordResponse.json().catch(() => ({}));
      return json(response, passwordResponse.status, {
        error: result.msg || result.message || "Sifre guncellenemedi."
      });
    }
  }

  return json(response, 200, { ok: true, profile: patched?.[0] || null });
}
