const MANAGER_ROLES = new Set(["super_admin", "president", "vice_president", "presidential_aide"]);
const SUPER_MANAGER_ROLES = new Set(["super_admin"]);

const VALID_PROFILE_ROLES = new Set([
  "super_admin",
  "president",
  "vice_president",
  "presidential_aide",
  "spokesperson",
  "discipline_chair",
  "discipline_vice_chair",
  "discipline_member",
  "youth_chair",
  "youth_member",
  "representative",
  "chief_representative",
  "member"
]);

const DISPLAY_NAME_PATTERN = /^[\p{L}][\p{L} .'-]{1,47}$/u;
const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function json(response, status, body) {
  return response.status(status).json(body);
}

function randomPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let value = "";
  for (const byte of bytes) value += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length];
  return `IHP-${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}`;
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
    return json(response, 403, { error: "Bu islem icin yetkiniz bulunmuyor." });
  }

  const { email, displayName } = request.body || {};
  const roles = normalizeRoles(request.body?.roles || request.body?.role, actor.roles);
  if (!email || !displayName || !roles) {
    return json(response, 400, { error: "Uye bilgileri eksik veya gecersiz." });
  }

  if (!DISPLAY_NAME_PATTERN.test(displayName)) {
    return json(response, 400, {
      error: "Ad soyad yalnizca guvenli karakterlerden olusabilir."
    });
  }

  if (!hasAny(actor.roles, SUPER_MANAGER_ROLES) && roles.some((role) => role !== "member")) {
    return json(response, 403, {
      error: "Ilk kayitta ozel rol atamak icin super admin yetkisi gerekir."
    });
  }

  const password = randomPassword();
  const role = primaryRole(roles);
  const createResponse = await supabaseRequest("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: displayName,
        primary_role: role,
        roles
      }
    })
  });

  const created = await createResponse.json();
  if (!createResponse.ok) {
    return json(response, createResponse.status, {
      error: created.msg || created.message || "Uye olusturulamadi."
    });
  }

  await supabaseRequest(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(created.id)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        email,
        display_name: displayName,
        role,
        roles,
        status: "active",
        avatar_initials: null,
        avatar_color: "#f3c969",
        avatar_url: null
      })
    }
  );

  return json(response, 200, {
    ok: true,
    email,
    displayName,
    roles,
    temporaryPassword: password,
    message: `${displayName} icin hesap olusturuldu.`
  });
}
