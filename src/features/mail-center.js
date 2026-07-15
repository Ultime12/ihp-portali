const IHP_MAIL_CENTER_V2 = true;
let mailDraftTimer = 0;

function canUsePortalMail() {
  return Boolean(state.profile && !state.profile.is_system_account && state.profile.status !== "left");
}

if (!navItems.some(([id]) => id === "mail")) {
  navItems.splice(0, 0, ["mail", "Mail", "inbox", canUsePortalMail]);
}

function mailUiState() {
  if (!state.cache.mailUi) {
    state.cache.mailUi = {
      folder: "inbox",
      selectedId: "",
      search: "",
      fetchedAt: 0,
      mobileReader: false,
      composer: null
    };
  }
  return state.cache.mailUi;
}

async function refreshPortalMailbox(force = false) {
  const ui = mailUiState();
  if (!canUsePortalMail()) return null;
  if (!force && state.cache.mailbox && Date.now() - ui.fetchedAt < 30_000) return state.cache.mailbox;
  state.cache.mailbox = await serverRequest("/api/mailbox");
  ui.fetchedAt = Date.now();
  return state.cache.mailbox;
}

function mailMessages() {
  return Array.isArray(state.cache.mailbox?.messages) ? state.cache.mailbox.messages : [];
}

function mailIsSender(item) {
  return item.sender_profile_id === state.profile?.id;
}

function mailIsRecipient(item) {
  return item.recipient_profile_id === state.profile?.id;
}

function mailFolderRows(folder = mailUiState().folder) {
  const messages = mailMessages();
  const rows = messages.filter((item) => {
    const sender = mailIsSender(item);
    const recipient = mailIsRecipient(item);
    if (sender && item.sender_deleted_at) return false;
    if (recipient && item.recipient_deleted_at) return false;
    if (folder === "inbox") return recipient && item.recipient_folder === "inbox" && item.delivery_status !== "scheduled";
    if (folder === "starred") return (sender && item.sender_starred) || (recipient && item.recipient_starred);
    if (folder === "sent") return sender && item.sender_folder === "sent" && !["draft", "scheduled", "cancelled"].includes(item.delivery_status);
    if (folder === "draft") return sender && item.sender_folder === "draft" && item.delivery_status === "draft";
    if (folder === "scheduled") return sender && item.sender_folder === "scheduled" && item.delivery_status === "scheduled";
    if (folder === "archive") return (sender && item.sender_folder === "archive") || (recipient && item.recipient_folder === "archive");
    if (folder === "spam") return recipient && item.recipient_folder === "spam";
    if (folder === "trash") return (sender && item.sender_folder === "trash") || (recipient && item.recipient_folder === "trash");
    return false;
  });

  const deduped = [];
  const batches = new Set();
  for (const item of rows) {
    if (mailIsSender(item) && ["sent", "scheduled"].includes(folder) && item.batch_id) {
      if (batches.has(item.batch_id)) continue;
      batches.add(item.batch_id);
    }
    deduped.push(item);
  }

  const query = mailUiState().search.trim().toLocaleLowerCase("tr-TR");
  if (!query) return deduped;
  return deduped.filter((item) => [
    item.sender_address,
    item.recipient_address,
    ...(item.to_addresses || []),
    ...(item.cc_addresses || []),
    item.subject,
    item.body_text
  ].join(" ").toLocaleLowerCase("tr-TR").includes(query));
}

function mailFolderCount(folder) {
  const previous = mailUiState().search;
  mailUiState().search = "";
  const count = mailFolderRows(folder).length;
  mailUiState().search = previous;
  return count;
}

function mailSelected() {
  const ui = mailUiState();
  const rows = mailFolderRows();
  return rows.find((item) => item.id === ui.selectedId) || rows[0] || null;
}

