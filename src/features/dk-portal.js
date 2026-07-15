const IHP_DK_PORTAL_V1 = true;
const DK_DEFAULT_LOGO = "/assets/identity/discipline-shield.png";
const DK_ALLOWED_ROLES = new Set([
  "super_admin",
  "discipline_chair",
  "discipline_vice_chair",
  "discipline_member"
]);

globalThis.__IHP_SERVER_PROXY__ = "/api/dk-proxy";

function isDkPortalActor(profile = state.profile) {
  return rolesOf(profile).some((role) => DK_ALLOWED_ROLES.has(role));
}

function dkLogoUrl() {
  return state.cache.settings?.dk_logo_url || DK_DEFAULT_LOGO;
}

function dkRoleLabel(profile = state.profile) {
  if (rolesOf(profile).includes("super_admin")) return "Sistem Yöneticisi";
  return disciplineRankLabel(profile);
}

activeTheme = function dkActiveTheme() {
  return "red";
};

themeLabel = function dkThemeLabel() {
  return "Kurumsal Kırmızı";
};

setTheme = function dkSetTheme(_theme, rerender = true) {
  document.documentElement.dataset.theme = "red";
  document.documentElement.dataset.portal = "discipline";
  if (rerender) render();
};

toggleTheme = function dkToggleTheme() {
  document.documentElement.dataset.theme = "red";
};

canUseIhpAssistant = function dkDisableGeneralAssistant() {
  return false;
};

portalServerRequest = async function dkPortalServerRequest(path, payload = {}) {
  return serverRequest(path, {
    method: "POST",
    body: JSON.stringify(payload)
  });
};

navItems.splice(
  0,
  navItems.length,
  ["overview", "Operasyon Merkezi", "activity", () => isDkPortalActor()],
  ["discipline-council", "Kurul Hiyerarşisi", "shield", () => isDkPortalActor()],
  ["applications", "DK Başvuruları", "inbox", () => isDkPortalActor()],
  ["complaints", "Gelen Şikayetler", "clipboard", () => isDkPortalActor()],
  ["investigations", "Soruşturmalar", "search", () => isDkPortalActor()],
  ["discipline", "Kararlar ve Cezalar", "shield", () => isDkPortalActor()],
  ["discipline-operations", "Üye Raporları", "download", () => isDkPortalActor()],
  ["settings", "Hesap ve Sistem", "settings", () => isDkPortalActor()]
);

brand = function dkBrand() {
  const href = state.profile ? "#/portal/overview" : "#/home";
  return `
    <a class="brand dk-brand" href="${href}" aria-label="İHP Disiplin Kurulu ana sayfa">
      <span class="brand-mark dk-brand-mark"><img src="${esc(dkLogoUrl())}" alt="Disiplin Kurulu logosu" /></span>
      <span class="brand-copy">
        <strong>İHP</strong>
        <span>Disiplin Kurulu</span>
      </span>
    </a>
  `;
};

function dkNavButton(item, page) {
  const [id, label, iconName] = item;
  const count = badgeCountForNav(id);
  return `
    <button class="nav-item ${page === id ? "active" : ""}" type="button" data-page="${id}" ${page === id ? 'aria-current="page"' : ""}>
      <span>${icon(iconName)} <b>${esc(label)}</b></span>
      ${count ? `<em class="nav-badge">${esc(count)}</em>` : ""}
    </button>
  `;
}

navSection = function dkNavSection(page) {
  const allowed = navItems.filter(([, , , allow]) => allow());
  const workflowIds = new Set(["overview", "applications", "complaints", "investigations", "discipline"]);
  const institutionIds = new Set(["discipline-council", "discipline-operations"]);
  const systemIds = new Set(["settings"]);
  return [
    ["Vaka Yönetimi", workflowIds],
    ["Kurumsal", institutionIds],
    ["Sistem", systemIds]
  ].map(([label, ids]) => {
    const items = allowed.filter(([id]) => ids.has(id));
    if (!items.length) return "";
    return `
      <section class="nav-group" aria-label="${esc(label)}">
        <p class="nav-section-label">${esc(label)}</p>
        ${items.map((item) => dkNavButton(item, page)).join("")}
      </section>
    `;
  }).join("");
};

