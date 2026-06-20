const IHP_CREDIT_ADMIN_V1 = true;
const CREDIT_PAGE_ID = "credit";

if (!navItems.some(([id]) => id === CREDIT_PAGE_ID)) {
  const settingsIndex = navItems.findIndex(([id]) => id === "settings");
  navItems.splice(settingsIndex < 0 ? navItems.length : settingsIndex, 0, [
    CREDIT_PAGE_ID,
    "Kredi Sistemi",
    "chart",
    () => hasRole("super_admin")
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
  if (page === CREDIT_PAGE_ID) return creditPage();
  return creditBaseRenderPortalPage(page);
};

const creditBaseLoadPage = loadPage;
loadPage = async function creditLoadPage(page) {
  if (page !== CREDIT_PAGE_ID) return creditBaseLoadPage(page);
  state.loading = true; state.pageError = null; render();
  try { state.cache.creditSystem = await portalServerRequest("/api/manage-member", { module: "credit", action: "admin_status" }); }
  catch (error) { state.pageError = { page, message: error.message }; }
  finally { state.loading = false; render(); }
};

const creditBaseHandleClick = handleClick;
handleClick = async function creditHandleClick(event) {
  const target = event.target.closest("[data-action]");
  const action = target?.dataset.action;
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