function mailInitials(address = "") {
  const local = String(address).split("@")[0].replace(/[._-]+/g, " ").trim();
  const parts = local.split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)[0]}` : local.slice(0, 2)).toLocaleUpperCase("tr-TR") || "@";
}

function mailAddressSummary(item, folder) {
  if (folder === "sent" || folder === "draft" || folder === "scheduled" || mailIsSender(item)) {
    return (item.to_addresses || []).join(", ") || item.recipient_address;
  }
  return item.sender_address;
}

function mailTime(item) {
  return item.scheduled_at || item.sent_at || item.created_at;
}

function mailStatusLabel(status) {
  return ({
    draft: "Taslak",
    scheduled: "Zamanlandı",
    queued: "Hazırlanıyor",
    sent: "Gönderildi",
    delivered: "Teslim edildi",
    received: "Alındı",
    failed: "Gönderilemedi",
    bounced: "Geri döndü",
    cancelled: "İptal edildi"
  })[status] || status || "Kayıtlı";
}

function mailFolderDefinitions() {
  return [
    ["inbox", "Gelen Kutusu", "inbox", Number(state.cache.mailbox?.unreadCount || 0)],
    ["starred", "Yıldızlı", "star", 0],
    ["sent", "Gönderilen", "send", 0],
    ["draft", "Taslaklar", "edit", mailFolderCount("draft")],
    ["scheduled", "Zamanlanmış", "clock", mailFolderCount("scheduled")],
    ["archive", "Arşiv", "archive", 0],
    ["spam", "İstenmeyen", "shield", 0],
    ["trash", "Çöp Kutusu", "trash", 0]
  ];
}

function mailSidebar() {
  const ui = mailUiState();
  const mailbox = state.cache.mailbox?.mailbox || {};
  return `
    <aside class="mail-nav" aria-label="Posta klasörleri">
      <button class="mail-compose-main" type="button" data-action="mail-compose">${icon("edit")} <span>Yeni ileti</span></button>
      <nav>
        ${mailFolderDefinitions().map(([id, label, iconName, count]) => `
          <button class="mail-folder-link ${ui.folder === id ? "active" : ""}" type="button" data-action="mail-folder" data-folder="${id}">
            ${icon(iconName)} <span>${label}</span>${Number(count) ? `<b>${Number(count)}</b>` : ""}
          </button>
        `).join("")}
      </nav>
      <div class="mail-account-card">
        <span class="mail-account-avatar">${esc(mailInitials(mailbox.address))}</span>
        <div><strong>${esc(mailbox.displayName || state.profile?.display_name)}</strong><small>${esc(mailbox.address || state.profile?.portal_email)}</small></div>
        <button type="button" data-action="logout" aria-label="Çıkış yap" title="Çıkış yap">${icon("logout")}</button>
      </div>
    </aside>
  `;
}

function mailListRow(item) {
  const ui = mailUiState();
  const folder = ui.folder;
  const address = mailAddressSummary(item, folder);
  const recipientSide = mailIsRecipient(item);
  const unread = recipientSide && !item.read_at && item.delivery_status !== "scheduled";
  const starred = mailIsSender(item) ? item.sender_starred : item.recipient_starred;
  return `
    <article class="mail-row ${unread ? "unread" : ""} ${ui.selectedId === item.id ? "active" : ""}" data-id="${esc(item.id)}">
      <button class="mail-row-star ${starred ? "active" : ""}" type="button" data-action="mail-star" data-id="${esc(item.id)}" aria-label="${starred ? "Yıldızı kaldır" : "Yıldız ekle"}">${icon("star")}</button>
      <button class="mail-row-main" type="button" data-action="mail-open" data-id="${esc(item.id)}">
        <span class="mail-row-avatar">${esc(mailInitials(address))}</span>
        <span class="mail-row-copy">
          <span class="mail-row-heading"><strong>${esc(address)}</strong><time>${formatDate(mailTime(item), true)}</time></span>
          <b>${esc(item.subject || "(Konu yok)")}</b>
          <small>${esc(String(item.body_text || "").replace(/\s+/g, " ").slice(0, 110))}</small>
          <span class="mail-row-meta">${Number(item.attachment_count || 0) ? `${icon("paperclip")} ${Number(item.attachment_count)}` : ""}${item.delivery_status === "scheduled" ? `<em>${mailStatusLabel(item.delivery_status)}</em>` : ""}</span>
        </span>
      </button>
    </article>
  `;
}

function mailListPane() {
  const rows = mailFolderRows();
  const label = mailFolderDefinitions().find(([id]) => id === mailUiState().folder)?.[1] || "Posta";
  return `
    <section class="mail-list-pane ${mailUiState().mobileReader ? "mobile-hidden" : ""}">
      <header class="mail-list-head"><div><span>Klasör</span><h2>${esc(label)}</h2></div><b>${rows.length}</b></header>
      <div class="mail-list-scroll">
        ${rows.length ? rows.map(mailListRow).join("") : `<div class="mail-zero">${icon("inbox")}<strong>Burada ileti yok</strong><span>Yeni iletiler ve kayıtlar bu alanda görünür.</span></div>`}
      </div>
    </section>
  `;
}

function mailReaderHtml(item) {
  const html = item.body_html || `<p>${esc(item.body_text || "").replace(/\n/g, "<br>")}</p>`;
  const dark = document.documentElement.dataset.mailTheme === "dark";
  const colors = dark
    ? { scheme: "dark", background: "#202337", text: "#f2f3fb", link: "#8db7ff", quote: "#b4bad0", line: "#474c66", code: "#181b2b" }
    : { scheme: "light", background: "#fff", text: "#192033", link: "#315ed8", quote: "#5e6678", line: "#c8cedd", code: "#f3f5f9" };
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="${colors.scheme}"><style>html{background:${colors.background};color:${colors.text};font:15px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{margin:0;padding:4px 2px 24px;overflow-wrap:anywhere}a{color:${colors.link}}blockquote{margin:16px 0;padding:2px 0 2px 16px;border-left:3px solid ${colors.line};color:${colors.quote}}img,video{max-width:100%;height:auto}pre{white-space:pre-wrap;background:${colors.code};padding:12px;border-radius:8px}hr{border:0;border-top:1px solid ${colors.line}}</style></head><body>${html}</body></html>`;
}