publicPage = function dkPublicPage() {
  return `
    <div class="dk-public">
      <header class="dk-public-header">
        ${brand()}
        <button class="btn btn-primary btn-sm" type="button" data-action="nav-login">${icon("lock")} Yetkili Girişi</button>
      </header>
      <main class="dk-public-main">
        <section class="dk-public-copy">
          <span class="dk-overline"><i></i> İHP</span>
          <h1>Disiplin<br /><span>Kurulu</span></h1>
          <div class="hero-actions">
            <button class="btn btn-primary" type="button" data-action="nav-login">Yetkili Girişi ${icon("arrow")}</button>
            <a class="btn btn-secondary" href="https://ihp-portali.vercel.app">Üye Portalına Dön</a>
          </div>
        </section>
        <section class="dk-public-emblem glass" aria-label="Disiplin süreci ön izlemesi">
          <div class="dk-emblem-halo"></div>
          <img src="${esc(dkLogoUrl())}" alt="İHP Disiplin Kurulu arması" />
          <div class="dk-process-rail">
            <span><b>01</b> Şikâyet</span>
            <span><b>02</b> Soruşturma</span>
            <span><b>03</b> Kararname</span>
          </div>
        </section>
      </main>
      <footer class="dk-public-footer"><span>İHP Disiplin Kurulu</span><span>2026</span></footer>
    </div>
  `;
};

loginPage = function dkLoginPage() {
  return `
    <main class="dk-login">
      <section class="dk-login-identity">
        ${brand()}
        <a class="back-link" href="#/home">${icon("back")} Tanıtıma dön</a>
        <div class="dk-login-seal"><img src="${esc(dkLogoUrl())}" alt="" /><span>İHP Disiplin Kurulu</span></div>
        <span class="dk-overline"><i></i> Yetkili Girişi</span>
        <h1>Disiplin<br /><span>Kurulu</span></h1>
      </section>
      <section class="dk-login-card glass">
        <div class="login-card-head">
          <span class="dk-login-number">DK</span>
          <div><span>İHP Disiplin Kurulu</span><h2>Yetkili girişi</h2></div>
        </div>
        <form class="form-stack" data-form="login">
          <div class="form-group"><label for="login-email">E-posta</label><input class="field" id="login-email" name="email" type="email" autocomplete="email" inputmode="email" required /></div>
          <div class="form-group"><label for="login-password">Şifre</label><div class="password-field"><input class="field" id="login-password" name="password" type="password" autocomplete="current-password" required minlength="6" /><button class="password-toggle" type="button" data-action="toggle-password" aria-label="Şifreyi göster">Göster</button></div></div>
          <button class="btn btn-primary login-submit" type="submit"><span>Kurul Sistemine Gir</span>${icon("arrow")}</button>
        </form>
      </section>
    </main>
  `;
};

