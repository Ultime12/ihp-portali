function json(response, status, body) {
  response.setHeader("Cache-Control", "no-store");
  return response.status(status).json(body);
}

async function supabaseRequest(path, options = {}) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return fetch(`${process.env.SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
}

async function authenticatedUser(request) {
  const bearer = request.headers.authorization || "";
  if (!bearer.startsWith("Bearer ")) return null;
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: bearer
    }
  });
  return response.ok ? response.json() : null;
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return json(response, 405, { error: "Yalnizca POST istegi kabul edilir." });
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return json(response, 500, { error: "Sunucu yapilandirmasi eksik." });
  }
  if (request.body?.acceptDataLoss !== true || String(request.body?.confirmation || "").trim() !== "HESABIMI SİL") {
    return json(response, 400, { error: "Hesap silme metnini okuyup tam olarak onaylamalisiniz." });
  }

  const user = await authenticatedUser(request);
  if (!user?.id) return json(response, 401, { error: "Oturum gecersiz veya sona ermis." });

  const profileResponse = await supabaseRequest(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,is_system_account&limit=1`
  );
  const [profile] = await profileResponse.json().catch(() => []);
  if (!profile) return json(response, 404, { error: "Portal profili bulunamadi." });
  if (profile.is_system_account) return json(response, 403, { error: "Sistem hesaplari bu ekrandan silinemez." });

  const deleteResponse = await supabaseRequest(`/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
    method: "DELETE"
  });
  if (!deleteResponse.ok) {
    const payload = await deleteResponse.json().catch(() => ({}));
    return json(response, deleteResponse.status, {
      error: payload.msg || payload.message || "Hesap silinemedi. Lutfen tekrar deneyin."
    });
  }

  return json(response, 200, { ok: true });
}
