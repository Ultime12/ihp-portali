const IHP_CREDIT_ADMIN_V1 = true;
const CREDIT_PAGE_ID = "credit";

function isCreditTestAccount(profile = state.profile) {
  return Boolean(profile?.credit_test_access);
}

function canAccessCreditSystem() {
  return !(typeof isEntryAccessAccount === "function" && isEntryAccessAccount());
}

if (!navItems.some(([id]) => id === CREDIT_PAGE_ID)) {
  const settingsIndex = navItems.findIndex(([id]) => id === "settings");
  navItems.splice(settingsIndex < 0 ? navItems.length : settingsIndex, 0, [
    CREDIT_PAGE_ID,
    "Kredi Sistemi",
    "wallet",
    canAccessCreditSystem
  ]);
}

function creditData() {
  return state.cache.creditSystem || { settings: {}, accounts: [], profiles: [], loans: [], installments: [], transactions: [], cheques: [], gameRequests: [] };
}

function creditProfileMap(data = creditData()) {
  return new Map((data.profiles || []).map((item) => [item.id, item]));
}

function creditAccountMap(data = creditData()) {
  return new Map((data.accounts || []).map((item) => [item.id, item]));
}

function creditMemberForAccount(accountId, data = creditData()) {
  const account = creditAccountMap(data).get(accountId);
  return creditProfileMap(data).get(account?.profile_id) || null;
}

function creditAmount(value) {
  return `${Number(value || 0).toLocaleString("tr-TR")} kredi`;
}

function creditTransactionLabel(kind) {
  return ({
    account_opened: "Hesap açıldı",
    transfer_out: "Giden transfer", transfer_in: "Gelen transfer", transfer_tax: "Transfer vergisi",
    weekly_allowance: "Haftalık ödeme", cheque_issue: "Çek oluşturuldu", cheque_redeem: "Çek bozduruldu",
    loan_disbursement: "Kredi kullandırıldı", loan_repayment: "Kredi ödemesi",
    balance_forfeit: "Kapatılan hesap bakiyesi", admin_adjustment: "Admin düzeltmesi",
    game_entry: "Oyun giriş bedeli"
  })[kind] || kind;
}

function creditTransactionDirection(item = {}) {
  if (item.kind === "admin_adjustment") {
    return item.metadata?.direction === "credit" ? "incoming" : "outgoing";
  }
  if (["transfer_in", "weekly_allowance", "cheque_redeem", "loan_disbursement"].includes(item.kind)) return "incoming";
  if (["transfer_out", "transfer_tax", "cheque_issue", "loan_repayment", "balance_forfeit", "game_entry"].includes(item.kind)) return "outgoing";
  return "neutral";
}

function creditTransactionKindMarkup(item = {}) {
  const direction = creditTransactionDirection(item);
  return `<span class="credit-transaction-kind ${direction}"><i>${icon("arrow")}</i><span>${esc(creditTransactionLabel(item.kind))}</span></span>`;
}

function creditTransactionAmountMarkup(item = {}) {
  const direction = creditTransactionDirection(item);
  const sign = direction === "incoming" ? "+" : direction === "outgoing" ? "−" : "";
  return `<strong class="credit-transaction-amount ${direction}">${sign}${creditAmount(item.amount)}</strong>`;
}

function creditSettingsForm(settings) {
  const allowances = settings.role_allowances || {};
  return `
    <section class="panel glass credit-settings-panel">
      <div class="panel-head"><div><span class="panel-kicker">Admin ayarları</span><h3>Ekonomi kuralları</h3></div>${badge("Tüm üyelere açık", "green")}</div>
      <div class="credit-settings-grid">
        <label>Transfer vergisi (%)<input class="field" data-credit-tax type="number" min="0" max="50" step="0.1" value="${Number(settings.transfer_tax_basis_points || 0) / 100}" /></label>
        <label>Kredi faizi (%)<input class="field" data-credit-interest type="number" min="0" max="100" step="0.1" value="${Number(settings.loan_interest_basis_points || 0) / 100}" /></label>
        <label>En yüksek kredi<input class="field" data-credit-max-loan type="number" min="1" max="1000000" value="${Number(settings.max_loan_amount || 5000)}" /></label>
        <label>En uzun vade (gün)<input class="field" data-credit-max-term type="number" min="1" max="30" value="${Number(settings.max_term_days || 30)}" /></label>
        <label>Ek ödeme süresi (gün)<input class="field" data-credit-grace type="number" min="0" max="7" value="${Number(settings.grace_days ?? 1)}" /></label>
        <label class="switch-row"><span>Haftalık rütbe ödemesi</span><input type="checkbox" data-credit-weekly ${settings.weekly_allowance_enabled ? "checked" : ""} /></label>
      </div>
      <details class="credit-allowance-details"><summary>Rütbeye göre haftalık kredi</summary><div class="credit-allowance-grid">${ROLE_OPTIONS.map(([role, label]) => `<label>${esc(label)}<input class="field" data-credit-allowance="${role}" type="number" min="0" max="1000000" value="${Number(allowances[role] || 0)}" /></label>`).join("")}</div></details>
      <div class="panel-actions"><button class="btn btn-primary btn-sm" type="button" data-action="save-credit-settings">Kredi ayarlarını kaydet</button></div>
      <p class="credit-safety-note">Üyeler hesap açılış sözleşmesini onayladıktan sonra kişisel hesap numarası oluşturabilir.</p>
    </section>
  `;
}

