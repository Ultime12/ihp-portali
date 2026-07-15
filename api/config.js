let pushKeyCache = { value: "", expiresAt: 0 };

async function loadPushPublicKey(url, serviceRoleKey) {
  const environmentKey = process.env.VAPID_PUBLIC_KEY || "";
  if (environmentKey) return environmentKey;
  if (!serviceRoleKey) return "";
  if (pushKeyCache.expiresAt > Date.now()) return pushKeyCache.value;
  const result = await fetch(`${url}/rest/v1/rpc/mobile_push_server_config`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json"
    },
    body: "{}"
  }).then(async (request) => request.ok ? request.json() : "").catch(() => "");
  const row = Array.isArray(result) ? result[0] : result;
  const value = typeof row?.vapid_public_key === "string" ? row.vapid_public_key : "";
  pushKeyCache = { value, expiresAt: Date.now() + 5 * 60 * 1000 };
  return value;
}

async function loadPasskeyStatus(url, anonKey) {
  if (!url || !anonKey) return false;
  const settings = await fetch(`${url}/auth/v1/settings`, {
    headers: { apikey: anonKey }
  }).then(async (request) => request.ok ? request.json() : null).catch(() => null);
  return settings?.passkeys_enabled === true;
}

export default async function handler(_request, response) {
  const url = process.env.SUPABASE_URL || "";
  const anonKey = process.env.SUPABASE_ANON_KEY || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const [vapidPublicKey, passkeysEnabled] = await Promise.all([
    url ? loadPushPublicKey(url, serviceRoleKey) : "",
    loadPasskeyStatus(url, anonKey)
  ]);

  response
    .status(200)
    .setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300")
    .json({
      configured: Boolean(url && anonKey),
      supabaseUrl: url,
      supabaseAnonKey: anonKey,
      pushConfigured: Boolean(vapidPublicKey),
      vapidPublicKey,
      passkeysEnabled
    });
}
