const IHP_CREDIT_ADMIN_V1 = true;
const CREDIT_PAGE_ID = "credit";

function isCreditTestAccount(profile = state.profile) {
  return Boolean(profile?.credit_test_access);
}

function canAccessCreditSystem() {
  return hasRole("super_admin") || isCreditTestAccount();
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
  return state.cache.creditSystem || { settings: {}, accounts: [], profiles: [], loans: [], installments: [], transactions: [], cheques: [] };
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
    balance_forfeit: "Kapatılan hesap bakiyesi", admin_adjustment: "Admin düzeltmesi"
  })[kind] || kind;
}

function creditSettingsForm(settings) {
  const allowances = settings.role_allowances || {};
  return `
    <section class="panel glass credit-settings-panel">
      <div class="panel-head"><div><span class="panel-kicker">Admin ayarları</span><h3>Ekonomi kuralları</h3></div>${badge("Üyelere kapalı", "coral")}</div>
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
      <p class="credit-safety-note">Üye ekranı bu aşamada kapalıdır. Hesap ve işlem altyapısı hazır tutulur; Admin dışında hiç kimse bu bölümü göremez.</p>
    </section>
  `;
}

function creditLoanLabel(status) {
  return ({ pending: "Admin kararı bekliyor", approved: "Aktif kredi", rejected: "Reddedildi", paid: "Tamamlandı", delinquent: "Gecikmede" })[status] || status;
}

function creditMemberPage() {
  const data = creditData();
  const account = data.account;
  const settings = data.settings || {};
  if (!account) {
    return `
      <section class="page-head credit-head"><div><span class="eyebrow">İHP Kredi Sistemi</span><h2>Deneme hesabı hazırlanıyor.</h2><p>Kredi hesabı bulunamadı. Bu durum Admin tarafından düzeltilmelidir.</p></div></section>
      ${emptyCard("Kredi hesabı bulunamadı", "Lütfen Admin ile iletişime geçin.")}
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
    <section class="metrics-grid credit-metrics">
      ${metric("Kullanılabilir bakiye", Number(account.balance || 0).toLocaleString("tr-TR"), "İHP kredi", "wallet")}
      ${metric("Transfer vergisi", `%${taxRate.toLocaleString("tr-TR")}`, "Alıcı tutarına eklenir", "chart")}
      ${metric("Kredi faizi", `%${interestRate.toLocaleString("tr-TR")}`, `En fazla ${Number(settings.max_term_days || 30)} gün`, "briefcase")}
      ${metric("Açık taksit", dueInstallments.length, activeLoan ? creditLoanLabel(activeLoan.status) : "Aktif kredi yok", "inbox")}
    </section>
    <section class="credit-member-grid">
      <article class="panel glass credit-action-card">
        <div class="panel-head"><div><span class="panel-kicker">Hesaba gönder</span><h3>Kredi transferi</h3></div>${icon("arrow")}</div>
        <label>Alıcı hesap kodu<input class="field" data-credit-recipient maxlength="12" placeholder="IHP900000002" autocomplete="off" /></label>
        <label>Alıcıya gidecek tutar<input class="field" data-credit-transfer-amount type="number" min="1" max="1000000" placeholder="100" /></label>
        <p class="credit-card-note">Vergi ayrıca bakiyenizden kesilir. Yanlış hesaba yapılan transfer geri alınamaz.</p>
        <button class="btn btn-primary btn-sm" type="button" data-action="credit-member-transfer">Transferi tamamla</button>
      </article>
      <article class="panel glass credit-action-card">
        <div class="panel-head"><div><span class="panel-kicker">24 haneli güvence</span><h3>Çek işlemleri</h3></div>${icon("clipboard")}</div>
        <label>Çek tutarı<input class="field" data-credit-cheque-amount type="number" min="1" max="1000000" placeholder="100" /></label>
        <button class="btn btn-secondary btn-sm" type="button" data-action="credit-member-issue-cheque">Çek oluştur</button>
        <div class="credit-form-divider"><span>veya</span></div>
        <label>Çek kodu<input class="field" data-credit-cheque-code inputmode="numeric" maxlength="24" placeholder="24 haneli kod" autocomplete="off" /></label>
        <button class="btn btn-primary btn-sm" type="button" data-action="credit-member-redeem-cheque">Çeki hesaba aktar</button>
      </article>
      <article class="panel glass credit-action-card">
        <div class="panel-head"><div><span class="panel-kicker">Admin onaylı</span><h3>Kredi başvurusu</h3></div>${icon("briefcase")}</div>
        ${pendingLoan ? `<div class="credit-loan-banner">${badge("Bekliyor", "gold")}<strong>${creditAmount(pendingLoan.principal)}</strong><span>Başvuru Admin kararı bekliyor.</span></div>` : `
          <label>Talep edilen tutar<input class="field" data-credit-loan-amount type="number" min="1" max="${Number(settings.max_loan_amount || 5000)}" placeholder="500" /></label>
          <div class="form-grid"><label>Vade (gün)<input class="field" data-credit-loan-term type="number" min="1" max="${Number(settings.max_term_days || 30)}" value="30" /></label><label>Taksit sayısı<select class="field" data-credit-loan-installments><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></label></div>
          <button class="btn btn-primary btn-sm" type="button" data-action="credit-member-request-loan">Başvuruyu gönder</button>
        `}
      </article>
    </section>
    ${dueInstallments.length ? `<section class="panel glass"><div class="panel-head"><div><span class="panel-kicker">Ödeme planı</span><h3>Bekleyen taksitler</h3></div>${badge(String(dueInstallments.length), "gold")}</div><div class="credit-installment-list">${dueInstallments.map((item) => `<div><span><strong>${item.installment_no}. taksit</strong><small>Son tarih ${formatDate(item.due_at)}</small></span><b>${creditAmount(item.amount)}</b><button class="btn btn-secondary btn-sm" type="button" data-action="credit-member-pay-installment" data-id="${esc(item.id)}">Taksidi öde</button></div>`).join("")}</div></section>` : ""}
    <section class="panel glass"><div class="panel-head"><div><span class="panel-kicker">Hesap defteri</span><h3>Son hareketler</h3></div>${badge(`${(data.transactions || []).length} kayıt`, "blue")}</div>
      ${(data.transactions || []).length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Tarih</th><th>İşlem</th><th>Tutar</th><th>Son bakiye</th></tr></thead><tbody>${data.transactions.map((item) => `<tr><td>${formatDate(item.created_at, true)}</td><td>${esc(creditTransactionLabel(item.kind))}</td><td>${creditAmount(item.amount)}</td><td>${creditAmount(item.balance_after)}</td></tr>`).join("")}</tbody></table></div>` : emptyCard("Henüz hareket yok", "Kredi işlemleri burada listelenecek.")}
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
      ${data.transactions.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Tarih</th><th>Hesap sahibi</th><th>İşlem</th><th>Tutar</th><th>Son bakiye</th></tr></thead><tbody>${data.transactions.slice(0, 80).map((item) => { const member = creditMemberForAccount(item.account_id, data); return `<tr><td>${formatDate(item.created_at, true)}</td><td>${esc(member?.display_name || "Sistem hesabı")}</td><td>${esc(creditTransactionLabel(item.kind))}</td><td>${creditAmount(item.amount)}</td><td>${creditAmount(item.balance_after)}</td></tr>`; }).join("")}</tbody></table></div>` : emptyCard("İşlem kaydı yok", "Kredi sistemi açıldığında hareketler burada görünür.")}
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
