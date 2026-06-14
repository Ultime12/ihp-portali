const IHP_AGREEMENTS_FEATURE_PATCH_V1 = true;

STATUS_LABELS.signed = "İmzalandı";
STATUS_LABELS.cancelled = STATUS_LABELS.cancelled || "İptal";

function agreementsIsEntryAccount() {
  return typeof isEntryAccessAccount === "function" && isEntryAccessAccount();
}

function agreementsCanOpen() {
  return !agreementsIsEntryAccount();
}

permissions.agreements = agreementsCanOpen;

if (!navItems.some(([id]) => id === "agreements")) {
  const insertIndex = navItems.findIndex(([id]) => id === "applications");
  navItems.splice(insertIndex === -1 ? navItems.length : insertIndex, 0, [
    "agreements",
    "Antlaşmalar",
    "book",
    permissions.agreements
  ]);
}

function agreementsEnsureStyles() {
  if (document.getElementById("ihp-agreements-feature-styles")) return;
  const style = document.createElement("style");
  style.id = "ihp-agreements-feature-styles";
  style.textContent = `
    .agreement-hero { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(280px, .8fr); gap: .85rem; align-items: stretch; margin-bottom: .85rem; }
    .agreement-focus { padding: 1.1rem; border-radius: 1.4rem; border: 1px solid rgba(255,255,255,.13); background: linear-gradient(135deg, rgba(87,143,255,.18), rgba(255,255,255,.06)); }
    .agreement-focus strong { display: block; font-size: 1.15rem; margin-bottom: .35rem; }
    .agreement-focus p { margin: 0; color: var(--muted); line-height: 1.6; }
    .agreement-card { position: relative; overflow: hidden; }
    .agreement-card::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 4px; background: linear-gradient(90deg, #6da5ff, #d71920); opacity: .9; }
    .agreement-card .entity-top { padding-top: .25rem; }
    .agreement-document { display: grid; gap: .55rem; margin-top: .8rem; padding: .85rem; border-radius: 1rem; background: rgba(255,255,255,.055); border: 1px solid rgba(255,255,255,.11); }
    .agreement-document p { margin: 0; color: var(--text); line-height: 1.55; white-space: pre-wrap; }
    .agreement-file-link { display: inline-flex; align-items: center; gap: .35rem; width: fit-content; color: var(--accent); font-weight: 800; text-decoration: none; }
    .agreement-file-link:hover { text-decoration: underline; }
    .agreement-sign-strip { display: flex; gap: .55rem; flex-wrap: wrap; margin-top: .85rem; }
    .agreement-target-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .65rem; }
    .agreement-target-tile { padding: .85rem; border-radius: 1rem; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.055); }
    .agreement-target-tile strong { display: block; margin-bottom: .2rem; }
    .agreement-target-tile span { color: var(--muted); font-size: .85rem; line-height: 1.35; }
    .agreement-member-target[hidden] { display: none !important; }
    .agreement-detail-body { max-height: 42vh; overflow: auto; padding: .85rem; border-radius: 1rem; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.055); white-space: pre-wrap; line-height: 1.65; }
    @media (max-width: 980px) {
      .agreement-hero { grid-template-columns: 1fr; }
      .agreement-target-grid { grid-template-columns: 1fr; }
    }
  `;
  document.head.append(style);
}

function agreementStatusBadge(status = "pending") {
  const tones = {
    pending: "gold",
    signed: "green",
    rejected: "coral",
    cancelled: "violet"
  };
  return badge(statusLabel(status), tones[status] || "blue");
}

function agreementTargetTypeLabel(type = "member") {
  return (
    {
      member: "Üye",
      discipline: "Disiplin Kurulu",
      youth: "Gençlik Kolları"
    }[type] || type
  );
}

function agreementTargetLabel(item) {
  if (item?.target_type === "member") return item.target?.display_name || "Üye seçimi";
  return item?.target_committee?.name || agreementTargetTypeLabel(item?.target_type);
}