function dkDashboardPage() {
  const data = state.cache.dkOverview || {};
  const complaints = data.complaints || state.cache.complaintBadge || [];
  const investigations = data.investigations || state.cache.investigationBadge || [];
  const records = data.records || [];
  const members = data.members || [];
  const newComplaints = complaints.filter((item) => item.status === "new");
  const openInvestigations = investigations.filter((item) => ["open", "reviewing"].includes(item.status));
  const appealedRecords = records.filter((item) => item.appeal_status === "submitted");
  const council = members
    .filter((member) => disciplineRank(member) > 0)
    .sort((a, b) => disciplineRank(b) - disciplineRank(a));
  const recentCases = [
    ...complaints.slice(0, 3).map((item) => ({
      type: "Şikâyet",
      title: item.subject || item.title || "Yeni şikâyet",
      date: item.created_at,
      page: "complaints",
      status: item.status
    })),
    ...investigations.slice(0, 3).map((item) => ({
      type: "Soruşturma",
      title: item.title || "Soruşturma",
      date: item.created_at,
      page: "investigations",
      status: item.status
    }))
  ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).slice(0, 5);

  return `
    <section class="dk-command-hero glass">
      <div>
        <span class="dk-overline"><i></i> İHP Disiplin Kurulu</span>
        <h2>Dosya Yönetimi</h2>
        <p>${esc(state.profile.display_name)} · ${esc(dkRoleLabel())}</p>
      </div>
    </section>
    <section class="metrics-grid dk-metrics">
      ${metric("Yeni şikâyet", newComplaints.length, "İnceleme bekliyor", "clipboard")}
      ${metric("Açık soruşturma", openInvestigations.length, "Devam eden dosya", "search")}
      ${metric("İtiraz", appealedRecords.length, "Karar bekleyen", "history")}
      ${metric("Kurul personeli", council.length, "Aktif hiyerarşi", "users")}
    </section>
    <section class="dk-command-grid">
      <article class="panel glass dk-case-stream">
        <div class="panel-head"><div><span class="panel-kicker">Canlı dosya akışı</span><h3>Son hareketler</h3></div><button class="table-action" type="button" data-page="complaints">Tüm şikâyetler</button></div>
        ${recentCases.length
          ? recentCases.map((item, index) => `
              <button class="dk-case-row" type="button" data-page="${esc(item.page)}">
                <span class="dk-case-index">${String(index + 1).padStart(2, "0")}</span>
                <span><small>${esc(item.type)}</small><strong>${esc(item.title)}</strong></span>
                <span>${badgeForStatus(item.status)}<small>${formatDate(item.date, true)}</small></span>
              </button>
            `).join("")
          : emptyCard("Bekleyen dosya yok", "Yeni şikâyet ve soruşturmalar burada görünecek.")}
      </article>
      <aside class="dk-action-deck">
        <button class="dk-action-card" type="button" data-page="complaints">${icon("clipboard")}<span><small>Gelen kutusu</small><strong>Şikâyetleri değerlendir</strong></span>${icon("arrow")}</button>
        <button class="dk-action-card" type="button" data-page="investigations">${icon("search")}<span><small>Dosya yönetimi</small><strong>Soruşturmaları aç</strong></span>${icon("arrow")}</button>
        <button class="dk-action-card" type="button" data-page="discipline">${icon("shield")}<span><small>Karar merkezi</small><strong>Kararname ve ceza</strong></span>${icon("arrow")}</button>
        <button class="dk-action-card" type="button" data-page="discipline-operations">${icon("download")}<span><small>Kurumsal çıktı</small><strong>Üye raporu oluştur</strong></span>${icon("arrow")}</button>
      </aside>
    </section>
  `;
}

dashboardPage = dkDashboardPage;

const dkBaseBadgeCountForNav = badgeCountForNav;
badgeCountForNav = function dkBadgeCountForNav(id) {
  if (id !== "applications") return dkBaseBadgeCountForNav(id);
  const rows = state.cache.applicationBadge || state.cache.applications || [];
  const count = rows.filter(
    (item) => targetCommitteeName(item) === "Disiplin Kurulu" && item.status === "new"
  ).length;
  return count ? String(count) : "";
};

applicationsPage = function dkApplicationsPage() {
  const rows = (state.cache.applications || []).filter(
    (item) => targetCommitteeName(item) === "Disiplin Kurulu"
  );
  return `
    ${pageHeader(
      "DK Başvuruları",
      "Disiplin Kurulu Başvuruları",
      "Disiplin Kuruluna iletilen üyelik ve görev başvuruları."
    )}
    <div class="card-grid application-grid">
      ${
        rows.length
          ? rows.map((item) => `
              <article class="entity-card glass application-card">
                <div class="entity-top">
                  ${badge(applicationTargetLabel(item), "red")}
                  ${badgeForStatus(item.status)}
                </div>
                <h3 style="margin-top:.85rem">${esc(applicationPersonLabel(item))}</h3>
                <p>${esc(item.notes || "Başvuru notu eklenmedi.")}</p>
                <div class="meta-list">
                  <div class="meta-row"><span>Talep edilen rol</span><strong>${esc(roleLabel(item.requested_role || "member"))}</strong></div>
                  <div class="meta-row"><span>Başvuru tarihi</span><strong>${formatDate(item.created_at, true)}</strong></div>
                  <div class="meta-row"><span>Sorumlu</span><strong>${esc(item.claimer?.display_name || "Henüz alınmadı")}</strong></div>
                  <div class="meta-row"><span>İşleyen yetkili</span><strong>${esc(item.decider?.display_name || "Henüz işlem yok")}</strong></div>
                  <div class="meta-row"><span>Karar notu</span><strong>${esc(item.decision_note || "Henüz karar yok")}</strong></div>
                </div>
                ${applicationActions(item)}
              </article>
            `).join("")
          : emptyCard("Bekleyen DK başvurusu yok", "Ana portaldan gelen başvurular burada listelenecek.")
      }
    </div>
  `;
};

