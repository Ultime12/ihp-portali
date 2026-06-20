const IHP_PREMIUM_UI_V1 = true;

function premiumBrand() {
  const logo = state.cache.settings?.logo_url || "";
  const mark = logo
    ? `<span class="brand-mark"><img class="brand-logo-image" src="${esc(logo)}" alt="İHP logosu" /></span>`
    : `<span class="brand-mark brand-initials">İHP</span>`;
  const href = state.profile
    ? (typeof isEntryAccessAccount === "function" && isEntryAccessAccount() ? "#/portal/access" : "#/portal/overview")
    : "#/home";
  return `
    <a class="brand premium-brand" href="${href}" aria-label="İHP ana sayfa">
      ${mark}
      <span class="brand-copy"><strong>İHP Portalı</strong><span>Öğrenci topluluğu</span></span>
    </a>
  `;
}

brand = premiumBrand;

const premiumNavGroups = [
  ["Portal", new Set(["overview", "members", "positions", "committees", "announcements", "regulation", "youth", "agreements", "games", "access"])],
  ["Yönetim", new Set(["presidency", "applications", "reports"])],
  ["Disiplin", new Set(["discipline-operations", "discipline-council", "discipline", "complaints", "investigations"])],
  ["Sistem", new Set(["credit", "audit", "settings"])]
];

function premiumNavButton(item, page) {
  const [id, label, iconName] = item;
  const count = badgeCountForNav(id);
  return `
    <button class="nav-item ${page === id ? "active" : ""}" type="button" data-page="${id}" ${page === id ? 'aria-current="page"' : ""}>
      <span>${icon(iconName)} <b>${esc(label)}</b></span>
      ${count ? `<em class="nav-badge">${esc(count)}</em>` : ""}
    </button>
  `;
}

navSection = function premiumNavSection(page) {
  const allowed = navItems.filter(([, , , allow]) => allow());
  return premiumNavGroups.map(([label, ids]) => {
    const items = allowed.filter(([id]) => ids.has(id));
    if (!items.length) return "";
    return `
      <section class="nav-group" aria-label="${esc(label)}">
        <p class="nav-section-label">${esc(label)}</p>
        ${items.map((item) => premiumNavButton(item, page)).join("")}
      </section>
    `;
  }).join("");
};

function premiumPageBody(page) {
  if (state.loading) return skeletonPage();
  if (state.pageError?.page === page) {
    return `
      <section class="page-state page-state-error glass" role="alert">
        <span class="state-icon">${icon("activity")}</span>
        <div><strong>Bu bölüm yüklenemedi</strong><p>${esc(state.pageError.message)}</p></div>
        <button class="btn btn-primary btn-sm" type="button" data-action="retry-page">Yeniden dene</button>
      </section>
    `;
  }
  return renderPortalPage(page);
}

portalShell = function premiumPortalShell(page) {
  const profile = state.profile;
  const notifications = state.cache.notifications || [];
  const unread = notifications.filter((item) => !item.read_at).length;
  return `
    <div class="app-shell premium-app-shell">
      <aside class="sidebar ${state.sidebarOpen ? "open" : ""}" aria-label="Portal menüsü">
        <div class="sidebar-head">${brand()}</div>
        <nav class="app-nav">${navSection(page)}</nav>
        <div class="sidebar-bottom">
          <button class="side-profile" type="button" data-page="settings" aria-label="Profil ayarlarını aç">
            ${avatar(profile)}
            <span><strong>${esc(profile.display_name)}</strong><small>${typeof ihpAdminRoleBadgesV1 === "function" ? ihpAdminRoleBadgesV1(profile) : esc(roleLabels(profile))}</small></span>
          </button>
          <button class="nav-item logout-item" type="button" data-action="logout">${icon("logout")} <b>Çıkış Yap</b></button>
        </div>
      </aside>
      <button class="mobile-backdrop ${state.sidebarOpen ? "open" : ""}" type="button" data-action="close-sidebar" aria-label="Menüyü kapat"></button>
      <main class="app-main">
        <header class="topbar">
          <div class="topbar-left">
            <button class="icon-btn mobile-menu-btn" type="button" data-action="toggle-sidebar" aria-label="Menüyü aç">${icon("menu")}</button>
            <div><span class="topbar-kicker">Çalışma alanı</span><h1>${esc(pageName(page))}</h1></div>
          </div>
          <div class="top-actions">
            <label class="theme-picker" aria-label="Vurgu rengini seç">
              <span>${icon("sparkles")}</span>
              <select data-theme-select>
                ${THEME_OPTIONS.map(([value, label]) => `<option value="${value}" ${activeTheme() === value ? "selected" : ""}>${esc(label)}</option>`).join("")}
              </select>
            </label>
            <button class="icon-btn notification-btn" type="button" data-action="open-notifications" aria-label="Bildirimleri aç">
              ${icon("bell")}${unread ? `<span class="notification-count">${unread}</span>` : ""}
            </button>
            <button class="profile-chip" type="button" data-page="settings">${avatar(profile)}<span>${esc(profile.display_name)}</span></button>
          </div>
        </header>
        <div class="app-content" id="main-content">${premiumPageBody(page)}</div>
      </main>
    </div>
  `;
};

