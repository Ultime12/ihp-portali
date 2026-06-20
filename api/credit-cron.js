function json(response, status, body) {
  response.setHeader("Cache-Control", "no-store");
  return response.status(status).json(body);
}

export default async function handler(request, response) {
  if (request.method !== "GET") return json(response, 405, { error: "Yalnizca GET istegi kabul edilir." });
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.authorization !== `Bearer ${secret}`) {
    return json(response, 401, { error: "Cron yetkisi gecersiz." });
  }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const result = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/process_credit_schedules`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: "{}"
  });
  const payload = await result.json().catch(() => null);
  if (!result.ok) return json(response, 500, { error: payload?.message || "Otomatik kredi islemleri tamamlanamadi." });
  return json(response, 200, payload || { ok: true });
}