complaintsPage = function dkComplaintsPage() {
  const rows = state.cache.complaints || [];
  return `
    ${pageHeader(
      "Gelen Şikayetler",
      "Şikayet Dosyaları",
      "Kurula iletilen şikayet kayıtları."
    )}
    <div class="card-grid application-grid">
      ${
        rows.length
          ? rows.map((item) => `
              <article class="entity-card glass application-card">
                <div class="entity-top">
                  ${badge(complaintTargetLabel(item), "blue")}
                  ${badgeForStatus(item.status)}
                </div>
                <h3 style="margin-top:.85rem">${esc(item.subject)}</h3>
                <p>${esc(item.description || "Açıklama eklenmedi.")}</p>
                <div class="meta-list">
                  <div class="meta-row"><span>Şikayet eden</span><strong>${esc(complaintPersonLabel(item))}</strong></div>
                  <div class="meta-row"><span>Öncelik</span><strong>${esc(priorityLabel(item.priority || "normal"))}</strong></div>
                  <div class="meta-row"><span>Sorumlu</span><strong>${esc(item.assignee?.display_name || "Henüz alınmadı")}</strong></div>
                  <div class="meta-row"><span>İşleyen yetkili</span><strong>${esc(item.decider?.display_name || "Henüz işlem yok")}</strong></div>
                  <div class="meta-row"><span>Karar notu</span><strong>${esc(item.decision_note || "Henüz karar yok")}</strong></div>
                  <div class="meta-row"><span>Kanıt notu</span><strong>${esc(item.evidence_note || "Eklenmedi")}</strong></div>
                  <div class="meta-row meta-row-stack"><span>Dosya ekleri</span>${caseAttachmentsMarkup(item)}</div>
                  <div class="meta-row"><span>Tarih</span><strong>${formatDate(item.created_at, true)}</strong></div>
                </div>
                ${complaintActions(item)}
              </article>
            `).join("")
          : emptyCard("Gelen şikayet yok", "Üyelerin ana portaldan gönderdiği şikayetler burada listelenecek.")
      }
    </div>
  `;
};

