import { timingSafeEqual } from "node:crypto";
import { getPushWebhookSecret, pushSupabaseRequest, sendNotificationPush, sendPushToProfile } from "../server/push.js";

const VALID_SCOPES = new Set(["main", "dk", "finance", "mail"]);

function json(response, status, payload) {
  response.setHeader("Cache-Control", "no-store");
  return response.status(status).json(payload);
}

function safeSecretEqual(received, expected) {
  const left = Buffer.from(String(received || ""));
  const right = Buffer.from(String(expected || ""));
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

async function authenticate(request) {
  const bearer = String(request.headers.authorization || "");
  if (!bearer.startsWith("Bearer ")) return null;
  const token = bearer.slice(7);
  const authResponse = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`
    }
  });
  if (!authResponse.ok) return null;
  const user = await authResponse.json();
  const profileResponse = await pushSupabaseRequest(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,status,is_system_account,push_notifications_enabled&limit=1`
  );
  const [profile] = await profileResponse.json().catch(() => []);
  if (!profile || profile.status !== "active" || profile.is_system_account) return null;
  return { user, profile };
}

function normalizedSubscription(value) {
  const endpoint = String(value?.endpoint || "");
  const p256dh = String(value?.keys?.p256dh || "");
  const auth = String(value?.keys?.auth || "");
  if (!endpoint.startsWith("https://") || endpoint.length > 2000) return null;
  if (p256dh.length < 40 || p256dh.length > 300 || auth.length < 8 || auth.length > 200) return null;
  return { endpoint, p256dh, auth };
}

async function setPushPreference(profileId, enabled) {
  await pushSupabaseRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(profileId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ push_notifications_enabled: enabled })
  });
}

async function subscribe(actor, request, response) {
  const subscription = normalizedSubscription(request.body?.subscription);
  if (!subscription) return json(response, 400, { error: "Geçerli bir bildirim aboneliği bulunamadı." });
  const appScope = VALID_SCOPES.has(request.body?.appScope) ? request.body.appScope : "main";

  await pushSupabaseRequest(`/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(subscription.endpoint)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  });
  const insert = await pushSupabaseRequest("/rest/v1/push_subscriptions", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      profile_id: actor.profile.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
      app_scope: appScope,
      updated_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString()
    })
  });
  const [saved] = await insert.json().catch(() => []);
  if (!insert.ok || !saved) return json(response, 500, { error: "Bildirim aboneliği kaydedilemedi." });
  await setPushPreference(actor.profile.id, true);
  await sendPushToProfile(actor.profile.id, {
    title: "İHP Mobil hazır",
    body: "Bu cihaz önemli portal bildirimlerini almaya başladı.",
    category: "system",
    link: "https://ihp.org.tr/#/portal/mobile"
  });
  return json(response, 200, { ok: true, subscribed: true });
}

async function unsubscribe(actor, request, response) {
  const endpoint = String(request.body?.endpoint || "");
  if (!endpoint.startsWith("https://")) return json(response, 400, { error: "Abonelik adresi geçersiz." });
  await pushSupabaseRequest(
    `/rest/v1/push_subscriptions?profile_id=eq.${encodeURIComponent(actor.profile.id)}&endpoint=eq.${encodeURIComponent(endpoint)}`,
    { method: "DELETE", headers: { Prefer: "return=minimal" } }
  );
  const remaining = await pushSupabaseRequest(
    `/rest/v1/push_subscriptions?profile_id=eq.${encodeURIComponent(actor.profile.id)}&select=id&limit=1`
  );
  const rows = await remaining.json().catch(() => []);
  if (!rows.length) await setPushPreference(actor.profile.id, false);
  return json(response, 200, { ok: true, subscribed: false });
}

async function deliverWebhook(request, response) {
  const expected = await getPushWebhookSecret();
  const received = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!safeSecretEqual(received, expected)) return json(response, 401, { error: "Webhook doğrulanamadı." });
  const notificationId = request.body?.notification_id || request.body?.record?.id;
  if (!notificationId) return json(response, 400, { error: "Bildirim kimliği eksik." });
  const result = await sendNotificationPush(notificationId);
  return json(response, 200, { ok: true, ...result });
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return json(response, 405, { error: "Yalnızca POST isteği kabul edilir." });
  }
  if (String(request.query?.delivery || "") === "1") return deliverWebhook(request, response);

  const actor = await authenticate(request);
  if (!actor) return json(response, 401, { error: "Aktif üye oturumu bulunamadı." });
  const action = String(request.body?.action || "status");
  if (action === "subscribe") return subscribe(actor, request, response);
  if (action === "unsubscribe") return unsubscribe(actor, request, response);
  if (action === "test") {
    const result = await sendPushToProfile(actor.profile.id, {
      title: "İHP Mobil test bildirimi",
      body: "Bildirim bağlantınız doğru çalışıyor.",
      category: "system",
      link: "https://ihp.org.tr/#/portal/mobile"
    });
    return json(response, 200, { ok: true, ...result });
  }
  return json(response, 400, { error: "Geçersiz bildirim işlemi." });
}