function agreementSignerLabel(item) {
  if (item?.status === "signed") return item.signer?.display_name || "İmzalandı";
  if (item?.status === "rejected") return item.rejecter?.display_name || "Reddedildi";
  if (item?.status === "cancelled") return "İptal edildi";
  return "İmza bekliyor";
}

function agreementCommitteeByName(name) {
  return (state.cache.committees || []).find((committee) => committee.name === name)?.id || null;
}

function agreementCanSign(item) {
  if (!item || item.status !== "pending") return false;
  if (hasRole("super_admin")) return true;
  if (item.target_type === "member") return item.target_profile_id === state.profile?.id;
  if (item.target_type === "discipline") return hasRole("discipline_chair");
  if (item.target_type === "youth") return hasRole("youth_chair");
  return false;
}

function agreementCanCancel(item) {
  return Boolean(item && item.status === "pending" && (item.proposer_id === state.profile?.id || hasRole("super_admin")));
}

function agreementCanDelete(item) {
  return Boolean(item && hasRole("super_admin"));
}

function agreementNeedsMySignature(item) {
  return agreementCanSign(item);
}

function agreementPendingSignatureCount(rows = state.cache.agreementBadge || state.cache.agreements || []) {
  return rows.filter(agreementNeedsMySignature).length;
}

function agreementVisibleMembers() {
  return visibleMembers().filter((member) => member.id !== state.profile?.id);
}

function agreementFileMime(dataUrl = "") {
  const match = String(dataUrl || "").match(/^data:([^;]+);/);
  return match?.[1] || "";
}

function agreementFileAllowed(name = "", dataUrl = "") {
  if (!dataUrl) return true;
  const lowerName = String(name || "").toLocaleLowerCase("tr");
  const mime = agreementFileMime(dataUrl);
  return (
    lowerName.endsWith(".pdf") ||
    lowerName.endsWith(".doc") ||
    lowerName.endsWith(".docx") ||
    [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ].includes(mime)
  );
}