function dkSettingsPage() {
  const profile = state.profile;
  const logo = dkLogoUrl();
  return `
    ${pageHeader("Hesap ve Sistem", "Kurul tercihleri", "DK teması kurumsal kırmızı olarak sabittir. Hesap ve güvenlik işlemleri bu alandan yürütülür.")}
    <section class="dashboard-grid">
      <article class="panel glass">
        <div class="panel-head"><div><span class="panel-kicker">Hesabım</span><h3>Profil bilgileri</h3></div>${badge(dkRoleLabel(), hasRole("super_admin") ? "red" : "gold")}</div>
        <form class="form-stack" data-form="profile-settings">
          <div class="preview-profile">${avatar(profile)}<div><strong>${esc(profile.display_name)}</strong><span>${esc(roleLabels(profile))}</span></div></div>
          <div class="form-grid">
            <div class="form-group"><label for="profile-name">Ad soyad</label><input class="field" id="profile-name" name="displayName" value="${esc(profile.display_name)}" required minlength="2" maxlength="48" /></div>
            <div class="form-group"><label for="profile-initials">Avatar kısaltması</label><input class="field" id="profile-initials" name="avatarInitials" value="${esc(profile.avatar_initials || "")}" maxlength="4" /></div>
          </div>
          <div class="form-grid">
            <div class="form-group"><label for="profile-color">Avatar rengi</label><input class="field" id="profile-color" name="avatarColor" type="color" value="${esc(profile.avatar_color || "#9f2233")}" /></div>
            <div class="form-group"><label for="profile-file">Profil fotoğrafı</label><input class="field" id="profile-file" type="file" accept="image/*" data-avatar-upload data-avatar-target="profile-avatar-url" /><input id="profile-avatar-url" name="avatarUrl" type="hidden" value="${esc(profile.avatar_url || "")}" /></div>
          </div>
          <button class="btn btn-primary btn-sm" type="submit">Profili kaydet</button>
        </form>
      </article>
      <article class="panel glass">
        <div class="panel-head"><div><span class="panel-kicker">Güvenlik</span><h3>Şifre değiştir</h3></div><span>Eski şifre gerekli</span></div>
        <form class="form-stack" data-form="change-password">
          <div class="form-group"><label for="old-password">Eski şifre</label><input class="field" id="old-password" name="oldPassword" type="password" autocomplete="current-password" required /></div>
          <div class="form-group"><label for="new-password">Yeni şifre</label><input class="field" id="new-password" name="newPassword" type="password" autocomplete="new-password" required minlength="8" /></div>
          <button class="btn btn-primary btn-sm" type="submit">Şifreyi güncelle</button>
        </form>
        <div class="dk-theme-lock">${icon("lock")}<span><strong>Tema kilitli</strong><small>Kurul ciddiyeti ve tutarlılığı için bu sitede kırmızı kurumsal tema kullanılır.</small></span></div>
      </article>
    </section>
    ${hasRole("super_admin") ? `
      <section class="panel glass dk-logo-settings">
        <div class="panel-head"><div><span class="panel-kicker">Sistem yönetimi</span><h3>Disiplin Kurulu logosu</h3></div>${badge("Sistem Yöneticisi", "red")}</div>
        <form class="form-stack" data-form="dk-logo">
          <div class="dk-logo-preview"><span><img src="${esc(logo)}" alt="DK logo ön izlemesi" /></span><div><strong>DK sitesine özel marka</strong><p>Ana portalın logosundan bağımsızdır ve yalnızca bu sitede kullanılır.</p></div></div>
          <div class="form-group"><label for="dk-logo-file">Yeni logo yükle</label><input class="field" id="dk-logo-file" type="file" accept="image/png,image/jpeg,image/webp" data-avatar-upload data-avatar-target="dk-logo-url" /><input id="dk-logo-url" name="logoUrl" type="hidden" value="${esc(state.cache.settings?.dk_logo_url || "")}" /></div>
          <div class="modal-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="clear-dk-logo">Varsayılan armaya dön</button><button class="btn btn-primary btn-sm" type="submit">${icon("upload")} DK logosunu kaydet</button></div>
        </form>
      </section>
    ` : ""}
  `;
}

settingsPage = dkSettingsPage;

portalShell = function dkPortalShell(page) {
  const profile = state.profile;
  const notifications = state.cache.notifications || [];
  const unread = notifications.filter((item) => !item.read_at).length;
  return `
    <div class="app-shell dk-app-shell">
      <aside class="sidebar dk-sidebar ${state.sidebarOpen ? "open" : ""}" aria-label="Disiplin Kurulu menüsü">
        <div class="sidebar-head">${brand()}</div>
        <div class="dk-sidebar-stamp"><span>GİZLİ</span><small>Kurul çalışma alanı</small></div>
        <nav class="app-nav">${navSection(page)}</nav>
        <div class="sidebar-bottom">
          <button class="side-profile" type="button" data-page="settings">${avatar(profile)}<span><strong>${esc(profile.display_name)}</strong><small>${esc(dkRoleLabel(profile))}</small></span></button>
          <button class="nav-item logout-item" type="button" data-action="logout">${icon("logout")} <b>Güvenli Çıkış</b></button>
        </div>
      </aside>
      <button class="mobile-backdrop ${state.sidebarOpen ? "open" : ""}" type="button" data-action="close-sidebar" aria-label="Menüyü kapat"></button>
      <main class="app-main dk-app-main">
        <header class="topbar dk-topbar">
          <div class="topbar-left"><button class="icon-btn mobile-menu-btn" type="button" data-action="toggle-sidebar" aria-label="Menüyü aç">${icon("menu")}</button><div><span class="topbar-kicker">İHP / Disiplin Kurulu</span><h1>${esc(pageName(page))}</h1></div></div>
          <div class="top-actions">
            <span class="dk-fixed-theme"><i></i> Kurumsal Kırmızı</span>
            <button class="icon-btn notification-btn" type="button" data-action="open-notifications" aria-label="Bildirimleri aç">${icon("bell")}${unread ? `<span class="notification-count">${unread}</span>` : ""}</button>
            <button class="profile-chip" type="button" data-page="settings">${avatar(profile)}<span>${esc(profile.display_name)}</span></button>
          </div>
        </header>
        <div class="app-content" id="main-content">${premiumPageBody(page)}</div>
      </main>
    </div>
  `;
};

