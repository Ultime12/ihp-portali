const IHP_AGREEMENTS_FEATURE_PATCH_V2 = true;

Object.assign(STATUS_LABELS, {
  signed: "İmzalandı",
  pending_executive: "Yürütme Kurulu onayında",
  active: "Yürürlükte",
  expired: "Süresi doldu",
  terminated: "Sona erdi"
});

function agreementsIsEntryAccount() {
  return typeof isEntryAccessAccount === "function" && isEntryAccessAccount();
}

permissions.agreements = () => !agreementsIsEntryAccount();

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
    .agreement-hero { display:grid; grid-template-columns:minmax(0,1.2fr) minmax(280px,.8fr); gap:.85rem; margin-bottom:.85rem; }
    .agreement-focus { padding:1.1rem; border-radius:1.4rem; border:1px solid rgba(255,255,255,.13); background:linear-gradient(135deg,rgba(87,143,255,.18),rgba(255,255,255,.06)); }
    .agreement-focus p { color:var(--muted); line-height:1.6; }
    .agreement-card { position:relative; overflow:hidden; }
    .agreement-card::before { content:""; position:absolute; inset:0 0 auto; height:4px; background:linear-gradient(90deg,#6da5ff,#d71920); }
    .agreement-document { display:grid; gap:.55rem; margin-top:.8rem; padding:.85rem; border-radius:1rem; background:rgba(255,255,255,.055); border:1px solid rgba(255,255,255,.11); }
    .agreement-document p,.agreement-detail-body { white-space:pre-wrap; line-height:1.65; }
    .agreement-file-link { display:inline-flex; gap:.35rem; width:fit-content; color:var(--accent); font-weight:800; text-decoration:none; }
    .agreement-target-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:.65rem; margin-top:.85rem; }
    .agreement-target-tile { padding:.85rem; border-radius:1rem; border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.055); }
    .agreement-target-tile strong { display:block; margin-bottom:.2rem; }
    .agreement-target-tile span { color:var(--muted); font-size:.85rem; }
    [data-agreement-member-group][hidden] { display:none !important; }
    .agreement-detail-body { max-height:42vh; overflow:auto; padding:.85rem; border-radius:1rem; border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.055); }
    @media (max-width:980px) { .agreement-hero{grid-template-columns:1fr}.agreement-target-grid{grid-template-columns:1fr 1fr} }
    @media (max-width:560px) { .agreement-target-grid{grid-template-columns:1fr} }
  `;
  document.head.append(style);
}

function agreementStatusBadge(status = "pending") {
  const tones = {
    pending: "gold",
    pending_executive: "violet",
    signed: "green",
    active: "green",
    rejected: "coral",
    cancelled: "violet",
    expired: "blue",
    terminated: "coral"
  };
  return badge(statusLabel(status), tones[status] || "blue");
}

function agreementTargetTypeLabel(type = "member") {
  return {
    member: "Üye",
    discipline: "Disiplin Kurulu",
    youth: "Gençlik Kolları",
    party: "İHP tüzel yapısı"
  }[type] || type;
}

function agreementTargetLabel(item) {
  if (item?.target_type === "member") return item.target?.display_name || "Üye";
  return item?.target_committee?.name || agreementTargetTypeLabel(item?.target_type);
}

function agreementSignerLabel(item) {
  if (item?.status === "pending") return "İmza bekliyor";
  if (item?.status === "pending_executive") return "İmzalandı, Yürütme Kurulu onayında";
  if (["active", "signed"].includes(item?.status)) return item.signer?.display_name || "Yürürlükte";
  if (item?.status === "rejected") return item.rejecter?.display_name || "Reddedildi";
  return statusLabel(item?.status);
}

function agreementHasActiveDelegation(profileId = state.profile?.id) {
  const now = Date.now();
  return (state.cache.agreementDelegations || []).some((delegation) =>
    delegation.delegate_profile_id === profileId &&
    !delegation.revoked_at &&
    new Date(delegation.starts_at).valueOf() <= now &&
    (!delegation.ends_at || new Date(delegation.ends_at).valueOf() > now)
  );
}

function agreementCanSign(item) {
  if (!item || item.status !== "pending") return false;
  if (item.target_type === "member") return item.target_profile_id === state.profile?.id;
  if (item.target_type === "discipline") return hasRole("discipline_chair");
  if (item.target_type === "youth") return hasRole("youth_chair");
  if (item.target_type === "party") return hasRole("president") || agreementHasActiveDelegation();
  return false;
}

function agreementCanCancel(item) {
  return Boolean(item && item.status === "pending" && item.proposer_id === state.profile?.id);
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
  return String(dataUrl || "").match(/^data:([^;]+);/)?.[1] || "";
}

function agreementFileAllowed(name = "", dataUrl = "") {
  if (!dataUrl) return true;
  const lowerName = String(name || "").toLocaleLowerCase("tr");
  const mime = agreementFileMime(dataUrl);
  return lowerName.endsWith(".pdf") || lowerName.endsWith(".doc") || lowerName.endsWith(".docx") || [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ].includes(mime);
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
  if (!response.ok) throw new Error(body?.message || body?.hint || "Antlaşma verileri alınamadı.");
  return body;
}

function agreementsSelectQuery() {
  return [
    "select=*",
    "proposer:profiles!agreements_proposer_id_fkey(id,display_name,email,member_code)",
    "target:profiles!agreements_target_profile_id_fkey(id,display_name,email,member_code)",
    "target_committee:committees!agreements_target_committee_id_fkey(id,name)",
    "signer:profiles!agreements_signed_by_fkey(display_name)",
    "rejecter:profiles!agreements_rejected_by_fkey(display_name)"
  ].join(",");
}

async function loadAgreementsLocal() {
  return agreementsRestRequest(`agreements?${agreementsSelectQuery()}&order=created_at.desc`);
}

async function loadAgreementDelegationsLocal() {
  return agreementsRestRequest(
    "agreement_delegations?select=*,delegate:profiles!agreement_delegations_delegate_profile_id_fkey(id,display_name,role,roles)&order=created_at.desc"
  ).catch(() => []);
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
    buttons.push(`<button class="table-action danger-action" type="button" data-action="cancel-agreement" data-id="${esc(item.id)}">Geri çek</button>`);
  }
  return `<div class="inline-actions">${buttons.join("")}</div>`;
}

function agreementCard(item, emphasis = false) {
  const preview = item.body
    ? esc(item.body.length > 280 ? `${item.body.slice(0, 280)}...` : item.body)
    : "Metin yerine dosya eklendi.";
  return `
    <article class="entity-card glass application-card agreement-card ${emphasis ? "agreement-card-focus" : ""}">
      <div class="entity-top">${badge(agreementTargetLabel(item), item.target_type === "party" ? "gold" : "violet")}${agreementStatusBadge(item.status)}</div>
      <h3 style="margin-top:.85rem">${esc(item.title)}</h3>
      <div class="agreement-document">
        <p>${preview}</p>
        ${item.file_data ? `<a class="agreement-file-link" href="${esc(item.file_data)}" download="${esc(item.file_name || "ihp-antlasma")}">${icon("download")} ${esc(item.file_name || "Dosyayı aç")}</a>` : ""}
      </div>
      <div class="meta-list">
        <div class="meta-row"><span>Sunan</span><strong>${esc(item.proposer?.display_name || "Üye")}</strong></div>
        <div class="meta-row"><span>Hedef</span><strong>${esc(agreementTargetLabel(item))}</strong></div>
        <div class="meta-row"><span>Amaç</span><strong>${esc(item.purpose || "Eski kayıtta belirtilmedi")}</strong></div>
        <div class="meta-row"><span>Yürürlük</span><strong>${formatDate(item.effective_at, true)}${item.expires_at ? ` - ${formatDate(item.expires_at, true)}` : ""}</strong></div>
        <div class="meta-row"><span>Onay</span><strong>${esc(agreementSignerLabel(item))}</strong></div>
      </div>
      ${agreementActions(item)}
    </article>
  `;
}

function agreementDelegationPanel() {
  if (!hasRole("president")) return "";
  const members = visibleMembers().filter((member) =>
    member.id !== state.profile?.id &&
    rolesOf(member).some((role) => !["member", "youth_member", "discipline_member", "representative"].includes(role))
  );
  const delegations = (state.cache.agreementDelegations || []).filter((item) => !item.revoked_at);
  return `
    <section class="panel glass" style="margin-bottom:.85rem">
      <div class="panel-head"><div><span class="panel-kicker">Başkanlık yetkisi</span><h3>Yazılı imza yetkisi</h3></div><span>${delegations.length} aktif kayıt</span></div>
      <form class="form-stack" data-form="agreement-delegation">
        <div class="form-grid">
          <div class="form-group"><label>Yetkilendirilecek yönetici</label><select class="field" name="delegateProfileId" required><option value="">Seçin</option>${members.map((member) => `<option value="${esc(member.id)}">${esc(member.display_name)} · ${esc(roleLabels(member))}</option>`).join("")}</select></div>
          <div class="form-group"><label>Yetki bitişi (isteğe bağlı)</label><input class="field" name="endsAt" type="datetime-local" /></div>
        </div>
        <div class="form-group"><label>Yazılı yetki kapsamı</label><textarea class="field" name="authorityNote" required minlength="5" maxlength="800"></textarea></div>
        <div class="inline-actions"><button class="btn btn-primary btn-sm" type="submit">İmza yetkisi ver</button></div>
      </form>
      ${delegations.length ? `<div class="hierarchy-list" style="margin-top:.85rem">${delegations.map((item) => `<article class="hierarchy-row"><div><strong>${esc(item.delegate?.display_name || "Yönetici")}</strong><span>${esc(item.authority_note)}</span></div><button class="table-action danger-action" type="button" data-action="revoke-agreement-delegation" data-id="${esc(item.id)}">Yetkiyi geri al</button></article>`).join("")}</div>` : ""}
    </section>
  `;
}

function agreementsPage() {
  agreementsEnsureStyles();
  const rows = state.cache.agreements || [];
  const pendingMine = rows.filter(agreementNeedsMySignature);
  const q = (state.filters.agreementSearch || "").toLocaleLowerCase("tr");
  const filtered = rows.filter((item) => !q || [
    item.title,
    item.body,
    item.purpose,
    item.obligations,
    item.proposer?.display_name,
    agreementTargetLabel(item)
  ].join(" ").toLocaleLowerCase("tr").includes(q));
  return `
    ${pageHeader(
      "Antlaşmalar",
      "Ana Yönetmeliğe bağlı resmî kabul akışı",
      "Taraflar, amaç, yükümlülük ve yürürlük tarihleri kaydedilir; geniş kapsamlı antlaşmalar Yürütme Kurulu onayı olmadan yürürlüğe girmez.",
      `<button class="btn btn-primary btn-sm" type="button" data-action="open-agreement">${icon("plus")} Antlaşma Sun</button>`
    )}
    <section class="metrics-grid">
      ${metric("Toplam", rows.length, "Yetkinize açık kayıt", "book")}
      ${metric("İmzamı bekleyen", pendingMine.length, "Yetkili kabul", "inbox")}
      ${metric("Kurul onayında", rows.filter((item) => item.status === "pending_executive").length, "Yürütme Kurulu", "users")}
      ${metric("Yürürlükte", rows.filter((item) => ["active", "signed"].includes(item.status)).length, "Bağlayıcı kayıt", "check")}
    </section>
    ${agreementDelegationPanel()}
    <div class="agreement-hero">
      <section class="agreement-focus">
        <strong>Yetkili imza düzeni</strong>
        <p>Bireysel metni hedef üye, kurul metnini ilgili kurul başkanı, parti adına metni Başkan veya yazılı yetki verdiği yönetici imzalar.</p>
        <div class="agreement-target-grid">
          <div class="agreement-target-tile"><strong>Üye</strong><span>Hedef kişi kabul eder.</span></div>
          <div class="agreement-target-tile"><strong>Disiplin</strong><span>DK Başkanı karar verir.</span></div>
          <div class="agreement-target-tile"><strong>Gençlik</strong><span>Gençlik Kolları Başkanı karar verir.</span></div>
          <div class="agreement-target-tile"><strong>Parti</strong><span>Başkanlık imzası ve gerektiğinde Yürütme onayı.</span></div>
        </div>
      </section>
      <section class="panel glass"><div class="panel-head"><h3>Arama</h3></div><label class="search-field">${icon("search")}<input class="field" type="search" placeholder="Antlaşma ara..." data-filter="agreementSearch" value="${esc(state.filters.agreementSearch || "")}" /></label></section>
    </div>
    ${pendingMine.length ? `<section class="panel glass" style="margin-bottom:.85rem"><div class="panel-head"><h3>İmzamı bekleyenler</h3></div><div class="card-grid application-grid">${pendingMine.map((item) => agreementCard(item, true)).join("")}</div></section>` : ""}
    <section class="panel glass"><div class="panel-head"><h3>Kurumsal antlaşma kayıtları</h3></div><div class="card-grid application-grid">${filtered.length ? filtered.map((item) => agreementCard(item)).join("") : emptyCard("Antlaşma yok", "Yeni antlaşmalar burada gösterilecek.")}</div></section>
  `;
}

function agreementDateInput(hoursFromNow = 0) {
  const date = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  const offset = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.valueOf() - offset).toISOString().slice(0, 16);
}

function openAgreement() {
  const members = agreementVisibleMembers();
  modal({
    title: "Antlaşma sun",
    subtitle: "Bağlayıcılık için tüm zorunlu kurumsal alanları doldurun.",
    body: `
      <form class="form-stack" data-form="agreement">
        <div class="form-group"><label>Başlık</label><input class="field" name="title" required minlength="3" maxlength="160" /></div>
        <div class="form-grid">
          <div class="form-group"><label>Hedef</label><select class="field" name="targetType" data-agreement-target-type><option value="member">Bir üyeye</option><option value="discipline">Disiplin Kurulu'na</option><option value="youth">Gençlik Kolları'na</option><option value="party">İHP adına</option></select></div>
          <div class="form-group" data-agreement-member-group><label>Hedef üye</label><select class="field" name="targetProfileId" data-agreement-member-select><option value="">Seçin</option>${members.map((member) => `<option value="${esc(member.id)}">${esc(member.display_name)} · ${esc(member.member_code ? `#${member.member_code}` : "")}</option>`).join("")}</select></div>
        </div>
        <div class="form-grid">
          <div class="form-group"><label>Kapsam</label><select class="field" name="scope"><option value="personal">Kişisel</option><option value="committee">Kurul / birim</option><option value="party">Parti geneli</option></select></div>
          <div class="form-group"><label>Yürütme Kurulu onayı</label><label class="account-delete-consent"><input type="checkbox" name="requiresExecutiveApproval" /><span>Birden fazla organı, üye haklarını veya ciddi yükümlülüğü etkiliyor.</span></label></div>
        </div>
        <div class="form-group"><label>Amaç ve konu</label><textarea class="field" name="purpose" required minlength="5" maxlength="1200"></textarea></div>
        <div class="form-group"><label>Tarafların görev ve yükümlülükleri</label><textarea class="field" name="obligations" required minlength="5" maxlength="4000" style="min-height:180px"></textarea></div>
        <div class="form-grid">
          <div class="form-group"><label>Yürürlük tarihi</label><input class="field" name="effectiveAt" type="datetime-local" required value="${agreementDateInput(1)}" /></div>
          <div class="form-group"><label>Bitiş tarihi (süreliyse)</label><input class="field" name="expiresAt" type="datetime-local" /></div>
        </div>
        <div class="form-group"><label>Antlaşma metni</label><textarea class="field" name="body" maxlength="12000" style="min-height:260px"></textarea></div>
        <div class="form-group"><label>PDF veya Word dosyası</label><input class="field" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" data-evidence-upload data-evidence-target="agreement-file-data" data-evidence-name-target="agreement-file-name" /><input id="agreement-file-data" name="fileData" type="hidden" /><input id="agreement-file-name" name="fileName" type="hidden" /><p class="security-note">Metin veya dosyadan en az biri zorunludur; dosya en fazla 4 MB olabilir.</p></div>
        <div class="modal-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button><button class="btn btn-primary btn-sm" type="submit">Antlaşmayı sun</button></div>
      </form>
    `
  });
  syncAgreementTarget(document.querySelector("[data-agreement-target-type]"));
}

function openAgreementDecision(item, status) {
  if (!item || !agreementCanSign(item)) return;
  const signed = status === "signed";
  modal({
    title: signed ? "Antlaşmayı imzala" : "Antlaşmayı reddet",
    subtitle: `${agreementTargetLabel(item)} adına yetkili karar.`,
    body: `
      <form class="form-stack" data-form="agreement-decision" data-id="${esc(item.id)}" data-status="${esc(status)}">
        <div class="setup-box"><strong>${esc(item.title)}</strong><p class="security-note">${esc(item.purpose || "")}</p></div>
        <div class="agreement-detail-body">${esc(item.body || "Metin yerine dosya eklenmiş.")}</div>
        <div class="form-group"><label>Karar notu</label><textarea class="field" name="decisionNote" maxlength="900" ${signed ? "" : "required"}></textarea></div>
        ${item.requires_executive_approval ? `<p class="security-note">İmza sonrasında antlaşma Yürütme Kurulu oylamasına gönderilir; kurul kabul etmeden yürürlüğe girmez.</p>` : ""}
        <div class="modal-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button><button class="btn ${signed ? "btn-primary" : "btn-danger"} btn-sm" type="submit">${signed ? "İmzala" : "Reddet"}</button></div>
      </form>
    `
  });
}

function openAgreementDetail(item) {
  if (!item) return;
  modal({
    title: item.title,
    subtitle: `${agreementTargetLabel(item)} · ${statusLabel(item.status)}`,
    body: `
      <div class="meta-list">
        <div class="meta-row"><span>Sunan</span><strong>${esc(item.proposer?.display_name || "Üye")}</strong></div>
        <div class="meta-row"><span>Hedef</span><strong>${esc(agreementTargetLabel(item))}</strong></div>
        <div class="meta-row"><span>Amaç</span><strong>${esc(item.purpose || "Eski kayıtta belirtilmedi")}</strong></div>
        <div class="meta-row"><span>Yükümlülükler</span><strong>${esc(item.obligations || "Eski kayıtta belirtilmedi")}</strong></div>
        <div class="meta-row"><span>Yürürlük</span><strong>${formatDate(item.effective_at, true)}${item.expires_at ? ` - ${formatDate(item.expires_at, true)}` : ""}</strong></div>
        <div class="meta-row"><span>Durum</span><strong>${esc(agreementSignerLabel(item))}</strong></div>
        <div class="meta-row"><span>Karar notu</span><strong>${esc(item.decision_note || "Yok")}</strong></div>
      </div>
      <div class="agreement-detail-body" style="margin-top:.85rem">${esc(item.body || "Metin yerine dosya eklenmiş.")}</div>
      ${item.file_data ? `<div style="margin-top:.85rem"><a class="agreement-file-link" href="${esc(item.file_data)}" download="${esc(item.file_name || "ihp-antlasma")}">${icon("download")} ${esc(item.file_name || "Dosyayı aç")}</a></div>` : ""}
    `,
    actions: `<div class="modal-actions"><button class="btn btn-primary btn-sm" type="button" data-action="close-modal">Kapat</button></div>`
  });
}

function syncAgreementTarget(input) {
  if (!input) return;
  const group = document.querySelector("[data-agreement-member-group]");
  const memberSelect = document.querySelector("[data-agreement-member-select]");
  const isMember = input.value === "member";
  if (group) group.hidden = !isMember;
  if (memberSelect) memberSelect.required = isMember;
}