function creditLoanLabel(status) {
  return ({ pending: "Admin kararı bekliyor", approved: "Aktif kredi", rejected: "Reddedildi", paid: "Tamamlandı", delinquent: "Gecikmede" })[status] || status;
}

function creditGameName(key) {
  return ({ flappy: "İHP Flappy", snake: "İHP Snake", scratch: "İHP Kazı Kazan" })[key] || "Oyun Alanı";
}

function gameCreditRequestsPanel(data) {
  const requests = (data.gameRequests || []).filter((item) => ["pending", "approved"].includes(item.status));
  if (!requests.length) return "";
  return `
    <section class="panel glass credit-game-requests">
      <div class="panel-head"><div><span class="panel-kicker">Oyun ödemeleri</span><h3>Kredi onay merkezi</h3></div>${badge(String(requests.length), "gold")}</div>
      <div class="credit-game-request-list">
        ${requests.map((item) => `<article>
          <span class="credit-operation-icon">${icon("sparkles")}</span>
          <div><strong>${esc(creditGameName(item.game_key))}</strong><p>${item.status === "pending" ? `${Number(item.credit_amount).toLocaleString("tr-TR")} kredi çekmek istiyor.` : `${Number(item.credit_amount).toLocaleString("tr-TR")} kredi onaylandı; oyun başlatılabilir.`}</p></div>
          ${item.status === "pending" ? `<div class="table-actions"><button class="table-action success" type="button" data-action="approve-game-charge" data-id="${esc(item.id)}">Onayla</button><button class="table-action danger" type="button" data-action="reject-game-charge" data-id="${esc(item.id)}">Reddet</button></div>` : `<button class="btn btn-primary btn-sm" type="button" data-page="games">Oyuna dön</button>`}
        </article>`).join("")}
      </div>
      <p class="credit-safety-note">Onay verdiğiniz anda tutar bakiyenizden kesilir. Oyun başlatıldıktan sonra giriş bedeli iade edilmez.</p>
    </section>
  `;
}

