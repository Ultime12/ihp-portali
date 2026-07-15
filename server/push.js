import webpush from "web-push";

const DEFAULT_PUSH_URL = "https://ihp.org.tr/#/portal/overview";
const INVALID_SUBSCRIPTION_STATUS = new Set([404, 410]);
let vapidReady = false;
let serverConfigPromise = null;

function supabaseHeaders(extra = {}) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    ...extra
  };
}

export async function pushSupabaseRequest(path, options = {}) {
  return fetch(`${process.env.SUPABASE_URL}${path}`, {
    ...options,
    headers: supabaseHeaders(options.headers || {})
  });
}

async function loadPushServerConfig() {
  const fromEnvironment = {
    publicKey: process.env.VAPID_PUBLIC_KEY || "",
    privateKey: process.env.VAPID_PRIVATE_KEY || "",
    webhookSecret: process.env.PUSH_WEBHOOK_SECRET || ""
  };
  if (fromEnvironment.publicKey && fromEnvironment.privateKey && fromEnvironment.webhookSecret) {
    return fromEnvironment;
  }
  if (!serverConfigPromise) {
    serverConfigPromise = pushSupabaseRequest("/rest/v1/rpc/mobile_push_server_config", {
      method: "POST",
      body: "{}"
    }).then(async (response) => {
      if (!response.ok) return null;
      const payload = await response.json().catch(() => null);
      const row = Array.isArray(payload) ? payload[0] : payload;
      if (!row) return null;
      return {
        publicKey: fromEnvironment.publicKey || row.vapid_public_key || "",
        privateKey: fromEnvironment.privateKey || row.vapid_private_key || "",
        webhookSecret: fromEnvironment.webhookSecret || row.webhook_secret || ""
      };
    }).catch(() => null);
  }
  return serverConfigPromise;
}

async function configureVapid() {
  if (vapidReady) return true;
  const config = await loadPushServerConfig();
  if (!config?.publicKey || !config?.privateKey) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:sistem@ihp.org.tr",
    config.publicKey,
    config.privateKey
  );
  vapidReady = true;
  return true;
}

export async function getPushWebhookSecret() {
  const config = await loadPushServerConfig();
  return config?.webhookSecret || "";
}

export function normalizePushUrl(value = "") {
  const url = String(value || DEFAULT_PUSH_URL);
  return url
    .replace(/^https:\/\/dk\.ihp\.org\.tr\/?/i, "https://ihp.org.tr/dk/")
    .replace(/^https:\/\/mail\.ihp\.org\.tr\/?/i, "https://ihp.org.tr/mail/")
    .replace(/^https:\/\/ihp-finans\.vercel\.app\/?/i, "https://ihp.org.tr/finans/");
}

function pushPayload(notification = {}) {
  return JSON.stringify({
    title: String(notification.title || "İHP Mobil").slice(0, 120),
    body: String(notification.body || "Yeni bir bildiriminiz var.").slice(0, 600),
    icon: "/assets/pwa/icon-192.png",
    badge: "/assets/pwa/icon-192.png",
    tag: notification.id ? `ihp-${notification.id}` : "ihp-mobile",
    renotify: ["discipline", "security", "urgent"].includes(notification.category),
    notificationId: notification.id || "",
    url: normalizePushUrl(notification.link)
  });
}

async function rows(path) {
  const response = await pushSupabaseRequest(path);
  if (!response.ok) return [];
  return response.json().catch(() => []);
}

async function deliveredSubscriptionIds(notificationId, subscriptionIds) {
  if (!notificationId || !subscriptionIds.length) return new Set();
  const delivered = await rows(
    `/rest/v1/push_deliveries?notification_id=eq.${encodeURIComponent(notificationId)}&select=subscription_id`
  );
  const activeIds = new Set(subscriptionIds);
  return new Set(delivered.map((item) => item.subscription_id).filter((id) => activeIds.has(id)));
}

async function recordDelivery(notificationId, subscriptionId, status, errorMessage = "") {
  if (!notificationId || !subscriptionId) return;
  await pushSupabaseRequest("/rest/v1/push_deliveries?on_conflict=notification_id,subscription_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      notification_id: notificationId,
      subscription_id: subscriptionId,
      status,
      error_message: errorMessage ? String(errorMessage).slice(0, 500) : null,
      delivered_at: status === "sent" ? new Date().toISOString() : null
    })
  }).catch(() => undefined);
}

async function removeSubscription(id) {
  if (!id) return;
  await pushSupabaseRequest(`/rest/v1/push_subscriptions?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  }).catch(() => undefined);
}

export async function sendPushToProfile(profileId, notification = {}) {
  if (!profileId || !(await configureVapid())) return { sent: 0, skipped: true };
  const subscriptions = await rows(
    `/rest/v1/push_subscriptions?profile_id=eq.${encodeURIComponent(profileId)}&select=id,endpoint,p256dh,auth&order=updated_at.desc`
  );
  if (!subscriptions.length) return { sent: 0, skipped: true };

  const alreadyDelivered = await deliveredSubscriptionIds(notification.id, subscriptions.map((item) => item.id));
  const payload = pushPayload(notification);
  let sent = 0;

  await Promise.all(subscriptions.map(async (subscription) => {
    if (alreadyDelivered.has(subscription.id)) return;
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth }
        },
        payload,
        { TTL: 3600, urgency: notification.category === "discipline" ? "high" : "normal" }
      );
      sent += 1;
      await recordDelivery(notification.id, subscription.id, "sent");
    } catch (error) {
      const statusCode = Number(error?.statusCode || 0);
      if (INVALID_SUBSCRIPTION_STATUS.has(statusCode)) await removeSubscription(subscription.id);
      await recordDelivery(notification.id, subscription.id, "failed", error?.message || `HTTP ${statusCode || "error"}`);
    }
  }));

  return { sent, total: subscriptions.length };
}

export async function sendNotificationPush(notificationId) {
  if (!notificationId) return { sent: 0, skipped: true };
  const notifications = await rows(
    `/rest/v1/notifications?id=eq.${encodeURIComponent(notificationId)}&select=id,recipient_id,title,body,category,link&limit=1`
  );
  const notification = notifications[0];
  if (!notification?.recipient_id) return { sent: 0, skipped: true };
  return sendPushToProfile(notification.recipient_id, notification);
}
