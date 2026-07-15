const IHP_PWA_MOBILE_V1 = true;
const IHP_PWA_VARIANT = document.querySelector('meta[name="ihp-app-variant"]')?.content || "main";
const IHP_IS_IOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const ihpPwaState = {
  installPrompt: null,
  registration: null,
  subscription: null,
  passkeys: [],
  passkeyError: "",
  checking: false
};

if (location.hostname === "ihp.org.tr" && IHP_PWA_VARIANT !== "main") {
  const manifest = document.querySelector('link[rel="manifest"]');
  if (manifest) manifest.href = "/manifest.webmanifest";
}

function ihpPwaStandalone() {
  return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

function ihpPwaSupported() {
  return "serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost");
}

function ihpPasskeySupported() {
  return Boolean(state.config?.passkeysEnabled && globalThis.PublicKeyCredential && navigator.credentials);
}

async function ihpPwaRegistration() {
  if (!ihpPwaSupported()) return null;
  if (ihpPwaState.registration) return ihpPwaState.registration;
  ihpPwaState.registration = await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
  return ihpPwaState.registration;
}

function ihpApplicationUrl(appName) {
  if (location.hostname === "ihp.org.tr") {
    return {
      portal: "/#/portal/overview",
      mail: "/mail/#/portal/mail",
      finance: "/finans/#/portal/overview",
      discipline: "/dk/#/portal/overview"
    }[appName];
  }
  return {
    portal: "https://ihp.org.tr/#/portal/overview",
    mail: "https://mail.ihp.org.tr/#/portal/mail",
    finance: "https://ihp-finans.vercel.app/#/portal/overview",
    discipline: "https://dk.ihp.org.tr/#/portal/overview"
  }[appName];
}

function ihpCanOpenDiscipline() {
  return rolesOf().some((role) => ["super_admin", "discipline_chair", "discipline_vice_chair", "discipline_member"].includes(role));
}