function creditMemberPage() {
  const data = creditData();
  const account = data.account;
  const settings = data.settings || {};
  if (!account) {
    return `
      <section class="page-head credit-head"><div><span class="eyebrow">İHP Kredi Sistemi</span><h2>Kredi hesabını oluştur.</h2><p>Hesap numaranız henüz yok. Bilgilerinizi kontrol edip hesap açılış sözleşmesini onayladığınızda hesabınız anında açılır.</p></div><span class="credit-account-chip pending">${icon("wallet")} Hesap açılmadı</span></section>
      <section class="credit-onboarding-layout">
        <article class="panel glass credit-onboarding-card">
          <div class="panel-head"><div><span class="panel-kicker">Hesap sahibi bilgileri</span><h3>Başvuru formu</h3></div>${icon("userPlus")}</div>
          <div class="credit-identity-grid">
            <label>Ad soyad<input class="field" value="${esc(state.profile?.display_name || "")}" readonly /></label>
            <label>Portal e-postası<input class="field" value="${esc(state.profile?.email || "")}" readonly /></label>
          </div>
          <label>Hesabı kullanma amacı<select class="field" data-credit-open-purpose><option value="">Seçiniz</option><option value="general">Genel kullanım</option><option value="transfer">Kredi transferleri</option><option value="cheque">Çek işlemleri</option><option value="saving">Bakiye biriktirme</option></select></label>
          <label class="credit-opening-consent"><input type="checkbox" data-credit-open-consent /><span>Hesap bilgilerimin doğru olduğunu; transferlerin geri alınamayacağını, kredi ve çek işlemlerinin portal kurallarına tabi olduğunu okudum ve kabul ediyorum.</span></label>
          <button class="btn btn-primary" type="button" data-action="credit-open-account" disabled>Bilgileri onayla ve hesabı aç ${icon("arrow")}</button>
        </article>
        <aside class="panel glass credit-opening-summary">
          <span class="credit-opening-orb">${icon("wallet")}</span>
          <div><span class="panel-kicker">Açılış sonrası</span><h3>Kişisel hesap numarası</h3><p>Onaydan sonra size benzersiz bir <strong>IHP</strong> hesap kodu verilir. Bakiye, transfer, çek ve kredi işlemleriniz bu kodla yönetilir.</p></div>
          <ul><li>Başlangıç bakiyesi 0 kredidir.</li><li>Her üye yalnızca bir hesap açabilir.</li><li>Bilgiler yalnızca yetkili sistem tarafından kullanılır.</li></ul>
        </aside>
      </section>
    `;
  }
  const pendingLoan = (data.loans || []).find((item) => item.status === "pending");
  const activeLoan = (data.loans || []).find((item) => ["approved", "delinquent"].includes(item.status));
  const dueInstallments = (data.installments || []).filter((item) => item.status !== "paid");
  const taxRate = Number(settings.transfer_tax_basis_points || 0) / 100;
  const interestRate = Number(settings.loan_interest_basis_points || 0) / 100;
  return `
    <section class="page-head credit-head">
      <div><span class="eyebrow">İHP Kredi Sistemi</span><h2>Kişisel kredi merkezi.</h2><p>Transfer, çek ve kredi işlemleri sunucuda kaydedilir. Onaydan önce hesap kodunu ve tutarı dikkatle kontrol edin.</p></div>
      <span class="credit-account-chip">${icon("wallet")} ${esc(account.account_code)}</span>
    </section>
    <section class="credit-balance-stage">
      <article class="credit-balance-card glass">
        <span>Kullanılabilir bakiye</span>
        <strong>${Number(account.balance || 0).toLocaleString("tr-TR")}</strong>
        <small>İHP KREDİ</small>
        <em>${esc(account.account_code)}</em>
      </article>
      <div class="credit-balance-insights">
        <div><span>Transfer vergisi</span><strong>%${taxRate.toLocaleString("tr-TR")}</strong></div>
        <div><span>Kredi faizi</span><strong>%${interestRate.toLocaleString("tr-TR")}</strong></div>
        <div><span>Açık taksit</span><strong>${dueInstallments.length}</strong><small>${activeLoan ? creditLoanLabel(activeLoan.status) : "Aktif kredi yok"}</small></div>
      </div>
    </section>
    ${gameCreditRequestsPanel(data)}
    <section class="credit-operation-grid">
      <details class="credit-operation-card glass">
        <summary><span class="credit-operation-icon">${icon("arrow")}</span><span><small>Hesaba gönder</small><strong>Kredi transferi</strong></span><em>${icon("chevron")}</em></summary>
        <div class="credit-operation-content">
          <label>Alıcı hesap kodu<input class="field" data-credit-recipient maxlength="12" placeholder="IHP900000002" autocomplete="off" /></label>
          <label>Alıcıya gidecek tutar<input class="field" data-credit-transfer-amount type="number" min="1" max="1000000" placeholder="100" /></label>
          <div class="credit-transfer-preview" data-credit-transfer-preview><span>Alıcıya <b>0 kredi</b></span><span>Vergi <b>0 kredi</b></span><strong>Toplam kesinti <b>0 kredi</b></strong></div>
          <p class="credit-card-note">Yanlış hesaba yapılan transfer geri alınamaz.</p>
          <button class="btn btn-primary btn-sm" type="button" data-action="credit-member-transfer" disabled>Transferi tamamla</button>
        </div>
      </details>
      <details class="credit-operation-card glass">
        <summary><span class="credit-operation-icon">${icon("clipboard")}</span><span><small>24 haneli güvence</small><strong>Çek işlemleri</strong></span><em>${icon("chevron")}</em></summary>
        <div class="credit-operation-content">
          <label>Çek tutarı<input class="field" data-credit-cheque-amount type="number" min="1" max="1000000" placeholder="100" /></label>
          <button class="btn btn-secondary btn-sm" type="button" data-action="credit-member-issue-cheque">Çek oluştur</button>
          <div class="credit-form-divider"><span>veya</span></div>
          <label>Çek kodu<input class="field" data-credit-cheque-code inputmode="numeric" maxlength="24" placeholder="24 haneli kod" autocomplete="off" /></label>
          <button class="btn btn-primary btn-sm" type="button" data-action="credit-member-redeem-cheque">Çeki hesaba aktar</button>
        </div>
      </details>
      <details class="credit-operation-card glass">
        <summary><span class="credit-operation-icon">${icon("briefcase")}</span><span><small>Admin onaylı</small><strong>Kredi başvurusu</strong></span><em>${icon("chevron")}</em></summary>
        <div class="credit-operation-content">
          ${pendingLoan ? `<div class="credit-loan-banner">${badge("Bekliyor", "gold")}<strong>${creditAmount(pendingLoan.principal)}</strong><span>Başvuru Admin kararı bekliyor.</span></div>` : `
            <label>Talep edilen tutar<input class="field" data-credit-loan-amount type="number" min="1" max="${Number(settings.max_loan_amount || 5000)}" placeholder="500" /></label>
            <div class="form-grid"><label>Vade (gün)<input class="field" data-credit-loan-term type="number" min="1" max="${Number(settings.max_term_days || 30)}" value="30" /></label><label>Taksit sayısı<select class="field" data-credit-loan-installments><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></label></div>
            <button class="btn btn-primary btn-sm" type="button" data-action="credit-member-request-loan">Başvuruyu gönder</button>
          `}
        </div>
      </details>
    </section>
    ${dueInstallments.length ? `<section class="panel glass"><div class="panel-head"><div><span class="panel-kicker">Ödeme planı</span><h3>Bekleyen taksitler</h3></div>${badge(String(dueInstallments.length), "gold")}</div><div class="credit-installment-list">${dueInstallments.map((item) => `<div><span><strong>${item.installment_no}. taksit</strong><small>Son tarih ${formatDate(item.due_at)}</small></span><b>${creditAmount(item.amount)}</b><button class="btn btn-secondary btn-sm" type="button" data-action="credit-member-pay-installment" data-id="${esc(item.id)}">Taksidi öde</button></div>`).join("")}</div></section>` : ""}
    <section class="panel glass"><div class="panel-head"><div><span class="panel-kicker">Hesap defteri</span><h3>Son hareketler</h3></div>${badge(`${(data.transactions || []).length} kayıt`, "blue")}</div>
      ${(data.transactions || []).length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Tarih</th><th>İşlem</th><th>Tutar</th><th>Son bakiye</th></tr></thead><tbody>${data.transactions.map((item) => `<tr><td>${formatDate(item.created_at, true)}</td><td>${creditTransactionKindMarkup(item)}</td><td>${creditTransactionAmountMarkup(item)}</td><td>${creditAmount(item.balance_after)}</td></tr>`).join("")}</tbody></table></div>` : emptyCard("Henüz hareket yok", "Kredi işlemleri burada listelenecek.")}
    </section>
  `;
}

function showCreditChequeCode(code, amount) {
  const grouped = String(code || "").match(/.{1,4}/g)?.join(" ") || "";
  modal({
    title: "Çek oluşturuldu",
    subtitle: "Bu kod yalnızca bir kez gösterilir. Kodu teslim edeceğiniz kişi tutarı hesabına aktarabilir.",
    body: `<div class="credit-cheque-reveal"><span>İHP KREDİ ÇEKİ</span><strong>${esc(grouped)}</strong><b>${creditAmount(amount)}</b></div>`,
    actions: `<div class="modal-actions"><button class="btn btn-primary btn-sm" type="button" data-action="close-modal">Tamam</button></div>`
  });
}

function updateCreditTransferPreview() {
  const data = creditData();
  const amount = Math.max(0, Math.trunc(Number(document.querySelector("[data-credit-transfer-amount]")?.value) || 0));
  const basisPoints = Number(data.settings?.transfer_tax_basis_points || 0);
  const tax = amount > 0 ? Math.ceil(amount * basisPoints / 10000) : 0;
  const total = amount + tax;
  const preview = document.querySelector("[data-credit-transfer-preview]");
  if (preview) preview.innerHTML = `<span>Alıcıya <b>${amount.toLocaleString("tr-TR")} kredi</b></span><span>Vergi <b>${tax.toLocaleString("tr-TR")} kredi</b></span><strong>Toplam kesinti <b>${total.toLocaleString("tr-TR")} kredi</b></strong>`;
  const recipient = document.querySelector("[data-credit-recipient]")?.value.trim().toUpperCase() || "";
  const button = document.querySelector('[data-action="credit-member-transfer"]');
  if (button) button.disabled = !(/^IHP[0-9]{9}$/.test(recipient) && amount > 0 && total <= Number(data.account?.balance || 0));
}

function creditAccountsPanel(data) {
  const accounts = (data.accounts || []).filter((item) => item.status === "active");
  const profiles = creditProfileMap(data);
  return `
    <section class="panel glass credit-account-admin-panel">
      <div class="panel-head"><div><span class="panel-kicker">Admin bakiye merkezi</span><h3>Hesaplara kredi ekle veya çek</h3></div>${badge(`${accounts.length} aktif hesap`, "blue")}</div>
      ${accounts.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Hesap sahibi</th><th>Hesap kodu</th><th>Bakiye</th><th>İşlem</th></tr></thead><tbody>${accounts.map((account) => { const member = profiles.get(account.profile_id); return `<tr><td><strong>${esc(member?.display_name || "Bilinmeyen hesap")}</strong><small class="table-subtitle">${esc(member?.email || "")}</small></td><td><code>${esc(account.account_code)}</code></td><td><strong>${creditAmount(account.balance)}</strong></td><td><button class="table-action" type="button" data-action="open-credit-adjustment" data-id="${esc(account.id)}" data-name="${esc(member?.display_name || account.account_code)}" data-balance="${Number(account.balance || 0)}">Bakiye düzenle</button></td></tr>`; }).join("")}</tbody></table></div>` : emptyCard("Henüz açılmış hesap yok", "Kullanıcılar bilgilerini onaylayıp hesap açtığında burada görünür.")}
    </section>
  `;
}

