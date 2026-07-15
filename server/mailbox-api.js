import { randomUUID } from "node:crypto";
import { cancelResendEmail, sendResendEmail } from "./mail.js";

const MAIL_DOMAIN = "ihp.org.tr";
const ATTACHMENT_BUCKET = "mail-attachments";
const ACTIVE_MAILBOX_STATUSES = new Set(["active", "passive", "suspended"]);
const BLOCKED_ATTACHMENT_EXTENSIONS = new Set([
  "app", "apk", "bat", "bin", "cmd", "com", "cpl", "dll", "dmg", "exe", "hta", "iso",
  "jar", "js", "jse", "lnk", "msi", "msp", "pif", "ps1", "reg", "scr", "vb", "vbe",
  "vbs", "wsf"
]);
const SAFE_HTML_TAGS = new Set([
  "a", "b", "blockquote", "br", "code", "del", "div", "em", "h1", "h2", "h3", "hr",
  "i", "li", "ol", "p", "pre", "s", "span", "strong", "u", "ul"
]);
const SAFE_STYLE_PROPERTIES = new Set([
  "background-color", "color", "font-size", "font-style", "font-weight", "margin-left",
  "text-align", "text-decoration"
]);

function json(response, status, body) {
  response.setHeader?.("Cache-Control", "no-store");
  return response.status(status).json(body);
}

