const DEFAULT_SITE_URL = "https://ihp-portali.vercel.app";
const DEFAULT_FROM = "IHP Portali <onboarding@resend.dev>";

function siteUrl() {
  const explicit = process.env.SITE_URL || process.env.PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`.replace(/\/+$/, "");
  return DEFAULT_SITE_URL;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function absoluteUrl(path = "") {
  if (!path) return siteUrl();
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("#")) return `${siteUrl()}/${path}`;
  return `${siteUrl()}${path.startsWith("/") ? "" : "/"}${path}`;
}

function plainText({ actionUrl }) {
  return [
    "IHP Portal: Yeni bildirim",
    "",
    "Portalda yeni bir bildirimin var. Detaylari gormek icin portala gir.",
    actionUrl ? `Portal: ${absoluteUrl(actionUrl)}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function htmlTemplate({ actionUrl, actionLabel = "Portala git" }) {
  const button = actionUrl
    ? `<a href="${escapeHtml(absoluteUrl(actionUrl))}" style="display:inline-block;margin-top:18px;padding:12px 18px;border-radius:999px;background:#6aa5ff;color:#061427;text-decoration:none;font-weight:800">${escapeHtml(actionLabel)}</a>`
    : "";

  return `<!doctype html>
<html>
  <body style="margin:0;background:#071528;padding:28px;font-family:Arial,sans-serif;color:#eaf1ff">
    <main style="max-width:620px;margin:0 auto;border:1px solid rgba(255,255,255,.14);border-radius:24px;background:#0b1d35;padding:26px">
      <div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#7db2ff;font-weight:800">IHP Portali</div>
      <h1 style="margin:12px 0 10px;font-size:26px;line-height:1.2">Yeni bildirimin var</h1>
      <p style="margin:0;color:#c8d5e8;line-height:1.65;font-size:15px">Portalda yeni bir bildirimin var. Detaylar gizlilik icin sadece portal icinde gosterilir.</p>
      ${button}
      <p style="margin-top:24px;color:#7d8ca3;font-size:12px;line-height:1.5">Bu e-posta IHP Portali tarafindan otomatik gonderildi. Bildirim detayi e-postaya eklenmedi.</p>
    </main>
  </body>
</html>`;
}

export async function sendPortalEmail({ to, subject, title, body, actionUrl, actionLabel } = {}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || process.env.MAIL_ENABLED === "false" || !to) {
    return { ok: false, skipped: true };
  }

  const payload = {
    from: process.env.MAIL_FROM || DEFAULT_FROM,
    to,
    subject: "IHP Portal: Yeni bildirim",
    html: htmlTemplate({ actionUrl, actionLabel }),
    text: plainText({ actionUrl })
  };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    console.error("Resend email failed", response.status, result?.message || result?.error || "unknown");
    return { ok: false, status: response.status };
  }

  return response.json().catch(() => ({ ok: true }));
}

export async function emailProfile(supabaseRequest, profileId, message = {}) {
  if (!profileId) return { ok: false, skipped: true };
  const response = await supabaseRequest(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(profileId)}&select=id,display_name,email,status,notifications_enabled&limit=1`
  );
  const [profile] = await response.json().catch(() => []);
  if (!response.ok || !profile?.email || profile.notifications_enabled === false) {
    return { ok: false, skipped: true };
  }

  return sendPortalEmail({
    to: profile.email,
    subject: "IHP Portal: Yeni bildirim",
    title: "Yeni bildirimin var",
    body: "Portalda yeni bir bildirimin var. Detaylari gormek icin portala gir.",
    actionUrl: message.actionUrl,
    actionLabel: message.actionLabel
  });
}