async function ihpPushRequest(payload) {
  return serverRequest("/api/push", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

function ihpBase64UrlToBytes(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

async function ihpRefreshPushState() {
  if (!ihpPwaSupported()) return;
  const registration = await ihpPwaRegistration().catch(() => null);
  ihpPwaState.subscription = registration && "pushManager" in registration
    ? await registration.pushManager.getSubscription().catch(() => null)
    : null;
}

async function ihpRefreshPasskeys() {
  ihpPwaState.passkeys = [];
  ihpPwaState.passkeyError = "";
  if (!state.profile || !ihpPasskeySupported()) return;
  try {
    const module = await import("./pwa-passkeys.js");
    ihpPwaState.passkeys = await module.listIhpPasskeys();
  } catch (error) {
    ihpPwaState.passkeyError = error.message || "Cihaz anahtarları alınamadı.";
  }
}

function ihpPushStatusLabel() {
  if (!state.config?.pushConfigured) return "Yapılandırılmadı";
  if (!("Notification" in globalThis)) return "Desteklenmiyor";
  if (Notification.permission === "denied") return "Engellendi";
  if (ihpPwaState.subscription) return "Açık";
  return "Kapalı";
}

function ihpInstallStatusLabel() {
  if (ihpPwaStandalone()) return "Telefona kurulu";
  if (!ihpPwaSupported()) return "Desteklenmiyor";
  return "Kurulabilir";
}

function ihpMobileAppCard({ name, subtitle, iconName, href, tone = "blue", active = false }) {
  return `
    <a class="pwa-app-card pwa-app-${tone} ${active ? "is-current" : ""}" href="${esc(href)}">
      <span class="pwa-app-icon">${icon(iconName)}</span>
      <span><small>${active ? "AÇIK UYGULAMA" : "İHP MOBİL"}</small><strong>${esc(name)}</strong><em>${esc(subtitle)}</em></span>
      ${icon("chevron")}
    </a>
  `;
}

function ihpPasskeyRows() {
  if (!ihpPasskeySupported()) return `<p class="pwa-inline-note">Bu cihaz passkey kullanımını desteklemiyor.</p>`;
  if (ihpPwaState.passkeyError) return `<p class="pwa-inline-note">${esc(ihpPwaState.passkeyError)}</p>`;
  if (!ihpPwaState.passkeys.length) return `<p class="pwa-inline-note">Bu hesaba bağlı cihaz anahtarı yok.</p>`;
  return `<div class="pwa-passkey-list">${ihpPwaState.passkeys.map((item) => `
    <article><span>${icon("lock")}</span><div><strong>${esc(item.friendly_name || "Cihaz anahtarı")}</strong><small>${item.created_at ? formatDate(item.created_at, true) : "Kayıtlı"}</small></div><button type="button" data-action="pwa-delete-passkey" data-id="${esc(item.id)}">Kaldır</button></article>
  `).join("")}</div>`;
}

function ihpMobilePage() {
  const notificationReady = ihpPwaState.subscription && Notification.permission === "granted";
  return `
    ${pageHeader(
      "İHP Mobil",
      "Tek uygulama, bütün çalışma alanları",
      "Portal, kurumsal posta, finans ve yetkili kullanıcılar için Disiplin Kurulu aynı mobil merkezden açılır.",
      `<span class="pwa-live-pill"><i></i>${esc(ihpInstallStatusLabel())}</span>`
    )}
    <section class="pwa-mobile-hero glass">
      <div class="pwa-mobile-mark"><img src="/assets/pwa/icon-192.png" alt="İHP Mobil" /></div>
      <div><span>İHP MOBİL</span><h2>Telefonunuzdaki çalışma merkezi.</h2><p>Tarayıcı çubuğu olmadan açılır, oturumunuzu korur ve önemli işlemleri bildirim olarak ulaştırır.</p></div>
      ${ihpPwaStandalone()
        ? `<span class="pwa-installed-check">${icon("check")} Kurulu</span>`
        : `<button class="btn btn-primary" type="button" data-action="pwa-install">${icon("download")} Telefonuma Kur</button>`}
    </section>
    <section class="pwa-section-head"><div><span>UYGULAMALAR</span><h3>Çalışma alanları</h3></div><p>Yetkinize açık uygulamalar gösterilir.</p></section>
    <section class="pwa-app-grid">
      ${ihpMobileAppCard({ name: "Üye Portalı", subtitle: "Üyeler, kurullar, duyurular ve kişisel işlemler", iconName: "home", href: ihpApplicationUrl("portal"), active: true })}
      ${ihpMobileAppCard({ name: "İHP Mail", subtitle: "Kurumsal gelen kutusu ve yazışmalar", iconName: "inbox", href: ihpApplicationUrl("mail"), tone: "violet" })}
      ${ihpMobileAppCard({ name: "İHP Finans", subtitle: "Kredi hesabı, borçlar ve sanal portföy", iconName: "chart", href: ihpApplicationUrl("finance"), tone: "green" })}
      ${ihpCanOpenDiscipline() ? ihpMobileAppCard({ name: "Disiplin Kurulu", subtitle: "Yetkili vaka ve karar çalışma alanı", iconName: "shield", href: ihpApplicationUrl("discipline"), tone: "red" }) : ""}
    </section>
    <section class="pwa-settings-grid">
      <article class="panel glass pwa-setting-card">
        <div class="panel-head"><div><span class="panel-kicker">BİLDİRİMLER</span><h3>Kilit ekranı bildirimleri</h3></div>${badge(ihpPushStatusLabel(), notificationReady ? "green" : "gray")}</div>
        <p>Mail, soruşturma, karar, rol ve diğer önemli portal kayıtları telefonunuza güvenli şekilde ulaşır.</p>
        <div class="pwa-setting-actions">
          ${notificationReady
            ? `<button class="btn btn-secondary btn-sm" type="button" data-action="pwa-test-push">Test bildirimi</button><button class="btn btn-danger btn-sm" type="button" data-action="pwa-disable-push">Bildirimleri kapat</button>`
            : `<button class="btn btn-primary btn-sm" type="button" data-action="pwa-enable-push">${icon("bell")} Bildirimleri Aç</button>`}
        </div>
      </article>
      <article class="panel glass pwa-setting-card" ${state.config?.passkeysEnabled ? "" : "hidden"}>
        <div class="panel-head"><div><span class="panel-kicker">GÜVENLİ GİRİŞ</span><h3>Face ID ve cihaz anahtarı</h3></div>${badge(ihpPwaState.passkeys.length ? `${ihpPwaState.passkeys.length} bağlı` : "Kapalı", ihpPwaState.passkeys.length ? "green" : "gray")}</div>
        <p>Bu cihazda destekleniyorsa şifre yazmadan Face ID, Touch ID, cihaz PIN'i veya güvenlik anahtarıyla giriş yapabilirsiniz.</p>
        ${ihpPasskeyRows()}
        ${ihpPasskeySupported() ? `<div class="pwa-setting-actions"><button class="btn btn-primary btn-sm" type="button" data-action="pwa-register-passkey">${icon("lock")} Bu cihazı bağla</button></div>` : ""}
      </article>
    </section>
    <section class="pwa-privacy-note">${icon("shield")}<div><strong>Özel kayıtlar çevrimdışı saklanmaz.</strong><p>Uygulama yalnızca tasarım dosyalarını önbelleğe alır; profil, mail, finans ve disiplin API cevapları cihaz önbelleğine yazılmaz.</p></div></section>
  `;
}

function ihpInstallFloatingButton() {
  if (IHP_PWA_VARIANT !== "main" || ihpPwaStandalone()) return "";
  return `<button class="pwa-install-floating" type="button" data-action="pwa-install">${icon("download")}<span><strong>İHP Mobil</strong><small>Telefonuma kur</small></span></button>`;
}

function ihpOpenInstallHelp() {
  const iosBody = `
    <div class="pwa-install-steps">
      <span>1</span><p>Safari alt menüsündeki <strong>Paylaş</strong> düğmesine dokunun.</p>
      <span>2</span><p><strong>Ana Ekrana Ekle</strong> seçeneğini açın.</p>
      <span>3</span><p>Sağ üstteki <strong>Ekle</strong> düğmesiyle kurulumu tamamlayın.</p>
    </div>`;
  modal({
    title: "İHP Mobil'i yükle",
    subtitle: IHP_IS_IOS ? "iPhone ve iPad kurulumu" : "Tarayıcı menüsünden yükleme",
    body: IHP_IS_IOS ? iosBody : `<p class="section-copy">Tarayıcı menüsünü açıp “Uygulamayı yükle” veya “Ana ekrana ekle” seçeneğini kullanın.</p>`,
    actions: `<div class="modal-actions"><button class="btn btn-primary btn-sm" type="button" data-action="close-modal">Tamam</button></div>`
  });
}

async function ihpRequestInstall() {
  if (ihpPwaStandalone()) return showToast("İHP Mobil bu cihazda zaten kurulu.");
  if (!ihpPwaState.installPrompt) return ihpOpenInstallHelp();
  const prompt = ihpPwaState.installPrompt;
  ihpPwaState.installPrompt = null;
  await prompt.prompt();
  const result = await prompt.userChoice;
  showToast(result.outcome === "accepted" ? "İHP Mobil kuruluyor." : "Kurulum iptal edildi.", result.outcome === "accepted" ? "success" : "error");
  render();
}

async function ihpEnablePush() {
  if (!state.config?.pushConfigured) throw new Error("Bildirim sunucusu henüz yapılandırılmadı.");
  if (!("Notification" in globalThis)) throw new Error("Bu tarayıcı bildirimleri desteklemiyor.");
  if (IHP_IS_IOS && !ihpPwaStandalone()) {
    ihpOpenInstallHelp();
    throw new Error("iPhone'da bildirim için önce İHP Mobil'i ana ekrana ekleyin.");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Bildirim izni verilmedi.");
  const registration = await ihpPwaRegistration();
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: ihpBase64UrlToBytes(state.config.vapidPublicKey)
  });
  await ihpPushRequest({ action: "subscribe", subscription: subscription.toJSON(), appScope: IHP_PWA_VARIANT });
  ihpPwaState.subscription = subscription;
  await navigator.setAppBadge?.((state.cache.notifications || []).filter((item) => !item.read_at).length).catch?.(() => undefined);
}

async function ihpDisablePush() {
  const subscription = ihpPwaState.subscription;
  if (subscription) {
    await ihpPushRequest({ action: "unsubscribe", endpoint: subscription.endpoint }).catch(() => undefined);
    await subscription.unsubscribe();
  }
  ihpPwaState.subscription = null;
  await navigator.clearAppBadge?.().catch?.(() => undefined);
}

async function ihpLoadMobileData() {
  ihpPwaState.checking = true;
  await Promise.all([ihpRefreshPushState(), ihpRefreshPasskeys()]);
  ihpPwaState.checking = false;
}

function ihpSyncAppBadge() {
  const unread = (state.cache.notifications || []).filter((item) => !item.read_at).length;
  if (unread) navigator.setAppBadge?.(unread).catch?.(() => undefined);
  else navigator.clearAppBadge?.().catch?.(() => undefined);
}

if (IHP_PWA_VARIANT === "main") {
  permissions.mobile = () => Boolean(state.profile) && !state.profile.is_system_account;
  if (!navItems.some(([id]) => id === "mobile")) {
    const overviewIndex = navItems.findIndex(([id]) => id === "overview");
    navItems.splice(overviewIndex < 0 ? 0 : overviewIndex + 1, 0, ["mobile", "İHP Mobil", "grid", permissions.mobile]);
  }

  const ihpPwaBaseRenderPortalPage = renderPortalPage;
  renderPortalPage = function ihpPwaRenderPortalPage(page) {
    return page === "mobile" ? ihpMobilePage() : ihpPwaBaseRenderPortalPage(page);
  };

  const ihpPwaBaseLoadPage = loadPage;
  loadPage = async function ihpPwaLoadPage(page) {
    if (page !== "mobile") return ihpPwaBaseLoadPage(page);
    state.loading = true;
    state.pageError = null;
    render();
    try {
      await loadNavigationSummary();
      await ihpLoadMobileData();
    } catch (error) {
      state.pageError = { page, message: error.message };
      showToast(error.message, "error");
    } finally {
      state.loading = false;
      render();
    }
  };

  const ihpPwaBaseDashboardPage = dashboardPage;
  dashboardPage = function ihpPwaDashboardPage() {
    return `${ihpPwaBaseDashboardPage()}<button class="pwa-dashboard-strip glass" type="button" data-page="mobile"><img src="/assets/pwa/icon-192.png" alt="" /><span><small>İHP MOBİL</small><strong>Portalınızı telefonunuza kurun</strong><em>Uygulamalar, bildirimler ve güvenli giriş tek yerde</em></span>${icon("chevron")}</button>`;
  };

  const ihpPwaBasePublicPage = publicPage;
  publicPage = function ihpPwaPublicPage() {
    return `${ihpPwaBasePublicPage()}${ihpInstallFloatingButton()}`;
  };
}

const ihpPwaBaseLoginPage = loginPage;
loginPage = function ihpPwaLoginPage() {
  const base = ihpPwaBaseLoginPage();
  if (!ihpPasskeySupported()) return `${base}${IHP_PWA_VARIANT === "main" ? ihpInstallFloatingButton() : ""}`;
  const passkey = `<div class="pwa-login-divider"><span>veya</span></div><button class="pwa-passkey-login" type="button" data-action="pwa-passkey-login">${icon("lock")} Face ID veya cihaz anahtarıyla giriş</button>`;
  return `${base.replace("</form>", `</form>${passkey}`)}${IHP_PWA_VARIANT === "main" ? ihpInstallFloatingButton() : ""}`;
};

const ihpPwaBaseRender = render;
render = function ihpPwaRender() {
  ihpPwaBaseRender();
  requestAnimationFrame(ihpSyncAppBadge);
};

const ihpPwaBaseHandleClick = handleClick;
handleClick = async function ihpPwaHandleClick(event) {
  const target = event.target.closest("[data-action]");
  const action = target?.dataset.action;
  if (!action?.startsWith("pwa-")) return ihpPwaBaseHandleClick(event);
  event.preventDefault();
  target.disabled = true;
  try {
    if (action === "pwa-install") await ihpRequestInstall();
    if (action === "pwa-enable-push") {
      await ihpEnablePush();
      showToast("Telefon bildirimleri açıldı.", "success");
      render();
    }
    if (action === "pwa-disable-push") {
      await ihpDisablePush();
      showToast("Telefon bildirimleri kapatıldı.");
      render();
    }
    if (action === "pwa-test-push") {
      await ihpPushRequest({ action: "test" });
      showToast("Test bildirimi gönderildi.", "success");
    }
    if (action === "pwa-register-passkey") {
      const module = await import("./pwa-passkeys.js");
      await module.registerIhpPasskey();
      await ihpRefreshPasskeys();
      showToast("Bu cihaz güvenli giriş için bağlandı.", "success");
      render();
    }
    if (action === "pwa-delete-passkey") {
      const module = await import("./pwa-passkeys.js");
      await module.deleteIhpPasskey(target.dataset.id);
      await ihpRefreshPasskeys();
      showToast("Cihaz anahtarı kaldırıldı.");
      render();
    }
    if (action === "pwa-passkey-login") {
      const module = await import("./pwa-passkeys.js");
      await module.signInWithIhpPasskey();
      location.hash = "#/portal/overview";
      location.reload();
    }
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    target.disabled = false;
  }
};

globalThis.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  ihpPwaState.installPrompt = event;
  if (!state.booting) render();
});

globalThis.addEventListener("appinstalled", () => {
  ihpPwaState.installPrompt = null;
  showToast("İHP Mobil telefonunuza kuruldu.", "success");
  if (!state.booting) render();
});

ihpPwaRegistration().catch(() => undefined);
