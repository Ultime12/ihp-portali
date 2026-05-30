export const ROLES = ["uye", "temsilci", "yonetici", "baskan_yardimcisi", "genel_baskan"];

export const ROLE_LABELS = {
  ziyaretci: "Ziyaretçi",
  uye: "Üye",
  temsilci: "Temsilci",
  yonetici: "Yönetici",
  baskan_yardimcisi: "Başkan Yardımcısı",
  genel_baskan: "Genel Başkan",
};

export function qs(selector, parent = document) {
  return parent.querySelector(selector);
}

export function qsa(selector, parent = document) {
  return [...parent.querySelectorAll(selector)];
}

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function nl2br(value = "") {
  return escapeHtml(value).replaceAll("\n", "<br>");
}

export function formatDate(value, withTime = true) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: withTime ? "short" : undefined,
  }).format(date);
}

export function roleRank(role = "ziyaretci") {
  if (role === "genel_baskan") return 50;
  if (role === "baskan_yardimcisi") return 40;
  if (role === "yonetici") return 30;
  if (role === "temsilci") return 20;
  if (role === "uye") return 10;
  return 0;
}

export function canAtLeast(profile, minRole) {
  return roleRank(profile?.role) >= roleRank(minRole);
}

export function roleBadge(role) {
  const label = ROLE_LABELS[role] || role || "Ziyaretçi";
  return `<span class="role-badge ${escapeHtml(role || "ziyaretci")}">${escapeHtml(label)}</span>`;
}

export function statusBadge(status = "pending") {
  return `<span class="status-badge ${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</span>`;
}

export function statusLabel(status) {
  const map = {
    draft: "Taslak",
    published: "Yayında",
    pending: "Beklemede",
    approved: "Onaylandı",
    rejected: "Reddedildi",
    open: "Açık",
    closed: "Kapalı",
    archived: "Arşiv",
    accepted: "Katılıyor",
    declined: "Katılmıyor",
    yes: "Evet",
    no: "Hayır",
    abstain: "Çekimser",
    investigating: "Soruşturma",
    decided: "Karar verildi",
  };
  return map[status] || status;
}

export function toast(message, type = "info") {
  let container = qs(".toast-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4600);
}

export function pagePath(page) {
  const inPages = location.pathname.includes("/pages/");
  if (page === "home") return inPages ? "../index.html" : "./index.html";
  return inPages ? `./${page}.html` : `./pages/${page}.html`;
}

export function getFormData(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string") data[key] = value.trim();
  }
  return data;
}

export function emptyState(text = "Kayıt bulunamadı.") {
  return `<div class="empty">${escapeHtml(text)}</div>`;
}

export function requireConfiguredNotice() {
  return `<div class="notice warn"><strong>Supabase bağlantısı kurulmamış.</strong><br>assets/js/config.js dosyasına Supabase URL ve anon/publishable key değerlerini girin, ardından database/schema.sql dosyasını Supabase SQL Editor'da çalıştırın.</div>`;
}

export function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function truncate(value = "", max = 140) {
  const str = String(value || "");
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}
