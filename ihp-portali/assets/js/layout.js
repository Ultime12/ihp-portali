import { getMyProfile, signOut } from "./auth.js";
import { canAtLeast, pagePath, roleBadge, escapeHtml } from "./utils.js";

const NAV = [
  { page: "home", label: "Ana Sayfa", public: true },
  { page: "announcements", label: "Duyurular", public: true },
  { page: "events", label: "Etkinlikler", public: true },
  { page: "gaming", label: "Oyun Merkezi", public: true },
  { page: "applications", label: "Başvuru", public: true },
  { page: "dashboard", label: "Panel", auth: true },
  { page: "profile", label: "Profil", auth: true },
  { page: "elections", label: "Seçimler", auth: true },
  { page: "executive", label: "Yürütme", auth: true, predicate: (p) => p?.is_executive_member || canAtLeast(p, "yonetici") },
  { page: "discipline", label: "Disiplin", auth: true, predicate: (p) => p?.is_discipline_member || canAtLeast(p, "yonetici") },
  { page: "admin", label: "Yönetim", auth: true, minRole: "yonetici" },
];

function theme() {
  return localStorage.getItem("ihp-theme") || "light";
}

function setTheme(next) {
  document.documentElement.dataset.theme = next;
  localStorage.setItem("ihp-theme", next);
}

export async function renderLayout() {
  setTheme(theme());
  const shell = document.getElementById("site-shell");
  const page = document.body.dataset.page;
  const profile = await getMyProfile();
  const links = NAV.filter((item) => {
    if (item.public) return true;
    if (item.auth && !profile) return false;
    if (item.minRole && !canAtLeast(profile, item.minRole)) return false;
    if (item.predicate && !item.predicate(profile)) return false;
    return true;
  });

  shell.innerHTML = `
    <header class="site-header">
      <div class="topbar">
        <a class="brand" href="${pagePath("home")}" aria-label="İHP Portalı ana sayfa">
          <div class="logo-mark">İHP</div>
          <div>
            <span class="brand-title">İstiklal Hürriyet Partisi</span>
            <span class="brand-subtitle">Öğrenci Topluluğu Portalı</span>
          </div>
        </a>
        <button class="icon-btn nav-toggle" type="button" aria-label="Menüyü aç/kapat">☰</button>
        <nav class="main-nav" aria-label="Ana menü">
          ${links.map((item) => `<a class="nav-link ${item.page === page ? "active" : ""}" href="${pagePath(item.page)}">${item.label}</a>`).join("")}
          ${profile ? `<span class="nav-link user-pill">${escapeHtml(profile.full_name || "Üye")} ${roleBadge(profile.role)}</span><button class="nav-link" id="logoutButton" type="button">Çıkış</button>` : `<a class="nav-link ${page === "auth" ? "active" : ""}" href="${pagePath("login")}">Giriş</a>`}
          <button class="icon-btn" id="themeToggle" type="button" title="Karanlık mod">${theme() === "dark" ? "☀" : "☾"}</button>
        </nav>
      </div>
    </header>
    <main id="page-root" class="page-shell"></main>
    <footer class="footer">
      <span>© ${new Date().getFullYear()} İstiklal Hürriyet Partisi Portalı</span>
      <span>Demokrasi · Eşitlik · Saygı · Şeffaflık</span>
    </footer>
  `;

  document.querySelector(".nav-toggle")?.addEventListener("click", () => document.querySelector(".main-nav")?.classList.toggle("open"));
  document.getElementById("themeToggle")?.addEventListener("click", () => {
    const next = theme() === "dark" ? "light" : "dark";
    setTheme(next);
    document.getElementById("themeToggle").textContent = next === "dark" ? "☀" : "☾";
  });
  document.getElementById("logoutButton")?.addEventListener("click", signOut);
}