function openCreditAdjustment(accountId, memberName, balance) {
  modal({
    title: `${memberName} bakiyesini düzenle`,
    subtitle: `Güncel bakiye: ${creditAmount(balance)}. Her işlem hesap defterine ve üyenin bildirimlerine kaydedilir.`,
    body: `<div class="form-grid"><div class="form-group"><label for="credit-adjust-direction">İşlem</label><select class="field" id="credit-adjust-direction"><option value="credit">Kredi ekle</option><option value="debit">Kredi çek</option></select></div><div class="form-group"><label for="credit-adjust-amount">Tutar</label><input class="field" id="credit-adjust-amount" type="number" min="1" max="1000000" placeholder="100" /></div></div><div class="form-group"><label for="credit-adjust-reason">Gerekçe</label><textarea class="field textarea" id="credit-adjust-reason" minlength="5" maxlength="300" placeholder="Bakiye değişikliğinin gerekçesini yazın"></textarea></div>`,
    actions: `<div class="modal-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button><button class="btn btn-primary btn-sm" type="button" data-action="confirm-credit-adjustment" data-id="${esc(accountId)}">Bakiyeyi güncelle</button></div>`
  });
}

function creditPage() {
  const data = creditData();
  const activeAccounts = data.accounts.filter((item) => item.status === "active");
  const totalBalance = activeAccounts.reduce((sum, item) => sum + Number(item.balance || 0), 0);
  const pendingLoans = data.loans.filter((item) => item.status === "pending");
  const delinquent = data.installments.filter((item) => item.status === "delinquent");
  return `
    <section class="page-head credit-head"><div><span class="eyebrow">İHP Kredi Sistemi</span><h2>Kapalı devre ekonomi merkezi.</h2><p>Hesaplar, transferler, çekler, krediler ve otomatik ödemeler tek, değiştirilemez işlem defterinde izlenir.</p></div><span class="credit-admin-seal">${icon("lock")} Yalnızca Admin</span></section>
    <section class="metrics-grid credit-metrics">
      ${metric("Aktif hesap", activeAccounts.length, "Açılmış banka hesabı", "users")}
      ${metric("Toplam bakiye", totalBalance.toLocaleString("tr-TR"), "Sistem içi kredi", "chart")}
      ${metric("Bekleyen kredi", pendingLoans.length, "Admin kararı bekliyor", "inbox")}
      ${metric("Geciken taksit", delinquent.length, "Disiplin akışına gider", "shield")}
    </section>
    ${creditSettingsForm(data.settings || {})}
    ${creditAccountsPanel(data)}
    <section class="credit-dashboard-grid">
      <article class="panel glass"><div class="panel-head"><div><span class="panel-kicker">Onay merkezi</span><h3>Bekleyen kredi başvuruları</h3></div>${badge(String(pendingLoans.length), pendingLoans.length ? "gold" : "gray")}</div>
        ${pendingLoans.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Üye</th><th>Tutar</th><th>Geri ödeme</th><th>Vade</th><th>İşlem</th></tr></thead><tbody>${pendingLoans.map((loan) => {
          const member = creditMemberForAccount(loan.account_id, data);
          return `<tr><td><strong>${esc(member?.display_name || "Bilinmeyen hesap")}</strong></td><td>${creditAmount(loan.principal)}</td><td>${creditAmount(loan.total_due)}</td><td>${loan.term_days} gün / ${loan.installment_count} taksit</td><td><div class="table-actions"><button class="table-action success" type="button" data-action="open-credit-review" data-id="${loan.id}" data-decision="approved">Onayla</button><button class="table-action danger" type="button" data-action="open-credit-review" data-id="${loan.id}" data-decision="rejected">Reddet</button></div></td></tr>`;
        }).join("")}</tbody></table></div>` : emptyCard("Bekleyen başvuru yok", "Yeni kredi talepleri burada görünür.")}
      </article>
      <article class="panel glass"><div class="panel-head"><div><span class="panel-kicker">Rapor merkezi</span><h3>İşlem dökümleri</h3></div>${icon("download")}</div><p class="credit-report-copy">Hesap hareketlerini resmi, sayfalı PDF raporu olarak dışarı aktarın.</p><div class="credit-report-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="credit-report" data-range="24h">Son 24 saat PDF</button><button class="btn btn-primary btn-sm" type="button" data-action="credit-report" data-range="7d">Son 7 gün PDF</button></div></article>
    </section>
    <section class="panel glass"><div class="panel-head"><div><span class="panel-kicker">Değiştirilemez kayıt</span><h3>Son işlemler</h3></div>${badge(`${data.transactions.length} kayıt`, "blue")}</div>
      ${data.transactions.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Tarih</th><th>Hesap sahibi</th><th>İşlem</th><th>Tutar</th><th>Son bakiye</th></tr></thead><tbody>${data.transactions.slice(0, 80).map((item) => { const member = creditMemberForAccount(item.account_id, data); return `<tr><td>${formatDate(item.created_at, true)}</td><td>${esc(member?.display_name || "Sistem hesabı")}</td><td>${creditTransactionKindMarkup(item)}</td><td>${creditTransactionAmountMarkup(item)}</td><td>${creditAmount(item.balance_after)}</td></tr>`; }).join("")}</tbody></table></div>` : emptyCard("İşlem kaydı yok", "Kredi sistemi açıldığında hareketler burada görünür.")}
    </section>
  `;
}