function configured() {
  return Boolean(
    process.env.SUPABASE_URL
    && process.env.SUPABASE_ANON_KEY
    && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
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

async function storageRequest(path, options = {}) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return fetch(`${baseUrl()}/storage/v1${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      ...(options.headers || {})
    }
  });
}

async function rows(path, message = "Posta verisi alınamadı.") {
  const response = await supabaseRequest(path);
  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const error = new Error(payload?.message || message);
    error.status = response.status;
    throw error;
  }
  return Array.isArray(payload) ? payload : [];
}

function rolesOf(profile = {}) {
  return [...new Set([...(Array.isArray(profile.roles) ? profile.roles : []), profile.role].filter(Boolean))];
}

async function authenticateActor(request) {
  const bearer = request.headers.authorization || "";
  if (!bearer.startsWith("Bearer ")) return null;

  const token = bearer.slice(7);
  const authResponse = await fetch(`${baseUrl()}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`
    }
  });
  if (!authResponse.ok) return null;

  const authUser = await authResponse.json();
  const profileRows = await rows(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(authUser.id)}&select=id,display_name,email,portal_email,status,is_system_account,role,roles&limit=1`,
    "Posta profili alınamadı."
  ).catch(() => []);
  const profile = profileRows[0];
  if (
    !profile
    || profile.is_system_account
    || !profile.portal_email
    || !ACTIVE_MAILBOX_STATUSES.has(profile.status)
  ) {
    return null;
  }

  return { authUser, profile, roles: rolesOf(profile) };
}

export function normalizeAddress(value = "") {
  const raw = String(value).trim();
  const bracketed = raw.match(/<([^<>]+)>/);
  const address = String(bracketed?.[1] || raw).trim().toLowerCase();
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(address)
    ? address
    : "";
}

function normalizeAddresses(value) {
  const input = Array.isArray(value) ? value : String(value || "").split(/[;,]/);
  return [...new Set(input.map(normalizeAddress).filter(Boolean))];
}

function isInternalAddress(address) {
  return address.endsWith(`@${MAIL_DOMAIN}`);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeDisplayName(value = "") {
  return String(value).replace(/[\r\n<>"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "İHP Üyesi";
}

function sanitizeStyle(value = "") {
  return String(value)
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .map((declaration) => {
      const separator = declaration.indexOf(":");
      if (separator < 1) return "";
      const property = declaration.slice(0, separator).trim().toLowerCase();
      const rawValue = declaration.slice(separator + 1).trim();
      if (!SAFE_STYLE_PROPERTIES.has(property)) return "";
      if (/url\s*\(|expression|javascript:|data:/i.test(rawValue)) return "";
      if (property === "margin-left" && !/^\d{1,3}(px|rem|em|%)$/.test(rawValue)) return "";
      if (property === "font-size" && !/^(?:[8-9]|[1-4]\d|5[0-6])(px)$/.test(rawValue)) return "";
      return `${property}:${rawValue.slice(0, 80)}`;
    })
    .filter(Boolean)
    .join(";");
}

export function sanitizeMailHtml(value = "") {
  const input = String(value || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|form|input|button|textarea|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|style|iframe|object|embed|form|input|button|textarea|svg|math)\b[^>]*\/?\s*>/gi, "");

  return input.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (full, rawTag, rawAttributes) => {
    const tag = String(rawTag).toLowerCase();
    if (!SAFE_HTML_TAGS.has(tag)) return "";
    if (full.startsWith("</")) return `</${tag}>`;
    if (tag === "br" || tag === "hr") return `<${tag}>`;

    let attributes = "";
    const styleMatch = String(rawAttributes).match(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const style = sanitizeStyle(styleMatch?.[1] || styleMatch?.[2] || "");
    if (style) attributes += ` style="${escapeHtml(style)}"`;

    if (tag === "a") {
      const hrefMatch = String(rawAttributes).match(/\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
      const href = String(hrefMatch?.[1] || hrefMatch?.[2] || "").trim();
      if (/^(https?:|mailto:)/i.test(href)) {
        attributes += ` href="${escapeHtml(href.slice(0, 2048))}" target="_blank" rel="noopener noreferrer"`;
      }
    }
    return `<${tag}${attributes}>`;
  }).slice(0, 120000);
}

export function mailHtmlToText(value = "") {
  return String(value || "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h1|h2|h3|li|blockquote|pre)>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/gi, "'")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function getSettings() {
  const settingsRows = await rows("/rest/v1/mail_settings?id=eq.main&select=*&limit=1").catch(() => []);
  return settingsRows[0] || {
    domain: MAIL_DOMAIN,
    external_sending_enabled: true,
    member_daily_external_limit: 10,
    global_daily_external_limit: 90,
    max_subject_chars: 160,
    max_body_chars: 60000,
    max_attachments: 10,
    max_attachment_bytes: 15728640,
    max_message_attachment_bytes: 26214400
  };
}

function publicSettings(settings) {
  return {
    domain: settings.domain || MAIL_DOMAIN,
    externalSendingEnabled: Boolean(settings.external_sending_enabled),
    maxSubjectChars: Number(settings.max_subject_chars || 160),
    maxBodyChars: Number(settings.max_body_chars || 60000),
    maxAttachments: Number(settings.max_attachments || 10),
    maxAttachmentBytes: Number(settings.max_attachment_bytes || 15728640),
    maxMessageAttachmentBytes: Number(settings.max_message_attachment_bytes || 26214400)
  };
}

async function getExternalUsage(profileId, settings) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const common = `direction=eq.external_outbound&delivery_status=in.(queued,scheduled,sent,delivered)&created_at=gte.${encodeURIComponent(start.toISOString())}&select=id`;
  const [memberRows, globalRows] = await Promise.all([
    rows(`/rest/v1/mail_messages?sender_profile_id=eq.${encodeURIComponent(profileId)}&${common}&limit=${Number(settings.member_daily_external_limit || 10) + 1}`),
    rows(`/rest/v1/mail_messages?${common}&limit=${Number(settings.global_daily_external_limit || 90) + 1}`)
  ]);
  return { member: memberRows.length, global: globalRows.length };
}

async function insertMessage(payload) {
  const response = await supabaseRequest("/rest/v1/mail_messages", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  const payloadRows = await response.json().catch(() => []);
  if (!response.ok || !payloadRows?.[0]) {
    const error = new Error(payloadRows?.message || "İleti kaydedilemedi.");
    error.status = response.status;
    throw error;
  }
  return payloadRows[0];
}

async function updateMessages(filter, payload) {
  const response = await supabaseRequest(`/rest/v1/mail_messages?${filter}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  const payloadRows = await response.json().catch(() => []);
  if (!response.ok) {
    const error = new Error(payloadRows?.message || "İleti güncellenemedi.");
    error.status = response.status;
    throw error;
  }
  return Array.isArray(payloadRows) ? payloadRows : [];
}

async function deleteRows(table, filter) {
  const response = await supabaseRequest(`/rest/v1/${table}?${filter}`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" }
  });
  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const error = new Error(payload?.message || "Kayıt silinemedi.");
    error.status = response.status;
    throw error;
  }
  return Array.isArray(payload) ? payload : [];
}

async function availableAliases(actor) {
  const aliases = await rows("/rest/v1/mail_aliases?active=eq.true&select=address,label,required_role,owner_profile_id&order=label.asc").catch(() => []);
  return aliases.filter((item) => (
    item.owner_profile_id === actor.profile.id
    || (item.required_role && actor.roles.includes(item.required_role))
  ));
}

async function senderIdentity(actor, requestedAddress) {
  const normalized = normalizeAddress(requestedAddress || actor.profile.portal_email);
  if (normalized === actor.profile.portal_email) {
    return { address: normalized, label: actor.profile.display_name, personal: true };
  }
  const aliases = await availableAliases(actor);
  const alias = aliases.find((item) => item.address === normalized);
  if (!alias) {
    const error = new Error("Bu kurumsal gönderici adresini kullanma yetkiniz yok.");
    error.status = 403;
    throw error;
  }
  return { address: alias.address, label: alias.label, personal: false };
}

async function resolveInternalAddress(address) {
  const direct = await rows(
    `/rest/v1/profiles?portal_email=ilike.${encodeURIComponent(address)}&is_system_account=eq.false&status=neq.left&select=id,display_name,portal_email,status,role,roles&limit=1`
  );
  if (direct[0]) return [direct[0]];

  const aliasRows = await rows(`/rest/v1/mail_aliases?address=eq.${encodeURIComponent(address)}&active=eq.true&select=address,label,required_role,owner_profile_id&limit=1`);
  const alias = aliasRows[0];
  if (!alias) return [];
  if (alias.owner_profile_id) {
    return rows(`/rest/v1/profiles?id=eq.${encodeURIComponent(alias.owner_profile_id)}&is_system_account=eq.false&status=neq.left&select=id,display_name,portal_email,status,role,roles&limit=1`);
  }
  const profiles = await rows("/rest/v1/profiles?is_system_account=eq.false&status=neq.left&select=id,display_name,portal_email,status,role,roles&limit=200");
  return profiles.filter((profile) => rolesOf(profile).includes(alias.required_role));
}

async function notifyRecipient(recipientId, actorId, subject) {
  if (!recipientId) return;
  await supabaseRequest("/rest/v1/notifications", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      recipient_id: recipientId,
      actor_id: actorId || null,
      title: "Yeni posta",
      body: subject ? `Konu: ${String(subject).slice(0, 120)}` : "Kurumsal posta kutunuza yeni bir ileti geldi.",
      category: "mail",
      link: "https://ihp-mail.vercel.app/#/portal/mail"
    })
  }).catch(() => undefined);
}

function messageAttachmentMap(attachments) {
  const map = new Map();
  for (const attachment of attachments) {
    if (!map.has(attachment.message_id)) map.set(attachment.message_id, []);
    map.get(attachment.message_id).push(attachment);
  }
  return map;
}

async function activateDueInternalMessages(actor) {
  const now = new Date().toISOString();
  const due = await rows(
    `/rest/v1/mail_messages?delivery_status=eq.scheduled&scheduled_at=lte.${encodeURIComponent(now)}&or=(sender_profile_id.eq.${actor.profile.id},recipient_profile_id.eq.${actor.profile.id})&select=id,batch_id,direction,recipient_profile_id,subject&limit=100`
  ).catch(() => []);
  if (!due.length) return;

  const batches = [...new Set(due.map((item) => item.batch_id))];
  for (const batchId of batches) {
    const batchRows = due.filter((item) => item.batch_id === batchId);
    const internal = batchRows.filter((item) => item.direction === "internal");
    await updateMessages(
      `batch_id=eq.${encodeURIComponent(batchId)}&delivery_status=eq.scheduled`,
      { delivery_status: internal.length ? "received" : "sent", sender_folder: "sent", sent_at: now }
    ).catch(() => undefined);
    await Promise.all(internal.map((item) => notifyRecipient(item.recipient_profile_id, actor.profile.id, item.subject)));
  }
}

async function loadMailbox(actor, settings) {
  await activateDueInternalMessages(actor);
  const profileId = actor.profile.id;
  const [messages, directory, aliases] = await Promise.all([
    rows(
      `/rest/v1/mail_messages?or=(sender_profile_id.eq.${profileId},recipient_profile_id.eq.${profileId})&select=id,thread_id,batch_id,sender_profile_id,recipient_profile_id,sender_address,recipient_address,to_addresses,cc_addresses,bcc_addresses,subject,body_text,body_html,direction,delivery_status,attachment_count,read_at,sent_at,scheduled_at,cancelled_at,sender_folder,recipient_folder,sender_starred,recipient_starred,sender_deleted_at,recipient_deleted_at,reply_to_message_id,resend_email_id,external_message_id,created_at&order=created_at.desc&limit=350`
    ),
    rows("/rest/v1/profiles?is_system_account=eq.false&status=neq.left&portal_email=not.is.null&select=id,display_name,portal_email&order=display_name.asc"),
    availableAliases(actor)
  ]);

  const ids = messages.map((item) => item.id);
  const attachments = ids.length
    ? await rows(`/rest/v1/mail_attachments?message_id=in.(${ids.join(",")})&select=id,message_id,file_name,content_type,byte_size,content_disposition,content_id,source,created_at&order=created_at.asc&limit=1000`).catch(() => [])
    : [];
  const attachmentsByMessage = messageAttachmentMap(attachments);
  const hydrated = messages.map((item) => ({
    ...item,
    attachments: attachmentsByMessage.get(item.id) || []
  }));

  return {
    mailbox: {
      address: actor.profile.portal_email,
      displayName: actor.profile.display_name,
      status: actor.profile.status
    },
    identities: [
      { address: actor.profile.portal_email, label: actor.profile.display_name, personal: true },
      ...aliases.map((item) => ({ address: item.address, label: item.label, personal: false }))
    ],
    messages: hydrated,
    directory,
    unreadCount: hydrated.filter((item) => (
      item.recipient_profile_id === profileId
      && !item.recipient_deleted_at
      && item.delivery_status !== "scheduled"
      && !item.read_at
    )).length,
    settings: publicSettings(settings)
  };
}

function validateSchedule(value) {
  if (!value) return null;
  const date = new Date(value);
  const minimum = Date.now() + 60_000;
  const maximum = Date.now() + 30 * 24 * 60 * 60 * 1000;
  if (Number.isNaN(date.valueOf()) || date.valueOf() < minimum || date.valueOf() > maximum) {
    const error = new Error("Gönderim zamanı en az 1 dakika sonra ve en fazla 30 gün içinde olmalıdır.");
    error.status = 400;
    throw error;
  }
  return date.toISOString();
}

function validateComposition(input, settings, { allowEmpty = false } = {}) {
  const to = normalizeAddresses(input.to);
  const cc = normalizeAddresses(input.cc);
  const bcc = normalizeAddresses(input.bcc);
  const all = [...new Set([...to, ...cc, ...bcc])];
  if (!allowEmpty && (!to.length || all.length > 10)) {
    const error = new Error(to.length ? "Bir iletide en fazla 10 alıcı kullanılabilir." : "En az bir alıcı yazın.");
    error.status = 400;
    throw error;
  }
  if (all.length > 10 || [...to, ...cc, ...bcc].some((item) => !normalizeAddress(item))) {
    const error = new Error("Alıcı adreslerinden biri geçersiz.");
    error.status = 400;
    throw error;
  }

  const subject = String(input.subject || "").trim();
  const html = sanitizeMailHtml(input.html || "");
  const body = String(input.body || mailHtmlToText(html)).trim();
  const maxSubject = Number(settings.max_subject_chars || 160);
  const maxBody = Number(settings.max_body_chars || 60000);
  if (!allowEmpty && (!subject || !body)) {
    const error = new Error("Konu ve mesaj alanları zorunludur.");
    error.status = 400;
    throw error;
  }
  if (subject.length > maxSubject || body.length > maxBody) {
    const error = new Error(`Konu en fazla ${maxSubject}, mesaj en fazla ${maxBody} karakter olabilir.`);
    error.status = 400;
    throw error;
  }

  return { to, cc, bcc, all, subject, body, html: html || `<p>${escapeHtml(body).replace(/\n/g, "<br>")}</p>` };
}

async function ownedDraft(actor, id) {
  if (!id) return null;
  const draftRows = await rows(
    `/rest/v1/mail_messages?id=eq.${encodeURIComponent(id)}&sender_profile_id=eq.${encodeURIComponent(actor.profile.id)}&delivery_status=eq.draft&select=*&limit=1`
  );
  return draftRows[0] || null;
}

async function saveDraft(actor, input, settings) {
  const data = validateComposition(input, settings, { allowEmpty: true });
  const identity = await senderIdentity(actor, input.from);
  const existing = await ownedDraft(actor, String(input.id || ""));
  const payload = {
    sender_address: identity.address,
    recipient_address: data.to[0] || actor.profile.portal_email,
    to_addresses: data.to,
    cc_addresses: data.cc,
    bcc_addresses: data.bcc,
    subject: data.subject,
    body_text: data.body,
    body_html: data.html,
    reply_to_message_id: /^[0-9a-f-]{36}$/i.test(String(input.replyToMessageId || "")) ? input.replyToMessageId : null,
    direction: "external_outbound",
    delivery_status: "draft",
    sender_folder: "draft"
  };
  if (existing) {
    const updated = await updateMessages(`id=eq.${encodeURIComponent(existing.id)}&sender_profile_id=eq.${actor.profile.id}`, payload);
    return updated[0];
  }
  return insertMessage({
    ...payload,
    sender_profile_id: actor.profile.id,
    recipient_profile_id: null
  });
}

async function attachmentsForMessage(messageId) {
  return rows(`/rest/v1/mail_attachments?message_id=eq.${encodeURIComponent(messageId)}&select=*&order=created_at.asc&limit=10`);
}

function safeAttachmentName(value = "") {
  return String(value).replace(/[\x00-\x1f<>:"/\\|?*]/g, "-").replace(/\s+/g, " ").trim().slice(0, 240);
}

function attachmentExtension(name = "") {
  return String(name).split(".").pop()?.toLowerCase() || "";
}

async function registerAttachment(actor, input, settings) {
  const messageId = String(input.messageId || "");
  const draft = await ownedDraft(actor, messageId);
  if (!draft) {
    const error = new Error("Dosya eki yalnızca size ait bir taslağa eklenebilir.");
    error.status = 404;
    throw error;
  }
  const storagePath = String(input.storagePath || "");
  const fileName = safeAttachmentName(input.fileName);
  const contentType = String(input.contentType || "application/octet-stream").slice(0, 160);
  const byteSize = Number(input.byteSize || 0);
  if (!storagePath.startsWith(`${actor.profile.id}/${messageId}/`) || !fileName) {
    const error = new Error("Dosya yolu geçersiz.");
    error.status = 400;
    throw error;
  }
  if (BLOCKED_ATTACHMENT_EXTENSIONS.has(attachmentExtension(fileName))) {
    const error = new Error("Bu dosya türü e-posta güvenliği nedeniyle eklenemez.");
    error.status = 400;
    throw error;
  }
  const maximumFile = Number(settings.max_attachment_bytes || 15728640);
  if (!Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > maximumFile) {
    const error = new Error(`Her dosya en fazla ${Math.floor(maximumFile / 1048576)} MB olabilir.`);
    error.status = 400;
    throw error;
  }
  const existing = await attachmentsForMessage(messageId);
  const total = existing.reduce((sum, item) => sum + Number(item.byte_size || 0), 0) + byteSize;
  if (existing.length >= Number(settings.max_attachments || 10) || total > Number(settings.max_message_attachment_bytes || 26214400)) {
    const error = new Error("Dosya adedi veya toplam ek boyutu sınırı aşıldı.");
    error.status = 400;
    throw error;
  }

  const response = await supabaseRequest("/rest/v1/mail_attachments", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      message_id: messageId,
      uploader_profile_id: actor.profile.id,
      storage_path: storagePath,
      file_name: fileName,
      content_type: contentType,
      byte_size: byteSize,
      source: "portal"
    })
  });
  const attachmentRows = await response.json().catch(() => []);
  if (!response.ok || !attachmentRows[0]) {
    const error = new Error(attachmentRows?.message || "Dosya eki kaydedilemedi.");
    error.status = response.status;
    throw error;
  }
  await updateMessages(`id=eq.${encodeURIComponent(messageId)}`, { attachment_count: existing.length + 1 });
  return attachmentRows[0];
}

async function removeAttachment(actor, input) {
  const attachmentId = String(input.id || "");
  const attachmentRows = await rows(`/rest/v1/mail_attachments?id=eq.${encodeURIComponent(attachmentId)}&select=*&limit=1`);
  const attachment = attachmentRows[0];
  if (!attachment || attachment.uploader_profile_id !== actor.profile.id || !(await ownedDraft(actor, attachment.message_id))) {
    const error = new Error("Dosya eki bulunamadı.");
    error.status = 404;
    throw error;
  }
  if (attachment.storage_path) {
    await storageRequest(`/object/${ATTACHMENT_BUCKET}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: [attachment.storage_path] })
    }).catch(() => undefined);
  }
  await deleteRows("mail_attachments", `id=eq.${encodeURIComponent(attachment.id)}`);
  const remaining = await attachmentsForMessage(attachment.message_id);
  await updateMessages(`id=eq.${encodeURIComponent(attachment.message_id)}`, { attachment_count: remaining.length });
}

async function resendAttachments(attachments) {
  const result = [];
  let totalBytes = 0;
  for (const attachment of attachments) {
    if (attachment.source !== "portal" || !attachment.storage_path) continue;
    const objectResponse = await storageRequest(
      `/object/authenticated/${ATTACHMENT_BUCKET}/${attachment.storage_path.split("/").map(encodeURIComponent).join("/")}`
    );
    if (!objectResponse.ok) {
      const error = new Error(`${attachment.file_name} dosyası okunamadı.`);
      error.status = 422;
      throw error;
    }
    const buffer = Buffer.from(await objectResponse.arrayBuffer());
    totalBytes += buffer.byteLength;
    if (totalBytes > 26214400) {
      const error = new Error("Dış e-posta eklerinin toplam boyutu çok büyük.");
      error.status = 413;
      throw error;
    }
    result.push({ content: buffer.toString("base64"), filename: attachment.file_name });
  }
  return result;
}

async function cloneAttachments(attachments, messageIds) {
  if (!attachments.length || !messageIds.length) return;
  const payload = messageIds.flatMap((messageId) => attachments.map((attachment) => ({
    message_id: messageId,
    uploader_profile_id: attachment.uploader_profile_id,
    storage_path: attachment.storage_path,
    external_attachment_id: attachment.external_attachment_id,
    file_name: attachment.file_name,
    content_type: attachment.content_type,
    byte_size: attachment.byte_size,
    content_disposition: attachment.content_disposition,
    content_id: attachment.content_id,
    source: attachment.source
  })));
  const response = await supabaseRequest("/rest/v1/mail_attachments", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error("Dosya ekleri alıcı iletisine bağlanamadı.");
}

function mailEnvelopeHtml(html, senderLabel) {
  return `<!doctype html><html><body style="margin:0;background:#f5f6fb;padding:24px;font-family:Arial,sans-serif;color:#182033"><main style="max-width:720px;margin:auto;background:#fff;border:1px solid #e1e5ef;border-radius:18px;padding:30px"><div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#635bda;font-weight:800">İHP Kurumsal Posta</div><div style="margin-top:20px;line-height:1.7">${html}</div><p style="margin-top:28px;padding-top:16px;border-top:1px solid #e6e9f0;color:#727b8d;font-size:12px">${escapeHtml(senderLabel)} tarafından İHP Mail üzerinden gönderildi.</p></main></body></html>`;
}

async function sendComposition(actor, input, settings) {
  const data = validateComposition(input, settings);
  const identity = await senderIdentity(actor, input.from);
  const scheduledAt = validateSchedule(input.scheduledAt);
  let draft = await ownedDraft(actor, String(input.draftId || ""));
  if (!draft) draft = await saveDraft(actor, { ...input, from: identity.address }, settings);
  const attachments = await attachmentsForMessage(draft.id);
  const batchId = draft.batch_id || randomUUID();
  const threadId = draft.thread_id || randomUUID();
  const replyToMessageId = /^[0-9a-f-]{36}$/i.test(String(input.replyToMessageId || "")) ? input.replyToMessageId : null;

  const externalAddresses = data.all.filter((address) => !isInternalAddress(address));
  const internalAddresses = data.all.filter(isInternalAddress);
  const internalRecipients = [];
  for (const address of internalAddresses) {
    const resolved = await resolveInternalAddress(address);
    if (!resolved.length) {
      const error = new Error(`${address} adresine bağlı aktif bir posta alıcısı bulunamadı.`);
      error.status = 404;
      throw error;
    }
    for (const recipient of resolved) {
      if (!internalRecipients.some((item) => item.id === recipient.id)) {
        internalRecipients.push({ ...recipient, requestedAddress: address });
      }
    }
  }

  let externalResult = null;
  if (externalAddresses.length) {
    if (actor.profile.status !== "active" || !settings.external_sending_enabled) {
      const error = new Error("Dış e-posta gönderimi bu hesap için kapalı.");
      error.status = 403;
      throw error;
    }
    const usage = await getExternalUsage(actor.profile.id, settings);
    if (usage.member >= Number(settings.member_daily_external_limit || 10)) {
      const error = new Error("Bugün için yeni dış e-posta gönderilemiyor. Daha sonra yeniden deneyin.");
      error.status = 429;
      throw error;
    }
    if (usage.global >= Number(settings.global_daily_external_limit || 90)) {
      const error = new Error("Dış e-posta servisi bugün için dolu. Daha sonra yeniden deneyin.");
      error.status = 429;
      throw error;
    }

    const externalTo = data.to.filter((address) => !isInternalAddress(address));
    const externalCc = data.cc.filter((address) => !isInternalAddress(address));
    const externalBcc = data.bcc.filter((address) => !isInternalAddress(address));
    const fallbackTo = externalTo.length ? externalTo : externalAddresses.slice(0, 1);
    const movedToBcc = externalTo.length ? externalBcc : [...externalBcc, ...externalAddresses.slice(1)];
    externalResult = await sendResendEmail({
      from: `${safeDisplayName(identity.label)} <${identity.address}>`,
      to: fallbackTo,
      cc: externalCc,
      bcc: movedToBcc,
      subject: data.subject,
      text: `${data.body}\n\n--\nBu ileti İHP Mail üzerinden gönderildi.`,
      html: mailEnvelopeHtml(data.html, identity.label),
      replyTo: identity.address,
      scheduledAt,
      attachments: await resendAttachments(attachments),
      idempotencyKey: `ihp-mail-${draft.id}`
    });
    if (!externalResult.ok) {
      const error = new Error(externalResult.error || "Dış e-posta gönderilemedi.");
      error.status = externalResult.status || 502;
      throw error;
    }
  }

  const now = new Date().toISOString();
  const common = {
    thread_id: threadId,
    batch_id: batchId,
    sender_profile_id: actor.profile.id,
    sender_address: identity.address,
    to_addresses: data.to,
    cc_addresses: data.cc,
    bcc_addresses: data.bcc,
    subject: data.subject,
    body_text: data.body,
    body_html: data.html,
    reply_to_message_id: replyToMessageId,
    attachment_count: attachments.length,
    scheduled_at: scheduledAt,
    sent_at: scheduledAt ? null : now,
    sender_folder: scheduledAt ? "scheduled" : "sent"
  };

  const created = [];
  const primaryExternal = externalAddresses.length > 0;
  const primaryInternal = !primaryExternal ? internalRecipients.shift() : null;
  const primaryPayload = primaryExternal
    ? {
        ...common,
        recipient_profile_id: null,
        recipient_address: externalAddresses[0],
        direction: "external_outbound",
        delivery_status: scheduledAt ? "scheduled" : "sent",
        resend_email_id: externalResult?.id || null
      }
    : {
        ...common,
        bcc_addresses: [],
        recipient_profile_id: primaryInternal.id,
        recipient_address: primaryInternal.requestedAddress,
        direction: "internal",
        delivery_status: scheduledAt ? "scheduled" : "received"
      };
  const updated = await updateMessages(`id=eq.${encodeURIComponent(draft.id)}&sender_profile_id=eq.${actor.profile.id}`, primaryPayload);
  if (!updated[0]) throw new Error("Taslak gönderime dönüştürülemedi.");
  created.push(updated[0]);

  const additionalRecipients = internalRecipients;
  const additionalIds = [];
  for (const recipient of additionalRecipients) {
    const message = await insertMessage({
      ...common,
      bcc_addresses: [],
      recipient_profile_id: recipient.id,
      recipient_address: recipient.requestedAddress,
      direction: "internal",
      delivery_status: scheduledAt ? "scheduled" : "received"
    });
    additionalIds.push(message.id);
    created.push(message);
  }
  await cloneAttachments(attachments, additionalIds);

  if (!scheduledAt) {
    const notifyRows = [primaryInternal, ...additionalRecipients].filter(Boolean);
    await Promise.all(notifyRows.map((recipient) => notifyRecipient(recipient.id, actor.profile.id, data.subject)));
  }
  return created[0];
}

async function participantMessage(actor, id) {
  const messageRows = await rows(
    `/rest/v1/mail_messages?id=eq.${encodeURIComponent(id)}&or=(sender_profile_id.eq.${actor.profile.id},recipient_profile_id.eq.${actor.profile.id})&select=*&limit=1`
  );
  return messageRows[0] || null;
}

async function mutateMessage(actor, input) {
  const ids = [...new Set((Array.isArray(input.ids) ? input.ids : [input.id]).map(String).filter((id) => /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 50);
  if (!ids.length) {
    const error = new Error("İleti seçin.");
    error.status = 400;
    throw error;
  }
  const command = String(input.command || "");
  const changed = [];
  for (const id of ids) {
    const message = await participantMessage(actor, id);
    if (!message) continue;
    const senderSide = message.sender_profile_id === actor.profile.id;
    const prefix = senderSide ? "sender" : "recipient";
    let patch = {};
    if (command === "read" && !senderSide) patch = { read_at: new Date().toISOString() };
    else if (command === "unread" && !senderSide) patch = { read_at: null };
    else if (command === "star") patch = { [`${prefix}_starred`]: input.value !== false };
    else if (command === "archive") patch = { [`${prefix}_folder`]: "archive" };
    else if (command === "spam" && !senderSide) patch = { recipient_folder: "spam" };
    else if (command === "trash") patch = { [`${prefix}_folder`]: "trash" };
    else if (command === "restore") patch = { [`${prefix}_folder`]: senderSide ? (message.delivery_status === "draft" ? "draft" : message.delivery_status === "scheduled" ? "scheduled" : "sent") : "inbox" };
    else if (command === "delete_forever") patch = { [`${prefix}_deleted_at`]: new Date().toISOString() };
    else continue;
    const updated = await updateMessages(`id=eq.${encodeURIComponent(id)}`, patch);
    if (updated[0]) changed.push(updated[0]);
  }
  return changed;
}

async function cancelScheduled(actor, id) {
  const message = await participantMessage(actor, id);
  if (!message || message.sender_profile_id !== actor.profile.id || message.delivery_status !== "scheduled") {
    const error = new Error("Zamanlanmış ileti bulunamadı.");
    error.status = 404;
    throw error;
  }
  if (message.resend_email_id) {
    const result = await cancelResendEmail(message.resend_email_id);
    if (!result.ok) {
      const error = new Error(result.error || "Zamanlanmış ileti iptal edilemedi.");
      error.status = result.status || 502;
      throw error;
    }
  }
  return updateMessages(`batch_id=eq.${encodeURIComponent(message.batch_id)}&sender_profile_id=eq.${actor.profile.id}`, {
    delivery_status: "cancelled",
    sender_folder: "trash",
    cancelled_at: new Date().toISOString()
  });
}

async function attachmentUrl(actor, id) {
  const attachmentRows = await rows(`/rest/v1/mail_attachments?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  const attachment = attachmentRows[0];
  if (!attachment || !(await participantMessage(actor, attachment.message_id))) {
    const error = new Error("Dosya eki bulunamadı.");
    error.status = 404;
    throw error;
  }
  if (attachment.source === "portal") {
    const response = await storageRequest(
      `/object/sign/${ATTACHMENT_BUCKET}/${attachment.storage_path.split("/").map(encodeURIComponent).join("/")}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: 300 })
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.signedURL) throw new Error("Dosya bağlantısı oluşturulamadı.");
    return { url: `${baseUrl()}/storage/v1${payload.signedURL}`, fileName: attachment.file_name };
  }

  const message = await participantMessage(actor, attachment.message_id);
  const response = await fetch(
    `https://api.resend.com/emails/receiving/${encodeURIComponent(message.external_message_id)}/attachments/${encodeURIComponent(attachment.external_attachment_id)}`,
    { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.download_url) throw new Error("Gelen posta eki alınamadı.");
  return { url: payload.download_url, fileName: attachment.file_name };
}

export async function sendMailboxMessageForActor(actor, input, settings = null) {
  const normalizedActor = {
    ...actor,
    roles: actor.roles || rolesOf(actor.profile || actor),
    profile: actor.profile || actor
  };
  return sendComposition(normalizedActor, input, settings || await getSettings());
}

export async function sendDisciplineMailboxMessage(profileId, message = {}) {
  if (!configured() || !profileId) return { ok: false, skipped: true };
  const recipientRows = await rows(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(profileId)}&is_system_account=eq.false&status=neq.left&select=id,display_name,portal_email,status,role,roles&limit=1`
  ).catch(() => []);
  const recipient = recipientRows[0];
  if (!recipient?.portal_email) return { ok: false, skipped: true };

  const chairRows = await rows(
    "/rest/v1/profiles?is_system_account=eq.false&status=eq.active&select=id,display_name,email,portal_email,status,role,roles&limit=200"
  ).catch(() => []);
  const chair = chairRows.find((profile) => rolesOf(profile).includes("discipline_chair"));
  if (!chair?.portal_email) return { ok: false, skipped: true };

  const result = await sendComposition(
    { authUser: { id: chair.id }, profile: chair, roles: rolesOf(chair) },
    {
      from: "dk@ihp.org.tr",
      to: recipient.portal_email,
      subject: String(message.subject || "Disiplin Kurulu bildirimi").slice(0, 160),
      body: String(message.body || "Disiplin Kurulu kaydınız güncellendi.").slice(0, 60000),
      html: message.html || ""
    },
    await getSettings()
  );
  return { ok: true, message: result };
}

export default async function handler(request, response) {
  if (!configured()) return json(response, 500, { error: "Posta sunucusu yapılandırması eksik." });
  if (!["GET", "POST"].includes(request.method)) return json(response, 405, { error: "Yalnızca GET ve POST istekleri kabul edilir." });

  const actor = await authenticateActor(request).catch(() => null);
  if (!actor) return json(response, 401, { error: "Geçerli üye posta kutusu bulunamadı." });
  const settings = await getSettings();

  if (request.method === "GET") {
    try {
      return json(response, 200, await loadMailbox(actor, settings));
    } catch (error) {
      return json(response, Number(error.status || 500), { error: error.message || "Posta kutusu yüklenemedi." });
    }
  }

  const action = String(request.body?.action || "send");
  try {
    if (action === "save_draft") return json(response, 200, { draft: await saveDraft(actor, request.body, settings) });
    if (action === "register_attachment") return json(response, 200, { attachment: await registerAttachment(actor, request.body, settings) });
    if (action === "remove_attachment") {
      await removeAttachment(actor, request.body);
      return json(response, 200, { ok: true });
    }
    if (action === "send") return json(response, 200, { ok: true, message: await sendComposition(actor, request.body, settings) });
    if (action === "mutate") return json(response, 200, { messages: await mutateMessage(actor, request.body) });
    if (action === "cancel_scheduled") return json(response, 200, { messages: await cancelScheduled(actor, request.body?.id) });
    if (action === "attachment_url") return json(response, 200, await attachmentUrl(actor, request.body?.id));
    return json(response, 400, { error: "Posta işlemi geçersiz." });
  } catch (error) {
    return json(response, Number(error.status || 500), { error: error.message || "Posta işlemi tamamlanamadı." });
  }
}
