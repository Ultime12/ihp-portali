const DEFAULT_SITE_URL = "https://ihp.org.tr";
const DEFAULT_FROM = "İHP Portalı <bildirim@ihp.org.tr>";

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

function plainText({ title, body, actionUrl }) {
  return [
    title || "Yeni bildirimin var",
    "",
    body || "Portalda yeni bir bildirimin var. Detaylari gormek icin portala gir.",
    actionUrl ? `Portal: ${absoluteUrl(actionUrl)}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function htmlTemplate({ title, body, actionUrl, actionLabel = "Portala git", senderLabel = "İHP Portalı" }) {
  const button = actionUrl
    ? `<a href="${escapeHtml(absoluteUrl(actionUrl))}" style="display:inline-block;margin-top:18px;padding:12px 18px;border-radius:999px;background:#6aa5ff;color:#061427;text-decoration:none;font-weight:800">${escapeHtml(actionLabel)}</a>`
    : "";

  return `<!doctype html>
<html>
  <body style="margin:0;background:#071528;padding:28px;font-family:Arial,sans-serif;color:#eaf1ff">
    <main style="max-width:620px;margin:0 auto;border:1px solid rgba(255,255,255,.14);border-radius:24px;background:#0b1d35;padding:26px">
      <div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#7db2ff;font-weight:800">${escapeHtml(senderLabel)}</div>
      <h1 style="margin:12px 0 10px;font-size:26px;line-height:1.2">${escapeHtml(title || "Yeni bildirimin var")}</h1>
      <p style="margin:0;color:#c8d5e8;line-height:1.65;font-size:15px;white-space:pre-wrap">${escapeHtml(body || "Portalda yeni bir bildirimin var. Detaylari gormek icin portala gir.")}</p>
      ${button}
      <p style="margin-top:24px;color:#7d8ca3;font-size:12px;line-height:1.5">Bu e-posta kurumsal sistem tarafından otomatik gönderildi. Kayıt üzerindeki güncel durum için bağlantıyı kullanın.</p>
    </main>
  </body>
</html>`;
}

export async function sendResendEmail({
  from,
  to,
  cc,
  bcc,
  subject,
  html,
  text,
  replyTo,
  scheduledAt,
  attachments,
  idempotencyKey
} = {}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || process.env.MAIL_ENABLED === "false" || !to) {
    return { ok: false, skipped: true };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {})
    },
    body: JSON.stringify({
      from: from || process.env.MAIL_FROM || DEFAULT_FROM,
      to,
      subject,
      html,
      text,
      ...(Array.isArray(cc) && cc.length ? { cc } : {}),
      ...(Array.isArray(bcc) && bcc.length ? { bcc } : {}),
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
      ...(Array.isArray(attachments) && attachments.length ? { attachments } : {})
    })
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Resend email failed", response.status, result?.message || result?.error || "unknown");
    return {
      ok: false,
      status: response.status,
      error: result?.message || result?.error || "E-posta gonderilemedi."
    };
  }

  return { ok: true, ...result };
}

export async function cancelResendEmail(emailId) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !emailId) return { ok: false, skipped: true };
  const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(emailId)}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: result?.message || result?.error || "Zamanlanmış e-posta iptal edilemedi."
    };
  }
  return { ok: true, ...result };
}

export async function sendPortalEmail({ from, to, subject, title, body, actionUrl, actionLabel, senderLabel, idempotencyKey } = {}) {
  return sendResendEmail({
    from,
    to,
    subject: String(subject || "IHP Portal: Yeni bildirim").slice(0, 180),
    html: htmlTemplate({ title, body, actionUrl, actionLabel, senderLabel }),
    text: plainText({ title, body, actionUrl }),
    idempotencyKey
  });
}

export async function emailProfile(supabaseRequest, profileId, message = {}) {
  if (!profileId) return { ok: false, skipped: true };
  const response = await supabaseRequest(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(profileId)}&select=id,display_name,email,status,notifications_enabled&limit=1`
  );
  const [profile] = await response.json().catch(() => []);
  if (!response.ok || !profile?.email || (profile.notifications_enabled === false && !message.force)) {
    return { ok: false, skipped: true };
  }

  return sendPortalEmail({
    from: message.from,
    to: profile.email,
    subject: message.subject || "IHP Portal: Yeni bildirim",
    title: message.title || "Yeni bildirimin var",
    body: message.body || "Portalda yeni bir bildirimin var. Detaylari gormek icin portala gir.",
    actionUrl: message.actionUrl,
    actionLabel: message.actionLabel,
    senderLabel: message.senderLabel,
    idempotencyKey: message.idempotencyKey
  });
}