publicPage = function premiumPublicPage() {
  return `
    <a class="skip-link" href="#premium-capabilities">İçeriğe geç</a>
    <div class="premium-public">
      <header class="public-nav-wrap">
        <nav class="site-nav">${brand()}<div class="nav-links"><a href="#premium-capabilities">Portal</a><a href="#premium-security">Güvenlik</a><button class="btn btn-primary btn-sm" data-action="nav-login">${icon("lock")} Giriş Yap</button></div></nav>
      </header>
      <main>
        <section class="premium-hero">
          <div class="hero-aurora" aria-hidden="true"></div>
          <div class="premium-hero-copy">
            <span class="eyebrow">Topluluk çalışma alanı</span>
            <h1>İstiklal<br /><span>Hürriyet</span></h1>
            <p>Üyeleri, kurulları, kararları ve duyuruları tek bir güvenli portalda buluşturan dijital çalışma alanı.</p>
            <div class="hero-actions"><button class="btn btn-primary" data-action="nav-login">Portala Giriş Yap ${icon("arrow")}</button><a class="btn btn-secondary" href="#premium-capabilities">Portalı İncele</a></div>
            <div class="public-trust"><span>${icon("shield")} Rol bazlı erişim</span><span>${icon("history")} Kayıtlı işlemler</span><span>${icon("bell")} Kişisel bildirimler</span></div>
          </div>
          <div class="premium-product-preview glass" aria-label="Portal ürün ön izlemesi">
            <div class="preview-chrome"><i></i><i></i><i></i><span>İHP Portalı</span></div>
            <div class="preview-layout">
              <aside><b>İHP</b><span class="active">Genel Bakış</span><span>Üyeler</span><span>Kurullar</span><span>Duyurular</span></aside>
              <div class="preview-workspace">
                <div class="preview-title"><span><small>Çalışma alanı</small><strong>Genel Bakış</strong></span><i></i></div>
                <div class="preview-cards"><article><small>Kişisel durum</small><strong>Aktif üye</strong><span>Profil ve roller</span></article><article><small>Bildirimler</small><strong>Tek merkez</strong><span>Kararlar ve görevler</span></article></div>
                <div class="preview-panel"><span></span><span></span><span></span></div>
              </div>
            </div>
          </div>
        </section>
        <section class="premium-section" id="premium-capabilities">
          <div class="premium-section-head"><span class="eyebrow">Portal yetenekleri</span><h2>Günlük işleyiş için tek ve net merkez.</h2></div>
          <div class="capability-grid">
            <article class="glass">${icon("users")}<h3>Üyeler ve kurullar</h3><p>Roller, üyelik durumu ve kurul yapısı yetkiye göre görüntülenir.</p></article>
            <article class="glass">${icon("shield")}<h3>Disiplin süreçleri</h3><p>Soruşturma, kararname, itiraz ve rapor akışları kendi hiyerarşisinde ilerler.</p></article>
            <article class="glass">${icon("book")}<h3>Antlaşmalar</h3><p>Üyeler ve kurullar arasında sunulan belgeler dijital olarak karara bağlanır.</p></article>
            <article class="glass">${icon("bell")}<h3>Bildirim merkezi</h3><p>Rol, karar, ceza, ödül ve geçiş kodları doğru kişiye ulaşır.</p></article>
          </div>
        </section>
        <section class="premium-section premium-security" id="premium-security">
          <div><span class="eyebrow">Güvenlik</span><h2>Her kullanıcı yalnızca yetkili olduğu alanı görür.</h2><p>Oturum, veri erişimi ve kritik işlemler sunucu tarafındaki kimlik ve yetki kontrolleriyle korunur.</p></div>
          <div class="security-orbit glass">${icon("lock")}<strong>Güvenli portal</strong><span>Rol bazlı erişim</span></div>
        </section>
      </main>
      <footer class="premium-footer">${brand()}<span>Öğrenci topluluğu portalı</span></footer>
    </div>
  `;
};