async function agreementsRestRequest(path, options = {}) {
  const cfg = getConfig();
  const token = getSession()?.access_token || "";
  const response = await fetch(`${cfg.supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: cfg.supabaseAnonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message || body?.hint || "Antlaşma işlemi tamamlanamadı.");
  return body;
}

function agreementsSelectQuery() {
  return [
    "select=*",
    "proposer:profiles!agreements_proposer_id_fkey(id,display_name,email,member_code,avatar_initials,avatar_color,avatar_url,is_system_account)",
    "target:profiles!agreements_target_profile_id_fkey(id,display_name,email,member_code,avatar_initials,avatar_color,avatar_url,is_system_account)",
    "target_committee:committees!agreements_target_committee_id_fkey(id,name)",
    "signer:profiles!agreements_signed_by_fkey(display_name)",
    "rejecter:profiles!agreements_rejected_by_fkey(display_name)"
  ].join(",");
}

async function loadAgreementsLocal() {
  return agreementsRestRequest(`agreements?${agreementsSelectQuery()}&order=created_at.desc`);
}

function agreementCard(item, emphasis = false) {
  const fileLink = item.file_data
    ? `<a class="agreement-file-link" href="${esc(item.file_data)}" download="${esc(item.file_name || "ihp-antlasma-dosyasi")}">${icon("download")} ${esc(item.file_name || "Dosyayı aç")}</a>`
    : `<span class="cell-sub">Dosya eklenmedi</span>`;
  const bodyPreview = item.body
    ? esc(item.body.length > 280 ? `${item.body.slice(0, 280)}...` : item.body)
    : "Metin yerine dosya eklendi.";
  return `
    <article class="entity-card glass application-card agreement-card ${emphasis ? "agreement-card-focus" : ""}">
      <div class="entity-top">
        ${badge(agreementTargetLabel(item), item.target_type === "member" ? "blue" : "violet")}
        ${agreementStatusBadge(item.status)}
      </div>
      <h3 style="margin-top:.85rem">${esc(item.title)}</h3>
      <div class="agreement-document">
        <p>${bodyPreview}</p>
        ${fileLink}
      </div>
      <div class="meta-list">
        <div class="meta-row"><span>Sunan</span><strong>${esc(item.proposer?.display_name || "Üye")}</strong></div>
        <div class="meta-row"><span>Hedef</span><strong>${esc(agreementTargetLabel(item))}</strong></div>
        <div class="meta-row"><span>Durum</span><strong>${esc(agreementSignerLabel(item))}</strong></div>
        <div class="meta-row"><span>Tarih</span><strong>${formatDate(item.created_at, true)}</strong></div>
        <div class="meta-row"><span>Karar notu</span><strong>${esc(item.decision_note || "Henüz not yok")}</strong></div>
      </div>
      ${agreementActions(item)}
    </article>
  `;
}

function agreementActions(item) {
  const buttons = [
    `<button class="table-action" type="button" data-action="view-agreement" data-id="${esc(item.id)}">Detay</button>`
  ];
  if (agreementCanSign(item)) {
    buttons.push(`<button class="table-action" type="button" data-action="open-agreement-decision" data-status="signed" data-id="${esc(item.id)}">İmzala</button>`);
    buttons.push(`<button class="table-action danger-action" type="button" data-action="open-agreement-decision" data-status="rejected" data-id="${esc(item.id)}">Reddet</button>`);
  }
  if (agreementCanCancel(item)) {
    buttons.push(`<button class="table-action danger-action" type="button" data-action="cancel-agreement" data-id="${esc(item.id)}">İptal et</button>`);
  }
  if (agreementCanDelete(item)) {
    buttons.push(`<button class="table-action danger-action" type="button" data-action="delete-agreement" data-id="${esc(item.id)}">Sil</button>`);
  }
  return `<div class="inline-actions">${buttons.join("")}</div>`;
}

function agreementsPage() {
  agreementsEnsureStyles();
  const rows = state.cache.agreements || [];
  const pendingMine = rows.filter(agreementNeedsMySignature);
  const sent = rows.filter((item) => item.proposer_id === state.profile?.id);
  const signed = rows.filter((item) => item.status === "signed");
  const q = (state.filters.agreementSearch || "").toLocaleLowerCase("tr");
  const filtered = rows.filter((item) => {
    const haystack = [
      item.title,
      item.body,
      item.proposer?.display_name,
      item.target?.display_name,
      item.target_committee?.name,
      item.file_name
    ].join(" ").toLocaleLowerCase("tr");
    return !q || haystack.includes(q);
  });

  return `
    ${pageHeader(
      "Antlaşmalar",
      "Metin veya dosya ile resmi onay akışı",
      "Bir üyeye, Disiplin Kurulu'na veya Gençlik Kolları'na antlaşma sunabilirsiniz. Yetkili taraf imzalarsa kayıt imzalandı olarak kapanır.",
      `<button class="btn btn-primary btn-sm" type="button" data-action="open-agreement">${icon("plus")} Antlaşma Sun</button>`
    )}
    <section class="metrics-grid">
      ${metric("Toplam", rows.length, "Görülebilen antlaşma", "book")}
      ${metric("İmzamı bekleyen", pendingMine.length, "Hemen işlem gereken", "inbox")}
      ${metric("Gönderdiklerim", sent.length, "Sunduğun kayıtlar", "arrow")}
      ${metric("İmzalanan", signed.length, "Tamamlanan antlaşma", "check")}
    </section>
    <div class="agreement-hero">
      <section class="agreement-focus">
        <strong>Antlaşma mantığı</strong>
        <p>Bireysel antlaşmalarda hedef üye imzalar. Disiplin Kurulu adına yalnızca DK Başkanı, Gençlik Kolları adına yalnızca Gençlik Kolları Başkanı karar verir.</p>
        <div class="agreement-target-grid" style="margin-top:.85rem">
          <div class="agreement-target-tile"><strong>Üye</strong><span>Doğrudan bir kişiye sunulur.</span></div>
          <div class="agreement-target-tile"><strong>Disiplin Kurulu</strong><span>DK Başkanı imzalar veya reddeder.</span></div>
          <div class="agreement-target-tile"><strong>Gençlik Kolları</strong><span>Gençlik Kolları Başkanı imzalar veya reddeder.</span></div>
        </div>
      </section>
      <section class="panel glass">
        <div class="panel-head"><h3>Arama</h3><span>Başlık, kişi, kurul veya dosya</span></div>
        <label class="search-field">
          ${icon("search")}
          <input class="field" type="search" placeholder="Antlaşma ara..." data-filter="agreementSearch" value="${esc(state.filters.agreementSearch || "")}" />
        </label>
        <div class="agreement-sign-strip">
          ${badge(`${pendingMine.length} bekleyen imza`, pendingMine.length ? "gold" : "green")}
          ${badge(`${rows.filter((item) => item.status === "rejected").length} red`, "coral")}
          ${badge(`${rows.filter((item) => item.file_data).length} dosyalı`, "blue")}
        </div>
      </section>
    </div>
    ${
      pendingMine.length
        ? `<section class="panel glass" style="margin-bottom:.85rem"><div class="panel-head"><h3>İmzamı bekleyenler</h3><span>Öncelikli işlem</span></div><div class="card-grid application-grid">${pendingMine.map((item) => agreementCard(item, true)).join("")}</div></section>`
        : ""
    }
    <section class="panel glass">
      <div class="panel-head"><h3>Tüm antlaşmalar</h3><span>Yetkinize açık kayıtlar</span></div>
      <div class="card-grid application-grid">
        ${
          filtered.length
            ? filtered.map((item) => agreementCard(item)).join("")
            : emptyCard("Antlaşma yok", "Yeni antlaşma sunduğunuzda veya size sunulduğunda burada görünecek.")
        }
      </div>
    </section>
  `;
}

function openAgreement() {
  agreementsEnsureStyles();
  const members = agreementVisibleMembers();
  modal({
    title: "Antlaşma sun",
    subtitle: "Metin yazın veya PDF/Word dosyası ekleyin.",
    body: `
      <form class="form-stack" data-form="agreement">
        <div class="form-group">
          <label for="agreement-title">Başlık</label>
          <input class="field" id="agreement-title" name="title" required minlength="3" maxlength="160" placeholder="Örn. Görev paylaşımı antlaşması" />
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label for="agreement-target-type">Kime sunulacak?</label>
            <select class="field" id="agreement-target-type" name="targetType" data-agreement-target-type>
              <option value="member">Bir üyeye</option>
              <option value="discipline">Disiplin Kurulu'na</option>
              <option value="youth">Gençlik Kolları'na</option>
            </select>
          </div>
          <div class="form-group agreement-member-target" data-agreement-member-group>
            <label for="agreement-target-member">Hedef üye</label>
            <select class="field" id="agreement-target-member" name="targetProfileId" data-agreement-member-select>
              <option value="">Üye seçin</option>
              ${members.map((member) => `<option value="${esc(member.id)}">${esc(member.display_name)} · ${esc(member.member_code ? `#${member.member_code}` : member.email || "")}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label for="agreement-body">Antlaşma metni</label>
          <textarea class="field" id="agreement-body" name="body" maxlength="12000" placeholder="Antlaşma maddelerini buraya yazabilirsiniz. Dosya ekleyecekseniz boş bırakabilirsiniz." style="min-height:220px;line-height:1.6"></textarea>
        </div>
        <div class="form-group">
          <label for="agreement-file">PDF veya Word dosyası</label>
          <input class="field" id="agreement-file" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" data-evidence-upload data-evidence-target="agreement-file-data" data-evidence-name-target="agreement-file-name" />
          <input id="agreement-file-data" name="fileData" type="hidden" />
          <input id="agreement-file-name" name="fileName" type="hidden" />
          <p class="security-note">Metin veya dosyadan en az biri zorunludur. Dosya 4 MB altında olmalıdır.</p>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button>
          <button class="btn btn-primary btn-sm" type="submit">${icon("check")} Antlaşmayı sun</button>
        </div>
      </form>
    `
  });
  syncAgreementTarget(document.getElementById("agreement-target-type"));
}

