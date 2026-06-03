const ALLOWED_ROLES = new Set([
  "super_admin",
  "president",
  "vice_president",
  "presidential_aide",
  "admission_officer",
  "discipline_admission_officer",
  "chief_representative"
]);

const VALID_PROFILE_ROLES = new Set([
  "super_admin",
  "president",
  "vice_president",
  "presidential_aide",
  "spokesperson",
  "discipline_chair",
  "discipline_vice_chair",
  "discipline_admission_officer",
  "discipline_member",
  "youth_chair",
  "youth_member",
  "admission_officer",
  "representative",
  "chief_representative",
  "member",
  "guest"
]);

const DISPLAY_NAME_PATTERN = /^[\p{L}][\p{L} .'-]{1,47}$/u;

const ASSIGNABLE_ROLES = {
  super_admin: VALID_PROFILE_ROLES,
  president: new Set([
    "vice_president",
    "presidential_aide",
    "spokesperson",
    "discipline_chair",
    "discipline_vice_chair",
    "discipline_admission_officer",
    "discipline_member",
    "youth_chair",
    "youth_member",
    "admission_officer",
    "representative",
    "chief_representative",
    "member",
    "guest"
  ]),
  vice_president: new Set([
    "presidential_aide",
    "spokesperson",
    "discipline_vice_chair",
    "discipline_member",
    "youth_chair",
    "youth_member",
    "admission_officer",
    "representative",
    "chief_representative",
    "member",
    "guest"
  ]),
  presidential_aide: new Set([
    "spokesperson",
    "discipline_member",
    "youth_member",
    "admission_officer",
    "representative",
    "chief_representative",
    "member",
    "guest"
  ]),
  admission_officer: new Set(["member", "guest", "representative"]),
  discipline_admission_officer: new Set([
    "discipline_member",
    "member",
    "guest",
    "representative"
  ]),
  chief_representative: new Set(["representative", "member", "guest"])
};

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

  const bearer = request.headers.authorization || "";
  if (!bearer.startsWith("Bearer ")) {
    return json(response, 401, { error: "Oturum dogrulanamadi." });
  }

  const token = bearer.slice(7);
  const authResponse = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`
    }
  });

  if (!authResponse.ok) {
    return json(response, 401, { error: "Oturum dogrulanamadi." });
  }

  const authUser = await authResponse.json();
  const profileResponse = await supabaseRequest(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(authUser.id)}&select=role&limit=1`
  );
  const [profile] = await profileResponse.json();

  if (!profile || !ALLOWED_ROLES.has(profile.role)) {
    return json(response, 403, { error: "Bu islem icin yetkiniz bulunmuyor." });
  }

  const { email, displayName, role = "member" } = request.body || {};
  if (!email || !displayName || !VALID_PROFILE_ROLES.has(role)) {
    return json(response, 400, { error: "Davet bilgileri eksik veya gecersiz." });
  }

  if (!DISPLAY_NAME_PATTERN.test(displayName)) {
    return json(response, 400, {
      error: "Gorunen ad yalnizca ad soyad veya guvenli uye etiketi olabilir."
    });
  }

  if (!ASSIGNABLE_ROLES[profile.role]?.has(role)) {
    return json(response, 403, {
      error: "Secilen rolu atamak icin yetkiniz bulunmuyor."
    });
  }

  const inviteResponse = await supabaseRequest("/auth/v1/invite", {
    method: "POST",
    body: JSON.stringify({
      email,
      data: {
        display_name: displayName,
        requested_role: role
      }
    })
  });

  const result = await inviteResponse.json();
  if (!inviteResponse.ok) {
    return json(response, inviteResponse.status, {
      error: result.msg || result.message || "Davet olusturulamadi."
    });
  }

  await supabaseRequest(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(result.id)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ display_name: displayName, role, status: "active" })
    }
  );

  return json(response, 200, {
    ok: true,
    message: `${displayName} icin guvenli davet olusturuldu.`
  });
}