const dkBaseLoadPage = loadPage;
loadPage = async function dkLoadPage(page) {
  if (page !== "overview") return dkBaseLoadPage(page);
  state.loading = true;
  state.pageError = null;
  render();
  try {
    const [notifications, complaints, investigations, records, members, settings] = await Promise.all([
      loadNotifications(),
      loadComplaints(),
      loadInvestigations(),
      loadDisciplineRecords(),
      loadMembers(),
      loadSettings()
    ]);
    state.cache.notifications = notifications;
    state.cache.complaintBadge = complaints;
    state.cache.investigationBadge = investigations;
    state.cache.settings = settings;
    state.cache.dkOverview = { complaints, investigations, records, members };
  } catch (error) {
    state.pageError = { page, message: error?.message || "Operasyon merkezi yüklenemedi." };
    showToast(state.pageError.message, "error");
  } finally {
    state.loading = false;
    render();
  }
};

function dkAccessDeniedPage() {
  return `
    <main class="dk-access-denied">
      <section class="glass">
        <span class="dk-denied-mark">${icon("lock")}</span>
        <span class="dk-overline"><i></i> Erişim sınırlandırıldı</span>
        <h1>Bu hesap DK sistemine yetkili değil.</h1>
        <p>Bu sistem yalnızca yetkili Disiplin Kurulu personeline açıktır.</p>
        <div class="hero-actions"><a class="btn btn-primary" href="https://ihp-portali.vercel.app">Ana Portala Dön</a><button class="btn btn-secondary" type="button" data-action="logout">Oturumu Kapat</button></div>
      </section>
    </main>
  `;
}

const dkBaseRender = render;
render = function dkRender() {
  document.documentElement.dataset.theme = "red";
  document.documentElement.dataset.portal = "discipline";
  if (!state.booting && state.profile && route().startsWith("portal") && !isDkPortalActor()) {
    app.innerHTML = dkAccessDeniedPage();
    return;
  }
  dkBaseRender();
};

const dkBaseSubmitForm = submitForm;
submitForm = async function dkSubmitForm(event) {
  const form = event.target.closest("form[data-form]");
  if (form?.dataset.form !== "dk-logo") return dkBaseSubmitForm(event);
  event.preventDefault();
  if (!hasRole("super_admin")) {
    showToast("DK logosunu yalnızca Sistem Yöneticisi değiştirebilir.", "error");
    return;
  }
  const submit = form.querySelector('[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    const values = formData(form);
    const rows = await updateRecord("portal_settings", "main", {
      dk_logo_url: values.logoUrl || null,
      updated_by: state.profile.id
    });
    state.cache.settings = rows?.[0] || (await loadSettings());
    showToast("Disiplin Kurulu logosu güncellendi.");
    render();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    if (submit) submit.disabled = false;
  }
};

const dkBaseHandleClick = handleClick;
handleClick = async function dkHandleClick(event) {
  const target = event.target.closest("[data-action]");
  if (target?.dataset.action === "clear-dk-logo") {
    event.preventDefault();
    if (!hasRole("super_admin")) return;
    const input = document.getElementById("dk-logo-url");
    if (input) input.value = "";
    showToast("Varsayılan DK arması seçildi. Kaydetmeyi unutmayın.");
    return;
  }
  return dkBaseHandleClick(event);
};
