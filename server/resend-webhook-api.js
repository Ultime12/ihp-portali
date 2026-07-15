import { createHmac, timingSafeEqual } from "node:crypto";
import { sanitizeMailHtml } from "./mailbox-api.js";

export const config = { api: { bodyParser: false } };

function json(response, status, body) {
  response.setHeader("Cache-Control", "no-store");
  return response.status(status).json(body);
}

function header(request, name) {
  if (typeof request.headers?.get === "function") return request.headers.get(name) || "";
  return request.headers?.[name.toLowerCase()] || "";
}

async function rawBody(request) {
  if (typeof request.rawBody === "string") return request.rawBody;
  if (Buffer.isBuffer(request.rawBody)) return request.rawBody.toString("utf8");
  if (typeof request.body === "string") return request.body;
  if (Buffer.isBuffer(request.body)) return request.body.toString("utf8");
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

export function verifyResendWebhook({ payload, id, timestamp, signature, secret, now = Date.now() }) {
  if (!payload || !id || !timestamp || !signature || !secret) return false;
  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber) || Math.abs(Math.floor(now / 1000) - timestampNumber) > 300) return false;
  try {
    const encodedSecret = String(secret).replace(/^whsec_/, "");
    const expected = createHmac("sha256", Buffer.from(encodedSecret, "base64"))
      .update(`${id}.${timestamp}.${payload}`)
      .digest("base64");
    const expectedBuffer = Buffer.from(expected);
    return String(signature)
      .split(/\s+/)
      .map((item) => item.split(","))
      .filter(([version, value]) => version === "v1" && value)
      .some(([, value]) => {
        const actualBuffer = Buffer.from(value);
        return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
      });
  } catch {
    return false;
  }
}

function decodeEntities(value) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return String(value).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const key = String(entity).toLowerCase();
    if (named[key] !== undefined) return named[key];
    if (key.startsWith("#x")) return String.fromCodePoint(Number.parseInt(key.slice(2), 16) || 32);
    if (key.startsWith("#")) return String.fromCodePoint(Number.parseInt(key.slice(1), 10) || 32);
    return match;
  });
}

