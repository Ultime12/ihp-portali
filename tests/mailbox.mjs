import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import mailboxHandler, { mailHtmlToText, normalizeAddress, sanitizeMailHtml } from "../server/mailbox-api.js";
import { htmlToPlainText, verifyResendWebhook } from "../server/resend-webhook-api.js";
import { emailProfile } from "../server/mail.js";

process.env.SUPABASE_URL = "https://project.supabase.co";
process.env.SUPABASE_ANON_KEY = "anon";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
process.env.RESEND_API_KEY = "re_test";
process.env.MAIL_ENABLED = "true";

const actorId = "11111111-1111-4111-8111-111111111111";
const recipientId = "22222222-2222-4222-8222-222222222222";
const messageId = "33333333-3333-4333-8333-333333333333";

const actor = {
  id: actorId,
  display_name: "Portal Üyesi",
  email: "member@example.com",
  portal_email: "portal.uyesi@ihp.org.tr",
  role: "member",
  roles: ["member"],
  status: "active",
  is_system_account: false
};

const settings = {
  id: "main",
  domain: "ihp.org.tr",
  external_sending_enabled: true,
  member_daily_external_limit: 10,
  global_daily_external_limit: 90,
  max_subject_chars: 160,
  max_body_chars: 60000,
  max_attachments: 10,
  max_attachment_bytes: 15728640,
  max_message_attachment_bytes: 26214400
};

function apiResponse() {
  return {
    statusCode: 200,
    payload: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function baseMock({ external = false } = {}) {
  const calls = [];
  const fetchMock = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const target = String(url);
    if (target.endsWith("/auth/v1/user")) return jsonResponse({ id: actorId });
    if (target.includes("/rest/v1/profiles?id=eq.")) return jsonResponse([actor]);
    if (target.includes("/rest/v1/mail_settings")) return jsonResponse([settings]);
    if (target.includes("/rest/v1/mail_aliases")) return jsonResponse([]);
    if (target.includes("/rest/v1/profiles?portal_email=ilike.")) {
      return jsonResponse([{
        id: recipientId,
        display_name: "Alıcı Üye",
        portal_email: "alici@ihp.org.tr",
        role: "member",
        roles: ["member"],
        status: "active"
      }]);
    }
    if (target.includes("/rest/v1/mail_attachments?")) return jsonResponse([]);
    if (target.includes("/rest/v1/mail_messages?") && options.method !== "PATCH") return jsonResponse([]);
    if (target.endsWith("/rest/v1/mail_messages") && options.method === "POST") {
      const payload = JSON.parse(options.body);
      return jsonResponse([{ id: messageId, thread_id: messageId, batch_id: messageId, ...payload }], 201);
    }
    if (target.includes("/rest/v1/mail_messages?id=eq.") && options.method === "PATCH") {
      const payload = JSON.parse(options.body);
      return jsonResponse([{ id: messageId, thread_id: messageId, batch_id: messageId, ...payload }]);
    }
    if (target.endsWith("/rest/v1/notifications")) return jsonResponse({}, 201);
    if (target === "https://api.resend.com/emails" && external) return jsonResponse({ id: "resend-message-id" });
    throw new Error(`Unexpected fetch: ${target}`);
  };
  return { calls, fetchMock };
}

assert.equal(normalizeAddress("Portal Üyesi <PORTAL.UYESI@ihp.org.tr>"), "portal.uyesi@ihp.org.tr");
assert.equal(normalizeAddress("geçersiz"), "");
assert.equal(mailHtmlToText("<p>Merhaba<br><strong>Dünya</strong></p>"), "Merhaba\nDünya");
assert.equal(sanitizeMailHtml('<p onclick="bad()"><strong>Güvenli</strong><script>alert(1)</script></p>'), "<p><strong>Güvenli</strong></p>");

{
  const { calls, fetchMock } = baseMock();
  globalThis.fetch = fetchMock;
  const response = apiResponse();
  await mailboxHandler({
    method: "POST",
    headers: { authorization: "Bearer member-token" },
    body: { action: "send", to: "alici@ihp.org.tr", subject: "Merhaba", body: "Portal içi ileti" }
  }, response);

  assert.equal(response.statusCode, 200, response.payload?.error);
  assert.equal(response.payload.message.direction, "internal");
  assert.equal(response.payload.message.recipient_profile_id, recipientId);
  assert.equal(calls.some((call) => call.url === "https://api.resend.com/emails"), false);
}

{
  const { calls, fetchMock } = baseMock({ external: true });
  globalThis.fetch = fetchMock;
  const response = apiResponse();
  await mailboxHandler({
    method: "POST",
    headers: { authorization: "Bearer member-token" },
    body: { action: "send", to: "outside@example.com", subject: "Dış ileti", html: "<p>Güvenli <b>metin</b></p>" }
  }, response);

  assert.equal(response.statusCode, 200, response.payload?.error);
  assert.equal(response.payload.message.delivery_status, "sent");
  const resendCall = calls.find((call) => call.url === "https://api.resend.com/emails");
  assert.ok(resendCall);
  const resendPayload = JSON.parse(resendCall.options.body);
  assert.equal(resendPayload.reply_to, actor.portal_email);
  assert.deepEqual(resendPayload.to, ["outside@example.com"]);
  assert.match(resendPayload.from, /<portal\.uyesi@ihp\.org\.tr>$/);
  assert.match(resendPayload.html, /<b>metin<\/b>/);
}

{
  const key = Buffer.from("mailbox-test-secret").toString("base64");
  const secret = `whsec_${key}`;
  const payload = JSON.stringify({ type: "email.received", data: { email_id: "email-id" } });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const id = "msg_test_webhook";
  const signature = createHmac("sha256", Buffer.from(key, "base64"))
    .update(`${id}.${timestamp}.${payload}`)
    .digest("base64");

  assert.equal(verifyResendWebhook({ payload, id, timestamp, signature: `v1,${signature}`, secret }), true);
  assert.equal(verifyResendWebhook({ payload: `${payload} `, id, timestamp, signature: `v1,${signature}`, secret }), false);
  assert.equal(verifyResendWebhook({ payload, id, timestamp: String(Number(timestamp) - 900), signature: `v1,${signature}`, secret }), false);
}

assert.equal(
  htmlToPlainText("<style>bad{}</style><p>Merhaba<br>Dünya &amp; İHP</p><script>alert(1)</script>"),
  "Merhaba\nDünya & İHP"
);

{
  let profileQuery = "";
  globalThis.fetch = async (url) => {
    assert.equal(String(url), "https://api.resend.com/emails");
    return jsonResponse({ id: "notification-email-id" });
  };
  const result = await emailProfile(async (path) => {
    profileQuery = path;
    return jsonResponse([{
      id: recipientId,
      display_name: "Alıcı Üye",
      email: "recipient@example.test",
      status: "active"
    }]);
  }, recipientId, {
    subject: "Sistem bildirimi",
    title: "Yeni kayıt",
    body: "Kayıt ayrıntıları portalda bulunuyor."
  });
  assert.equal(result.ok, true);
  assert.doesNotMatch(profileQuery, /notifications_enabled/);
  assert.match(profileQuery, /select=id,display_name,email,status/);
}

console.log("Mailbox v2 and Resend webhook tests passed.");