loginPage = function premiumLoginPage() {
  return `
    <main class="premium-login">
      <div class="login-aurora" aria-hidden="true"></div>
      <section class="premium-login-copy">
        ${brand()}
        <a class="back-link" href="#/home">${icon("back")} Ana sayfaya dön</a>
        <span class="eyebrow">Üye girişi</span>
        <h1>Portal<br /><span>erişimi.</span></h1>
        <p>Hesabınızla giriş yapın; çalışma alanınız rolünüze göre otomatik hazırlanır.</p>
        <div class="login-benefits"><span>${icon("shield")} Güvenli oturum</span><span>${icon("sparkles")} Kişisel çalışma alanı</span></div>
      </section>
      <section class="premium-login-card glass">
        <div class="login-card-head"><span class="icon-orb">${icon("lock")}</span><div><span>İHP Portalı</span><h2>Giriş yap</h2></div></div>
        <form class="form-stack" data-form="login">
          <div class="form-group"><label for="login-email">E-posta</label><input class="field" id="login-email" name="email" type="email" autocomplete="email" inputmode="email" required /></div>
          <div class="form-group"><label for="login-password">Şifre</label><div class="password-field"><input class="field" id="login-password" name="password" type="password" autocomplete="current-password" required minlength="6" /><button class="password-toggle" type="button" data-action="toggle-password" aria-label="Şifreyi göster">Göster</button></div></div>
          <button class="btn btn-primary login-submit" type="submit"><span>Giriş Yap</span>${icon("arrow")}</button>
        </form>
        ${state.config?.configured ? `<p class="login-footnote">Oturumunuz bu cihazda güvenli biçimde saklanır.</p>` : `<div class="page-state page-state-error"><strong>Bağlantı yapılandırması eksik</strong><p>Portal yöneticisiyle iletişime geçin.</p></div>`}
      </section>
    </main>
  `;
};

dashboardPage = function premiumDashboardPage() {
  const data = state.cache.overview || {};
  const profiles = visibleProfiles(data.profiles || []);
  const announcements = (data.announcements || []).filter((item) => item.status === "published");
  const disciplines = data.disciplines || [];
  const committees = data.committees || [];
  const applications = state.cache.applicationBadge || [];
  const notifications = state.cache.notifications || [];
  const openDiscipline = disciplines.filter((item) => !["closed", "decided", "cancelled"].includes(item.decision_status)).length;
  const unread = notifications.filter((item) => !item.read_at).length;
  return `
    <section class="dashboard-hero glass">
      <div><span class="eyebrow">Kişisel çalışma alanı</span><h2>Hoş geldiniz, ${esc(state.profile.display_name)}.</h2><p>${esc(roleLabels(state.profile))} yetkileriyle portalınız hazır.</p></div>
      <div class="personal-status"><span>Üyelik durumu</span>${badgeForStatus(state.profile.status)}<strong>${disciplinePoints(state.profile)} puan</strong></div>
    </section>
    <section class="metrics-grid premium-metrics">
      ${metric("Üye", profiles.length, "Görüntülenebilir kayıt", "users")}
      ${metric("Kurul", committees.length, "Aktif çalışma yapısı", "grid")}
      ${metric("Bildirim", unread, "Okunmamış", "bell")}
      ${metric("Açık işlem", openDiscipline, "Yetkinize göre", "shield")}
    </section>
    <section class="dashboard-grid premium-dashboard-grid">
      <article class="panel glass"><div class="panel-head"><div><span class="panel-kicker">Güncel</span><h3>Son duyurular</h3></div><button class="table-action" type="button" data-page="announcements">Tümünü gör</button></div>${announcements.length ? announcements.slice(0, 4).map((item) => `<button class="list-row list-row-button" type="button" data-page="announcements"><span class="list-icon">${icon("bell")}</span><span class="list-main"><strong>${esc(item.title)}</strong><small>${formatDate(item.created_at, true)}</small></span>${badgeForStatus(item.status)}</button>`).join("") : emptyCard("Henüz duyuru yok", "Yeni duyurular burada görünecek.")}</article>
      <article class="panel glass"><div class="panel-head"><div><span class="panel-kicker">Kısayollar</span><h3>Hızlı işlemler</h3></div></div><div class="quick-grid">${quickAction("Üyeler", "users", "members")}${quickAction("Kurullar", "grid", "committees")}${quickAction("Duyurular", "bell", "announcements")}${quickAction("Antlaşmalar", "book", "agreements")}${permissions.admissions() ? quickAction(`Başvurular${applications.filter((item) => item.status === "new").length ? ` (${applications.filter((item) => item.status === "new").length})` : ""}`, "inbox", "applications") : ""}${permissions.disciplineCouncil() ? quickAction("Disiplin", "shield", "discipline-operations") : ""}</div></article>
    </section>
  `;
};

