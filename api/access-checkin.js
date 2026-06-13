import { createHash } from "node:crypto";

const ENTRY_ACCOUNT_EMAIL = "giris@tfo.k12.tr";

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
    `/rest/v1/profiles?id=eq.${encodeURIComponent(authUser.id)}&select=id,display_name,email,role,roles,status,is_system_account&limit=1`
  );
  const [profile] = await profileResponse.json().catch(() => []);
  if (!profile || profile.status !== "active") return null;

  const roles = Array.isArray(profile.roles) && profile.roles.length ? profile.roles : [profile.role];
  return { authUser, profile, roles };
}

function hasAccessRole(actor) {
  return (
    actor?.profile?.is_system_account === true &&
    String(actor.profile.email || "").toLowerCase() === ENTRY_ACCOUNT_EMAIL
  );
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashCode(code) {
  return createHash("sha256").update(String(code)).digest("hex");
}

async function notify(profileId, actorId, title, body, category = "access") {
  await supabaseRequest("/rest/v1/notifications", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      recipient_id: profileId,
      actor_id: actorId,
      title,
      body,
      category,
      link: "#/portal/overview"
    })
  }).catch(() => undefined);
}

async function expireOldCheckins() {
  await supabaseRequest(
    `/rest/v1/access_checkins?status=eq.pending&expires_at=lt.${encodeURIComponent(new Date().toISOString())}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "expired" })
    }
  ).catch(() => undefined);
}

async function fetchCheckin(id) {
  const response = await supabaseRequest(
    `/rest/v1/access_checkins?id=eq.${encodeURIComponent(id)}&select=*,member:profiles!access_checkins_member_id_fkey(id,display_name)&limit=1`
  );
  const [checkin] = await response.json().catch(() => []);
  return response.ok ? checkin : null;
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
  if (!actor || !hasAccessRole(actor)) {
    return json(response, 403, { error: "Gecis onayi yalnizca ozel gecis hesabi ile yapilir." });
  }

  await expireOldCheckins();

  const { action, memberId, id, code } = request.body || {};

  if (action === "request") {
    if (!memberId) return json(response, 400, { error: "Uye secilmelidir." });

    const profileResponse = await supabaseRequest(
      `/rest/v1/profiles?id=eq.${encodeURIComponent(memberId)}&select=id,display_name,email,status,role,roles,is_system_account&limit=1`
    );
    const [member] = await profileResponse.json().catch(() => []);
    if (!profileResponse.ok || !member) {
      return json(response, 404, { error: "Uye bulunamadi." });
    }
    if (member.is_system_account || String(member.email || "").toLowerCase() === ENTRY_ACCOUNT_EMAIL) {
      return json(response, 400, { error: "Sistem hesabi icin gecis kodu olusturulamaz." });
    }
    if (member.status === "left") {
      return json(response, 400, { error: "Ayrilmis uye icin gecis kodu olusturulamaz." });
    }

    const accessCode = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const insertResponse = await supabaseRequest("/rest/v1/access_checkins", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        member_id: memberId,
        requested_by: actor.authUser.id,
        code_hash: hashCode(accessCode),
        status: "pending",
        expires_at: expiresAt
      })
    });
    const inserted = await insertResponse.json().catch(() => null);
    if (!insertResponse.ok) {
      return json(response, insertResponse.status, {
        error: inserted?.message || "Gecis kodu olusturulamadi."
      });
    }

    await notify(
      memberId,
      actor.authUser.id,
      "Gecis kodunuz",
      `Gecis onay kodunuz: ${accessCode}. Kod 10 dakika gecerlidir.`
    );

    return json(response, 200, { ok: true, checkin: inserted?.[0] || null });
  }

  if (action === "confirm") {
    if (!id || !code) return json(response, 400, { error: "Kod ve kayit secimi zorunludur." });

    const checkin = await fetchCheckin(id);
    if (!checkin) return json(response, 404, { error: "Gecis kaydi bulunamadi." });
    if (checkin.status !== "pending") return json(response, 400, { error: "Bu gecis kaydi artik beklemede degil." });
    if (new Date(checkin.expires_at).getTime() < Date.now()) {
      await supabaseRequest(`/rest/v1/access_checkins?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: "expired" })
      }).catch(() => undefined);
      return json(response, 400, { error: "Kodun suresi dolmus." });
    }
    if (hashCode(code) !== checkin.code_hash) {
      return json(response, 400, { error: "Kod hatali." });
    }

    const updateResponse = await supabaseRequest(`/rest/v1/access_checkins?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        status: "approved",
        approved_at: new Date().toISOString()
      })
    });
    const updated = await updateResponse.json().catch(() => null);
    if (!updateResponse.ok) {
      return json(response, updateResponse.status, {
        error: updated?.message || "Gecis onaylanamadi."
      });
    }

    await notify(
      checkin.member_id,
      actor.authUser.id,
      "Gecis onaylandi",
      `${checkin.member?.display_name || "Uyelik"} icin gecis onaylandi.`
    );

    return json(response, 200, { ok: true, checkin: updated?.[0] || null });
  }

  return json(response, 400, { error: "Gecersiz gecis islemi." });
}