function mailAttachmentChip(item) {
  const size = Number(item.byte_size || 0);
  const readable = size >= 1048576 ? `${(size / 1048576).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
  return `<button class="mail-attachment-chip" type="button" data-action="mail-download-attachment" data-id="${esc(item.id)}">${icon("paperclip")}<span><strong>${esc(item.file_name)}</strong><small>${esc(readable)}</small></span>${icon("download")}</button>`;
}

function mailReader(item) {
  if (!item) {
    return `<section class="mail-reader-pane mail-reader-empty"><div>${icon("inbox")}<strong>Bir ileti seçin</strong><span>Okumak veya yanıtlamak istediğiniz iletiyi açın.</span></div></section>`;
  }
  const sender = mailIsSender(item);
  const starred = sender ? item.sender_starred : item.recipient_starred;
  const folder = mailUiState().folder;
  const recipientLine = (item.to_addresses || []).join(", ") || item.recipient_address;
  return `
    <section class="mail-reader-pane ${mailUiState().mobileReader ? "mobile-active" : ""}">
      <header class="mail-reader-toolbar">
        <button class="mail-mobile-back" type="button" data-action="mail-mobile-back" aria-label="Listeye dön">${icon("back")}</button>
        <div>
          <button type="button" data-action="mail-star" data-id="${esc(item.id)}" aria-label="Yıldız">${icon("star")}</button>
          ${folder !== "archive" ? `<button type="button" data-action="mail-mutate" data-command="archive" data-id="${esc(item.id)}" aria-label="Arşivle">${icon("archive")}</button>` : ""}
          ${folder === "trash"
            ? `<button type="button" data-action="mail-mutate" data-command="restore" data-id="${esc(item.id)}" aria-label="Geri yükle">${icon("refresh")}</button><button type="button" data-action="mail-delete-forever" data-id="${esc(item.id)}" aria-label="Kalıcı sil">${icon("trash")}</button>`
            : `<button type="button" data-action="mail-mutate" data-command="trash" data-id="${esc(item.id)}" aria-label="Sil">${icon("trash")}</button>`}
          ${item.delivery_status === "scheduled" ? `<button type="button" data-action="mail-cancel-scheduled" data-id="${esc(item.id)}" aria-label="Zamanlamayı iptal et">${icon("x")}</button>` : ""}
        </div>
        <span class="mail-status-pill">${esc(mailStatusLabel(item.delivery_status))}</span>
      </header>
      <article class="mail-reader-card">
        <div class="mail-reader-subject"><span>Kurumsal ileti</span><h2>${esc(item.subject || "(Konu yok)")}</h2></div>
        <div class="mail-reader-sender">
          <span class="mail-reader-avatar">${esc(mailInitials(item.sender_address))}</span>
          <div><strong>${esc(item.sender_address)}</strong><button type="button" data-action="mail-details" data-id="${esc(item.id)}">Alıcı: ${esc(recipientLine)} ${icon("chevronDown")}</button></div>
          <time>${formatDate(mailTime(item), true)}</time>
        </div>
        <div class="mail-detail-strip" data-mail-details="${esc(item.id)}" hidden>
          <span><b>Kimden</b>${esc(item.sender_address)}</span>
          <span><b>Kime</b>${esc(recipientLine)}</span>
          ${(item.cc_addresses || []).length ? `<span><b>Bilgi</b>${esc(item.cc_addresses.join(", "))}</span>` : ""}
        </div>
        <iframe class="mail-body-frame" title="İleti içeriği" sandbox srcdoc="${esc(mailReaderHtml(item))}"></iframe>
        ${(item.attachments || []).length ? `<div class="mail-reader-attachments"><h3>${icon("paperclip")} ${item.attachments.length} dosya</h3><div>${item.attachments.map(mailAttachmentChip).join("")}</div></div>` : ""}
        <div class="mail-reader-footer">
          ${!sender ? `<button class="mail-reply-button" type="button" data-action="mail-reply" data-id="${esc(item.id)}">${icon("reply")} Yanıtla</button>` : ""}
          <button type="button" data-action="mail-forward" data-id="${esc(item.id)}">${icon("send")} Yönlendir</button>
        </div>
      </article>
    </section>
  `;
}

function mailComposerState() {
  return mailUiState().composer;
}

function mailComposerMarkup() {
  const composer = mailComposerState();
  if (!composer?.open) return "";
  const data = state.cache.mailbox || {};
  const identities = data.identities || [];
  return `
    <section class="mail-composer ${composer.minimized ? "minimized" : ""}" data-mail-composer>
      <header>
        <div><span>Yeni ileti</span><small data-mail-save-state>${composer.draftId ? "Taslak kayıtlı" : "Hazırlanıyor"}</small></div>
        <div><button type="button" data-action="mail-compose-minimize" aria-label="Küçült">_</button><button type="button" data-action="mail-compose-close" aria-label="Kapat">${icon("x")}</button></div>
      </header>
      <div class="mail-compose-fields">
        <label><span>Kimden</span><select data-mail-field="from">${identities.map((item) => `<option value="${esc(item.address)}" ${composer.from === item.address ? "selected" : ""}>${esc(item.label)} &lt;${esc(item.address)}&gt;</option>`).join("")}</select></label>
        <label><span>Kime</span><input data-mail-field="to" list="mail-directory" value="${esc(composer.to || "")}" placeholder="Bir veya birden fazla adres" /><button type="button" data-action="mail-toggle-copy">Bilgi / Gizli</button></label>
        <div class="mail-copy-fields ${composer.showCopy ? "open" : ""}"><label><span>Bilgi</span><input data-mail-field="cc" value="${esc(composer.cc || "")}" /></label><label><span>Gizli</span><input data-mail-field="bcc" value="${esc(composer.bcc || "")}" /></label></div>
        <input class="mail-compose-subject" data-mail-field="subject" value="${esc(composer.subject || "")}" placeholder="Konu" maxlength="${Number(data.settings?.maxSubjectChars || 160)}" />
        <datalist id="mail-directory">${(data.directory || []).map((item) => `<option value="${esc(item.portal_email)}">${esc(item.display_name)}</option>`).join("")}</datalist>
      </div>
      <div class="mail-editor-toolbar" role="toolbar" aria-label="Metin biçimlendirme">
        <button type="button" data-action="mail-format" data-command="bold" aria-label="Kalın">${icon("bold")}</button>
        <button type="button" data-action="mail-format" data-command="italic" aria-label="İtalik">${icon("italic")}</button>
        <button type="button" data-action="mail-format" data-command="underline" aria-label="Altı çizili">${icon("underline")}</button>
        <span></span>
        <button type="button" data-action="mail-format" data-command="insertUnorderedList" aria-label="Madde işaretleri">${icon("list")}</button>
        <button type="button" data-action="mail-format" data-command="indent" aria-label="Girinti">${icon("indent")}</button>
        <button type="button" data-action="mail-format" data-command="outdent" aria-label="Girintiyi azalt">${icon("back")}</button>
        <select data-mail-format-select aria-label="Metin stili"><option value="p">Normal</option><option value="h2">Başlık</option><option value="blockquote">Alıntı</option><option value="pre">Kod</option></select>
        <input type="color" data-mail-color value="#182033" aria-label="Metin rengi" />
      </div>
      <div class="mail-editor" contenteditable="true" data-mail-editor data-placeholder="Mesajınızı yazın...">${composer.html || ""}</div>
      <div class="mail-compose-attachments">
        ${(composer.attachments || []).map((item) => `<span>${icon("paperclip")}<b>${esc(item.file_name)}</b><button type="button" data-action="mail-remove-compose-attachment" data-id="${esc(item.id)}" aria-label="Eki kaldır">${icon("x")}</button></span>`).join("")}
      </div>
      <div class="mail-schedule-row ${composer.scheduleOpen ? "open" : ""}"><label>Gönderim zamanı<input type="datetime-local" data-mail-field="scheduledAt" value="${esc(composer.scheduledAt || "")}" /></label><small>En fazla 30 gün sonrası için zamanlanabilir.</small></div>
      <footer>
        <div class="mail-send-cluster"><button class="mail-send-button" type="button" data-action="mail-send">${icon("send")} Gönder</button><button class="mail-send-menu" type="button" data-action="mail-toggle-schedule" aria-label="Zamanla">${icon("clock")}</button></div>
        <div><input type="file" data-mail-attachments multiple hidden /><button type="button" data-action="mail-choose-attachments" aria-label="Dosya ekle">${icon("paperclip")}</button><button type="button" data-action="mail-save-draft" aria-label="Taslağı kaydet">${icon("archive")}</button><button type="button" data-action="mail-discard-draft" aria-label="Taslağı sil">${icon("trash")}</button></div>
      </footer>
    </section>
  `;
}

function mailTopbar({ search = true } = {}) {
  return `
    <header class="mail-product-topbar">
      <button class="mail-wordmark" type="button" data-page="mail" aria-label="Gelen kutusuna dön"><span>İHP</span><strong>Mail</strong></button>
      ${search
        ? `<label class="mail-search">${icon("search")}<input data-mail-search value="${esc(mailUiState().search)}" placeholder="Postada ara" /><kbd>/</kbd></label>`
        : `<div class="mail-settings-title"><span>Hesap</span><strong>Mail Ayarları</strong></div>`}
      <div>
        ${search ? `<button type="button" data-action="mail-refresh" aria-label="Yenile" title="Yenile">${icon("refresh")}</button>` : ""}
        <button type="button" data-action="mail-theme-toggle" aria-label="Temayı değiştir" title="Temayı değiştir">${icon("sparkles")}</button>
        <button type="button" data-page="settings" aria-label="Ayarlar" title="Ayarlar">${icon("settings")}</button>
        ${avatar(state.profile)}
      </div>
    </header>
  `;
}

function mailPage() {
  const selected = mailSelected();
  if (!mailUiState().selectedId && selected) mailUiState().selectedId = selected.id;
  return `
    <div class="mail-product-shell">
      ${mailTopbar()}
      <main class="mail-product-main">
        ${mailSidebar()}
        ${mailListPane()}
        ${mailReader(selected)}
      </main>
      ${mailComposerMarkup()}
    </div>
  `;
}

function emptyMailComposer(overrides = {}) {
  const data = state.cache.mailbox || {};
  return {
    open: true,
    minimized: false,
    draftId: "",
    from: data.mailbox?.address || state.profile?.portal_email || "",
    to: "",
    cc: "",
    bcc: "",
    subject: "",
    html: "",
    attachments: [],
    showCopy: false,
    scheduleOpen: false,
    scheduledAt: "",
    replyToMessageId: "",
    ...overrides
  };
}

function openMailComposer(overrides = {}) {
  mailUiState().composer = emptyMailComposer(overrides);
  render();
  setTimeout(() => document.querySelector('[data-mail-field="to"]')?.focus(), 30);
}

function syncMailComposerFromDom() {
  const composer = mailComposerState();
  const root = document.querySelector("[data-mail-composer]");
  if (!composer || !root) return root;
  root.querySelectorAll("[data-mail-field]").forEach((field) => {
    composer[field.dataset.mailField] = field.value;
  });
  composer.html = root.querySelector("[data-mail-editor]")?.innerHTML || composer.html || "";
  return root;
}

function composerPayload() {
  const composer = mailComposerState();
  if (!composer) return {};
  const root = syncMailComposerFromDom();
  const text = (root?.querySelector("[data-mail-editor]")?.innerText || "").trim();
  return {
    from: composer.from,
    to: composer.to,
    cc: composer.cc,
    bcc: composer.bcc,
    subject: composer.subject,
    html: composer.html,
    body: text,
    scheduledAt: composer.scheduleOpen ? composer.scheduledAt : "",
    replyToMessageId: composer.replyToMessageId || ""
  };
}

async function saveMailDraft({ quiet = false } = {}) {
  const composer = mailComposerState();
  if (!composer) return null;
  const saveState = document.querySelector("[data-mail-save-state]");
  if (saveState) saveState.textContent = "Kaydediliyor";
  try {
    const result = await serverRequest("/api/mailbox", {
      method: "POST",
      body: JSON.stringify({ action: "save_draft", id: composer.draftId, ...composerPayload() })
    });
    composer.draftId = result.draft.id;
    if (saveState) saveState.textContent = "Taslak kayıtlı";
    if (!quiet) showToast("Taslak kaydedildi.", "success");
    return result.draft;
  } catch (error) {
    if (saveState) saveState.textContent = "Kaydedilemedi";
    if (!quiet) showToast(error.message, "error");
    throw error;
  }
}

function scheduleDraftSave() {
  clearTimeout(mailDraftTimer);
  mailDraftTimer = setTimeout(() => saveMailDraft({ quiet: true }).catch(() => undefined), 900);
}

async function uploadMailAttachments(files) {
  const composer = mailComposerState();
  if (!composer || !files.length) return;
  if (!composer.draftId) await saveMailDraft({ quiet: true });
  const settings = state.cache.mailbox?.settings || {};
  const maximum = Number(settings.maxAttachments || 10);
  const remaining = Math.max(0, maximum - (composer.attachments || []).length);
  const selected = [...files].slice(0, remaining);
  if (!selected.length) return showToast("Bu iletiye daha fazla dosya eklenemez.", "error");

  for (const file of selected) {
    const safeName = file.name.replace(/[^\p{L}\p{N}._ -]/gu, "-").slice(-160);
    const path = `${state.profile.id}/${composer.draftId}/${crypto.randomUUID()}-${safeName}`;
    try {
      await uploadStorageObject("mail-attachments", path, file);
      const result = await serverRequest("/api/mailbox", {
        method: "POST",
        body: JSON.stringify({
          action: "register_attachment",
          messageId: composer.draftId,
          storagePath: path,
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          byteSize: file.size
        })
      });
      composer.attachments.push(result.attachment);
    } catch (error) {
      await removeStorageObject("mail-attachments", path).catch(() => undefined);
      showToast(`${file.name}: ${error.message}`, "error");
    }
  }
  render();
}

function mailBaseBadgeCountForNavFactory(base) {
  return function mailBadgeCountForNav(id) {
    if (id === "mail") {
      const count = Number(state.cache.mailbox?.unreadCount || 0);
      return count ? String(count) : "";
    }
    return base(id);
  };
}

badgeCountForNav = mailBaseBadgeCountForNavFactory(badgeCountForNav);

const mailBaseNotificationCategoryLabel = notificationCategoryLabel;
notificationCategoryLabel = function mailNotificationCategoryLabel(category = "system") {
  return category === "mail" ? "Mail" : mailBaseNotificationCategoryLabel(category);
};

const mailBaseRenderPortalPage = renderPortalPage;
renderPortalPage = function mailRenderPortalPage(page) {
  if (page === "mail") return mailPage();
  return mailBaseRenderPortalPage(page);
};

const mailBaseLoadPage = loadPage;
loadPage = async function mailLoadPage(page) {
  if (page !== "mail") return mailBaseLoadPage(page);
  state.loading = true;
  state.pageError = null;
  render();
  try {
    await Promise.all([loadNavigationSummary(), refreshPortalMailbox(true)]);
  } catch (error) {
    state.pageError = { page, message: error.message };
    showToast(error.message, "error");
  } finally {
    state.loading = false;
    render();
  }
};

const mailBaseHandleClick = handleClick;
handleClick = async function mailHandleClick(event) {
  const target = event.target.closest("[data-action]");
  const action = target?.dataset.action;
  if (!action?.startsWith("mail-")) return mailBaseHandleClick(event);
  event.preventDefault();
  const ui = mailUiState();
  const item = mailMessages().find((message) => message.id === target.dataset.id);
  if (ui.composer && action !== "mail-compose") syncMailComposerFromDom();

  if (action === "mail-compose") return openMailComposer();
  if (action === "mail-folder") {
    ui.folder = target.dataset.folder || "inbox";
    ui.selectedId = "";
    ui.mobileReader = false;
    render();
    return;
  }
  if (action === "mail-open") {
    ui.selectedId = target.dataset.id || "";
    ui.mobileReader = true;
    if (item && mailIsRecipient(item) && !item.read_at) {
      item.read_at = new Date().toISOString();
      state.cache.mailbox.unreadCount = Math.max(0, Number(state.cache.mailbox.unreadCount || 0) - 1);
      serverRequest("/api/mailbox", { method: "POST", body: JSON.stringify({ action: "mutate", command: "read", id: item.id }) }).catch(() => undefined);
    }
    render();
    return;
  }
  if (action === "mail-mobile-back") {
    ui.mobileReader = false;
    render();
    return;
  }
  if (action === "mail-refresh") {
    target.disabled = true;
    target.classList.add("is-loading");
    target.setAttribute("aria-busy", "true");
    showToast("Posta kutusu yenileniyor.");
    refreshPortalMailbox(true)
      .then(() => {
        render();
        showToast("Posta kutusu yenilendi.", "success");
      })
      .catch((error) => showToast(error.message, "error"))
      .finally(() => {
        target.disabled = false;
        target.classList.remove("is-loading");
        target.removeAttribute("aria-busy");
      });
    return;
  }
  if (action === "mail-star") {
    const current = mailIsSender(item) ? item.sender_starred : item.recipient_starred;
    if (mailIsSender(item)) item.sender_starred = !current; else item.recipient_starred = !current;
    render();
    serverRequest("/api/mailbox", { method: "POST", body: JSON.stringify({ action: "mutate", command: "star", value: !current, id: item.id }) })
      .catch((error) => {
        if (mailIsSender(item)) item.sender_starred = current; else item.recipient_starred = current;
        render();
        showToast(error.message, "error");
      });
    return;
  }
  if (action === "mail-mutate") {
    const command = target.dataset.command;
    const sender = mailIsSender(item);
    const folderKey = sender ? "sender_folder" : "recipient_folder";
    const previousFolder = item[folderKey];
    item[folderKey] = command === "restore"
      ? (sender ? (item.delivery_status === "draft" ? "draft" : item.delivery_status === "scheduled" ? "scheduled" : "sent") : "inbox")
      : command;
    ui.selectedId = "";
    render();
    serverRequest("/api/mailbox", { method: "POST", body: JSON.stringify({ action: "mutate", command, id: item.id }) })
      .then(() => refreshPortalMailbox(true))
      .catch((error) => {
        item[folderKey] = previousFolder;
        render();
        showToast(error.message, "error");
      });
    return;
  }
  if (action === "mail-delete-forever") {
    await serverRequest("/api/mailbox", { method: "POST", body: JSON.stringify({ action: "mutate", command: "delete_forever", id: item.id }) });
    await refreshPortalMailbox(true);
    ui.selectedId = "";
    render();
    showToast("İleti kalıcı olarak silindi.", "success");
    return;
  }
  if (action === "mail-cancel-scheduled") {
    await serverRequest("/api/mailbox", { method: "POST", body: JSON.stringify({ action: "cancel_scheduled", id: item.id }) });
    await refreshPortalMailbox(true);
    ui.selectedId = "";
    render();
    showToast("Zamanlanmış gönderim iptal edildi.", "success");
    return;
  }
  if (action === "mail-details") {
    const details = document.querySelector(`[data-mail-details="${target.dataset.id}"]`);
    if (details) details.hidden = !details.hidden;
    return;
  }
  if (action === "mail-reply" && item) {
    const subject = /^(ynt|re):/i.test(item.subject) ? item.subject : `Ynt: ${item.subject}`;
    return openMailComposer({ to: item.sender_address, subject, replyToMessageId: item.id });
  }
  if (action === "mail-forward" && item) {
    return openMailComposer({
      subject: /^(ilt|fwd):/i.test(item.subject) ? item.subject : `İlt: ${item.subject}`,
      html: `<br><br><blockquote><strong>Yönlendirilen ileti</strong><br>Kimden: ${esc(item.sender_address)}<br>Konu: ${esc(item.subject)}<br><br>${item.body_html || esc(item.body_text).replace(/\n/g, "<br>")}</blockquote>`
    });
  }
  if (action === "mail-download-attachment") {
    target.disabled = true;
    try {
      const result = await serverRequest("/api/mailbox", { method: "POST", body: JSON.stringify({ action: "attachment_url", id: target.dataset.id }) });
      const link = document.createElement("a");
      link.href = result.url;
      link.download = result.fileName || "dosya";
      link.rel = "noopener";
      link.click();
    } catch (error) { showToast(error.message, "error"); }
    finally { target.disabled = false; }
    return;
  }
  if (action === "mail-compose-minimize") {
    ui.composer.minimized = !ui.composer.minimized;
    render();
    return;
  }
  if (action === "mail-compose-close") {
    await saveMailDraft({ quiet: true }).catch(() => undefined);
    ui.composer = null;
    await refreshPortalMailbox(true).catch(() => undefined);
    render();
    return;
  }
  if (action === "mail-toggle-copy") {
    ui.composer.showCopy = !ui.composer.showCopy;
    render();
    return;
  }
  if (action === "mail-toggle-schedule") {
    ui.composer.scheduleOpen = !ui.composer.scheduleOpen;
    render();
    return;
  }
  if (action === "mail-format") {
    document.querySelector("[data-mail-editor]")?.focus();
    document.execCommand(target.dataset.command, false);
    scheduleDraftSave();
    return;
  }
  if (action === "mail-choose-attachments") {
    document.querySelector("[data-mail-attachments]")?.click();
    return;
  }
  if (action === "mail-remove-compose-attachment") {
    await serverRequest("/api/mailbox", { method: "POST", body: JSON.stringify({ action: "remove_attachment", id: target.dataset.id }) });
    ui.composer.attachments = ui.composer.attachments.filter((attachment) => attachment.id !== target.dataset.id);
    render();
    return;
  }
  if (action === "mail-save-draft") return saveMailDraft();
  if (action === "mail-discard-draft") {
    if (ui.composer.draftId) {
      await serverRequest("/api/mailbox", { method: "POST", body: JSON.stringify({ action: "mutate", command: "trash", id: ui.composer.draftId }) });
    }
    ui.composer = null;
    await refreshPortalMailbox(true).catch(() => undefined);
    render();
    return;
  }
  if (action === "mail-send") {
    target.disabled = true;
    try {
      const result = await serverRequest("/api/mailbox", {
        method: "POST",
        body: JSON.stringify({ action: "send", draftId: ui.composer.draftId, ...composerPayload() })
      });
      ui.composer = null;
      ui.folder = result.message.delivery_status === "scheduled" ? "scheduled" : "sent";
      ui.selectedId = result.message.id;
      await refreshPortalMailbox(true);
      render();
      showToast(result.message.delivery_status === "scheduled" ? "İleti zamanlandı." : "İleti gönderildi.", "success");
    } catch (error) {
      showToast(error.message, "error");
      target.disabled = false;
    }
    return;
  }
};

const mailBaseHandleFilter = handleFilter;
handleFilter = async function mailHandleFilter(event) {
  if (event.target.matches("[data-mail-search]")) {
    mailUiState().search = event.target.value;
    const list = document.querySelector(".mail-list-pane");
    if (list) list.outerHTML = mailListPane();
    return;
  }
  if (event.target.matches("[data-mail-attachments]")) {
    await uploadMailAttachments(event.target.files || []);
    return;
  }
  if (event.target.matches("[data-mail-format-select]")) {
    document.querySelector("[data-mail-editor]")?.focus();
    document.execCommand("formatBlock", false, event.target.value);
    scheduleDraftSave();
    return;
  }
  if (event.target.matches("[data-mail-color]")) {
    document.querySelector("[data-mail-editor]")?.focus();
    document.execCommand("foreColor", false, event.target.value);
    scheduleDraftSave();
    return;
  }
  if (event.target.matches("[data-mail-field], [data-mail-editor]")) {
    syncMailComposerFromDom();
    scheduleDraftSave();
    return;
  }
  return mailBaseHandleFilter(event);
};
