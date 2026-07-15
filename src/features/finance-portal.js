const IHP_FINANCE_PORTAL_V1 = true;
const FINANCE_PORTAL_ALLOWED_PAGES = new Set(["overview", "credit", "finance", "credit-management", "settings"]);

async function portalServerRequest(path, payload = {}) {
  return serverRequest(path, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

function isFinancePortalSystemAccount(profile = state.profile) {
  return Boolean(profile?.is_system_account);
}

function financePortalMemberAllowed() {
  return Boolean(state.profile) && !isFinancePortalSystemAccount();
}

function financePortalManagerAllowed() {
  return financePortalMemberAllowed() && canManageCreditSystem();
}

navItems.splice(
  0,
  navItems.length,
  ["overview", "Finans Merkezi", "wallet", () => true],
  ["credit", "Kredi İşlemleri", "wallet", financePortalMemberAllowed],
  ["finance", "İHP Finans", "chart", financePortalMemberAllowed],
  ["credit-management", "Görevli Paneli", "briefcase", financePortalManagerAllowed],
  ["settings", "Ayarlar", "settings", () => true]
);

function financePortalBrand() {
  const logo = state.cache.settings?.logo_url || "";
  const mark = logo
    ? `<span class="brand-mark"><img class="brand-logo-image" src="${esc(logo)}" alt="İHP logosu" /></span>`
    : `<span class="brand-mark brand-initials">İHP</span>`;
  return `
    <a class="brand premium-brand finance-site-brand" href="${state.profile ? "#/portal/overview" : "#/home"}" aria-label="İHP Finans ana sayfa">
      ${mark}
      <span class="brand-copy"><strong>İHP Finans</strong><span>Kredi ve portföy</span></span>
    </a>
  `;
}

brand = financePortalBrand;

function financePortalNetSummary() {
  const credit = creditData();
  const finance = financeData();
  const creditAccount = credit.account || null;
  const financeAccount = finance.account || null;
  const openLoans = (credit.loans || []).filter((item) => ["approved", "delinquent"].includes(item.status));
  const dueInstallments = (credit.installments || []).filter((item) => item.status !== "paid");
  const creditBalanceValue = Number(creditAccount?.balance || 0);
  const portfolioValue = financeAccount ? Number(finance.totals?.totalValue || 0) : 0;
  const loanDebt = openLoans.reduce((sum, item) => sum + Math.max(0, Number(item.total_due || 0) - Number(item.paid_amount || 0)), 0);
  const installmentDebt = dueInstallments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalDebt = Math.max(loanDebt, installmentDebt) + Number(finance.fee?.debt || 0);
  return {
    creditAccount,
    netValue: creditBalanceValue + portfolioValue - totalDebt,
    totalDebt
  };
}

function financePortalNavButton({ label, meta, iconName, pageId, target, currentPage, className = "" }) {
  const active = pageId && pageId === currentPage && !target;
  const attrs = target
    ? `data-action="finance-jump-section" data-page-target="${esc(pageId)}" data-target="${esc(target)}"`
    : `data-page="${esc(pageId)}"`;
  return `
    <button class="nav-item finance-nav-tab ${className} ${active ? "active" : ""}" type="button" ${attrs} ${active ? 'aria-current="page"' : ""}>
      <span>${icon(iconName)} <b>${esc(label)}<small>${esc(meta)}</small></b></span>
    </button>
  `;
}

navSection = function financePortalNavSection(page) {
  const memberAllowed = financePortalMemberAllowed();
  const summary = financePortalNetSummary();
  return `
    <section class="nav-group finance-nav-status" aria-label="Durumum">
      <p class="nav-section-label">Durumum</p>
      ${financePortalNavButton({ label: "Net Durum", meta: summary.creditAccount ? `${creditAmount(summary.netValue)} net` : "Hesap özeti", iconName: "activity", pageId: "overview", currentPage: page })}
    </section>
    <section class="nav-group finance-nav-credit" aria-label="Kredi işlemleri">
      <p class="nav-section-label">Kredi İşleri</p>
      ${memberAllowed ? financePortalNavButton({ label: "Para Transferleri", meta: "Gönderim ve planlı transfer", iconName: "arrow", pageId: "credit", target: "finance-transfer-section", currentPage: page }) : ""}
      ${memberAllowed ? financePortalNavButton({ label: "Borçlar", meta: "Kredi ve taksit takibi", iconName: "wallet", pageId: "credit", target: "finance-debts-section", currentPage: page }) : ""}
      ${memberAllowed ? financePortalNavButton({ label: "İstekler", meta: "Oyun ve işlem onayları", iconName: "bell", pageId: "credit", target: "finance-approvals-section", currentPage: page }) : ""}
    </section>
    ${memberAllowed ? `
      <section class="nav-group finance-nav-market" aria-label="Borsa ve finans">
        <p class="nav-section-label">Borsa ve Finans</p>
        ${financePortalNavButton({ label: "Borsa ve Finans", meta: "Grafik, portföy ve al-sat", iconName: "chart", pageId: "finance", currentPage: page, className: "finance-market-link" })}
      </section>
    ` : ""}
    <section class="nav-group finance-nav-system" aria-label="Sistem">
      <p class="nav-section-label">Sistem</p>
      ${financePortalManagerAllowed() ? financePortalNavButton({ label: "Görevli Paneli", meta: "Başvuru ve bakiye yönetimi", iconName: "briefcase", pageId: "credit-management", currentPage: page }) : ""}
      ${financePortalNavButton({ label: "Ayarlar", meta: "Profil ve oturum", iconName: "settings", pageId: "settings", currentPage: page })}
    </section>
  `;
};

function financePortalAccessBlocked() {
  return `
    <section class="page-state page-state-error glass">
      <span class="state-icon">${icon("lock")}</span>
      <div>
        <strong>Bu hesap finans sistemine açık değil</strong>
        <p>İHP Finans yalnızca gerçek üye hesaplarıyla kullanılabilir. Kredi ve portföy işlemleri sistem hesaplarına kapalıdır.</p>
      </div>
      <button class="btn btn-secondary btn-sm" type="button" data-action="logout">Oturumu kapat</button>
    </section>
  `;
}

function financePortalOverviewPage() {
  if (isFinancePortalSystemAccount()) return financePortalAccessBlocked();
  const credit = creditData();
  const finance = financeData();
  const creditBalance = credit.account ? creditAmount(credit.account.balance) : "Hesap yok";
  const financeValue = finance.account ? creditAmount(finance.totals?.totalValue || 0) : "Hesap yok";
  const fee = finance.fee || {};
  return `
    <section class="page-head finance-head">
      <div>
        <span class="eyebrow">İHP Finans</span>
        <h2>Kredi ve portföy işlemleri.</h2>
        <p>Kredi hesabınızı, sanal portföyünüzü ve yetkili finans yönetimini bu ayrı merkezden yönetin.</p>
      </div>
      <span class="finance-virtual-chip">${icon("shield")} Bağlı sistem</span>
    </section>
    <section class="finance-value-stage">
      <article class="finance-total-card glass">
        <span>Kredi hesabı</span>
        <strong>${esc(creditBalance)}</strong>
        <small>${credit.account?.account_code ? esc(credit.account.account_code) : "HESAP DURUMU"}</small>
        <div><span>İşlem merkezi</span><span>Çek, transfer ve kredi başvurusu</span></div>
      </article>
      <div class="finance-value-metrics">
        <article><span>Yatırım değeri</span><strong>${esc(financeValue)}</strong><small>İHP Finans portföyü</small></article>
        <article><span>Haftalık kesinti</span><strong>${creditAmount(fee.weeklyEstimate || 0)}</strong><small>${fee.nextChargeAt ? `Sonraki: ${formatDate(fee.nextChargeAt, true)}` : "Onay sonrası başlar"}</small></article>
        <article><span>Görevli paneli</span><strong>${financePortalManagerAllowed() ? "Açık" : "Kapalı"}</strong><small>Kredi işleri yetkisine göre görünür</small></article>
      </div>
    </section>
    <section class="finance-actions-grid finance-portal-actions">
      <button class="quick-card glass" type="button" data-page="credit">${icon("wallet")}<strong>Kredi İşlemleri</strong><span>Transfer, çek ve borç işlemleri</span></button>
      <button class="quick-card glass" type="button" data-page="finance">${icon("chart")}<strong>İHP Finans</strong><span>Piyasa, portföy ve al-sat işlemleri</span></button>
      ${
        financePortalManagerAllowed()
          ? `<button class="quick-card glass" type="button" data-page="credit-management">${icon("briefcase")}<strong>Görevli Paneli</strong><span>Hesap, başvuru ve bakiye yönetimi</span></button>`
          : ""
      }
    </section>
  `;
}

const financePortalBaseRenderPortalPage = renderPortalPage;
renderPortalPage = function financePortalRenderPortalPage(page) {
  if (page === "overview") return financePortalOverviewPage();
  if (!FINANCE_PORTAL_ALLOWED_PAGES.has(page)) return financePortalOverviewPage();
  return financePortalBaseRenderPortalPage(page);
};

const financePortalBaseLoadPage = loadPage;
loadPage = async function financePortalLoadPage(page) {
  if (!FINANCE_PORTAL_ALLOWED_PAGES.has(page)) return financePortalBaseLoadPage("overview");
  if (page !== "overview") {
    try {
      return await financePortalBaseLoadPage(page);
    } finally {
      if (financePortalPendingSection && page === (route().split("/")[1] || "overview")) {
        const pending = financePortalPendingSection;
        financePortalPendingSection = null;
        setTimeout(() => financePortalScrollToSection(pending), 80);
      }
    }
  }
  state.loading = true;
  state.pageError = null;
  render();
  try {
    if (financePortalMemberAllowed()) {
      const [creditStatus, financeStatus] = await Promise.allSettled([
        portalServerRequest("/api/manage-member", { module: "credit", action: "member_status" }),
        portalServerRequest("/api/manage-member", { module: "finance", action: "status", symbol: CREDIT_MARKET_DEFAULT_SYMBOL, range: financeMarketRange() })
      ]);
      if (creditStatus.status === "fulfilled") state.cache.creditSystem = creditStatus.value;
      if (financeStatus.status === "fulfilled") financeApplyStatus(financeStatus.value);
    }
    await loadNotifications().then((rows) => { state.cache.notifications = rows; }).catch(() => {});
  } catch (error) {
    state.pageError = { page, message: error.message || "Finans merkezi yüklenemedi." };
  } finally {
    state.loading = false;
    render();
    if (financePortalPendingSection && page === (route().split("/")[1] || "overview")) {
      const pending = financePortalPendingSection;
      financePortalPendingSection = null;
      setTimeout(() => financePortalScrollToSection(pending), 80);
    }
  }
};

const financePortalBasePublicPage = publicPage;
publicPage = function financePortalPublicPage() {
  return `
    <main class="premium-public-shell finance-public-shell">
      <nav class="site-nav">${brand()}<div class="nav-links"><button class="btn btn-primary btn-sm" data-action="nav-login">${icon("lock")} Giriş Yap</button></div></nav>
      <section class="premium-hero">
        <div class="hero-copy">
          <span class="eyebrow">Kredi ve portföy merkezi</span>
          <h1>İHP<br /><span>Finans.</span></h1>
          <p>Kredi hesabı, sanal portföy ve görevli finans yönetimi ayrı ve sade bir çalışma alanında.</p>
          <div class="hero-actions"><button class="btn btn-primary" data-action="nav-login">Finans sistemine gir ${icon("arrow")}</button></div>
        </div>
        <div class="premium-product-preview glass" aria-label="İHP Finans ön izlemesi">
          <div class="preview-chrome"><i></i><i></i><i></i><span>İHP Finans</span></div>
          <div class="preview-grid">
            <article><span>KREDİ</span><strong>Hesap</strong></article>
            <article><span>PORTFÖY</span><strong>Canlı</strong></article>
            <article><span>YÖNETİM</span><strong>Yetkili</strong></article>
            <article><span>KESİNTİ</span><strong>%10</strong></article>
          </div>
        </div>
      </section>
    </main>
  `;
};

const financePortalBaseLoginPage = loginPage;
loginPage = function financePortalLoginPage() {
  return financePortalBaseLoginPage()
    .replaceAll("İHP Portalı", "İHP Finans")
    .replace("Portal hesabınızı kullanın.", "Finans ve kredi hesabınıza giriş yapın.")
    .replace("Portal erişimi.", "Finans erişimi.");
};
function financePortalNotifications(rows = state.cache.notifications || []) {
  const keywords = ["kredi", "finans", "transfer", "çek", "cek", "borç", "borc", "taksit", "oyun", "snake", "flappy", "kazı", "kazan", "portföy", "yatırım"];
  return rows.filter((item) => {
    const category = String(item.category || "").toLocaleLowerCase("tr");
    const text = `${item.title || ""} ${item.body || ""} ${category}`.toLocaleLowerCase("tr");
    return ["credit", "finance", "game", "market"].includes(category) || keywords.some((word) => text.includes(word));
  });
}

const financePortalBaseOpenNotifications = openNotifications;
openNotifications = function financePortalOpenNotifications() {
  const original = state.cache.notifications || [];
  state.cache.notifications = financePortalNotifications(original);
  try {
    return financePortalBaseOpenNotifications();
  } finally {
    state.cache.notifications = original;
  }
};

let financePortalPendingSection = null;

function financePortalCloseSidebar() {
  state.sidebarOpen = false;
  document.querySelector(".finance-terminal-sidebar")?.classList.remove("open");
  document.querySelector(".mobile-backdrop")?.classList.remove("open");
}

function financePortalSectionElement(key) {
  const fallbackSelectors = {
    "finance-transfer-section": ".finance-hub-layout > .finance-hub-section:nth-of-type(1)",
    "finance-scheduled-section": ".credit-scheduled-panel",
    "finance-debts-section": ".finance-hub-layout > .finance-hub-section:nth-of-type(2)",
    "finance-cheques-section": ".finance-hub-layout > .finance-hub-section:nth-of-type(3)",
    "finance-ledger-section": ".finance-terminal-content > .finance-hub-section:last-of-type"
  };
  return document.getElementById(key) || document.querySelector(fallbackSelectors[key] || "");
}

function financePortalScrollToSection(key) {
  const section = financePortalSectionElement(key);
  section?.scrollIntoView({ behavior: "smooth", block: "start" });
  financePortalCloseSidebar();
}

function financePortalSidebarPanel(page) {
  const credit = creditData();
  const finance = financeData();
  const creditAccount = credit.account || null;
  const financeAccount = finance.account || null;
  const requests = (credit.gameRequests || []).filter((item) => ["pending", "approved"].includes(item.status));
  const openLoans = (credit.loans || []).filter((item) => ["pending", "approved", "delinquent"].includes(item.status));
  const activeLoans = openLoans.filter((item) => ["approved", "delinquent"].includes(item.status));
  const dueInstallments = (credit.installments || []).filter((item) => item.status !== "paid");
  const scheduledTransfers = (credit.scheduledTransfers || []).filter((item) => item.status === "scheduled");
  const financePositions = finance.positions || [];
  const creditBalanceValue = Number(creditAccount?.balance || 0);
  const portfolioValue = financeAccount ? Number(finance.totals?.totalValue || 0) : 0;
  const loanDebt = activeLoans.reduce((sum, item) => sum + Math.max(0, Number(item.total_due || 0) - Number(item.paid_amount || 0)), 0);
  const installmentDebt = dueInstallments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const financeFeeDebt = Number(finance.fee?.debt || 0);
  const totalDebt = Math.max(loanDebt, installmentDebt) + financeFeeDebt;
  const grossValue = creditBalanceValue + portfolioValue;
  const netValue = grossValue - totalDebt;

  return `
    <section class="finance-side-panel" aria-label="Finans durum ozeti">
      <div class="finance-side-status">
        <span>Durumum</span>
        <strong class="${netValue < 0 ? "negative" : "positive"}">${creditAmount(netValue)}</strong>
        <small>Varlik ${creditAmount(grossValue)} - Borc ${creditAmount(totalDebt)}</small>
      </div>
      <div class="finance-side-ledger">
        <article><span>Kredi</span><strong>${creditAccount ? creditAmount(creditAccount.balance) : "Yok"}</strong></article>
        <article><span>Portfoy</span><strong>${financeAccount ? creditAmount(finance.totals?.totalValue || 0) : "Kapali"}</strong></article>
        <article><span>Net</span><strong class="${netValue < 0 ? "negative" : "positive"}">${creditAmount(netValue)}</strong></article>
        <article><span>Borc</span><strong>${creditAmount(totalDebt)}</strong></article>
        <article><span>Istek</span><strong>${requests.length}</strong></article>
        <article><span>Planli</span><strong>${scheduledTransfers.length}</strong></article>
      </div>
    </section>
  `;
}

const financePortalBaseHandleClick = handleClick;
handleClick = async function financePortalHandleClick(event) {
  const pageTarget = event.target.closest("[data-page]");
  if (pageTarget && pageTarget.closest(".finance-terminal-sidebar")) {
    state.sidebarOpen = false;
  }
  const target = event.target.closest("[data-action]");
  const action = target?.dataset.action;
  if (action === "finance-jump-section") {
    event.preventDefault();
    const targetPage = target.dataset.pageTarget || "credit";
    const targetSection = target.dataset.target || "";
    const currentPage = route().split("/")[1] || "overview";
    if (targetPage !== currentPage) {
      financePortalPendingSection = targetSection;
      financePortalCloseSidebar();
      navigate(`portal/${targetPage}`);
      return;
    }
    financePortalScrollToSection(targetSection);
    return;
  }
  if (action === "finance-section") {
    event.preventDefault();
    const key = target.dataset.target || "";
    financePortalScrollToSection(key);
    return;
  }
  if (action === "mark-all-notifications") {
    event.preventDefault();
    const unread = financePortalNotifications(state.cache.notifications || []).filter((item) => !item.read_at);
    await Promise.all(unread.map((item) => updateRecord("notifications", item.id, { read_at: new Date().toISOString() })));
    state.cache.notifications = financePortalNotifications(await loadNotifications().catch(() => []));
    openNotifications();
    return;
  }
  return financePortalBaseHandleClick(event);
};

portalShell = function financePortalShell(page) {
  const profile = state.profile;
  const notifications = financePortalNotifications(state.cache.notifications || []);
  const unread = notifications.filter((item) => !item.read_at).length;
  return `
    <div class="app-shell premium-app-shell finance-terminal-shell">
      <aside class="sidebar finance-terminal-sidebar ${state.sidebarOpen ? "open" : ""}" aria-label="İHP Finans menüsü">
        <div class="sidebar-head">${brand()}</div>
        <nav class="app-nav">${navSection(page)}</nav>
        <div class="sidebar-bottom finance-terminal-account">
          <button class="side-profile" type="button" data-page="settings" aria-label="Profil ayarlarını aç">
            ${avatar(profile)}
            <span><strong>${esc(profile.display_name)}</strong><small>${esc(profile.email || "Finans hesabı")}</small></span>
          </button>
          <button class="nav-item logout-item" type="button" data-action="logout">${icon("logout")} <b>Çıkış Yap</b></button>
        </div>
      </aside>
      <button class="mobile-backdrop ${state.sidebarOpen ? "open" : ""}" type="button" data-action="close-sidebar" aria-label="Menüyü kapat"></button>
      <main class="app-main finance-terminal-main">
        <header class="topbar finance-terminal-topbar">
          <div class="topbar-left">
            <button class="icon-btn mobile-menu-btn" type="button" data-action="toggle-sidebar" aria-label="Menüyü aç">${icon("menu")}</button>
            <div><span class="topbar-kicker">İHP / Finans</span><h1>${esc(pageName(page))}</h1></div>
          </div>
          <div class="top-actions">
            <button class="icon-btn notification-btn" type="button" data-action="open-notifications" aria-label="Finans bildirimlerini aç">
              ${icon("bell")}${unread ? `<span class="notification-count">${esc(unread)}</span>` : ""}
            </button>
            <button class="profile-chip" type="button" data-page="settings">${avatar(profile)}<span>${esc(profile.display_name)}</span></button>
          </div>
        </header>
        <div class="app-content finance-terminal-content" id="main-content">${premiumPageBody(page)}</div>
      </main>
    </div>
  `;
};

financePortalOverviewPage = function financeTerminalOverviewPage() {
  if (isFinancePortalSystemAccount()) return financePortalAccessBlocked();
  const credit = creditData();
  const finance = financeData();
  const requests = (credit.gameRequests || []).filter((item) => ["pending", "approved"].includes(item.status));
  const creditBalance = credit.account ? creditAmount(credit.account.balance) : "Hesap yok";
  const financeValue = finance.account ? creditAmount(finance.totals?.totalValue || 0) : "Hesap yok";
  const debtCount = (credit.loans || []).filter((item) => ["pending", "approved", "delinquent"].includes(item.status)).length;
  return `
    <section class="finance-terminal-hero">
      <div>
        <span class="finance-terminal-kicker">İHP Finans</span>
        <h2>Hesap, borç ve piyasa merkezi</h2>
        <p>Kredi hesabı, yatırım portföyü, oyun istekleri ve görevli işlemleri tek finans ekranında ayrılır.</p>
      </div>
      <div class="finance-terminal-tape" aria-label="Finans özetleri">
        <span><b>${esc(creditBalance)}</b><small>Kredi hesabı</small></span>
        <span><b>${esc(financeValue)}</b><small>Portföy</small></span>
        <span><b>${requests.length}</b><small>İstek</small></span>
        <span><b>${debtCount}</b><small>Borç</small></span>
      </div>
    </section>
    <section class="finance-terminal-grid">
      <button class="finance-terminal-card" type="button" data-page="credit">${icon("wallet")}<strong>Kredi İşlemleri</strong><span>Transfer, çek, borç ve istekler</span></button>
      <button class="finance-terminal-card" type="button" data-page="finance">${icon("chart")}<strong>İHP Finans</strong><span>Grafik, portföy ve al-sat</span></button>
      ${
        financePortalManagerAllowed()
          ? `<button class="finance-terminal-card" type="button" data-page="credit-management">${icon("briefcase")}<strong>Görevli Paneli</strong><span>Başvuru ve bakiye yönetimi</span></button>`
          : ""
      }
    </section>
  `;
};

function financeModuleButton(target, label, meta, count = null) {
  return `
    <button class="finance-module-tab" type="button" data-action="finance-section" data-target="${esc(target)}">
      <span>${esc(label)}</span>
      <small>${esc(meta)}</small>
      ${count === null ? "" : `<b>${esc(String(count))}</b>`}
    </button>
  `;
}

function financeCreditModuleNav({ requestCount = 0, transferCount = 0, scheduledCount = 0, debtCount = 0, transactionCount = 0 } = {}) {
  return `
    <section class="finance-module-nav" aria-label="Kredi işlemleri">
      ${financeModuleButton("finance-approvals-section", "Onaylar", "Oyun ve işlem istekleri", requestCount)}
      ${financeModuleButton("finance-transfer-section", "Para Transferleri", "Anlık veya planlı gönderim", transferCount)}
      ${financeModuleButton("finance-scheduled-section", "Planlı Transferler", "İleri tarihli gönderimler", scheduledCount)}
      ${financeModuleButton("finance-debts-section", "Borçlar", "Başvuru ve taksitler", debtCount)}
      ${financeModuleButton("finance-cheques-section", "Çek İşlemleri", "PDF çek ve kod girişi")}
      ${financeModuleButton("finance-ledger-section", "Hesap Defteri", "Tüm hareketler", transactionCount)}
    </section>
  `;
}

function financeCreditUnavailableSection(id, title, subtitle, body, iconName = "wallet") {
  return `
    <section class="finance-module-section finance-disabled-module" id="${esc(id)}">
      <div class="finance-module-title">
        <span>${icon(iconName)}</span>
        <div><small>${esc(subtitle)}</small><h3>${esc(title)}</h3></div>
      </div>
      <p>${esc(body)}</p>
    </section>
  `;
}

function financeCreditNoAccountPage(data) {
  const requests = (data.gameRequests || []).filter((item) => ["pending", "approved"].includes(item.status));
  return `
    <section class="finance-credit-header">
      <div>
        <span class="finance-label">KREDİ MERKEZİ</span>
        <h2>Kredi hesabı açılmadı</h2>
        <p>Hesap açıldıktan sonra transfer, borç, çek ve onay işlemleri ayrı bölümlerde aktif olur.</p>
      </div>
      <div class="finance-command-balance">
        <small>Hesap durumu</small>
        <strong>Kapalı</strong>
        <span>Onay bekliyor</span>
      </div>
    </section>
    ${financeCreditModuleNav({ requestCount: requests.length })}
    <section class="finance-module-section finance-open-account-section">
      <div class="finance-module-title">
        <span>${icon("wallet")}</span>
        <div><small>HESAP AÇILIŞI</small><h3>Kredi hesabını aç</h3></div>
      </div>
      <div class="finance-open-account-grid">
        <div class="finance-compact-form">
          <label>Ad soyad<input class="field" value="${esc(state.profile?.display_name || "")}" readonly /></label>
          <label>Portal e-postası<input class="field" value="${esc(state.profile?.email || "")}" readonly /></label>
          <label>Hesabı kullanma amacı<select class="field" data-credit-open-purpose><option value="">Seçiniz</option><option value="general">Genel kullanım</option><option value="transfer">Para transferi</option><option value="cheque">Çek işlemleri</option><option value="saving">Bakiye biriktirme</option></select></label>
          <label class="credit-opening-consent"><input type="checkbox" data-credit-open-consent /><span>Bilgilerimin doğru olduğunu ve transfer, çek ve borç işlemlerinin portal kurallarına tabi olduğunu kabul ediyorum.</span></label>
          <button class="btn btn-primary" type="button" data-action="credit-open-account" disabled>Hesabı aç ${icon("arrow")}</button>
        </div>
        <aside>
          <strong>İHP hesap kodu</strong>
          <p>Onaydan sonra size benzersiz İHP hesap kodu verilir. Para transferi kişiye değil bu hesap koduna yapılır.</p>
        </aside>
      </div>
    </section>
    ${financeCreditRequestsSection(data)}
    ${financeCreditUnavailableSection("finance-transfer-section", "Para Transferleri", "TRANSFER", "Hesap açıldıktan sonra anlık veya planlı kredi gönderebilirsiniz.", "arrow")}
    ${financeCreditUnavailableSection("finance-debts-section", "Borçlar", "BORÇ", "Kredi başvurusu ve taksit ödemeleri hesap açıldıktan sonra burada görünür.", "briefcase")}
    ${financeCreditUnavailableSection("finance-cheques-section", "Çek İşlemleri", "ÇEK", "PDF çek oluşturma ve 24 haneli kod girişi hesap açıldıktan sonra aktif olur.", "clipboard")}
    ${financeCreditUnavailableSection("finance-ledger-section", "Hesap Defteri", "HAREKETLER", "Kredi hareketleri hesap açıldıktan sonra burada listelenir.", "activity")}
  `;
}

function financeCreditRequestsSection(data) {
  const requests = (data.gameRequests || []).filter((item) => ["pending", "approved"].includes(item.status));
  return `
    <section class="finance-module-section finance-request-section" id="finance-approvals-section">
      <div class="finance-module-title">
        <span>${icon("sparkles")}</span>
        <div><small>ONAY MERKEZİ</small><h3>Onaylar</h3></div>
        ${badge(String(requests.length), requests.length ? "gold" : "gray")}
      </div>
      <div class="panel-head"><div><span class="panel-kicker">İstekler</span><h3>Onay bekleyen işlemler</h3></div>${badge(String(requests.length), requests.length ? "gold" : "gray")}</div>
      ${
        requests.length
          ? `<div class="finance-request-list">${requests.map((item) => `
              <article>
                <span class="finance-request-icon">${icon("sparkles")}</span>
                <div><strong>${esc(creditGameName(item.game_key))}</strong><p>${item.status === "pending" ? `${Number(item.credit_amount).toLocaleString("tr-TR")} kredi çekmek istiyor.` : `${Number(item.credit_amount).toLocaleString("tr-TR")} kredi onaylandı; oyun başlatılabilir.`}</p></div>
                ${item.status === "pending" ? `<div class="table-actions"><button class="table-action success" type="button" data-action="approve-game-charge" data-id="${esc(item.id)}">Onayla</button><button class="table-action danger" type="button" data-action="reject-game-charge" data-id="${esc(item.id)}">Reddet</button></div>` : `<button class="btn btn-primary btn-sm" type="button" data-page="games">Oyuna dön</button>`}
              </article>`).join("")}</div>`
          : emptyCard("Bekleyen istek yok", "Oyun veya kredi onayı geldiğinde bu bölümde görünür.")
      }
    </section>
  `;
}

function financeCreditMemberPage() {
  const data = creditData();
  const account = data.account;
  if (!account) return financeCreditNoAccountPage(data);
  const settings = data.settings || {};
  const pendingLoan = (data.loans || []).find((item) => item.status === "pending");
  const activeLoan = (data.loans || []).find((item) => ["approved", "delinquent"].includes(item.status));
  const dueInstallments = (data.installments || []).filter((item) => item.status !== "paid");
  const loansById = creditLoanMap(data);
  const scheduledTransfers = data.scheduledTransfers || [];
  const pendingTransfers = scheduledTransfers.filter((item) => item.status === "scheduled");
  const requestCount = (data.gameRequests || []).filter((item) => ["pending", "approved"].includes(item.status)).length;
  const debtCount = (pendingLoan ? 1 : 0) + (activeLoan ? 1 : 0) + dueInstallments.length;
  const taxRate = Number(settings.transfer_tax_basis_points || 0) / 100;
  const interestRate = Number(settings.loan_interest_basis_points || 0) / 100;
  return `
    <section class="finance-credit-header">
      <div>
        <span class="finance-label">KREDI MERKEZI</span>
        <h2>Kredi hesabim</h2>
        <p>Onaylar, para transferi, borclar, cek islemleri ve hesap hareketleri ayri bolumlerde yonetilir.</p>
      </div>
      <div class="finance-command-balance">
        <small>Kullanilabilir bakiye</small>
        <strong>${Number(account.balance || 0).toLocaleString("tr-TR")}</strong>
        <span>${esc(account.account_code)}</span>
      </div>
    </section>
    ${financeCreditModuleNav({
      requestCount,
      transferCount: pendingTransfers.length,
      debtCount,
      transactionCount: (data.transactions || []).length
    })}
    <section class="finance-hub-head">
      <article class="finance-balance-black">
        <span>Kullanılabilir bakiye</span>
        <strong>${Number(account.balance || 0).toLocaleString("tr-TR")}</strong>
        <small>${esc(account.account_code)}</small>
      </article>
      <div class="finance-hub-metrics">
        <article><span>Transfer vergisi</span><strong>%${taxRate.toLocaleString("tr-TR")}</strong></article>
        <article><span>Kredi faizi</span><strong>%${interestRate.toLocaleString("tr-TR")}</strong></article>
        <article><span>Açık taksit</span><strong>${dueInstallments.length}</strong><small>${activeLoan ? creditLoanLabel(activeLoan.status) : "Aktif borç yok"}</small></article>
        <article><span>Sonraki ödeme</span><strong>${settings.weekly_allowance_enabled && settings.weekly_allowance_next_at ? formatDate(settings.weekly_allowance_next_at, true) : "Planlanmadı"}</strong></article>
      </div>
    </section>
    <div class="finance-hub-layout">
      ${financeCreditRequestsSection(data)}
      <section class="panel glass finance-hub-section">
        <div class="panel-head"><div><span class="panel-kicker">Para aktarımı</span><h3>Kredi transferi</h3></div>${badge("Vergi önizleme", "blue")}</div>
        <div class="finance-compact-form">
          <label>Alıcı hesap kodu<input class="field" data-credit-recipient maxlength="12" placeholder="IHP900000002" autocomplete="off" /></label>
          <label>Alıcıya gidecek tutar<input class="field" data-credit-transfer-amount type="number" min="1" max="1000000" placeholder="100" /></label>
          <label>Açıklama <span class="field-hint">İsteğe bağlı</span><textarea class="field textarea credit-transfer-description" data-credit-transfer-description maxlength="160" placeholder="Ödeme açıklaması"></textarea></label>
          <div class="credit-delivery-choice" role="group" aria-label="Gönderim zamanı">
            <label><input type="radio" name="credit-delivery" value="now" data-credit-delivery checked /><span>Şimdi</span></label>
            <label><input type="radio" name="credit-delivery" value="scheduled" data-credit-delivery /><span>Planla</span></label>
          </div>
          <label class="credit-schedule-field" data-credit-schedule-field hidden>Gönderim tarihi ve saati<input class="field" data-credit-scheduled-for type="datetime-local" min="${creditDateTimeLocalValue(new Date(Date.now() + 60_000))}" value="${creditDateTimeLocalValue(new Date(Date.now() + 60 * 60 * 1000))}" /></label>
          <div class="credit-transfer-preview" data-credit-transfer-preview><span>Alıcıya <b>0 kredi</b></span><span>Vergi <b>0 kredi</b></span><strong>Toplam kesinti <b>0 kredi</b></strong></div>
          <p class="credit-card-note" data-credit-delivery-note>Yanlış hesaba yapılan anlık transfer geri alınamaz.</p>
          <button class="btn btn-primary btn-sm" type="button" data-action="credit-member-transfer" disabled>Transferi tamamla</button>
        </div>
      </section>
      <section class="panel glass finance-hub-section">
        <div class="panel-head"><div><span class="panel-kicker">Borçlar</span><h3>Kredi ve taksitler</h3></div>${badge(activeLoan ? "Aktif" : pendingLoan ? "Bekliyor" : "Temiz", activeLoan ? "gold" : pendingLoan ? "blue" : "green")}</div>
        ${
          pendingLoan
            ? `<div class="credit-loan-banner">${badge("Bekliyor", "gold")}<strong>${creditAmount(pendingLoan.principal)}</strong><span>Başvuru kararı bekliyor.</span></div>`
            : `<div class="finance-compact-form">
                <label>Talep edilen tutar<input class="field" data-credit-loan-amount type="number" min="1" max="${Number(settings.max_loan_amount || 5000)}" placeholder="500" /></label>
                <div class="form-grid"><label>Vade (gün)<input class="field" data-credit-loan-term type="number" min="1" max="${Number(settings.max_term_days || 30)}" value="30" /></label><label>Taksit sayısı<select class="field" data-credit-loan-installments><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></label></div>
                <button class="btn btn-primary btn-sm" type="button" data-action="credit-member-request-loan">Borç başvurusu gönder</button>
              </div>`
        }
        ${dueInstallments.length ? `<div class="credit-installment-list finance-installments">${dueInstallments.map((item) => {
          const loan = loansById.get(item.loan_id) || {};
          return `<div><span><strong>${esc(creditLoanDisplayName(loan))} · ${item.installment_no}. taksit</strong><small>Son tarih ${formatDate(item.due_at)}</small></span><b>${creditAmount(item.amount)}</b><button class="btn btn-secondary btn-sm" type="button" data-action="credit-member-pay-installment" data-id="${esc(item.id)}">Öde</button></div>`;
        }).join("")}</div>` : ""}
      </section>
      <section class="panel glass finance-hub-section">
        <div class="panel-head"><div><span class="panel-kicker">Çek işlemleri</span><h3>24 haneli kod</h3></div>${icon("clipboard")}</div>
        <div class="finance-compact-form">
          <label>Çek tutarı<input class="field" data-credit-cheque-amount type="number" min="1" max="1000000" placeholder="100" /></label>
          <button class="btn btn-secondary btn-sm" type="button" data-action="credit-member-issue-cheque">PDF çek oluştur</button>
          <div class="credit-form-divider"><span>veya</span></div>
          <label>Çek kodu<input class="field" data-credit-cheque-code inputmode="numeric" maxlength="24" placeholder="24 haneli kod" autocomplete="off" /></label>
          <button class="btn btn-primary btn-sm" type="button" data-action="credit-member-redeem-cheque">Çeki hesaba aktar</button>
        </div>
      </section>
    </div>
    ${scheduledTransfers.length ? `<section class="panel glass credit-scheduled-panel"><div class="panel-head"><div><span class="panel-kicker">Planlı transferler</span><h3>Transfer takvimi</h3></div>${badge(`${pendingTransfers.length} bekleyen`, pendingTransfers.length ? "gold" : "gray")}</div><div class="credit-scheduled-list">${scheduledTransfers.map((item) => `<article class="credit-scheduled-item ${esc(item.status)}"><span class="credit-scheduled-orb">${icon(item.status === "completed" ? "check" : item.status === "cancelled" || item.status === "failed" ? "x" : "history")}</span><div><strong>${creditAmount(item.amount)} · ${esc(item.recipient_account_code)}</strong><p>${item.description ? esc(item.description) : "Açıklama yok"}</p><small>${formatDate(item.scheduled_for, true)} · Vergi ${creditAmount(item.tax)}</small></div><div class="credit-scheduled-actions">${badge(creditScheduledTransferStatus(item.status), item.status === "completed" ? "green" : item.status === "scheduled" ? "gold" : "gray")}${item.status === "scheduled" ? `<button class="table-action danger" type="button" data-action="credit-cancel-scheduled-transfer" data-id="${esc(item.id)}">İptal et</button>` : ""}</div></article>`).join("")}</div></section>` : ""}
    <section class="panel glass finance-hub-section">
      <div class="panel-head"><div><span class="panel-kicker">Hesap defteri</span><h3>Son hareketler</h3></div>${badge(`${(data.transactions || []).length} kayıt`, "blue")}</div>
      ${(data.transactions || []).length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Tarih</th><th>İşlem</th><th>Açıklama</th><th>Tutar</th><th>Son bakiye</th></tr></thead><tbody>${data.transactions.map((item) => `<tr><td>${formatDate(item.created_at, true)}</td><td>${creditTransactionKindMarkup(item)}</td><td><span class="credit-ledger-description">${esc(item.metadata?.description || "—")}</span></td><td>${creditTransactionAmountMarkup(item)}</td><td>${creditAmount(item.balance_after)}</td></tr>`).join("")}</tbody></table></div>` : emptyCard("Henüz hareket yok", "Kredi işlemleri burada listelenecek.")}
    </section>
  `;
}

const financePortalBaseCreditMemberPage = creditMemberPage;
creditMemberPage = financeCreditMemberPage;

function financeSectionShell(id, eyebrow, title, iconName, body, aside = "") {
  return `
    <section class="finance-split-section" id="${esc(id)}">
      <header class="finance-split-head">
        <span class="finance-split-icon">${icon(iconName)}</span>
        <div><small>${eyebrow}</small><h3>${title}</h3></div>
        ${aside}
      </header>
      <div class="finance-split-body">${body}</div>
    </section>
  `;
}

function financeCreditMemberPageSeparated() {
  const data = creditData();
  const account = data.account;
  if (!account) return financeCreditNoAccountPage(data);
  const settings = data.settings || {};
  const pendingLoan = (data.loans || []).find((item) => item.status === "pending");
  const activeLoan = (data.loans || []).find((item) => ["approved", "delinquent"].includes(item.status));
  const dueInstallments = (data.installments || []).filter((item) => item.status !== "paid");
  const loansById = creditLoanMap(data);
  const scheduledTransfers = data.scheduledTransfers || [];
  const pendingTransfers = scheduledTransfers.filter((item) => item.status === "scheduled");
  const requestCount = (data.gameRequests || []).filter((item) => ["pending", "approved"].includes(item.status)).length;
  const debtCount = (pendingLoan ? 1 : 0) + (activeLoan ? 1 : 0) + dueInstallments.length;
  const taxRate = Number(settings.transfer_tax_basis_points || 0) / 100;
  const interestRate = Number(settings.loan_interest_basis_points || 0) / 100;
  const transferForm = `
    <div class="finance-compact-form finance-form-panel">
      <label>Alıcı hesap kodu<input class="field" data-credit-recipient maxlength="12" placeholder="IHP900000002" autocomplete="off" /></label>
      <label>Alıcıya gidecek tutar<input class="field" data-credit-transfer-amount type="number" min="1" max="1000000" placeholder="100" /></label>
      <label>Açıklama <span class="field-hint">İsteğe bağlı</span><textarea class="field textarea credit-transfer-description" data-credit-transfer-description maxlength="160" placeholder="Ödeme açıklaması"></textarea></label>
      <div class="credit-delivery-choice" role="group" aria-label="Gönderim zamanı">
        <label><input type="radio" name="credit-delivery" value="now" data-credit-delivery checked /><span>Şimdi gönder</span></label>
        <label><input type="radio" name="credit-delivery" value="scheduled" data-credit-delivery /><span>Planla</span></label>
      </div>
      <label class="credit-schedule-field" data-credit-schedule-field hidden>Gönderim tarihi ve saati<input class="field" data-credit-scheduled-for type="datetime-local" min="${creditDateTimeLocalValue(new Date(Date.now() + 60_000))}" value="${creditDateTimeLocalValue(new Date(Date.now() + 60 * 60 * 1000))}" /></label>
      <div class="credit-transfer-preview" data-credit-transfer-preview><span>Alıcıya <b>0 kredi</b></span><span>Vergi <b>0 kredi</b></span><strong>Toplam kesinti <b>0 kredi</b></strong></div>
      <p class="credit-card-note" data-credit-delivery-note>Yanlış hesaba yapılan anlık transfer geri alınamaz.</p>
      <button class="btn btn-primary btn-sm" type="button" data-action="credit-member-transfer" disabled>Transferi tamamla</button>
    </div>
  `;
  const debtForm = pendingLoan
    ? `<div class="credit-loan-banner">${badge("Bekliyor", "gold")}<strong>${creditAmount(pendingLoan.principal)}</strong><span>Başvuru kararı bekliyor.</span></div>`
    : `<div class="finance-compact-form finance-form-panel">
        <label>Talep edilen tutar<input class="field" data-credit-loan-amount type="number" min="1" max="${Number(settings.max_loan_amount || 5000)}" placeholder="500" /></label>
        <div class="form-grid"><label>Vade (gün)<input class="field" data-credit-loan-term type="number" min="1" max="${Number(settings.max_term_days || 30)}" value="30" /></label><label>Taksit sayısı<select class="field" data-credit-loan-installments><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></label></div>
        <button class="btn btn-primary btn-sm" type="button" data-action="credit-member-request-loan">Borç başvurusu gönder</button>
      </div>`;
  const installments = dueInstallments.length
    ? `<div class="credit-installment-list finance-installments">${dueInstallments.map((item) => {
        const loan = loansById.get(item.loan_id) || {};
        return `<div><span><strong>${esc(creditLoanDisplayName(loan))} - ${item.installment_no}. taksit</strong><small>Son tarih ${formatDate(item.due_at)}</small></span><b>${creditAmount(item.amount)}</b><button class="btn btn-secondary btn-sm" type="button" data-action="credit-member-pay-installment" data-id="${esc(item.id)}">Öde</button></div>`;
      }).join("")}</div>`
    : `<div class="finance-empty-line"><strong>Bekleyen taksit yok</strong><span>Aktif borç olursa ödeme planı burada görünür.</span></div>`;
  const chequeForm = `
    <div class="finance-compact-form finance-form-panel">
      <label>Çek tutarı<input class="field" data-credit-cheque-amount type="number" min="1" max="1000000" placeholder="100" /></label>
      <button class="btn btn-secondary btn-sm" type="button" data-action="credit-member-issue-cheque">PDF çek oluştur</button>
      <div class="credit-form-divider"><span>veya</span></div>
      <label>Çek kodu<input class="field" data-credit-cheque-code inputmode="numeric" maxlength="24" placeholder="24 haneli kod" autocomplete="off" /></label>
      <button class="btn btn-primary btn-sm" type="button" data-action="credit-member-redeem-cheque">Çeki hesaba aktar</button>
    </div>
  `;
  const scheduledBody = scheduledTransfers.length
    ? `<div class="credit-scheduled-list">${scheduledTransfers.map((item) => `<article class="credit-scheduled-item ${esc(item.status)}"><span class="credit-scheduled-orb">${icon(item.status === "completed" ? "check" : item.status === "cancelled" || item.status === "failed" ? "x" : "history")}</span><div><strong>${creditAmount(item.amount)} - ${esc(item.recipient_account_code)}</strong><p>${item.description ? esc(item.description) : "Açıklama yok"}</p><small>${formatDate(item.scheduled_for, true)} - Vergi ${creditAmount(item.tax)}</small></div><div class="credit-scheduled-actions">${badge(creditScheduledTransferStatus(item.status), item.status === "completed" ? "green" : item.status === "scheduled" ? "gold" : "gray")}${item.status === "scheduled" ? `<button class="table-action danger" type="button" data-action="credit-cancel-scheduled-transfer" data-id="${esc(item.id)}">İptal et</button>` : ""}</div></article>`).join("")}</div>`
    : `<div class="finance-empty-line"><strong>Planlı transfer yok</strong><span>İleri tarihli gönderimler burada ayrı listelenir.</span></div>`;
  const ledgerBody = (data.transactions || []).length
    ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Tarih</th><th>İşlem</th><th>Açıklama</th><th>Tutar</th><th>Son bakiye</th></tr></thead><tbody>${data.transactions.map((item) => `<tr><td>${formatDate(item.created_at, true)}</td><td>${creditTransactionKindMarkup(item)}</td><td><span class="credit-ledger-description">${esc(item.metadata?.description || "-")}</span></td><td>${creditTransactionAmountMarkup(item)}</td><td>${creditAmount(item.balance_after)}</td></tr>`).join("")}</tbody></table></div>`
    : `<div class="finance-empty-line"><strong>Hareket yok</strong><span>Transfer, çek, borç ve oyun ödemeleri burada görünür.</span></div>`;

  return `
    <section class="finance-credit-header finance-credit-header-clean">
      <div>
        <span class="finance-label">KREDİ MERKEZİ</span>
        <h2>Kredi hesabım</h2>
        <p>Onaylar, transferler, borçlar, çekler ve hesap hareketleri sade bölümlerde yönetilir.</p>
      </div>
      <div class="finance-command-balance">
        <small>Kullanılabilir bakiye</small>
        <strong>${Number(account.balance || 0).toLocaleString("tr-TR")}</strong>
        <span>${esc(account.account_code)}</span>
      </div>
    </section>
    ${financeCreditModuleNav({ requestCount, transferCount: pendingTransfers.length, scheduledCount: pendingTransfers.length, debtCount, transactionCount: (data.transactions || []).length })}
    <section class="finance-credit-overview">
      <article><span>Transfer vergisi</span><strong>%${taxRate.toLocaleString("tr-TR")}</strong></article>
      <article><span>Borç faizi</span><strong>%${interestRate.toLocaleString("tr-TR")}</strong></article>
      <article><span>Açık taksit</span><strong>${dueInstallments.length}</strong><small>${activeLoan ? creditLoanLabel(activeLoan.status) : "Aktif borç yok"}</small></article>
      <article><span>Sonraki ödeme</span><strong>${settings.weekly_allowance_enabled && settings.weekly_allowance_next_at ? formatDate(settings.weekly_allowance_next_at, true) : "Planlanmadı"}</strong></article>
    </section>
    <div class="finance-split-stack">
      ${financeCreditRequestsSection(data)}
      ${financeSectionShell("finance-transfer-section", "PARA TRANSFERLERİ", "Para Transferleri", "arrow", transferForm, badge("Vergi önizleme", "blue"))}
      ${financeSectionShell("finance-scheduled-section", "PLANLI TRANSFERLER", "Planlı Transferler", "history", scheduledBody, badge(`${pendingTransfers.length} bekleyen`, pendingTransfers.length ? "gold" : "gray"))}
      ${financeSectionShell("finance-debts-section", "BORÇLAR", "Borçlar", "briefcase", `${debtForm}${installments}`, badge(activeLoan ? "Aktif" : pendingLoan ? "Bekliyor" : "Temiz", activeLoan ? "gold" : pendingLoan ? "blue" : "green"))}
      ${financeSectionShell("finance-cheques-section", "ÇEK İŞLEMLERİ", "Çek İşlemleri", "clipboard", chequeForm)}
      ${financeSectionShell("finance-ledger-section", "HESAP DEFTERİ", "Hesap Defteri", "activity", ledgerBody, badge(`${(data.transactions || []).length} kayıt`, "blue"))}
      ${financeSectionShell("finance-account-section", "HESAP YÖNETİMİ", "Hesap Yönetimi", "settings", `<div class="finance-account-danger-line"><p>Kapatma sonunda kullanılabilir bakiyeniz sıfırlanır. Açık borç, planlı transfer veya kullanılmamış çek varken hesap kapatılamaz.</p><button class="btn btn-danger btn-sm" type="button" data-action="open-credit-account-close">Hesabı kapat</button></div>`)}
    </div>
  `;
}

creditMemberPage = financeCreditMemberPageSeparated;

function financeBrokerChart(data) {
  const series = Array.isArray(data.series) ? data.series : [];
  if (series.length < 2) {
    return `<div class="credit-market-empty">${icon("chart")}<strong>Grafik hazırlanıyor</strong><span>Piyasa verisi geldiğinde burada gösterilecek.</span></div>`;
  }
  const width = 980;
  const height = 360;
  const inset = { top: 24, right: 28, bottom: 42, left: 34 };
  const values = series.map((point) => Number(point.value)).filter(Number.isFinite);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const spread = Math.max(maximum - minimum, Math.abs(maximum) * 0.006, 1);
  const chartWidth = width - inset.left - inset.right;
  const chartHeight = height - inset.top - inset.bottom;
  const points = series.map((point, index) => ({
    x: inset.left + (index / Math.max(series.length - 1, 1)) * chartWidth,
    y: inset.top + ((maximum - Number(point.value)) / spread) * chartHeight
  }));
  const line = points.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  const area = `${line} L ${points.at(-1).x.toFixed(2)} ${(height - inset.bottom).toFixed(2)} L ${points[0].x.toFixed(2)} ${(height - inset.bottom).toFixed(2)} Z`;
  const firstTime = new Date(series[0].timestamp);
  const lastTime = new Date(series.at(-1).timestamp);
  const zoom = Math.min(3.5, Math.max(1, Number(state.filters.marketZoom || 1)));
  const pointPayload = encodeURIComponent(JSON.stringify(series.map((point, index) => ({
    timestamp: point.timestamp,
    value: Number(point.value),
    x: points[index].x,
    y: points[index].y
  }))));
  return `
    <div class="credit-market-chart-shell finance-broker-chart" data-finance-chart data-points="${esc(pointPayload)}" tabindex="0" aria-label="Grafiği dokunarak inceleyin">
      <div class="credit-market-chart-viewport">
        <div class="credit-market-zoom-track" style="--market-zoom:${zoom}">
          <svg class="credit-market-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(creditMarketRangeLabel(data.range))} piyasa grafiği">
            <defs>
              <linearGradient id="financeBrokerArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="currentColor" stop-opacity=".38"></stop>
                <stop offset="100%" stop-color="currentColor" stop-opacity=".02"></stop>
              </linearGradient>
            </defs>
            <g class="credit-market-grid">
              <line x1="34" y1="95" x2="952" y2="95"></line>
              <line x1="34" y1="178" x2="952" y2="178"></line>
              <line x1="34" y1="262" x2="952" y2="262"></line>
            </g>
            <path class="credit-market-area" d="${area}" fill="url(#financeBrokerArea)"></path>
            <path class="credit-market-line" d="${line}"></path>
            <circle class="credit-market-last-point" cx="${points.at(-1).x.toFixed(2)}" cy="${points.at(-1).y.toFixed(2)}" r="6"></circle>
            <g class="credit-market-cursor" data-market-cursor hidden>
              <line x1="34" y1="22" x2="34" y2="318"></line>
              <circle cx="34" cy="22" r="8"></circle>
            </g>
          </svg>
        </div>
      </div>
      <div class="credit-market-tooltip" data-market-tooltip hidden></div>
      <div class="credit-market-axis"><span>${esc(firstTime.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" }))}</span><span>${esc(lastTime.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" }))}</span></div>
    </div>
  `;
}

creditMarketPanel = function financeBrokerMarketPanel() {
  const data = creditMarketData();
  const instruments = Array.isArray(data.instruments) ? data.instruments : [];
  const selectedSymbol = data.selectedSymbol || instruments[0]?.symbol || CREDIT_MARKET_DEFAULT_SYMBOL;
  const selected = instruments.find((item) => item.symbol === selectedSymbol);
  const change = Number(selected?.change || 0);
  const changeClass = change > 0 ? "positive" : change < 0 ? "negative" : "neutral";
  const updatedAt = selected?.updatedAt || data.updatedAt;
  const range = data.range || "1w";
  const zoom = Math.min(3.5, Math.max(1, Number(state.filters.marketZoom || 1)));
  return `
    <section class="panel finance-broker-panel" aria-labelledby="credit-market-title">
      <div class="finance-broker-head">
        <div>
          <span class="finance-terminal-kicker">İHP Finans</span>
          <h3 id="credit-market-title">Piyasa ekranı</h3>
          <p>Fiyatlar eğlence amaçlıdır; 1 birim fiyat bu sistemde 1 İHP kredi gibi hesaplanır.</p>
        </div>
        <div class="finance-broker-controls">
          <div class="finance-range-switch" role="group" aria-label="Grafik aralığı">
            ${CREDIT_MARKET_RANGE_OPTIONS.map(([value, label]) => `<button class="${range === value ? "active" : ""}" type="button" data-action="credit-market-range" data-range="${esc(value)}">${esc(label)}</button>`).join("")}
          </div>
          <div class="finance-zoom-switch" role="group" aria-label="Grafik yakınlaştırma">
            <button type="button" data-action="credit-market-zoom" data-direction="out" ${zoom <= 1 ? "disabled" : ""}>−</button>
            <span>${zoom.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}x</span>
            <button type="button" data-action="credit-market-zoom" data-direction="in" ${zoom >= 3.5 ? "disabled" : ""}>+</button>
          </div>
          <button class="btn btn-secondary btn-sm" type="button" data-action="credit-market-refresh">${icon("activity")} Yenile</button>
        </div>
      </div>
      ${data.error ? `<div class="credit-market-warning">${icon("info")}<span>${esc(data.error)}</span></div>` : ""}
      <div class="finance-broker-layout">
        <div class="finance-broker-list" role="list" aria-label="Piyasa araçları">
          ${instruments.length ? instruments.map((item) => {
            const itemChange = Number(item.change || 0);
            const itemClass = itemChange > 0 ? "positive" : itemChange < 0 ? "negative" : "neutral";
            return `
              <button class="finance-broker-symbol ${item.symbol === selectedSymbol ? "active" : ""}" type="button" data-action="credit-market-symbol" data-symbol="${esc(item.symbol)}" role="listitem">
                <span><strong>${esc(item.code)}</strong><small>${esc(item.name)}</small></span>
                <span><b>${creditMarketNumber(item.price)}</b><em class="${itemClass}">${itemChange > 0 ? "+" : ""}${creditMarketNumber(item.changePercent)}%</em></span>
              </button>
            `;
          }).join("") : `<div class="credit-market-loading"><span class="loading-spinner"></span><span>Piyasa verileri alınıyor.</span></div>`}
        </div>
        <article class="finance-broker-chart-card">
          <div class="credit-market-quote">
            <div><span>${esc(selected?.name || "Piyasa verisi")}</span><strong>${selected ? creditMarketPrice(selected.price) : "—"}</strong></div>
            <div class="credit-market-change ${changeClass}"><strong>${change > 0 ? "+" : ""}${creditMarketNumber(change)}</strong><span>${change > 0 ? "+" : ""}${creditMarketNumber(selected?.changePercent)}%</span></div>
          </div>
          ${financeBrokerChart(data)}
          <div class="credit-market-stats">
            <div><span>${esc(creditMarketRangeLabel(range))} en yüksek</span><strong>${selected ? creditMarketPrice(selected.high) : "—"}</strong></div>
            <div><span>${esc(creditMarketRangeLabel(range))} en düşük</span><strong>${selected ? creditMarketPrice(selected.low) : "—"}</strong></div>
            <div><span>Son güncelleme</span><strong>${updatedAt ? formatDate(updatedAt, true) : "Bekleniyor"}</strong></div>
          </div>
        </article>
      </div>
    </section>
  `;
};

loginPage = function financeTerminalLoginPage() {
  return `
    <main class="premium-login finance-login-terminal">
      <section class="premium-login-copy">
        ${brand()}
        <a class="back-link" href="#/home">${icon("back")} Ana sayfaya dön</a>
        <span class="finance-terminal-kicker">Finans erişimi</span>
        <h1>Finans<br /><span>paneli.</span></h1>
        <p>Kredi hesabı, borçlar, portföy ve piyasa ekranı için İHP hesabınızla giriş yapın.</p>
      </section>
      <section class="premium-login-card glass finance-login-card">
        <div class="login-card-head"><span class="icon-orb">${icon("lock")}</span><div><span>İHP Finans</span><h2>Giriş yap</h2></div></div>
        <form class="form-stack" data-form="login">
          <div class="form-group"><label for="login-email">E-posta</label><input class="field" id="login-email" name="email" type="email" autocomplete="email" inputmode="email" required /></div>
          <div class="form-group"><label for="login-password">Şifre</label><div class="password-field"><input class="field" id="login-password" name="password" type="password" autocomplete="current-password" required minlength="6" /><button class="password-toggle" type="button" data-action="toggle-password" aria-label="Şifreyi göster">Göster</button></div></div>
          <button class="btn btn-primary login-submit" type="submit"><span>Finans sistemine gir</span>${icon("arrow")}</button>
        </form>
        ${state.config?.configured ? `<p class="login-footnote">Oturum bu cihazda korunur.</p>` : `<div class="page-state page-state-error"><strong>Bağlantı eksik</strong><p>Sunucu yapılandırması kontrol edilmeli.</p></div>`}
      </section>
    </main>
  `;
};

publicPage = function financeTerminalPublicPage() {
  return `
    <main class="finance-entry-shell">
      <nav class="finance-entry-nav">
        ${brand()}
        <button class="finance-entry-login" type="button" data-action="nav-login">${icon("lock")} Giriş</button>
      </nav>
      <section class="finance-entry-grid">
        <div class="finance-entry-copy">
          <span class="finance-label">IHP FINANCE OS</span>
          <h1>Kredi.<br />Borsa.<br /><span>Tek panel.</span></h1>
          <p>Kredi hesabı, borçlar, istekler ve sanal piyasa işlemleri için ayrı finans merkezi.</p>
          <div class="finance-entry-actions">
            <button class="finance-primary-action" type="button" data-action="nav-login">Finans sistemine gir ${icon("arrow")}</button>
            <span>Üye hesabı ile erişilir</span>
          </div>
        </div>
        <aside class="finance-entry-board" aria-label="Finans ön izleme">
          <div class="finance-board-head"><span>MARKET BOARD</span><b>LIVE</b></div>
          <div class="finance-board-price">
            <small>Portföy ekranı</small>
            <strong>₭ 0</strong>
            <em>Hesap açıldığında aktif olur</em>
          </div>
          <div class="finance-board-lines">
            <i style="--h:42%"></i><i style="--h:67%"></i><i style="--h:50%"></i><i style="--h:78%"></i><i style="--h:58%"></i><i style="--h:86%"></i>
          </div>
          <div class="finance-board-grid">
            <span><b>Kredi</b><small>Transfer ve çek</small></span>
            <span><b>Borç</b><small>Taksit takibi</small></span>
            <span><b>Piyasa</b><small>1G / 1H / 1Y</small></span>
            <span><b>İstek</b><small>Oyun onayı</small></span>
          </div>
        </aside>
      </section>
    </main>
  `;
};

loginPage = function financeCommandLoginPage() {
  return `
    <main class="finance-auth-shell">
      <section class="finance-auth-copy">
        ${brand()}
        <a class="finance-auth-back" href="#/home">${icon("back")} Ana sayfa</a>
        <span class="finance-label">Güvenli finans erişimi</span>
        <h1>Finans<br />oturumu.</h1>
        <p>Kredi hesabı, borçlar ve piyasa ekranına İHP hesabınızla girin.</p>
      </section>
      <section class="finance-auth-card">
        <div class="finance-auth-card-head">
          <span>${icon("wallet")}</span>
          <div><small>IHP FINANCE</small><h2>Giriş yap</h2></div>
        </div>
        <form class="form-stack" data-form="login">
          <div class="form-group"><label for="login-email">E-posta</label><input class="field" id="login-email" name="email" type="email" autocomplete="email" inputmode="email" required /></div>
          <div class="form-group"><label for="login-password">Şifre</label><div class="password-field"><input class="field" id="login-password" name="password" type="password" autocomplete="current-password" required minlength="6" /><button class="password-toggle" type="button" data-action="toggle-password" aria-label="Şifreyi göster">Göster</button></div></div>
          <button class="finance-submit" type="submit"><span>Giriş yap</span>${icon("arrow")}</button>
        </form>
        ${state.config?.configured ? `<p class="finance-auth-note">Oturum bu cihazda korunur.</p>` : `<div class="page-state page-state-error"><strong>Bağlantı eksik</strong><p>Sunucu yapılandırması kontrol edilmeli.</p></div>`}
      </section>
    </main>
  `;
};

financePortalOverviewPage = function financeCommandOverviewPage() {
  if (isFinancePortalSystemAccount()) return financePortalAccessBlocked();
  const credit = creditData();
  const finance = financeData();
  const requests = (credit.gameRequests || []).filter((item) => ["pending", "approved"].includes(item.status));
  const openLoans = (credit.loans || []).filter((item) => ["pending", "approved", "delinquent"].includes(item.status));
  const creditBalance = credit.account ? creditAmount(credit.account.balance) : "Hesap yok";
  const financeValue = finance.account ? creditAmount(finance.totals?.totalValue || 0) : "Hesap yok";
  const nextFee = finance.fee?.nextChargeAt ? formatDate(finance.fee.nextChargeAt, true) : "Onay bekliyor";
  return `
    <section class="finance-command-hero">
      <div>
        <span class="finance-label">İHP FİNANS</span>
        <h2>Finans özetim</h2>
        <p>Kredi durumunuz, borçlarınız, istekleriniz ve sanal yatırımlarınız tek bakışta.</p>
      </div>
      <div class="finance-command-balance">
        <small>Kullanılabilir bakiye</small>
        <strong>${esc(creditBalance)}</strong>
        <span>${credit.account?.account_code ? esc(credit.account.account_code) : "Hesap açılmadı"}</span>
      </div>
    </section>
    <section class="finance-command-strip">
      <article><span>Portföy</span><strong>${esc(financeValue)}</strong><small>Yatırım hesabı</small></article>
      <article><span>İstek</span><strong>${requests.length}</strong><small>Oyun ve kredi onayı</small></article>
      <article><span>Borç</span><strong>${openLoans.length}</strong><small>Açık başvuru / taksit</small></article>
      <article><span>Kesinti</span><strong>${esc(nextFee)}</strong><small>Portföy bakım zamanı</small></article>
    </section>
    <section class="finance-command-actions">
      <button type="button" data-page="credit"><i>${icon("wallet")}</i><strong>Kredi İşlemleri</strong><span>Transfer, çek, borç ve istekler</span></button>
      <button type="button" data-page="finance"><i>${icon("chart")}</i><strong>Borsa ve Finans</strong><span>Portföy, grafik ve al-sat ekranı</span></button>
      ${financePortalManagerAllowed() ? `<button type="button" data-page="credit-management"><i>${icon("briefcase")}</i><strong>Görevli Paneli</strong><span>Başvuru ve bakiye yönetimi</span></button>` : ""}
    </section>
  `;
};

function financeInvestmentNav({ positions = 0, history = 0 } = {}) {
  return `
    <section class="finance-module-nav finance-invest-nav" aria-label="İHP Finans bölümleri">
      ${financeModuleButton("finance-fee-section", "Portföy Kesintisi", "Haftalık sistem kesintisi")}
      ${financeModuleButton("finance-cash-section", "Nakit Aktarımı", "Kredi ve yatırım nakdi")}
      ${financeModuleButton("finance-order-section", "Al/Sat Emirleri", "Seçili varlık işlemi")}
      ${financeModuleButton("finance-positions-section", "Açık Pozisyonlar", "Portföy varlıkları", positions)}
      ${financeModuleButton("finance-market-section", "Piyasa Grafiği", "1G / 1H / 1Y inceleme")}
      ${financeModuleButton("finance-history-section", "İşlem Geçmişi", "Finans hareketleri", history)}
    </section>
  `;
}

function financePositionsBody(data) {
  const positions = data.positions || [];
  if (!positions.length) {
    return `<div class="finance-empty-line"><strong>Acik pozisyon yok</strong><span>Ilk alimdan sonra portfoy varliklari burada ayri listelenir.</span></div>`;
  }
  return `
    <div class="finance-position-list">
      ${positions.map((position) => {
        const profit = Number(position.profit || 0);
        return `
          <article class="finance-position-card">
            <div class="finance-position-symbol"><strong>${esc(position.instrument?.code || position.symbol.replace(".IS", ""))}</strong><span>${esc(position.instrument?.name || position.symbol)}</span></div>
            <div><span>Adet</span><strong>${Number(position.quantity).toLocaleString("tr-TR", { maximumFractionDigits: 6 })}</strong></div>
            <div><span>Ortalama</span><strong>${creditMarketNumber(position.average_cost)}</strong></div>
            <div><span>Guncel deger</span><strong>${position.market_value === null ? "Veri bekleniyor" : creditAmount(position.market_value)}</strong></div>
            <div><span>Kar / zarar</span><strong class="${financeProfitClass(profit)}">${position.profit === null ? "-" : financeSignedAmount(profit)}</strong></div>
            <button class="table-action" type="button" data-action="finance-select-position" data-symbol="${esc(position.symbol)}">İşlem yap</button>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function financeHistoryBody(data) {
  const rows = data.transactions || [];
  if (!rows.length) {
    return `<div class="finance-empty-line"><strong>Finans hareketi yok</strong><span>Aktarım ve alım-satım işlemleri burada saklanacak.</span></div>`;
  }
  return `
    <div class="finance-history-list">
      ${rows.map((item) => {
        const incoming = ["deposit", "sell"].includes(item.kind);
        return `
          <article>
            <span class="finance-history-icon ${incoming ? "incoming" : "outgoing"}">${icon(incoming ? "download" : "arrow")}</span>
            <div><strong>${esc(financeTransactionLabel(item.kind))}</strong><small>${item.symbol ? `${esc(item.symbol.replace(".IS", ""))} - ${Number(item.quantity || 0).toLocaleString("tr-TR", { maximumFractionDigits: 6 })} adet` : "Hesaplar arası aktarım"}</small></div>
            <div><strong class="${incoming ? "positive" : "negative"}">${incoming ? "+" : "-"}${creditAmount(item.amount)}</strong><small>${formatDate(item.created_at, true)}</small></div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

financePage = function financeSeparatedInvestmentPage() {
  const data = financeData();
  if (!data.account || financeFeeConsentRequired(data)) return financeOnboardingPage(data);

  const selected = financeSelectedInstrument(data);
  const selectedPosition = selected ? financePositionForSymbol(selected.symbol, data) : null;
  const profit = Number(data.totals?.profit || 0);
  const fee = data.fee || {};
  const feeBody = `
    <div class="finance-fee-grid finance-section-grid">
      <article><span>Tahmini haftalık</span><strong>${creditAmount(fee.weeklyEstimate || 0)}</strong><small>Mevcut portföy bazına göre</small></article>
      <article><span>Sonraki kesinti</span><strong>${fee.nextChargeAt ? formatDate(fee.nextChargeAt, true) : "Takvim bekliyor"}</strong><small>Onay tarihinden itibaren 7 gün</small></article>
      <article class="${Number(fee.debt || 0) > 0 ? "fee-debt" : ""}"><span>Bekleyen kesinti</span><strong>${creditAmount(fee.debt || 0)}</strong><small>${Number(fee.debt || 0) > 0 ? "Bakiye geldiğinde tahsil edilir" : "Borç yok"}</small></article>
    </div>
  `;
  const cashBody = `
    <div class="finance-compact-form finance-form-panel">
      <label>Aktarılacak kredi<input class="field" type="number" min="1" max="100000000" step="1" data-finance-transfer-amount placeholder="100" /></label>
      <div class="finance-transfer-route"><span>Kredi hesabı</span>${icon("arrow")}<span>Yatırım nakdi</span></div>
      <div class="finance-button-pair">
        <button class="btn btn-primary btn-sm" type="button" data-action="finance-transfer" data-direction="deposit">Yatırıma aktar</button>
        <button class="btn btn-secondary btn-sm" type="button" data-action="finance-transfer" data-direction="withdrawal">Krediye geri çek</button>
      </div>
    </div>
  `;
  const orderBody = `
    <div class="finance-compact-form finance-form-panel" id="finance-trade-card">
      <label>Adet<input class="field" type="number" min="0.001" max="1000000" step="0.001" data-finance-quantity placeholder="1" ${selected ? "" : "disabled"} /></label>
      <div class="finance-trade-preview" data-finance-trade-preview>
        <span>Tahmini işlem tutarı</span><strong>0 kredi</strong><small>Sunucudaki işlem anı fiyatı kesin tutarı belirler.</small>
      </div>
      <div class="finance-button-pair">
        <button class="btn btn-primary btn-sm" type="button" data-action="finance-trade" data-side="buy" ${selected ? "" : "disabled"}>Al</button>
        <button class="btn btn-danger btn-sm" type="button" data-action="finance-trade" data-side="sell" ${selectedPosition ? "" : "disabled"}>Sat${selectedPosition ? ` - ${Number(selectedPosition.quantity).toLocaleString("tr-TR", { maximumFractionDigits: 6 })} adet` : ""}</button>
      </div>
    </div>
  `;

  return `
    <section class="finance-credit-header finance-invest-header">
      <div>
        <span class="finance-label">İHP FİNANS</span>
        <h2>Yatırım paneli</h2>
        <p>Nakit, emirler, pozisyonlar, piyasa grafiği ve geçmiş sade bölümlerde izlenir.</p>
      </div>
      <div class="finance-command-balance">
        <small>Toplam yatırım değeri</small>
        <strong>${Number(data.totals?.totalValue || 0).toLocaleString("tr-TR")}</strong>
        <span>Nakit ${creditAmount(data.account.cash_balance)}</span>
      </div>
    </section>
    ${financeInvestmentNav({ positions: (data.positions || []).length, history: (data.transactions || []).length })}
    <section class="finance-credit-overview">
      <article><span>Kredi hesabı</span><strong>${creditAmount(data.creditAccount?.balance)}</strong><small>${esc(data.creditAccount?.account_code || "Hesap yok")}</small></article>
      <article><span>Portföy</span><strong>${creditAmount(data.totals?.marketValue)}</strong><small>Güncel piyasa değeri</small></article>
      <article><span>Toplam maliyet</span><strong>${creditAmount(Math.round(data.totals?.costValue || 0))}</strong><small>Açık pozisyonlar</small></article>
      <article><span>Kâr / zarar</span><strong class="${financeProfitClass(profit)}">${financeSignedAmount(profit)}</strong><small>Güncel fiyata göre</small></article>
    </section>
    <div class="finance-split-stack finance-invest-stack">
      ${financeSectionShell("finance-fee-section", "PORTFÖY KESİNTİSİ", `Haftalık %${Number(fee.weeklyRatePercent || 10).toLocaleString("tr-TR")}`, "shield", feeBody)}
      ${financeSectionShell("finance-cash-section", "NAKİT AKTARIMI", "Nakit Aktarımı", "wallet", cashBody)}
      ${financeSectionShell("finance-order-section", "AL/SAT EMİRLERİ", `${esc(selected?.code || "Piyasa")} al / sat`, "activity", orderBody, selected ? badge(creditMarketPrice(selected.price), Number(selected.change) >= 0 ? "green" : "red") : badge("Veri bekleniyor", "gray"))}
      ${financeSectionShell("finance-positions-section", "AÇIK POZİSYONLAR", "Açık Pozisyonlar", "briefcase", financePositionsBody(data), badge(`${(data.positions || []).length} varlık`, (data.positions || []).length ? "blue" : "gray"))}
      ${financeSectionShell("finance-market-section", "PİYASA GRAFİĞİ", "Piyasa Grafiği", "chart", creditMarketPanel())}
      ${financeSectionShell("finance-history-section", "İŞLEM GEÇMİŞİ", "İşlem Geçmişi", "history", financeHistoryBody(data), badge(`${(data.transactions || []).length} kayıt`, "blue"))}
    </div>
  `;
};
