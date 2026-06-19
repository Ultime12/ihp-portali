const ALLOWED_TYPES = new Set(["error", "unhandledrejection", "network", "render"]);
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;
const rateLimit = new Map();

function cleanText(value, maxLength) {
  return String(value || "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, "[id]")
    .replace(/\b(?:eyJ|sb_|re_)[A-Za-z0-9._-]{12,}\b/g, "[secret]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, maxLength);
}

function requestIp(request) {
  return String(request.headers["x-forwarded-for"] || request.socket?.remoteAddress || "unknown")
    .split(",")[0]
    .trim();
}

function isRateLimited(ip) {
  const now = Date.now();
  const current = rateLimit.get(ip);
  if (!current || now - current.startedAt > WINDOW_MS) {
    rateLimit.set(ip, { count: 1, startedAt: now });
    return false;
  }
  current.count += 1;
  return current.count > MAX_REQUESTS;
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const contentLength = Number(request.headers["content-length"] || 0);
  if (contentLength > 2_048) return response.status(413).json({ error: "Payload too large" });
  if (isRateLimited(requestIp(request))) return response.status(429).json({ error: "Rate limit" });

  const payload = request.body && typeof request.body === "object" ? request.body : {};
  const type = ALLOWED_TYPES.has(payload.type) ? payload.type : "error";
  const message = cleanText(payload.message, 420);
  const page = cleanText(payload.page, 80).replace(/[^a-z0-9/_-]/gi, "");
  const timestamp = Number.isNaN(Date.parse(payload.timestamp))
    ? new Date().toISOString()
    : new Date(payload.timestamp).toISOString();

  console.error(JSON.stringify({ event: "client_error", type, page, timestamp, message }));
  return response.status(204).end();
}
