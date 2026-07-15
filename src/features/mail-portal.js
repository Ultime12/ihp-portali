const IHP_MAIL_PORTAL_V2 = true;
const MAIL_THEME_STORAGE_KEY = "ihp-mail-theme";
document.documentElement.dataset.portalVariant = "mail";

function storedMailTheme() {
  try {
    return localStorage.getItem(MAIL_THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function applyMailTheme(value) {
  const theme = value === "dark" ? "dark" : "light";
  document.documentElement.dataset.mailTheme = theme;
  try { localStorage.setItem(MAIL_THEME_STORAGE_KEY, theme); } catch {}
  return theme;
}

function toggleMailTheme() {
  const next = document.documentElement.dataset.mailTheme === "dark" ? "light" : "dark";
  applyMailTheme(next);
  render();
  showToast(next === "dark" ? "Karanlık tema açıldı." : "Aydınlık tema açıldı.", "success");
}

applyMailTheme(storedMailTheme());

navItems.splice(
  0,
  navItems.length,
  ["mail", "Mail", "inbox", canUsePortalMail],
  ["settings", "Ayarlar", "settings", () => true]
);

const mailPortalBaseBrand = brand;
brand = function mailPortalBrand() {
  return `<a class="brand premium-brand" href="#/portal/mail" aria-label="İHP Mail"><span class="brand-mark brand-initials">İHP</span><span class="brand-copy"><strong>İHP Mail</strong><span>Kurumsal posta</span></span></a>`;
};

function mailSettingsPage() {
  const mailbox = state.cache.mailbox?.mailbox || {};
  const dark = document.documentElement.dataset.mailTheme === "dark";
  return `
    <div class="mail-product-shell mail-settings-shell">
      ${mailTopbar({ search: false })}
      <main class="mail-settings-main">
        <aside class="mail-settings-nav">
          <button type="button" data-page="mail">${icon("back")} Gelen kutusuna dön</button>
          <span>POSTA AYARLARI</span>
          <button class="active" type="button">${icon("settings")} Görünüm ve hesap</button>
        </aside>
        <section class="mail-settings-content">
          <div class="mail-settings-heading"><span>İHP MAIL</span><h1>Ayarlar</h1><p>Posta görünümünüzü ve açık oturumunuzu yönetin.</p></div>
          <article class="mail-settings-card">
            <div><span class="mail-settings-icon">${icon("sparkles")}</span><div><h2>Görünüm</h2><p>Tercihiniz yalnızca İHP Mail’de uygulanır; ana portal temasını değiştirmez.</p></div></div>
            <div class="mail-theme-options" role="group" aria-label="Mail teması">
              <button class="${dark ? "" : "active"}" type="button" data-action="mail-set-theme" data-theme="light"><i class="light-preview"></i><strong>Aydınlık</strong><small>Temiz ve ferah</small></button>
              <button class="${dark ? "active" : ""}" type="button" data-action="mail-set-theme" data-theme="dark"><i class="dark-preview"></i><strong>Karanlık</strong><small>Gece kullanımı</small></button>
            </div>
          </article>
          <article class="mail-settings-card mail-account-settings">
            <div><span class="mail-settings-icon">${icon("inbox")}</span><div><h2>Kurumsal hesap</h2><p>${esc(mailbox.address || state.profile?.portal_email || "")}</p></div></div>
            <dl><div><dt>Hesap sahibi</dt><dd>${esc(mailbox.displayName || state.profile?.display_name || "")}</dd></div><div><dt>Durum</dt><dd>Etkin</dd></div></dl>
            <button class="mail-logout-button" type="button" data-action="logout">${icon("logout")} Çıkış Yap</button>
          </article>
        </section>
      </main>
    </div>
  `;
}

portalShell = function mailPortalShell(page) {
  const content = page === "settings" ? mailSettingsPage() : mailPage();
  return `<div class="mail-site-shell">${state.loading ? skeletonPage() : content}</div>`;
};

renderPortalPage = function mailPortalRenderPortalPage(page) {
  return page === "settings" ? mailSettingsPage() : mailPage();
};

const mailPortalBaseLoadPage = loadPage;
loadPage = async function mailPortalLoadPage(page) {
  const destination = page === "settings" ? "settings" : "mail";
  if (destination === "mail") return mailPortalBaseLoadPage("mail");
  state.loading = true;
  state.pageError = null;
  render();
  try {
    if (!state.cache.mailbox) await refreshPortalMailbox(true);
  } catch (error) {
    state.pageError = { page: destination, message: error.message };
    showToast(error.message, "error");
  } finally {
    state.loading = false;
    render();
  }
};

const mailPortalBaseHandleClick = handleClick;
handleClick = async function mailPortalHandleClick(event) {
  const target = event.target.closest("[data-action]");
  if (target?.dataset.action === "mail-theme-toggle") {
    event.preventDefault();
    toggleMailTheme();
    return;
  }
  if (target?.dataset.action === "mail-set-theme") {
    event.preventDefault();
    applyMailTheme(target.dataset.theme);
    render();
    return;
  }
  return mailPortalBaseHandleClick(event);
};

publicPage = function mailPortalPublicPage() {
  return `
    <main class="mail-public-shell">
      <section class="mail-public-card">
        <div class="mail-public-copy">
          <div class="mail-public-brand"><span>İHP</span> İHP Mail</div>
          <h1>Yazışmalar.<br><span>Tek yerde.</span></h1>
          <p>Kurumsal adresiniz, gelen kutunuz, dosyalarınız ve zamanlanmış iletileriniz için sade bir çalışma alanı.</p>
          <button type="button" data-action="nav-login">Posta kutusuna gir ${icon("arrow")}</button>
        </div>
        <div class="mail-public-preview" aria-hidden="true">
          <div class="mail-preview-window"><header></header><div class="mail-preview-lines">
            <article><i></i><div><b>Kurumsal yazışma</b><span>Yeni ileti ve dosya eki</span><small></small></div></article>
            <article><i></i><div><b>Zamanlanmış ileti</b><span>Yarın, 09.30</span><small></small></div></article>
            <article><i></i><div><b>Disiplin Kurulu</b><span>dk@ihp.org.tr</span><small></small></div></article>
          </div></div>
        </div>
      </section>
    </main>
  `;
};

const mailPortalBaseLoginPage = loginPage;
loginPage = function mailPortalLoginPage() {
  return mailPortalBaseLoginPage()
    .replaceAll("İHP Portalı", "İHP Mail")
    .replace("Portal hesabınızı kullanın.", "Kurumsal posta kutunuza giriş yapın.")
    .replace("Portal erişimi.", "Posta erişimi.");
};

window.addEventListener("hashchange", () => {
  const current = route();
  if (current.startsWith("portal/") && !["portal/mail", "portal/settings"].includes(current)) {
    navigate("portal/mail");
  }
});

void mailPortalBaseBrand;
