import { emailProfile } from "../server/mail.js";

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

async function authenticateUser(request) {
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
  return authResponse.json();
}

async function notify(profileId) {
  await supabaseRequest("/rest/v1/notifications", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      recipient_id: profileId,
      title: "Uyelik askisi sona erdi",
      body: "Sureli uzaklastirma cezanizin suresi doldu. Uyelik durumunuz tekrar aktif hale getirildi.",
      category: "discipline",
      link: "#/portal/discipline"
    })
  }).catch(() => undefined);
  await emailProfile(supabaseRequest, profileId, {
    subject: "Uyelik askisi sona erdi",
    title: "Uyelik askisi sona erdi",
    body: "Sureli uzaklastirma cezanizin suresi doldu. Uyelik durumunuz tekrar aktif hale getirildi.",
    actionUrl: "#/portal/discipline",
    actionLabel: "Disiplin sayfasini ac"
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

  const user = await authenticateUser(request);
  if (!user) return json(response, 401, { error: "Oturum dogrulanamadi." });

  const profilesResponse = await supabaseRequest(
    "/rest/v1/profiles?status=eq.suspended&suspended_until=not.is.null&select=id,display_name,suspended_until"
  );
  const profiles = await profilesResponse.json().catch(() => []);
  if (!profilesResponse.ok) {
    return json(response, profilesResponse.status, { error: "Askidaki uyeler okunamadi." });
  }

  const now = Date.now();
  const expired = profiles.filter((profile) => new Date(profile.suspended_until).getTime() <= now);
  for (const profile of expired) {
    await supabaseRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(profile.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        status: "active",
        suspended_until: null,
        suspension_note: ""
      })
    });
    await notify(profile.id);
  }

  return json(response, 200, { ok: true, restored: expired.length });
}
