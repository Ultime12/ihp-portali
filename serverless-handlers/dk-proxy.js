const ALLOWED_TARGETS = new Set([
  "/api/manage-member",
  "/api/review-application",
  "/api/review-complaint",
  "/api/manage-investigation",
  "/api/apply-discipline",
  "/api/discipline-appeal",
  "/api/restore-suspensions",
  "/api/push"
]);

function json(response, status, body) {
  response.setHeader("Cache-Control", "no-store");
  return response.status(status).json(body);
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return json(response, 405, { error: "Yalnızca POST isteği kabul edilir." });
  }

  const target = String(request.query?.target || "").trim();
  if (!ALLOWED_TARGETS.has(target)) {
    return json(response, 400, { error: "Bu API hedefi DK geçidine açık değil." });
  }

  const authorization = String(request.headers.authorization || "");
  if (!authorization.startsWith("Bearer ")) {
    return json(response, 401, { error: "Aktif oturum gerekir." });
  }

  const configuredOrigin = String(process.env.IHP_CORE_API_ORIGIN || "").replace(/\/+$/, "");
  const coreOrigin = !configuredOrigin || configuredOrigin === "https://ihp-portali.vercel.app"
    ? "https://ihp26.vercel.app"
    : configuredOrigin;

  try {
    const upstream = await fetch(`${coreOrigin}${target}`, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
        "X-IHP-Portal": "discipline"
      },
      body: JSON.stringify(request.body || {}),
      signal: AbortSignal.timeout(55_000)
    });
    const payload = await upstream.text();
    response.setHeader("Cache-Control", "no-store");
    response.setHeader(
      "Content-Type",
      upstream.headers.get("content-type") || "application/json; charset=utf-8"
    );
    return response.status(upstream.status).send(payload);
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    return json(response, timedOut ? 504 : 502, {
      error: timedOut
        ? "Ana portal işlemi zaman aşımına uğradı."
        : "Ana portal işlem servisine ulaşılamadı."
    });
  }
}