function openCreditReview(loanId, decision) {
  modal({
    title: decision === "approved" ? "Kredi başvurusunu onayla" : "Kredi başvurusunu reddet",
    subtitle: decision === "approved" ? "Tutar üyenin hesabına aktarılır ve taksitler oluşturulur." : "Başvuru sonuçlandırılır; bakiye değişmez.",
    body: `<div class="form-group"><label for="credit-decision-note">Karar notu</label><textarea class="field textarea" id="credit-decision-note" maxlength="600" placeholder="Kararın kısa gerekçesi"></textarea></div>`,
    actions: `<div class="modal-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button><button class="btn ${decision === "approved" ? "btn-primary" : "btn-danger"} btn-sm" type="button" data-action="confirm-credit-review" data-id="${loanId}" data-decision="${decision}">Kararı kaydet</button></div>`
  });
}

async function exportCreditReport(range) {
  const report = await portalServerRequest("/api/manage-member", { module: "credit", action: "report", range });
  const builder = createPdfBuilder("IHP Kredi Sistemi Islem Raporu", state.cache.settings?.logo_url || "", {
    subtitle: range === "7d" ? "Son 7 gun resmi hesap hareketleri" : "Son 24 saat resmi hesap hareketleri",
    footer: "IHP Kredi Sistemi - yalnizca yetkili yonetici kullanimi icindir."
  });
  const profiles = creditProfileMap(report);
  const accounts = creditAccountMap(report);
  const total = report.transactions.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  builder.section("Rapor Ozeti");
  builder.keyValueRows([
    ["Rapor araligi", range === "7d" ? "Son 7 gun" : "Son 24 saat"],
    ["Olusturulma", formatDate(report.generatedAt, true)],
    ["Olusturan", state.profile.display_name],
    ["Islem sayisi", String(report.transactions.length)],
    ["Toplam hareket", creditAmount(total)]
  ]);
  builder.section("Hesap Hareketleri");
  if (!report.transactions.length) builder.paragraph("Kayit", "Secilen donemde hesap hareketi bulunmuyor.");
  report.transactions.forEach((item, index) => {
    const account = accounts.get(item.account_id);
    const member = profiles.get(account?.profile_id);
    builder.paragraph(`${index + 1}. ${creditTransactionLabel(item.kind)}`, `${formatDate(item.created_at, true)} | ${member?.display_name || "Sistem hesabi"} | ${account?.account_code || "-"} | ${creditAmount(item.amount)} | Son bakiye: ${creditAmount(item.balance_after)}`);
  });
  downloadBlob(builder.finish(), `IHP-Kredi-Islem-Raporu-${range}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

const creditBaseRenderPortalPage = renderPortalPage;
renderPortalPage = function creditRenderPortalPage(page) {
  if (page === CREDIT_PAGE_ID) return hasRole("super_admin") ? creditPage() : creditMemberPage();
  return creditBaseRenderPortalPage(page);
};

const creditBaseLoadPage = loadPage;
loadPage = async function creditLoadPage(page) {
  if (page !== CREDIT_PAGE_ID) return creditBaseLoadPage(page);
  state.loading = true; state.pageError = null; render();
  try {
    state.cache.creditSystem = await portalServerRequest("/api/manage-member", {
      module: "credit",
      action: hasRole("super_admin") ? "admin_status" : "member_status"
    });
  }
  catch (error) { state.pageError = { page, message: error.message }; }
  finally { state.loading = false; render(); }
};

const creditBaseHandleClick = handleClick;
handleClick = async function creditHandleClick(event) {
  const target = event.target.closest("[data-action]");
  const action = target?.dataset.action;
  if (action === "credit-open-account") {
    event.preventDefault(); target.disabled = true;
    try {
      const usagePurpose = document.querySelector("[data-credit-open-purpose]")?.value || "";
      const termsAccepted = Boolean(document.querySelector("[data-credit-open-consent]")?.checked);
      state.cache.creditSystem = await portalServerRequest("/api/manage-member", {
        module: "credit",
        action: "open_account",
        usagePurpose,
        termsAccepted
      });
      showToast("Kredi hesabınız oluşturuldu.", "success"); render();
    } catch (error) { showToast(error.message, "error"); target.disabled = false; }
    return;
  }
  if (action === "approve-game-charge" || action === "reject-game-charge") {
    event.preventDefault(); target.disabled = true;
    try {
      state.cache.creditSystem = await portalServerRequest("/api/manage-member", {
        module: "credit",
        action: "decide_game_charge",
        requestId: target.dataset.id,
        approve: action === "approve-game-charge"
      });
      showToast(action === "approve-game-charge" ? "Oyun kredisi onaylandı." : "Oyun kredi talebi reddedildi.", "success");
      render();
    } catch (error) { showToast(error.message, "error"); target.disabled = false; }
    return;
  }
  if (action === "credit-member-transfer") {
    event.preventDefault(); target.disabled = true;
    try {
      const recipientCode = document.querySelector("[data-credit-recipient]")?.value.trim().toUpperCase();
      const amount = Number(document.querySelector("[data-credit-transfer-amount]")?.value);
      state.cache.creditSystem = await portalServerRequest("/api/manage-member", { module: "credit", action: "transfer", recipientCode, amount });
      showToast("Transfer tamamlandı.", "success"); render();
    } catch (error) { showToast(error.message, "error"); target.disabled = false; }
    return;
  }
  if (action === "credit-member-issue-cheque") {
    event.preventDefault(); target.disabled = true;
    try {
      const amount = Number(document.querySelector("[data-credit-cheque-amount]")?.value);
      const response = await portalServerRequest("/api/manage-member", { module: "credit", action: "issue_cheque", amount });
      state.cache.creditSystem = response;
      showCreditChequeCode(response.code, amount);
    } catch (error) { showToast(error.message, "error"); target.disabled = false; }
    return;
  }
  if (action === "credit-member-redeem-cheque") {
    event.preventDefault(); target.disabled = true;
    try {
      const code = document.querySelector("[data-credit-cheque-code]")?.value.replace(/\D/g, "");
      state.cache.creditSystem = await portalServerRequest("/api/manage-member", { module: "credit", action: "redeem_cheque", code });
      showToast("Çek tutarı hesabınıza aktarıldı.", "success"); render();
    } catch (error) { showToast(error.message, "error"); target.disabled = false; }
    return;
  }
  if (action === "credit-member-request-loan") {
    event.preventDefault(); target.disabled = true;
    try {
      const amount = Number(document.querySelector("[data-credit-loan-amount]")?.value);
      const termDays = Number(document.querySelector("[data-credit-loan-term]")?.value);
      const installmentCount = Number(document.querySelector("[data-credit-loan-installments]")?.value);
      state.cache.creditSystem = await portalServerRequest("/api/manage-member", { module: "credit", action: "request_loan", amount, termDays, installmentCount });
      showToast("Kredi başvurusu Admin onayına gönderildi.", "success"); render();
    } catch (error) { showToast(error.message, "error"); target.disabled = false; }
    return;
  }
  if (action === "credit-member-pay-installment") {
    event.preventDefault(); target.disabled = true;
    try {
      state.cache.creditSystem = await portalServerRequest("/api/manage-member", { module: "credit", action: "pay_installment", installmentId: target.dataset.id });
      showToast("Taksit ödemesi tamamlandı.", "success"); render();
    } catch (error) { showToast(error.message, "error"); target.disabled = false; }
    return;
  }
  if (action === "open-credit-adjustment") {
    event.preventDefault();
    openCreditAdjustment(target.dataset.id, target.dataset.name, Number(target.dataset.balance || 0));
    return;
  }
  if (action === "confirm-credit-adjustment") {
    event.preventDefault(); target.disabled = true;
    try {
      state.cache.creditSystem = await portalServerRequest("/api/manage-member", {
        module: "credit",
        action: "adjust_balance",
        accountId: target.dataset.id,
        direction: modalRoot.querySelector("#credit-adjust-direction")?.value,
        amount: Number(modalRoot.querySelector("#credit-adjust-amount")?.value),
        reason: modalRoot.querySelector("#credit-adjust-reason")?.value || ""
      });
      closeModal(); showToast("Hesap bakiyesi güncellendi.", "success"); render();
    } catch (error) { showToast(error.message, "error"); target.disabled = false; }
    return;
  }
  if (action === "save-credit-settings") {
    event.preventDefault(); target.disabled = true;
    try {
      const roleAllowances = {};
      document.querySelectorAll("[data-credit-allowance]").forEach((input) => { roleAllowances[input.dataset.creditAllowance] = Number(input.value); });
      state.cache.creditSystem = await portalServerRequest("/api/manage-member", {
        module: "credit",
        action: "update_settings",
        transferTaxBasisPoints: Math.round(Number(document.querySelector("[data-credit-tax]").value) * 100),
        loanInterestBasisPoints: Math.round(Number(document.querySelector("[data-credit-interest]").value) * 100),
        maxLoanAmount: Number(document.querySelector("[data-credit-max-loan]").value),
        maxTermDays: Number(document.querySelector("[data-credit-max-term]").value),
        graceDays: Number(document.querySelector("[data-credit-grace]").value),
        weeklyAllowanceEnabled: document.querySelector("[data-credit-weekly]").checked,
        roleAllowances
      });
      showToast("Kredi sistemi ayarları kaydedildi.", "success"); render();
    } catch (error) { showToast(error.message, "error"); target.disabled = false; }
    return;
  }
  if (action === "open-credit-review") { event.preventDefault(); openCreditReview(target.dataset.id, target.dataset.decision); return; }
  if (action === "confirm-credit-review") {
    event.preventDefault(); target.disabled = true;
    try {
      state.cache.creditSystem = await portalServerRequest("/api/manage-member", { module: "credit", action: "review_loan", loanId: target.dataset.id, decision: target.dataset.decision, note: modalRoot.querySelector("#credit-decision-note")?.value || "" });
      closeModal(); showToast("Kredi başvurusu sonuçlandırıldı.", "success"); render();
    } catch (error) { showToast(error.message, "error"); target.disabled = false; }
    return;
  }
  if (action === "credit-report") {
    event.preventDefault(); target.disabled = true;
    try { await exportCreditReport(target.dataset.range || "24h"); showToast("Kredi raporu hazırlandı.", "success"); }
    catch (error) { showToast(error.message, "error"); }
    finally { target.disabled = false; }
    return;
  }
  return creditBaseHandleClick(event);
};

const creditBaseHandleFilter = handleFilter;
handleFilter = async function creditHandleFilter(event) {
  if (event.target.matches("[data-credit-open-purpose], [data-credit-open-consent]")) {
    const purpose = document.querySelector("[data-credit-open-purpose]")?.value || "";
    const accepted = Boolean(document.querySelector("[data-credit-open-consent]")?.checked);
    const button = document.querySelector('[data-action="credit-open-account"]');
    if (button) button.disabled = !(purpose && accepted);
    return;
  }
  if (event.target.matches("[data-credit-transfer-amount], [data-credit-recipient]")) {
    updateCreditTransferPreview();
    return;
  }
  return creditBaseHandleFilter(event);
};