export function htmlToPlainText(html = "") {
  return decodeEntities(
    String(html)
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizeAddress(value = "") {
  const raw = String(value).trim();
  const bracketed = raw.match(/<([^<>]+)>/);
  return String(bracketed?.[1] || raw).trim().toLowerCase();
}

function baseUrl() {
  return String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
}

async function supabaseRequest(path, options = {}) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return fetch(`${baseUrl()}${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
}

async function notifyRecipient(recipientId, subject) {
  await supabaseRequest("/rest/v1/notifications", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      recipient_id: recipientId,
      actor_id: null,
      title: "Dışarıdan yeni e-posta",
      body: subject ? `Konu: ${String(subject).slice(0, 120)}` : "Kurumsal posta kutunuza yeni bir e-posta geldi.",
      category: "mail",
      link: "https://ihp-mail.vercel.app/#/portal/mail"
    })
  }).catch(() => undefined);
}

async function receivedEmail(emailId) {
  const response = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.message || result?.error || "Gelen e-posta içeriği alınamadı.");
  return result;
}

async function recipientProfiles(address) {
  const directResponse = await supabaseRequest(
    `/rest/v1/profiles?portal_email=ilike.${encodeURIComponent(address)}&is_system_account=eq.false&status=neq.left&select=id,portal_email,role,roles&limit=1`
  );
  const direct = await directResponse.json().catch(() => []);
  if (directResponse.ok && direct[0]) return direct;

  const aliasResponse = await supabaseRequest(
    `/rest/v1/mail_aliases?address=eq.${encodeURIComponent(address)}&active=eq.true&select=required_role,owner_profile_id&limit=1`
  );
  const aliases = await aliasResponse.json().catch(() => []);
  const alias = aliases[0];
  if (!aliasResponse.ok || !alias) return [];
  if (alias.owner_profile_id) {
    const ownerResponse = await supabaseRequest(
      `/rest/v1/profiles?id=eq.${encodeURIComponent(alias.owner_profile_id)}&is_system_account=eq.false&status=neq.left&select=id,portal_email,role,roles&limit=1`
    );
    return ownerResponse.ok ? ownerResponse.json().catch(() => []) : [];
  }

  const profilesResponse = await supabaseRequest(
    "/rest/v1/profiles?is_system_account=eq.false&status=neq.left&select=id,portal_email,role,roles&limit=200"
  );
  const profiles = await profilesResponse.json().catch(() => []);
  if (!profilesResponse.ok) return [];
  return profiles.filter((profile) => [
    ...(Array.isArray(profile.roles) ? profile.roles : []),
    profile.role
  ].includes(alias.required_role));
}

async function insertIncomingAttachments(messageId, attachments) {
  if (!attachments.length) return;
  const response = await supabaseRequest("/rest/v1/mail_attachments", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(attachments.map((item) => ({
      message_id: messageId,
      uploader_profile_id: null,
      external_attachment_id: String(item.id),
      file_name: String(item.filename).replace(/[\\/]/g, "-").slice(0, 240),
      content_type: String(item.content_type || "application/octet-stream").slice(0, 160),
      byte_size: Number(item.size),
      content_disposition: item.content_disposition === "inline" ? "inline" : "attachment",
      content_id: item.content_id ? String(item.content_id).slice(0, 128) : null,
      source: "resend"
    })))
  });
  if (!response.ok) throw new Error("Gelen e-posta ekleri kaydedilemedi.");
}

export default async function handler(request, response) {
  if (request.method !== "POST") return json(response, 405, { error: "Yalnızca POST isteği kabul edilir." });
  if (
    !process.env.RESEND_WEBHOOK_SECRET
    || !process.env.RESEND_API_KEY
    || !process.env.SUPABASE_URL
    || !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return json(response, 500, { error: "Gelen posta yapılandırması eksik." });
  }

  const payload = await rawBody(request);
  const svixId = header(request, "svix-id");
  const svixTimestamp = header(request, "svix-timestamp");
  const svixSignature = header(request, "svix-signature");
  if (!verifyResendWebhook({
    payload,
    id: svixId,
    timestamp: svixTimestamp,
    signature: svixSignature,
    secret: process.env.RESEND_WEBHOOK_SECRET
  })) {
    return json(response, 400, { error: "Webhook imzası geçersiz." });
  }

  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return json(response, 400, { error: "Webhook içeriği geçersiz." });
  }
  if (event.type !== "email.received") return json(response, 200, { received: true, processed: 0 });

  const emailId = String(event.data?.email_id || "");
  if (!emailId) return json(response, 400, { error: "Gelen e-posta kimliği eksik." });

  try {
    const email = await receivedEmail(emailId);
    const recipients = [...new Set(
      [...(Array.isArray(email.to) ? email.to : []), ...(Array.isArray(event.data?.to) ? event.data.to : [])]
        .map(normalizeAddress)
        .filter((address) => address.endsWith("@ihp.org.tr"))
    )];
    const senderAddress = normalizeAddress(email.from || event.data?.from || "") || "bilinmeyen@external.invalid";
    const subject = String(email.subject || event.data?.subject || "(Konu yok)").trim().slice(0, 200) || "(Konu yok)";
    const body = String(email.text || htmlToPlainText(email.html) || "Bu e-postanın metin içeriği alınamadı.")
      .trim()
      .slice(0, 60000);
    const bodyHtml = sanitizeMailHtml(email.html || "");
    const attachments = (Array.isArray(email.attachments) ? email.attachments : [])
      .filter((item) => item?.id && item?.filename && Number(item.size || 0) > 0 && Number(item.size || 0) <= 15728640)
      .slice(0, 10);
    const toAddresses = (Array.isArray(email.to) ? email.to : []).map(normalizeAddress).filter(Boolean);
    const ccAddresses = (Array.isArray(email.cc) ? email.cc : []).map(normalizeAddress).filter(Boolean);
    let processed = 0;

    for (const recipientAddress of recipients) {
      const profiles = await recipientProfiles(recipientAddress);
      for (const profile of profiles) {
        const duplicateResponse = await supabaseRequest(
          `/rest/v1/mail_messages?webhook_id=eq.${encodeURIComponent(svixId)}&recipient_profile_id=eq.${encodeURIComponent(profile.id)}&select=id&limit=1`
        );
        const duplicates = await duplicateResponse.json().catch(() => []);
        if (duplicateResponse.ok && duplicates?.length) continue;

        const insertResponse = await supabaseRequest("/rest/v1/mail_messages", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            sender_profile_id: null,
            recipient_profile_id: profile.id,
            sender_address: senderAddress,
            recipient_address: recipientAddress,
            to_addresses: toAddresses.length ? toAddresses : [recipientAddress],
            cc_addresses: ccAddresses,
            bcc_addresses: [],
            subject,
            body_text: body,
            body_html: bodyHtml || null,
            direction: "inbound",
            delivery_status: "received",
            resend_email_id: emailId,
            external_message_id: emailId,
            webhook_id: svixId,
            attachment_count: attachments.length,
            recipient_folder: "inbox",
            sent_at: email.created_at || event.data?.created_at || event.created_at || new Date().toISOString()
          })
        });
        const inserted = await insertResponse.json().catch(() => []);
        if (!insertResponse.ok || !inserted[0]) {
          if (inserted?.code === "23505") continue;
          throw new Error(inserted?.message || "Gelen e-posta kaydedilemedi.");
        }
        await insertIncomingAttachments(inserted[0].id, attachments);
        processed += 1;
        await notifyRecipient(profile.id, subject);
      }
    }

    return json(response, 200, { received: true, processed });
  } catch (error) {
    console.error("Inbound email processing failed", emailId, error.message || error);
    return json(response, 502, { error: "Gelen e-posta işlenemedi." });
  }
}