const premiumBaseHandleClick = handleClick;
handleClick = async function premiumHandleClick(event) {
  const target = event.target.closest("[data-action]");
  const action = target?.dataset.action;
  if (action === "toggle-password") {
    event.preventDefault();
    const input = document.getElementById("login-password");
    const visible = input?.type === "text";
    if (input) input.type = visible ? "password" : "text";
    target.textContent = visible ? "Göster" : "Gizle";
    target.setAttribute("aria-label", visible ? "Şifreyi göster" : "Şifreyi gizle");
    return;
  }
  if (action === "retry-page") {
    event.preventDefault();
    await loadPage(route().split("/")[1] || "overview");
    return;
  }
  return premiumBaseHandleClick(event);
};

const premiumReducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const premiumObserver = !premiumReducedMotion.matches && "IntersectionObserver" in window
  ? new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        premiumObserver.unobserve(entry.target);
      }
    }), { threshold: 0.08, rootMargin: "0px 0px -28px" })
  : null;

function enhancePremiumPage() {
  document.querySelectorAll(".data-table").forEach((table) => {
    const labels = [...table.querySelectorAll("thead th")].map((cell) => cell.textContent.trim());
    table.querySelectorAll("tbody tr").forEach((row) => {
      [...row.children].forEach((cell, index) => {
        if (cell.tagName === "TD" && !cell.dataset.label) cell.dataset.label = labels[index] || "Bilgi";
      });
    });
  });
  document.querySelectorAll(".panel, .metric-card, .capability-grid > article, .page-head, .dashboard-hero").forEach((element, index) => {
    element.classList.add("premium-reveal");
    element.style.setProperty("--reveal-delay", `${Math.min(index, 8) * 45}ms`);
    if (premiumObserver) premiumObserver.observe(element);
    else element.classList.add("is-visible");
  });
}

const premiumBaseRender = render;
render = function premiumRender() {
  premiumBaseRender();
  requestAnimationFrame(enhancePremiumPage);
};

function sanitizeClientError(value) {
  return String(value || "Bilinmeyen istemci hatası")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, "[id]")
    .replace(/\b(?:eyJ|sb_|re_)[A-Za-z0-9._-]{12,}\b/g, "[secret]")
    .slice(0, 420);
}

const clientErrorSignatures = new Set();
let clientErrorCount = 0;
function reportClientError(type, message) {
  if (clientErrorCount >= 5) return;
  const cleanMessage = sanitizeClientError(message);
  const signature = `${type}:${cleanMessage}`;
  if (clientErrorSignatures.has(signature)) return;
  clientErrorSignatures.add(signature);
  clientErrorCount += 1;
  fetch("/api/client-error", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({ type, message: cleanMessage, page: route().split("/").slice(0, 2).join("/"), timestamp: new Date().toISOString() })
  }).catch(() => {});
}

window.addEventListener("error", (event) => reportClientError("error", event.message));
window.addEventListener("unhandledrejection", (event) => reportClientError("unhandledrejection", event.reason?.message || event.reason));
