import {
  getConfig,
  getSession,
  loadConfig,
  changePassword,
  signIn,
  signOut
} from "./lib/supabase.js";
import {
  createAnnouncement,
  createApplication,
  createComplaint,
  createDisciplineRecord,
  createRegulation,
  createYouthActivity,
  deleteRecord,
  disciplineAppeal,
  getProfile,
  inviteMember,
  loadAnnouncements,
  loadApplications,
  loadAuditLogs,
  loadComplaints,
  loadCommittees,
  loadDashboard,
  loadDisciplineRecords,
  loadInvestigations,
  loadMembers,
  loadNotifications,
  loadPositions,
  loadRegulations,
  loadSettings,
  loadYouthActivities,
  applyDisciplineSanction,
  manageMember,
  manageInvestigation,
  reviewComplaint,
  reviewApplication,
  deleteOwnAccount,
  updateRecord
} from "./lib/portal-service.js";
import { icon } from "./ui/icons.js";

const app = document.querySelector("#app");
const modalRoot = document.querySelector("#modal-root");
const toastRoot = document.querySelector("#toast-root");

const ROLE_LABELS = {
  super_admin: "Admin",
  president: "Başkan",
  vice_president: "Başkan Yardımcısı",
  presidential_aide: "Başkan Yaveri",
  spokesperson: "Parti Sözcüsü",
  credit_officer: "Kredi İşleri Sorumlusu",
  discipline_chair: "Disiplin Kurulu Başkanı",
  discipline_vice_chair: "Disiplin Kurulu Başkan Yardımcısı",
  discipline_member: "Disiplin Kurulu Üyesi",
  youth_chair: "Gençlik Kolları Başkanı",
  youth_member: "Gençlik Kolları Üyesi",
  representative: "Temsilci",
  chief_representative: "Baş Temsilci",
  member: "Üye"
};

const ROLE_OPTIONS = Object.entries(ROLE_LABELS);

const THEME_OPTIONS = [
  ["blue", "Mavi"],
  ["light", "Aydınlık"],
  ["green", "Yeşil"],
  ["pink", "Pembe"],
  ["red", "Kırmızı"]
];

const STATUS_LABELS = {
  active: "Aktif",
  passive: "Pasif",
  suspended: "Askıda",
  left: "Ayrıldı",
  pending: "Beklemede",
  vacant: "Boş",
  transferred: "Devredildi",
  draft: "Taslak",
  published: "Yayında",
  archived: "Arşiv",
  reviewing: "İncelemede",
  decided: "Kararname Yazıldı",
  appealed: "İtirazda",
  closed: "Kapatıldı",
  new: "Yeni",
  accepted: "Kabul",
  rejected: "Reddedildi",
  resolved: "Çözüldü",
  planned: "Planlandı",
  completed: "Tamamlandı",
  none: "Yok",
  open: "Açık",
  cancelled: "İptal",
  submitted: "İtiraz edildi",
  appeal_accepted: "İtiraz kabul",
  appeal_rejected: "İtiraz red"
};

const state              = {
  booting: true,
  loading: false,
  config: null,
  profile: null,
  sidebarOpen: false,
  cache: {},
  filters: {},
  pendingConfirm: null,
  celebratedRewards: new Set(),
  pageError: null,
  modalReturnFocus: null
};

function rolesOf(profile = state.profile) {
  const roles = Array.isArray(profile?.roles) && profile.roles.length ? profile.roles : [];
  if (profile?.role && !roles.includes(profile.role)) roles.unshift(profile.role);
  return [...new Set(roles.filter(Boolean))];
}

function hasRole(...roles) {
  const current = rolesOf();
  return roles.some((role) => current.includes(role));
}

function canManageMembers() {
  return hasRole("super_admin", "president", "vice_president", "presidential_aide");
}

function canFullyEditMembers() {
  return hasRole("super_admin");
}

function canModerateMembers() {
  return hasRole("super_admin", "president", "vice_president");
}

function canModerateMember(member) {
  if (!member || member.id === state.profile?.id) return false;
  if (hasRole("super_admin")) return true;
  const targetRoles = rolesOf(member);
  if (targetRoles.some((role) => ["super_admin", "president"].includes(role))) return false;
  if (hasRole("vice_president") && targetRoles.includes("vice_president")) return false;
  return hasRole("president", "vice_president");
}

function canEditMembers() {
  return canModerateMembers();
}

const PARTY_ROLES = new Set([
  "president",
  "vice_president",
  "presidential_aide",
  "spokesperson",
  "credit_officer",
  "discipline_chair",
  "discipline_vice_chair",
  "discipline_member",
  "youth_chair",
  "youth_member",
  "representative",
  "chief_representative",
  "member"
]);

function isTechnicalSuperAdmin(profile = state.profile) {
  const roles = rolesOf(profile);
  return roles.includes("super_admin") && !roles.some((role) => PARTY_ROLES.has(role));
}

function visibleProfiles(rows = []) {
  return rows.filter((profile) => !isTechnicalSuperAdmin(profile));
}

function visibleMembers() {
  return visibleProfiles(state.cache.members || []);
}

function isDisciplineRoleManager() {
  return hasRole("super_admin", "president", "discipline_chair", "discipline_vice_chair");
}

function canRemoveDisciplineRole(member) {
  return isDisciplineRoleManager() && canSetDisciplineRole(member, "none");
}

const permissions = {
  upper: () => hasRole("super_admin", "president", "vice_president", "presidential_aide"),
  members: () => true,
  announce: () => hasRole("super_admin", "president", "vice_president", "presidential_aide", "discipline_chair", "discipline_vice_chair", "spokesperson"),
  disciplineView: () =>
    hasRole("super_admin", "discipline_chair", "discipline_vice_chair", "discipline_member"),
  disciplineManage: () => hasRole("super_admin", "discipline_chair", "discipline_vice_chair", "discipline_member"),
  disciplineCouncil: () => hasRole("super_admin", "discipline_chair", "discipline_vice_chair", "discipline_member"),
  presidency: () => hasRole("super_admin", "president", "vice_president", "presidential_aide"),
  admissions: () => true,
  complaints: () => true,
  youth: () => hasRole("super_admin", "youth_chair")
};

const navItems = [
  ["overview", "Genel Bakış", "home", () => true],
  ["members", "Üyeler", "users", () => true],
  ["presidency", "Başkanlık", "briefcase", permissions.presidency],
  ["discipline-council", "Disiplin Kurulu", "shield", permissions.disciplineCouncil],
  ["positions", "Görev Dağılımı", "briefcase", () => true],
  ["committees", "Kurullar", "grid", () => true],
  ["announcements", "Duyurular", "bell", () => true],
  ["discipline", "Disiplin Kayıtları", "shield", () => true],
  ["complaints", "Şikayetler", "clipboard", permissions.complaints],
  ["investigations", "Soruşturmalar", "search", permissions.disciplineCouncil],
  ["regulation", "Yönetmelik", "book", () => true],
  ["youth", "Gençlik Kolları", "sparkles", () => true],
  ["applications", "Başvurular", "inbox", permissions.admissions],
  ["reports", "Raporlar", "chart", permissions.upper],
  ["audit", "İşlem Geçmişi", "history", permissions.upper],
  ["settings", "Ayarlar", "settings", () => true]
];

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function route() {
  return location.hash.replace(/^#\/?/, "") || "home";
}

function pageName(page) {
  return navItems.find(([id]) => id === page)?.[1] || "Portal";
}

function navigate(target) {
  location.hash = `#/${target}`;
}

function formatDate(value, withTime = false) {
  if (!value) return "Belirtilmedi";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return esc(value);
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {})
  }).format(date);
}

function roleLabel(role) {
  return ROLE_LABELS[role] || role || "Belirtilmedi";
}

function visibleRolesOf(profile = state.profile) {
  const roles = rolesOf(profile);
  return roles.includes("president") ? roles.filter((role) => role !== "super_admin") : roles;
}

function roleLabels(profile = state.profile) {
  const labels = visibleRolesOf(profile).map(roleLabel);
  return labels.length ? labels.join(", ") : "Belirtilmedi";
}

function roleBadgeTone(role) {
  return role === "super_admin" ? "red" : "blue";
}

function roleBadges(profile = state.profile) {
  const roles = visibleRolesOf(profile);
  if (!roles.length) return badge("Belirtilmedi", "blue");
  return `<span class="role-badge-list">${roles.map((role) => badge(roleLabel(role), roleBadgeTone(role))).join("")}</span>`;
}

function disciplinePoints(profile = state.profile) {
  const value = Number(profile?.discipline_points);
  return Number.isFinite(value) ? value : 100;
}

function pointDeltaValue(item = {}) {
  const value = Number(item?.point_delta || 0);
  return Number.isFinite(value) ? value : 0;
}

function pointDeltaBadge(delta = 0) {
  const value = Number(delta || 0);
  const label = value > 0 ? `+${value}` : String(value);
  const tone = value > 0 ? "green" : value < 0 ? "red" : "gray";
  return badge(`${label} puan`, tone);
}

function pointTrail(item = {}) {
  if (item.points_before === null || item.points_before === undefined || item.points_after === null || item.points_after === undefined) {
    return "";
  }
  return `${item.points_before} → ${item.points_after}`;
}

function sanctionEffectLabel(effect = "none") {
  return (
    {
      none: "Sadece kayıt",
      points_only: "Puan güncelle",
      reward_points: "Ödül puanı",
      remove_roles: "Yetkileri al",
      suspend_member: "Üyeliği askıya al",
      passive_member: "Pasif üyeliğe çek"
    }[effect] || effect
  );
}

function canAwardPoints() {
  return hasRole("super_admin", "president", "discipline_chair");
}

const LEADERSHIP_ORDER = [
  "president",
  "vice_president",
  "presidential_aide",
  "discipline_chair",
  "discipline_vice_chair",
  "youth_chair",
  "spokesperson",
  "chief_representative",
  "representative",
  "discipline_member",
  "youth_member",
  "member"
];

function leadershipRank(profile) {
  const roles = visibleRolesOf(profile);
  const index = LEADERSHIP_ORDER.findIndex((role) => roles.includes(role));
  return index === -1 ? LEADERSHIP_ORDER.length : index;
}

function disciplineRank(profile) {
  const roles = rolesOf(profile);
  if (roles.includes("discipline_chair")) return 3;
  if (roles.includes("discipline_vice_chair")) return 2;
  if (roles.includes("discipline_member")) return 1;
  return 0;
}

function disciplineRankLabel(profile) {
  return (
    {
      3: "1. Disiplin Kurulu Başkanı",
      2: "2. Disiplin Kurulu Başkan Yardımcısı",
      1: "3. Disiplin Kurulu Üyesi"
    }[disciplineRank(profile)] || "Disiplin dışı"
  );
}

function isProtectedDisciplineTarget(profile) {
  return rolesOf(profile).some((role) => ["super_admin", "president", "vice_president"].includes(role));
}

function isProtectedInvestigationTarget(profile) {
  return rolesOf(profile).some((role) => ["president", "vice_president"].includes(role));
}

function canSetDisciplineRole(member, targetRole) {
  if (!member || member.id === state.profile?.id) return false;
  const currentRank = disciplineRank(member);
  const targetRank = targetRole === "discipline_chair" ? 3 : targetRole === "discipline_vice_chair" ? 2 : targetRole === "discipline_member" ? 1 : 0;
  if (currentRank === targetRank) return false;
  if (hasRole("super_admin")) return true;
  if (rolesOf(member).includes("super_admin")) return false;
  if (hasRole("president")) return true;
  if (hasRole("discipline_chair")) {
    return currentRank > 0 && currentRank < 3 && targetRank < 3;
  }
  if (hasRole("discipline_vice_chair")) {
    return currentRank === 1 && (targetRank === 2 || targetRank === 0);
  }
  return false;
}

function canDisciplineTarget(member) {
  if (!member || member.id === state.profile?.id) return false;
  if (hasRole("super_admin")) return true;
  if (!hasRole("discipline_chair", "discipline_vice_chair", "discipline_member")) return false;
  if (isProtectedDisciplineTarget(member)) return false;
  const actorRank = disciplineRank(state.profile);
  const targetRank = disciplineRank(member);
  return targetRank === 0 || targetRank < actorRank;
}

function disciplineTargetMembers() {
  return (state.cache.disciplineMembers || state.cache.members || []).filter(canDisciplineTarget);
}

function canInvestigateTarget(member) {
  if (!member || member.id === state.profile?.id) return false;
  if (isTechnicalSuperAdmin(member)) return false;
  if (hasRole("super_admin")) return true;
  if (!hasRole("discipline_chair", "discipline_vice_chair", "discipline_member")) return false;
  if (isProtectedInvestigationTarget(member)) return false;
  const actorRank = disciplineRank(state.profile);
  const targetRank = disciplineRank(member);
  return targetRank === 0 || targetRank < actorRank;
}

function investigationTargetMembers() {
  return (state.cache.disciplineMembers || state.cache.members || []).filter(canInvestigateTarget);
}

function committeeLinks(profile) {
  return Array.isArray(profile?.profile_committees) ? profile.profile_committees : [];
}

function committeeNames(profile) {
  const names = committeeLinks(profile)
    .map((link) => link.committee?.name || link.committees?.name)
    .filter(Boolean);
  if (profile?.committees?.name) names.push(profile.committees.name);
  return [...new Set(names)];
}

function committeeIds(profile) {
  const ids = committeeLinks(profile)
    .map((link) => link.committee_id || link.committee?.id || link.committees?.id)
    .filter(Boolean);
  if (profile?.committee_id) ids.push(profile.committee_id);
  return [...new Set(ids)];
}

function committeeLabels(profile) {
  const names = committeeNames(profile);
  return names.length ? names.join(", ") : "Genel üyelik";
}

function isExecutiveCommittee(name = "") {
  return name === "Yürütme Kurulu" || name === "Yönetim Kurulu";
}

function isNoChairCommittee(name = "") {
  return isExecutiveCommittee(name) || name === "Sosyal Medya Başkanlığı";
}

function currentCommitteeIds() {
  return committeeIds(state.profile);
}

function targetCommitteeId(item) {
  return item?.target_committee_id || item?.suggested_committee_id || item?.target_committee?.id || "";
}

function targetCommitteeName(item) {
  return item?.target_committee?.name || item?.committees?.name || "";
}

const ROLE_COMMITTEE_NAMES = {
  spokesperson: "Sosyal Medya Başkanlığı",
  discipline_chair: "Disiplin Kurulu",
  discipline_vice_chair: "Disiplin Kurulu",
  discipline_member: "Disiplin Kurulu",
  youth_chair: "Gençlik Kolları",
  youth_member: "Gençlik Kolları",
  president: "Yürütme Kurulu",
  vice_president: "Yürütme Kurulu",
  presidential_aide: "Yürütme Kurulu",
  chief_representative: "Yürütme Kurulu",
  representative: "Yürütme Kurulu",
  member: "Yürütme Kurulu"
};

function committeeNameForRole(role) {
  return ROLE_COMMITTEE_NAMES[role] || "Yürütme Kurulu";
}

function committeeIdForRole(role) {
  const committeeName = committeeNameForRole(role);
  const committee = (state.cache.committees || []).find((item) => item.name === committeeName);
  return committee?.id || "";
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status || "Belirtilmedi";
}

function activeTheme() {
  const current = document.documentElement.dataset.theme || state.profile?.theme_preference || "blue";
  const normalized = current === "dark" ? "blue" : current;
  return THEME_OPTIONS.some(([value]) => value === normalized) ? normalized : "blue";
}

function themeLabel(theme = activeTheme()) {
  return THEME_OPTIONS.find(([value]) => value === theme)?.[1] || "Mavi";
}

function setTheme(theme, rerender = true) {
  const normalized = theme === "dark" ? "blue" : theme;
  const next = THEME_OPTIONS.some(([value]) => value === normalized) ? normalized : "blue";
  document.documentElement.dataset.theme = next;
  if (state.profile) state.profile.theme_preference = next;
  if (rerender) render();
}

function canEditRegulations() {
  return hasRole("super_admin");
}

function canReviewApplication(item) {
  if (!item) return false;
  if (hasRole("super_admin")) return true;
  if (item.claimed_by && item.claimed_by !== state.profile?.id && !hasRole("discipline_chair")) return false;
  const committeeName = targetCommitteeName(item);
  const committeeId = targetCommitteeId(item);
  if (
    (isExecutiveCommittee(committeeName) || currentCommitteeIds().includes(committeeId)) &&
    hasRole("president", "vice_president", "presidential_aide")
  ) {
    return true;
  }
  if (committeeName === "Disiplin Kurulu") {
    return hasRole("discipline_chair", "discipline_vice_chair", "discipline_member");
  }
  if (committeeName === "Gençlik Kolları") return hasRole("youth_chair");
  return false;
}

function canClaimApplication(item) {
  return Boolean(
    item &&
      !item.claimed_by &&
      targetCommitteeName(item) === "Disiplin Kurulu" &&
      hasRole("super_admin", "discipline_chair") &&
      !["accepted", "rejected"].includes(item.status)
  );
}

function badge(label, tone = "blue") {
  return `<span class="badge badge-${tone}">${esc(label)}</span>`;
}

function badgeForStatus(status) {
  const tones = {
    active: "green",
    published: "green",
    accepted: "green",
    completed: "green",
    vacant: "gold",
    pending: "gold",
    reviewing: "gold",
    planned: "gold",
    suspended: "coral",
    rejected: "coral",
    urgent: "coral",
    appealed: "coral",
    draft: "blue",
    new: "blue",
    open: "blue",
    archived: "violet",
    passive: "violet",
    left: "violet",
    cancelled: "violet",
    submitted: "coral",
    appeal_accepted: "green",
    appeal_rejected: "coral",
    closed: "violet"
  };
  return badge(statusLabel(status), tones[status] || "blue");
}

function avatar(profileOrName = "Üye") {
  const profile =
    typeof profileOrName === "object" && profileOrName !== null ? profileOrName : null;
  const name = profile?.display_name || String(profileOrName || "Üye");
  const initials = (profile?.avatar_initials || name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 3)).toLocaleUpperCase("tr");
  const color = /^#[0-9A-Fa-f]{6}$/.test(profile?.avatar_color || "")
    ? profile.avatar_color
    : "#f3c969";
  if (profile?.avatar_url) {
    return `<span class="avatar avatar-image" style="--avatar-color:${esc(color)}"><img src="${esc(profile.avatar_url)}" alt="${esc(name)}" /></span>`;
  }
  return `<span class="avatar" style="--avatar-color:${esc(color)}">${esc(initials || "Ü")}</span>`;
}

function brand() {
  return `
    <a class="brand" href="${state.profile ? "#/portal/overview" : "#/home"}" aria-label="İHP ana sayfa">
      <span class="brand-mark brand-initials">İHP</span>
      <span class="brand-copy">
        <strong>İHP Portalı</strong>
        <span>Öğrenci topluluğu</span>
      </span>
    </a>
  `;
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type === "error" ? "error" : ""}`;
  toast.innerHTML = `${icon(type === "error" ? "info" : "check")}<span>${esc(message)}</span>`;
  toastRoot.append(toast);
  setTimeout(() => toast.remove(), 3600);
}

function rewardPointsFromNotification(item = {}) {
  const match = String(item.body || "").match(/\+(\d+)\s*puan/i);
  return match ? Number(match[1]) : null;
}

function ensureRewardCelebrationStyles() {
  if (document.getElementById("reward-celebration-styles")) return;
  const style = document.createElement("style");
  style.id = "reward-celebration-styles";
  style.textContent = `
    @keyframes ihpRewardRise { from { transform: translateY(22px) scale(.96); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }
    @keyframes ihpConfettiDrop { 0% { transform: translateY(-18vh) rotate(0deg); opacity: 1; } 100% { transform: translateY(92vh) rotate(560deg); opacity: 0; } }
    .reward-celebration { position: fixed; inset: 0; z-index: 9999; pointer-events: none; display: grid; place-items: center; overflow: hidden; }
    .reward-celebration-card { pointer-events: auto; width: min(380px, calc(100vw - 32px)); padding: 26px; border-radius: 28px; background: linear-gradient(145deg, rgba(255,255,255,.98), rgba(243,201,105,.96)); color: #132033; box-shadow: 0 28px 80px rgba(8,18,38,.34); text-align: center; animation: ihpRewardRise .42s ease-out both; }
    .reward-celebration-card strong { display: block; font-size: 30px; margin-bottom: 8px; }
    .reward-celebration-card .reward-points { display: inline-flex; align-items: center; justify-content: center; min-width: 108px; min-height: 108px; border-radius: 999px; margin: 10px auto; background: #0b1b31; color: #f3c969; font-size: 32px; font-weight: 900; }
    .reward-confetti-piece { position: fixed; top: -12vh; width: 10px; height: 16px; border-radius: 4px; animation: ihpConfettiDrop 3.8s linear forwards; }
  `;
  document.head.append(style);
}

function showRewardCelebration(notification) {
  ensureRewardCelebrationStyles();
  const points = rewardPointsFromNotification(notification);
  const overlay = document.createElement("div");
  overlay.className = "reward-celebration";
  const colors = ["#e11d48", "#2563eb", "#16a34a", "#f59e0b", "#7c3aed", "#06b6d4"];
  const pieces = Array.from({ length: 56 }, (_, index) => {
    const left = Math.round(Math.random() * 100);
    const delay = (Math.random() * 1.2).toFixed(2);
    const duration = (2.6 + Math.random() * 1.8).toFixed(2);
    const color = colors[index % colors.length];
    return `<span class="reward-confetti-piece" style="left:${left}vw;background:${color};animation-delay:${delay}s;animation-duration:${duration}s"></span>`;
  }).join("");
  overlay.innerHTML = `
    ${pieces}
    <section class="reward-celebration-card" role="status" aria-live="polite">
      <strong>Tebrikler!</strong>
      <div class="reward-points">${points ? `+${points}` : "+Puan"}</div>
      <p>${esc(notification.body || "Ödül puanı kazandınız.")}</p>
      <button class="btn btn-primary btn-sm" type="button">Harika</button>
    </section>
  `;
  overlay.querySelector("button")?.addEventListener("click", () => overlay.remove());
  document.body.append(overlay);
  setTimeout(() => overlay.remove(), 5200);
}

function maybeCelebrateRewards() {
  const reward = (state.cache.notifications || []).find(
    (item) => item.category === "reward" && !item.read_at && !state.celebratedRewards.has(item.id)
  );
  if (!reward) return;
  state.celebratedRewards.add(reward.id);
  showRewardCelebration(reward);
}

function closeModal() {
  modalRoot.innerHTML = "";
  state.pendingConfirm = null;
  document.body.classList.remove("modal-open");
  state.modalReturnFocus?.focus?.();
  state.modalReturnFocus = null;
}

function modal({ title, subtitle = "", body, actions = "" }) {
  state.modalReturnFocus = document.activeElement;
  modalRoot.innerHTML = `
    <div class="modal-backdrop" data-action="modal-backdrop">
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-head">
          <div>
            <h2 id="modal-title">${esc(title)}</h2>
            ${subtitle ? `<p>${esc(subtitle)}</p>` : ""}
          </div>
          <button class="icon-btn" type="button" data-action="close-modal" aria-label="Pencereyi kapat">
            ${icon("x")}
          </button>
        </div>
        ${body}
        ${actions}
      </section>
    </div>
  `;
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => {
    modalRoot.querySelector("button, input, select, textarea, [tabindex]:not([tabindex='-1'])")?.focus();
  });
}

function confirmModal(title, message, onConfirm) {
  state.pendingConfirm = onConfirm;
  modal({
    title,
    subtitle: "Bu işlem kayıt altına alınacaktır.",
    body: `<p class="section-copy">${esc(message)}</p>`,
    actions: `
      <div class="modal-actions">
        <button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button>
        <button class="btn btn-danger btn-sm" type="button" data-action="confirm-action">Onayla</button>
      </div>
    `
  });
}

function publicPage() {
  const principles = [
    ["01", "Demokrasi", "Birlikte düşünmek"],
    ["02", "Eşitlik", "Herkese aynı saygı"],
    ["03", "Adalet", "Dengeli kararlar"],
    ["04", "Şeffaflık", "Anlaşılır süreçler"],
    ["05", "Dayanışma", "Yan yana gelişmek"],
    ["06", "Sorumluluk", "Görevi sahiplenmek"],
    ["07", "Katılım", "Söz hakkını korumak"],
    ["08", "Özgür Fikir", "Farklılıklara alan açmak"],
    ["09", "Saygı", "İletişimi güçlendirmek"],
    ["10", "Düzen", "Sürdürülebilir işleyiş"]
  ];

  const modules = [
    ["users", "Üye Yönetimi", "Giriş yapan üyelere açık gerçek kadro listesi, rol bazlı görünürlük ve düzenli durum takibi."],
    ["briefcase", "Görev Dağılımı", "Topluluk sorumluluklarını görünür ve anlaşılır hale getiren görev sistemi."],
    ["bell", "Duyurular", "Hedef kitle ve öncelik seçimiyle kontrollü topluluk içi iletişim."],
    ["shield", "Gizli Kayıtlar", "Yetki sınırları içinde korunan, kişiyi afişe etmeyen disiplin süreçleri."],
    ["grid", "Kurullar", "Her kurulun görevini, sorumluluğunu ve çalışma alanını açıklayan yapı."],
    ["chart", "Raporlama", "Topluluğun işleyişini sade göstergelerle takip eden yönetim özeti."]
  ];

  const committees = [
    ["Yürütme Kurulu", "Genel koordinasyon, düzen ve görev paylaşımı."],
    ["Disiplin Kurulu", "Gizlilik odaklı inceleme ve değerlendirme."],
    ["Gençlik Kolları", "Sosyal çalışmalar ve etkinlik koordinasyonu."],
    ["Sosyal Medya Başkanlığı", "Parti sözcülüğü ve topluluk içi bilgilendirme."]
  ];

  return `
    <a class="skip-link" href="#about">İçeriğe geç</a>
    <div class="public-shell">
      <nav class="site-nav">
        ${brand()}
        <div class="nav-links">
          <a href="#about">Hakkımızda</a>
          <a href="#principles">İlkeler</a>
          <a href="#features">Portal</a>
          <button class="btn btn-primary btn-sm" data-action="nav-login">${icon("lock")} Giriş Yap</button>
        </div>
      </nav>

      <main>
        <section class="hero">
          <div class="hero-grid">
            <div>
              <span class="eyebrow">Topluluk Portalı</span>
              <h1>İstiklal <span>Hürriyet</span><em>Partisi</em></h1>
              <p class="hero-lead">
                Öğrenciler arasında dayanışma, düzen, arkadaşlık ve sosyal etkileşim için
                kurulmuş modern topluluk portalı.
              </p>
              <div class="hero-actions">
                <button class="btn btn-primary" data-action="nav-login">
                  Portala Giriş Yap ${icon("arrow")}
                </button>
                <a class="btn btn-secondary" href="#about">Topluluğu Tanı</a>
              </div>
              <div class="disclaimer">
                ${icon("info")}
                <span>
                  İHP gerçek bir siyasi parti değildir. Öğrenciler arasında sosyalleşme,
                  dayanışma ve düzenli topluluk yapısı amacıyla kullanılan bir isimdir.
                </span>
              </div>
            </div>
            <div class="portal-preview glass" aria-label="Portal dashboard ön izlemesi">
              <div class="preview-window">
                <div class="window-head"><i></i><i></i><i></i></div>
                <div class="preview-profile">
                  ${avatar("Üye")}
                  <div><strong>Topluluk Portalı</strong><span>Güvenli çalışma alanı</span></div>
                </div>
                <div class="mini-metrics">
                  <div class="mini-metric"><span>Kurullar</span><strong>06</strong></div>
                  <div class="mini-metric"><span>Modüller</span><strong>11</strong></div>
                  <div class="mini-metric"><span>Gizlilik</span><strong>RLS</strong></div>
                  <div class="mini-metric"><span>Erişim</span><strong>Rol</strong></div>
                </div>
                <div class="preview-list">
                  <div class="preview-line"><i></i> Yetkiye göre düzenlenen kontrol paneli</div>
                  <div class="preview-line"><i></i> Topluluk içi güvenli iletişim</div>
                  <div class="preview-line"><i></i> Şeffaf ve düzenli görev paylaşımı</div>
                </div>
              </div>
            </div>
          </div>
          <span class="scroll-note"><i></i> Keşfet</span>
        </section>

        <section class="section" id="about">
          <div class="section-inner">
            <div class="section-head">
              <span class="eyebrow">Topluluğun özü</span>
              <h2>Daha düzenli, daha güçlü bir topluluk deneyimi.</h2>
              <p>
                İHP; öğrenciler arasında iletişim, sorumluluk ve sosyalleşmeyi güçlendiren
                bir topluluk sistemidir. Portal, herkesin rolünü bildiği sade ve güvenli
                bir çalışma alanı sunar.
              </p>
            </div>
            <div class="about-grid">
              <article class="feature-card glass">
                <span class="icon-orb">${icon("sparkles")}</span>
                <h3>Sosyal yapı, ciddi düzen</h3>
                <p>
                  Samimi bir öğrenci topluluğunun ihtiyaç duyduğu duyuru, kurul ve görev
                  akışlarını tek bir yerde toplar.
                </p>
              </article>
              <article class="feature-card glass">
                <span class="icon-orb">${icon("lock")}</span>
                <h3>Gizlilik varsayılan ayar</h3>
                <p>
                  Kişisel veriler ve özel kayıtlar rol bazlı yetkilendirme ile sınırlandırılır.
                  Her kullanıcı yalnızca görmesi gereken alanlara ulaşır.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section class="section section-tight" id="principles">
          <div class="section-inner">
            <div class="section-head">
              <span class="eyebrow">Temel ilkeler</span>
              <h2>Birlikte çalışmanın açık kuralları.</h2>
            </div>
            <div class="principles-grid">
              ${principles
                .map(
                  ([no, title, text]) => `
                    <article class="principle-card glass">
                      <span class="principle-no">${no}</span>
                      <strong>${title}</strong>
                      <span>${text}</span>
                    </article>
                  `
                )
                .join("")}
            </div>
          </div>
        </section>

        <section class="section" id="features">
          <div class="section-inner">
            <div class="section-head">
              <span class="eyebrow">Portal özellikleri</span>
              <h2>Her işlem, olması gereken yerde.</h2>
              <p>
                Portal; günlük topluluk düzenini sadeleştirir, yetkileri netleştirir ve
                kullanıcıyı gereksiz kalabalıkla yormaz.
              </p>
            </div>
            <div class="feature-grid">
              ${modules
                .map(
                  ([iconName, title, text]) => `
                    <article class="feature-card glass">
                      <span class="icon-orb">${icon(iconName)}</span>
                      <h3>${title}</h3>
                      <p>${text}</p>
                    </article>
                  `
                )
                .join("")}
            </div>
          </div>
        </section>

        <section class="section section-tight">
          <div class="section-inner">
            <div class="section-head">
              <span class="eyebrow">Kurullar</span>
              <h2>Dağınık değil, birlikte hareket eden bir yapı.</h2>
            </div>
            <div class="public-card-grid">
              ${committees
                .map(
                  ([title, text]) => `
                    <article class="committee-public-card glass">
                      <span class="icon-orb">${icon("grid")}</span>
                      <h3>${title}</h3>
                      <p>${text}</p>
                    </article>
                  `
                )
                .join("")}
            </div>
          </div>
        </section>

        <section class="section">
          <div class="section-inner">
            <div class="privacy-grid">
              <article class="privacy-card glass">
                <span class="icon-orb">${icon("shield")}</span>
                <h3>Rol bazlı veri erişimi</h3>
                <p>
                  Veritabanı erişimi yalnızca arayüzde değil, Supabase Row Level Security
                  politikalarıyla veri katmanında da sınırlandırılır.
                </p>
              </article>
              <article class="privacy-card glass">
                <span class="icon-orb">${icon("history")}</span>
                <h3>İşlem geçmişi</h3>
                <p>
                  Kritik değişiklikler düzenli biçimde kaydedilir. Böylece topluluk yönetimi
                  daha güvenilir ve takip edilebilir hale gelir.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section class="section section-tight">
          <div class="section-inner">
            <div class="public-banner glass">
              <div>
                <span class="eyebrow">Güvenli portal</span>
                <h2>Topluluk düzenini tek merkezden yönet.</h2>
                <p>Portal alanı yalnızca yetkilendirilmiş üyelere açıktır.</p>
              </div>
              <button class="btn btn-primary" data-action="nav-login">Giriş Yap ${icon("arrow")}</button>
            </div>
          </div>
        </section>
      </main>

      <footer class="footer">
        <div class="footer-inner">
          ${brand()}
          <span>Öğrenci topluluğu portalı. Resmi kurum veya siyasi parti sitesi değildir.</span>
        </div>
      </footer>
    </div>
  `;
}

function loginPage() {
  return `
    <main class="login-shell">
      <section class="login-copy">
        <a class="back-link" href="#/home">${icon("back")} Ana sayfaya dön</a>
        <span class="eyebrow">Güvenli giriş</span>
        <h1>Portal<br />erişimi.</h1>
        <p>
          İHP öğrenci topluluğu çalışma alanına erişmek için hesabınızla giriş yapın.
          Yetkileriniz, rolünüze ve veri erişim kurallarına göre otomatik belirlenir.
        </p>
        <div class="disclaimer">
          ${icon("shield")}
          <span>
            Oturum Supabase Auth ile doğrulanır. Kişisel kayıtlar ve disiplin verileri
            Row Level Security kurallarıyla korunur.
          </span>
        </div>
      </section>
      <section class="login-card glass">
        <h2>Portala giriş yap</h2>
        <p>Yetkilendirilmiş topluluk hesabınızı kullanın.</p>
        <form class="form-stack" data-form="login">
          <div class="form-group">
            <label for="login-email">E-posta</label>
            <input class="field" id="login-email" name="email" type="email" autocomplete="email" required />
          </div>
          <div class="form-group">
            <label for="login-password">Şifre</label>
            <input class="field" id="login-password" name="password" type="password" autocomplete="current-password" required minlength="6" />
          </div>
          <button class="btn btn-primary" type="submit">
            Güvenli Giriş ${icon("arrow")}
          </button>
        </form>
        ${
          state.config?.configured
            ? `
              <div class="security-note">
                ${icon("lock")} Erişim bilgileriniz portal içinde gösterilmez. Oturum
                yalnızca bu tarayıcı sekmesi boyunca saklanır.
              </div>
            `
            : `
              <div class="setup-box">
                <strong>Bağlantı yapılandırması gerekli</strong>
                <p class="security-note">
                  Supabase ortam değişkenleri henüz bağlı görünmüyor. Vercel proje
                  ayarlarına gerekli değerler eklendiğinde gerçek giriş sistemi açılır.
                </p>
              </div>
            `
        }
      </section>
    </main>
  `;
}

function skeletonPage() {
  return `
    <div class="skeleton-page">
      ${Array.from({ length: 4 }, () => `<div class="skeleton skeleton-card"></div>`).join("")}
    </div>
  `;
}

function emptyCard(title, description) {
  return `
    <div class="empty-card">
      ${icon("inbox")}
      <strong>${esc(title)}</strong>
      <span>${esc(description)}</span>
    </div>
  `;
}

function badgeCountForNav(id) {
  if (id === "applications") {
    const rows = state.cache.applicationBadge || state.cache.applications || [];
    const count = rows.filter((item) => item.status === "new").length;
    return count ? String(count) : "";
  }
  if (id === "complaints") {
    const rows = state.cache.complaintBadge || state.cache.complaints || [];
    const count = rows.filter((item) => item.status === "new").length;
    return count ? String(count) : "";
  }
  if (id === "investigations") {
    const rows = state.cache.investigationBadge || state.cache.investigations || [];
    const count = rows.filter((item) => ["open", "reviewing"].includes(item.status)).length;
    return count ? String(count) : "";
  }
  return "";
}

function navSection(page) {
  return navItems
    .filter(([, , , allow]) => allow())
    .map(
      ([id, label, iconName]) => {
        const count = badgeCountForNav(id);
        return `
        <button class="nav-item ${page === id ? "active" : ""}" type="button" data-page="${id}">
          <span>${icon(iconName)} ${label}</span>
          ${count ? `<b class="nav-badge">${esc(count)}</b>` : ""}
        </button>
      `;
      }
    )
    .join("");
}

function portalShell(page) {
  const profile = state.profile;
  const notifications = state.cache.notifications || [];
  const unreadNotifications = notifications.filter((item) => !item.read_at).length;
  return `
    <div class="app-shell">
      <aside class="sidebar ${state.sidebarOpen ? "open" : ""}">
        ${brand()}
        <div class="app-nav">
          <p class="nav-section-label">Portal</p>
          ${navSection(page)}
        </div>
        <div class="sidebar-bottom">
          <div class="side-profile">
            ${avatar(profile)}
            <div>
              <strong>${esc(profile.display_name)}</strong>
              <span>${esc(roleLabels(profile))}</span>
            </div>
          </div>
          <button class="nav-item" type="button" data-action="logout">
            ${icon("logout")} Çıkış Yap
          </button>
        </div>
      </aside>
      <button class="mobile-backdrop ${state.sidebarOpen ? "open" : ""}" data-action="close-sidebar" aria-label="Menüyü kapat"></button>
      <main class="app-main">
        <header class="topbar">
          <div class="topbar-left">
            <button class="icon-btn mobile-menu-btn" type="button" data-action="toggle-sidebar" aria-label="Menüyü aç">
              ${icon("menu")}
            </button>
            <div>
              <h1>${esc(pageName(page))}</h1>
              <p>İHP öğrenci topluluğu portalı</p>
            </div>
          </div>
          <div class="top-actions">
            <label class="theme-picker" aria-label="Tema seç">
              <span>${icon("sun")}</span>
              <select data-theme-select>
                ${THEME_OPTIONS.map(([value, label]) => `<option value="${value}" ${activeTheme() === value ? "selected" : ""}>${esc(label)}</option>`).join("")}
              </select>
            </label>
            <button class="icon-btn notification-btn" type="button" data-action="open-notifications" aria-label="Bildirimleri aç">
              ${icon("bell")}
              ${unreadNotifications ? `<span class="notification-count">${unreadNotifications}</span>` : ""}
            </button>
            <button class="btn btn-secondary btn-sm" type="button" data-page="settings">
              ${avatar(profile)} ${esc(profile.display_name)}
            </button>
          </div>
        </header>
        <div class="app-content">
          ${state.loading ? skeletonPage() : renderPortalPage(page)}
        </div>
      </main>
    </div>
  `;
}

function dashboardPage() {
  const data = state.cache.overview || {};
  const profiles = visibleProfiles(data.profiles || []);
  const announcements = data.announcements || [];
  const disciplines = data.disciplines || [];
  const positions = data.positions || [];
  const committees = data.committees || [];
  const auditLogs = data.auditLogs || [];
  const complaints = data.complaints || [];
  const activeAnnouncements = announcements.filter((item) => item.status === "published");
  const openDisciplines = disciplines.filter(
    (item) => !["closed", "decided"].includes(item.decision_status)
  );
  const vacantPositions = positions.filter((item) => item.status === "vacant");
  const memberMetric = permissions.members() ? "Toplam üye" : "Profil erişimi";

  return `
    <section class="hero-panel glass">
      <span class="eyebrow">Kontrol merkezi</span>
      <h2>Hoş geldiniz, ${esc(state.profile.display_name)}.</h2>
      <p>${esc(roleLabels(state.profile))} yetkileriyle topluluk çalışma alanındasınız.</p>
    </section>

    <section class="metrics-grid">
      ${metric(memberMetric, profiles.length, permissions.members() ? "Görüntülenebilir üye kayıtları" : "Yalnızca size açık kayıt", "users")}
      ${metric("Aktif duyuru", activeAnnouncements.length, "Erişiminize açık yayınlar", "bell")}
      ${metric("Disiplin puanım", disciplinePoints(state.profile), "Başlangıç 100, ödülle yükselir", "sparkles")}
      ${metric("Açık disiplin", openDisciplines.length, permissions.disciplineView() ? "Yetkinize göre listelendi" : "Yalnızca size ait kayıtlar", "shield")}
      ${metric("Yeni şikayet", complaints.filter((item) => item.status === "new").length, "Disiplin kuruluna gelen", "clipboard")}
    </section>

    <section class="dashboard-grid">
      <article class="panel glass">
        <div class="panel-head">
          <h3>Son duyurular</h3>
          <button class="table-action" type="button" data-page="announcements">Tümünü gör</button>
        </div>
        ${
          announcements.length
            ? announcements
                .slice(0, 5)
                .map(
                  (item) => `
                    <div class="list-row">
                      <div class="list-main">
                        <strong>${esc(item.title)}</strong>
                        <span>${esc(item.category)} · ${formatDate(item.created_at)}</span>
                      </div>
                      ${badgeForStatus(item.status)}
                    </div>
                  `
                )
                .join("")
            : emptyCard("Henüz duyuru yok", "Yayınlanan duyurular burada görünecek.")
        }
      </article>
      <article class="panel glass">
        <div class="panel-head">
          <h3>Hızlı işlemler</h3>
          <span>Rolünüze göre</span>
        </div>
        <div class="quick-grid">
          ${quickAction("Duyurular", "bell", "announcements")}
          ${quickAction("Görevler", "briefcase", "positions")}
          ${quickAction("Yönetmelik", "book", "regulation")}
          ${quickAction("Gençlik", "sparkles", "youth")}
          ${permissions.members() ? quickAction("Üyeler", "users", "members") : ""}
          ${permissions.admissions() ? quickAction("Başvurular", "inbox", "applications") : ""}
        </div>
      </article>
    </section>

    ${
      permissions.upper()
        ? `
          <section class="panel glass" style="margin-top:.85rem">
            <div class="panel-head">
              <h3>Son işlemler</h3>
              <button class="table-action" type="button" data-page="audit">İşlem geçmişi</button>
            </div>
            ${
              auditLogs.length
                ? auditLogs
                    .slice(0, 4)
                    .map(
                      (item) => `
                        <div class="list-row">
                          <div class="list-main">
                            <strong>${esc(item.target_type)} · ${esc(item.action)}</strong>
                            <span>${formatDate(item.created_at, true)}</span>
                          </div>
                          ${badge("Kayıtlı", "green")}
                        </div>
                      `
                    )
                    .join("")
                : emptyCard("İşlem geçmişi boş", "İlk kritik işlem burada kaydedilecek.")
            }
          </section>
        `
        : ""
    }
  `;
}

function metric(label, value, note, iconName) {
  return `
    <article class="metric-card glass">
      <div class="metric-top"><span>${esc(label)}</span>${icon(iconName)}</div>
      <strong>${String(value).padStart(2, "0")}</strong>
      <small>${esc(note)}</small>
    </article>
  `;
}

function quickAction(label, iconName, page) {
  return `
    <button class="quick-card" type="button" data-page="${page}">
      ${icon(iconName)}<strong>${esc(label)}</strong>
    </button>
  `;
}

function pageHeader(eyebrow, title, description, actions = "") {
  return `
    <header class="page-head">
      <div>
        <span class="eyebrow">${esc(eyebrow)}</span>
        <h2>${esc(title)}</h2>
        <p>${esc(description)}</p>
      </div>
      ${actions ? `<div class="page-actions">${actions}</div>` : ""}
    </header>
  `;
}

function toolbar(searchName, options = []) {
  return `
    <div class="toolbar">
      <label class="search-field">
        ${icon("search")}
        <input class="field" type="search" placeholder="Ara..." aria-label="Ara" data-filter="${searchName}" value="${esc(state.filters[searchName] || "")}" />
      </label>
      ${options
        .map(
          ([filterName, label, items]) => `
            <label>
              <span class="skip-link">${esc(label)}</span>
              <select class="field" aria-label="${esc(label)}" data-filter="${filterName}">
                <option value="">${esc(label)}: Tümü</option>
                ${items
                  .map(
                    ([value, text]) =>
                      `<option value="${esc(value)}" ${state.filters[filterName] === value ? "selected" : ""}>${esc(text)}</option>`
                  )
                  .join("")}
              </select>
            </label>
          `
        )
        .join("")}
    </div>
  `;
}

function membersPage() {
  const rows = visibleMembers();
  const q = (state.filters.memberSearch || "").toLocaleLowerCase("tr");
  const filtered = rows.filter(
    (item) =>
      (!q || item.display_name.toLocaleLowerCase("tr").includes(q)) &&
      (!state.filters.memberRole || rolesOf(item).includes(state.filters.memberRole)) &&
      (!state.filters.memberStatus || item.status === state.filters.memberStatus)
  );

  return `
    ${pageHeader(
      "Üye listesi",
      "Parti kadrosu",
      "Giriş yapan her üye kadrodaki isimleri görebilir. Roller Üyeler ekranından değil, yetkili panellerden yönetilir; hassas profil ve şifre işlemleri yalnızca admindedir.",
      `
        <button class="btn btn-secondary btn-sm" type="button" data-action="export-members">${icon("download")} PDF</button>
      `
    )}
    ${toolbar("memberSearch", [
      ["memberRole", "Rol", ROLE_OPTIONS],
      ["memberStatus", "Durum", ["active", "passive", "suspended", "left", "pending"].map((id) => [id, statusLabel(id)])]
    ])}
    <div class="table-shell glass">
      <table class="data-table">
        <thead><tr><th>Üye</th><th>Roller</th><th>Kurul</th><th>Durum</th><th>Katılım</th><th>İşlem</th></tr></thead>
        <tbody>
          ${
            filtered.length
              ? filtered
                  .map(
                    (item) => `
                      <tr>
                        <td><span class="cell-main member-cell">${avatar(item)} ${esc(item.display_name)}</span><span class="cell-sub">${esc(hasRole("super_admin") || item.id === state.profile?.id ? item.email || item.id.slice(0, 8) : "Profil detayı gizli")}</span></td>
                        <td>${esc(roleLabels(item))}</td>
                        <td>${esc(committeeLabels(item))}</td>
                        <td>${badgeForStatus(item.status)}</td>
                        <td>${formatDate(item.joined_at)}</td>
                        <td>
                          ${
                            canEditMembers() || isDisciplineRoleManager()
                              ? `<span class="cell-sub">Yetkili panelden yönetilir</span>`
                              : `<span class="cell-sub">${formatDate(item.updated_at, true)}</span>`
                          }
                        </td>
                      </tr>
                    `
                  )
                  .join("")
              : `<tr><td colspan="6">${emptyCard("Eşleşen kayıt yok", "Arama veya filtre seçimini değiştirin.")}</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
}

function positionsPage() {
  const rows = state.cache.positions || [];
  return `
    ${pageHeader(
      "Görev dağılımı",
      "Sorumluluklar görünür, roller net.",
      "Topluluk içinde üstlenilen görevler ve açık pozisyonlar tek bir çalışma alanında listelenir."
    )}
    <div class="card-grid">
      ${
        rows.length
          ? rows
              .map(
                (item) => `
                  <article class="entity-card glass">
                    <div class="entity-top">
                      <span class="icon-orb">${icon("briefcase")}</span>
                      ${badgeForStatus(item.status)}
                    </div>
                    <h3 style="margin-top:.85rem">${esc(item.title)}</h3>
                    <p>${esc(item.description)}</p>
                    <div class="meta-list">
                      <div class="meta-row"><span>Kurul</span><strong>${esc(item.committees?.name || "Bağımsız")}</strong></div>
                      <div class="meta-row"><span>Yetki seviyesi</span><strong>${esc(item.authority_level)}</strong></div>
                      <div class="meta-row"><span>Görevli</span><strong>${esc(item.profiles?.display_name || "Bu görev şu anda boştur.")}</strong></div>
                    </div>
                  </article>
                `
              )
              .join("")
          : emptyCard("Görev kaydı yok", "Yeni görevler eklendiğinde burada görünecek.")
      }
    </div>
  `;
}

function committeeChairLabel(item) {
  if (isExecutiveCommittee(item.name)) return "Başkanın seçtiği yürütme üyeleri";
  if (item.name === "Sosyal Medya Başkanlığı") return "Etiket kurumu";
  return item.profiles?.display_name || "Atama bekleniyor";
}

function committeeMemberNames(name) {
  const members = visibleMembers().filter((member) =>
    committeeNames(member).some((memberCommittee) =>
      memberCommittee === name || (isExecutiveCommittee(name) && isExecutiveCommittee(memberCommittee))
    )
  );
  return members.length
    ? members.map((member) => member.display_name).join(", ")
    : "Henüz üye yok";
}

function committeesPage() {
  const rows = state.cache.committees || [];
  return `
    ${pageHeader(
      "Kurullar",
      "Birlikte çalışan yapı taşları.",
      "Her kurul, kendi sorumluluk alanı içinde düzenli çalışma ve koordinasyon sağlar."
    )}
    <div class="card-grid">
      ${
        rows.length
          ? rows
              .map(
                (item) => `
                  <article class="entity-card glass">
                    <div class="entity-top">
                      <span class="icon-orb">${icon("grid")}</span>
                      ${badgeForStatus(item.status)}
                    </div>
                    <h3 style="margin-top:.85rem">${esc(item.name)}</h3>
                    <p>${esc(item.description)}</p>
                    <div class="meta-list">
                      ${isNoChairCommittee(item.name) ? "" : `<div class="meta-row"><span>Kurul başkanı</span><strong>${esc(committeeChairLabel(item))}</strong></div>`}
                      <div class="meta-row"><span>Üyeler</span><strong>${esc(committeeMemberNames(item.name))}</strong></div>
                      <div class="meta-row"><span>Güncellendi</span><strong>${formatDate(item.updated_at)}</strong></div>
                    </div>
                  </article>
                `
              )
              .join("")
          : emptyCard("Kurul kaydı yok", "Kurullar yapılandırıldığında burada görünecek.")
      }
    </div>
  `;
}

function presidencyPage() {
  const rows = [...visibleMembers()].sort((a, b) => leadershipRank(a) - leadershipRank(b) || a.display_name.localeCompare(b.display_name, "tr"));
  return `
    ${pageHeader(
      "Başkanlık",
      "Yönetim ve rol düzeni",
      "Başkanlık işlemleri burada toplanır. Üye listesi yalnızca görüntüleme alanıdır; rol ve durum kararları bu panelden verilir.",
      canManageMembers()
        ? `<button class="btn btn-primary btn-sm" type="button" data-action="open-invite">${icon("userPlus")} Üye Ekle</button>`
        : ""
    )}
    <section class="metrics-grid">
      ${metric("Toplam üye", rows.length, "Kayıtlı portal üyesi", "users")}
      ${metric("Yönetim", rows.filter((item) => rolesOf(item).some((role) => ["president", "vice_president", "presidential_aide"].includes(role))).length, "Başkanlık kadrosu", "briefcase")}
      ${metric("Kurul üyesi", rows.filter((item) => committeeNames(item).length).length, "En az bir kurulda", "grid")}
      ${metric("Aktif", rows.filter((item) => item.status === "active").length, "Aktif hesap", "check")}
    </section>
    <div class="hierarchy-list">
      ${
        rows.length
          ? rows
              .map(
                (member, index) => `
                  <article class="hierarchy-card glass">
                    <div class="rank-pill">${String(index + 1).padStart(2, "0")}</div>
                    <div class="hierarchy-main">
                      <div class="preview-profile">${avatar(member)}<div><strong>${esc(member.display_name)}</strong><span>${esc(roleLabels(member))}</span></div></div>
                      <p>${esc(committeeLabels(member))}</p>
                    </div>
                    <div class="hierarchy-actions">
                      ${badgeForStatus(member.status)}
                      ${canModerateMember(member) ? `<button class="table-action" type="button" data-action="edit-member" data-id="${esc(member.id)}">${hasRole("super_admin") ? "Profil / rol düzenle" : "Rol / durum yönet"}</button>` : ""}
                      ${hasRole("super_admin") && member.id !== state.profile?.id ? `<button class="table-action danger-action" type="button" data-action="delete-member" data-id="${esc(member.id)}">Sil</button>` : ""}
                    </div>
                  </article>
                `
              )
              .join("")
          : emptyCard("Üye yok", "Başkanlık paneli üyeler oluşturulduğunda dolacak.")
      }
    </div>
  `;
}

function disciplineRoleActionButtons(member) {
  const actions = [
    ["discipline_vice_chair", "Başkan yardımcısı yap"],
    ["discipline_member", "Üye yap"],
    ["none", "Disiplin rolünü al"]
  ];
  return actions
    .filter(([targetRole]) => canSetDisciplineRole(member, targetRole))
    .map(([targetRole, label]) => `<button class="table-action ${targetRole === "none" ? "danger-action" : ""}" type="button" data-action="set-discipline-role" data-id="${esc(member.id)}" data-role="${esc(targetRole)}">${esc(label)}</button>`)
    .join("");
}

function disciplineCouncilPage() {
  const rows = [...visibleMembers()]
    .filter((member) => disciplineRank(member) > 0)
    .sort((a, b) => disciplineRank(b) - disciplineRank(a) || a.display_name.localeCompare(b.display_name, "tr"));
  return `
    ${pageHeader(
      "Disiplin Kurulu",
      "Hiyerarşi ve sorumluluklar",
      "Sıralama: 1. Disiplin Kurulu Başkanı, 2. Disiplin Kurulu Başkan Yardımcısı, 3. Disiplin Kurulu Üyesi. Yetki alma ve terfi bu sıraya göre uygulanır."
    )}
    <section class="metrics-grid">
      ${metric("DK Başkanı", rows.filter((item) => disciplineRank(item) === 3).length, "En üst disiplin yetkisi", "shield")}
      ${metric("Başkan yardımcısı", rows.filter((item) => disciplineRank(item) === 2).length, "İkinci seviye", "users")}
      ${metric("Kurul üyesi", rows.filter((item) => disciplineRank(item) === 1).length, "İnceleme yetkisi", "clipboard")}
      ${metric("Yeni şikayet", (state.cache.complaintBadge || []).filter((item) => item.status === "new").length, "Sorumluluk bekleyen", "inbox")}
    </section>
    <div class="quick-grid" style="margin-bottom:.85rem">
      <button class="quick-card" type="button" data-page="complaints">${icon("clipboard")}<strong>Şikayetleri gör</strong></button>
      <button class="quick-card" type="button" data-page="applications">${icon("inbox")}<strong>Başvuruları gör</strong></button>
      <button class="quick-card" type="button" data-page="discipline">${icon("shield")}<strong>Disiplin kayıtları</strong></button>
    </div>
    <div class="hierarchy-list">
      ${
        rows.length
          ? rows
              .map(
                (member) => `
                  <article class="hierarchy-card glass">
                    <div class="rank-pill">${disciplineRank(member)}</div>
                    <div class="hierarchy-main">
                      <div class="preview-profile">${avatar(member)}<div><strong>${esc(member.display_name)}</strong><span>${esc(disciplineRankLabel(member))}</span></div></div>
                      <p>${esc(roleLabels(member))}</p>
                    </div>
                    <div class="hierarchy-actions">
                      ${disciplineRoleActionButtons(member) || `<span class="cell-sub">Bu kişi için işlem yetkiniz yok</span>`}
                    </div>
                  </article>
                `
              )
              .join("")
          : emptyCard("Disiplin kurulu boş", "Disiplin rolü verilen üyeler burada hiyerarşik görünecek.")
      }
    </div>
  `;
}

function announcementsPage() {
  const rows = state.cache.announcements || [];
  return `
    ${pageHeader(
      "Duyurular",
      "Topluluk içi iletişim.",
      "Yayınlar hedef kitle ve öncelik seviyesine göre düzenlenir.",
      permissions.announce()
        ? `<button class="btn btn-primary btn-sm" type="button" data-action="open-announcement">${icon("plus")} Duyuru Oluştur</button>`
        : ""
    )}
    <div class="card-grid">
      ${
        rows.length
          ? rows
              .map(
                (item) => `
                  <article class="entity-card notice-card ${item.priority === "urgent" ? "urgent" : ""} glass">
                    <div class="entity-top">
                      ${badge(item.category, "blue")}
                      ${badgeForStatus(item.status)}
                    </div>
                    <h3 style="margin-top:.85rem">${esc(item.title)}</h3>
                    <p>${esc(item.content)}</p>
                    <div class="meta-list">
                      <div class="meta-row"><span>Hedef kitle</span><strong>${esc(audienceLabel(item.audience))}</strong></div>
                      <div class="meta-row"><span>Öncelik</span><strong>${esc(priorityLabel(item.priority))}</strong></div>
                      <div class="meta-row"><span>Yayın tarihi</span><strong>${formatDate(item.created_at)}</strong></div>
                    </div>
                    ${
                      permissions.announce()
                        ? `<div class="inline-actions">
                            <button class="table-action" type="button" data-action="edit-announcement" data-id="${esc(item.id)}">${icon("settings")} Düzenle</button>
                            ${item.status !== "archived" ? `<button class="table-action" type="button" data-action="archive-announcement" data-id="${esc(item.id)}">${icon("archive")} Arşivle</button>` : ""}
                            <button class="table-action danger-action" type="button" data-action="delete-announcement" data-id="${esc(item.id)}">Sil</button>
                          </div>`
                        : ""
                    }
                  </article>
                `
              )
              .join("")
          : emptyCard("Henüz duyuru yok", "Yetkili roller ilk duyuruyu oluşturabilir.")
      }
    </div>
  `;
}

function appealStatusOf(item) {
  return item?.appeal_status || (item?.decision_status === "appealed" ? "submitted" : "none");
}

function canAppealDiscipline(item) {
  if (!item || item.archived || item.member_id !== state.profile?.id) return false;
  if (item.decision_status !== "decided") return false;
  if (appealStatusOf(item) !== "none") return false;
  const createdAt = new Date(item.created_at).valueOf();
  return Number.isFinite(createdAt) && Date.now() - createdAt <= 3 * 24 * 60 * 60 * 1000;
}

function canReviewDisciplineAppeal(item) {
  return Boolean(item && appealStatusOf(item) === "submitted" && hasRole("super_admin", "discipline_chair"));
}

function disciplineRowActions(item) {
  const buttons = [`<button class="table-action" type="button" data-action="view-discipline" data-id="${esc(item.id)}">Detay</button>`];
  if (permissions.disciplineManage() && !item.archived) {
    if (hasRole("super_admin")) {
      buttons.push(`<button class="table-action" type="button" data-action="edit-discipline" data-id="${esc(item.id)}">Düzelt</button>`);
    }
    buttons.push(`<button class="table-action danger-action" type="button" data-action="delete-discipline" data-id="${esc(item.id)}">Sil</button>`);
  }
  if (canAppealDiscipline(item)) {
    buttons.push(`<button class="table-action" type="button" data-action="open-discipline-appeal" data-id="${esc(item.id)}">İtiraz et</button>`);
  }
  if (canReviewDisciplineAppeal(item)) {
    buttons.push(`<button class="table-action" type="button" data-action="review-discipline-appeal" data-id="${esc(item.id)}" data-status="accepted">İtirazı kabul</button>`);
    buttons.push(`<button class="table-action danger-action" type="button" data-action="review-discipline-appeal" data-id="${esc(item.id)}" data-status="rejected">İtirazı reddet</button>`);
  }
  return `<div class="inline-actions">${buttons.join("")}</div>`;
}

function disciplinePage() {
  const rows = state.cache.discipline || [];
  const visibleRows = permissions.disciplineView()
    ? rows
    : rows.filter((item) => item.member_id === state.profile?.id);
  return `
    ${pageHeader(
      "Gizlilik odaklı kayıtlar",
      permissions.disciplineView() ? "Disiplin kayıtları" : "Disiplin durumum",
      "Başkan ve başkan yardımcısı disiplin kayıtlarını göremez; kayıtlar yalnızca ilgili üye, disiplin yetkilileri ve sistem yöneticisine açıktır.",
      permissions.disciplineManage() || canAwardPoints()
        ? `<div class="inline-actions">${permissions.disciplineManage() ? `<button class="btn btn-primary btn-sm" type="button" data-action="open-discipline">${icon("plus")} Ceza Kararnamesi</button>` : ""}${canAwardPoints() ? `<button class="btn btn-secondary btn-sm" type="button" data-action="open-award-points">${icon("sparkles")} Puan Ver</button>` : ""}</div>`
        : ""
    )}
    <div class="privacy-strip">
      ${icon("shield")}
      <span>Bu alan herkese açık değildir. Erişim Supabase RLS politikalarıyla veri katmanında sınırlandırılır.</span>
    </div>
    <div class="table-shell glass">
      <table class="data-table">
        <thead><tr><th>Kayıt</th><th>İlgili üye</th><th>Tür</th><th>Ciddiyet</th><th>Karar durumu</th><th>Puan</th><th>İşlem</th></tr></thead>
        <tbody>
          ${
            visibleRows.length
              ? visibleRows
                  .map(
                    (item) => `
                      <tr>
                        <td><span class="cell-main">${esc(item.id.slice(0, 8))}</span><span class="cell-sub">${esc(item.reason)}</span></td>
                        <td>${esc(item.profiles?.display_name || state.profile.display_name)}</td>
                        <td>${esc(item.record_type)}</td>
                        <td>${severityBadge(item.severity)}</td>
                        <td>${item.archived ? badge("Silindi", "violet") : badgeForStatus(item.decision_status)}</td>
                        <td>${pointDeltaBadge(pointDeltaValue(item))}<span class="cell-sub">${esc(pointTrail(item))}</span></td>
                        <td>${disciplineRowActions(item)}</td>
                      </tr>
                    `
                  )
                  .join("")
              : `<tr><td colspan="7">${emptyCard("Görüntülenebilir kayıt yok", "Size açık bir disiplin kaydı bulunmuyor.")}</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
}

function regulationPage() {
  const rows = state.cache.regulation || [];
  return `
    ${pageHeader(
      "Topluluk rehberi",
      "İHP Parti ve Topluluk Yönetmeliği",
      "Topluluk işleyişini, temel ilkeleri ve görev paylaşımını açıklayan okunabilir rehber.",
      canEditRegulations()
        ? `<button class="btn btn-primary btn-sm" type="button" data-action="open-regulation">${icon("plus")} Yönetmelik Ekle</button>`
        : ""
    )}
    <div class="accordion">
      ${
        rows.length
          ? rows
              .map(
                (item, index) => `
                  <article class="accordion-item glass">
                    <button class="accordion-btn" type="button" data-action="accordion">
                      <span>${String(index + 1).padStart(2, "0")} · ${esc(item.title)}</span>
                      ${icon("chevron")}
                    </button>
                    <div class="accordion-content" ${index ? "hidden" : ""}>
                      <div class="regulation-body">${esc(item.content)}</div>
                      ${
                        canEditRegulations()
                          ? `<div class="inline-actions"><button class="table-action" type="button" data-action="edit-regulation" data-id="${esc(item.id)}">Düzenle</button><button class="table-action danger-action" type="button" data-action="delete-regulation" data-id="${esc(item.id)}">Sil</button></div>`
                          : ""
                      }
                    </div>
                  </article>
                `
              )
              .join("")
          : emptyCard("Yönetmelik bölümü yok", "İlk bölümler eklendiğinde burada görünecek.")
      }
    </div>
  `;
}

function openRegulation(item = null) {
  if (!canEditRegulations()) return;
  modal({
    title: item ? "Yönetmeliği düzenle" : "Yönetmelik ekle",
    subtitle: "Bu alan yalnızca admin tarafından değiştirilebilir.",
    body: `
      <form class="form-stack" data-form="regulation" data-id="${esc(item?.id || "")}">
        <div class="form-grid">
          <div class="form-group"><label for="regulation-title">Başlık</label><input class="field" id="regulation-title" name="title" value="${esc(item?.title || "")}" required maxlength="160" /></div>
          <div class="form-group"><label for="regulation-sort">Sıra</label><input class="field" id="regulation-sort" name="sortOrder" type="number" value="${esc(item?.sort_order ?? (state.cache.regulation || []).length + 1)}" min="1" max="999" /></div>
        </div>
        <div class="form-group"><label for="regulation-content">İçerik</label><textarea class="field regulation-editor" id="regulation-content" name="content" required maxlength="50000" rows="24" placeholder="Her maddeyi veya paragrafı ayrı satıra yazabilirsiniz.">${esc(item?.content || "")}</textarea><small class="form-hint">Satır sonları ve boş satırlar yayınlanan metinde aynen korunur. En fazla 50.000 karakter.</small></div>
        <div class="modal-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button><button class="btn btn-primary btn-sm" type="submit">Kaydet</button></div>
      </form>
    `
  });
  modalRoot.querySelector(".modal")?.classList.add("regulation-modal");
}


function youthPage() {
  const rows = state.cache.youth || [];
  const active = rows.filter((item) => item.status === "active");
  const planned = rows.filter((item) => item.status === "planned");
  const completed = rows.filter((item) => item.status === "completed");
  return `
    ${pageHeader(
      "Gençlik kolları",
      "Enerjiyi birlikte üret.",
      "Sosyal çalışmalar, etkinlikler ve aktif projeler ana portal düzeni içinde ayrı bir çalışma alanında toplanır.",
      permissions.youth()
        ? `<button class="btn btn-primary btn-sm" type="button" data-action="open-youth">${icon("plus")} Çalışma Ekle</button>`
        : ""
    )}
    <section class="hero-panel glass">
      <span class="eyebrow">Gençlik Kolları</span>
      <h2>Katılım, iletişim ve yeni fikirler.</h2>
      <p>Topluluğun sosyal çalışmalarını, etkinlik hazırlıklarını ve gençlik katılımını görünür tutan çalışma alanı. Başkan bu alana çalışma ekleyemez; yönetim gençlik kolları ve admin üzerinden yürür.</p>
    </section>
    <section class="metrics-grid">
      ${metric("Aktif çalışma", active.length, "Şu anda yürüyen işler", "sparkles")}
      ${metric("Planlanan", planned.length, "Hazırlık aşamasında", "activity")}
      ${metric("Tamamlanan", completed.length, "Kapanan çalışmalar", "check")}
      ${metric("Toplam kayıt", rows.length, "Gençlik arşivi", "grid")}
    </section>
    <div class="card-grid">
      ${
        rows.length
          ? rows
              .map(
                (item) => `
                  <article class="entity-card glass">
                    <div class="entity-top"><span class="icon-orb">${icon("sparkles")}</span>${badgeForStatus(item.status)}</div>
                    <h3 style="margin-top:.85rem">${esc(item.title)}</h3>
                    <p>${esc(item.description)}</p>
                    <div class="meta-list">
                      <div class="meta-row"><span>Başlangıç</span><strong>${formatDate(item.starts_at)}</strong></div>
                      <div class="meta-row"><span>Kaydı açan</span><strong>${esc(item.creator?.display_name || "Gençlik yetkilisi")}</strong></div>
                      <div class="meta-row"><span>Güncellendi</span><strong>${formatDate(item.updated_at, true)}</strong></div>
                    </div>
                    ${
                      permissions.youth()
                        ? `<div class="inline-actions">
                            <button class="table-action" type="button" data-action="edit-youth" data-id="${esc(item.id)}">Düzenle</button>
                            ${hasRole("super_admin") ? `<button class="table-action danger-action" type="button" data-action="delete-youth" data-id="${esc(item.id)}">Sil</button>` : ""}
                          </div>`
                        : ""
                    }
                  </article>
                `
              )
              .join("")
          : emptyCard("Aktif çalışma yok", "Yeni çalışmalar burada listelenecek.")
      }
    </div>
  `;
}

function applicationTargetLabel(item) {
  return item.target_committee?.name || item.committees?.name || "Kurul seçilmedi";
}

function applicationPersonLabel(item) {
  return item.applicant?.display_name || item.candidate_label || "Başvuran üye";
}

function applicationActions(item) {
  const isOwn = item.applicant_profile_id === state.profile?.id;
  const claimedByOther = item.claimed_by && item.claimed_by !== state.profile?.id && !hasRole("super_admin", "discipline_chair");
  if (claimedByOther) {
    return `<p class="security-note">Bu başvuru ${esc(item.claimer?.display_name || "başka bir yetkili")} tarafından üstlenildi.</p>`;
  }
  if (canReviewApplication(item) && !["accepted", "rejected"].includes(item.status)) {
    return `
      <div class="inline-actions">
        ${canClaimApplication(item) ? `<button class="table-action" type="button" data-action="claim-application" data-id="${esc(item.id)}">Sorumluluğu al</button>` : ""}
        <button class="table-action" type="button" data-action="open-application-review" data-id="${esc(item.id)}" data-status="reviewing">İncelemede</button>
        <button class="table-action" type="button" data-action="open-application-review" data-id="${esc(item.id)}" data-status="accepted">Onayla</button>
        <button class="table-action danger-action" type="button" data-action="open-application-review" data-id="${esc(item.id)}" data-status="rejected">Reddet</button>
        ${hasRole("super_admin") ? `<button class="table-action danger-action" type="button" data-action="delete-application" data-id="${esc(item.id)}">Sil</button>` : ""}
      </div>
    `;
  }
  if (isOwn && item.status === "new") {
    return `<div class="inline-actions"><button class="table-action danger-action" type="button" data-action="delete-application" data-id="${esc(item.id)}">Başvuruyu sil</button></div>`;
  }
  if (hasRole("super_admin")) {
    return `<div class="inline-actions"><button class="table-action danger-action" type="button" data-action="delete-application" data-id="${esc(item.id)}">Başvuruyu sil</button></div>`;
  }
  return "";
}

function applicationsPage() {
  const rows = state.cache.applications || [];
  const visibleRows = rows.filter(
    (item) =>
      hasRole("super_admin") ||
      item.applicant_profile_id === state.profile?.id ||
      item.created_by === state.profile?.id ||
      canReviewApplication(item) ||
      item.decided_by === state.profile?.id ||
      item.claimed_by === state.profile?.id
  );
  return `
    ${pageHeader(
      "Başvurular",
      "Kurul ve rol başvuruları",
      "Her üye kendi başvurusunu açabilir. Yetkililer yalnızca yetkili oldukları kurulun başvurularını görebilir ve sonuçlandırabilir.",
      `<button class="btn btn-primary btn-sm" type="button" data-action="open-application">${icon("plus")} Başvuru Yap</button>`
    )}
    <div class="card-grid application-grid">
      ${
        visibleRows.length
          ? visibleRows
              .map(
                (item) => `
                  <article class="entity-card glass application-card">
                    <div class="entity-top">
                      ${badge(applicationTargetLabel(item), "blue")}
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
                `
              )
              .join("")
          : emptyCard("Başvuru yok", "Kendi kurul veya rol başvurunuzu buradan açabilirsiniz.")
      }
    </div>
  `;
}

function openApplicationReview(item, status) {
  if (!item || !canReviewApplication(item)) return;
  modal({
    title: statusLabel(status),
    subtitle: `${applicationPersonLabel(item)} için başvuru kararı.`,
    body: `
      <form class="form-stack" data-form="application-review" data-id="${esc(item.id)}" data-status="${esc(status)}">
        <div class="setup-box">
          <strong>${esc(applicationPersonLabel(item))}</strong>
          <p class="security-note">${esc(applicationTargetLabel(item))} · ${esc(roleLabel(item.requested_role || "member"))}</p>
        </div>
        <div class="form-group">
          <label for="decision-note">Karar notu</label>
          <textarea class="field" id="decision-note" name="decisionNote" maxlength="600">${esc(item.decision_note || "")}</textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button>
          <button class="btn btn-primary btn-sm" type="submit">Kararı kaydet</button>
        </div>
      </form>
    `
  });
}

function complaintPersonLabel(item) {
  return item.complainant?.display_name || "Şikayet eden üye";
}

function complaintTargetLabel(item) {
  return item.accused?.display_name || "Genel şikayet";
}

function canHandleComplaint(item) {
  if (!item) return false;
  if (hasRole("super_admin")) return true;
  if (hasRole("discipline_chair")) return true;
  if (item.assigned_to && item.assigned_to !== state.profile?.id) return false;
  return hasRole("discipline_vice_chair", "discipline_member");
}

function canClaimComplaint(item) {
  if (!item || ["resolved", "rejected", "closed"].includes(item.status)) return false;
  if (!hasRole("super_admin", "discipline_chair", "discipline_vice_chair", "discipline_member")) return false;
  if (!item.assigned_to) return true;
  return item.assigned_to !== state.profile?.id && hasRole("super_admin", "discipline_chair");
}

function complaintActions(item) {
  const isOwn = item.complainant_profile_id === state.profile?.id;
  const buttons = [];
  if (canClaimComplaint(item)) {
    buttons.push(`<button class="table-action" type="button" data-action="claim-complaint" data-id="${esc(item.id)}">${item.assigned_to ? "Sorumluluğu devral" : "Sorumluluğu al"}</button>`);
  }
  if (canHandleComplaint(item) && !["resolved", "rejected", "closed"].includes(item.status)) {
    buttons.push(`<button class="table-action" type="button" data-action="open-complaint-review" data-id="${esc(item.id)}" data-status="reviewing">İncelemede</button>`);
    buttons.push(`<button class="table-action" type="button" data-action="open-complaint-review" data-id="${esc(item.id)}" data-status="resolved">Çözüldü</button>`);
    buttons.push(`<button class="table-action danger-action" type="button" data-action="open-complaint-review" data-id="${esc(item.id)}" data-status="rejected">Reddet</button>`);
  }
  if (hasRole("super_admin") || (isOwn && item.status === "new")) {
    buttons.push(`<button class="table-action danger-action" type="button" data-action="delete-complaint" data-id="${esc(item.id)}">Sil</button>`);
  }
  return buttons.length ? `<div class="inline-actions">${buttons.join("")}</div>` : "";
}

function complaintsPage() {
  const rows = state.cache.complaints || [];
  return `
    ${pageHeader(
      "Şikayetler",
      "Disiplin kuruluna bildirim",
      "Üyeler şikayet yazabilir. Disiplin kurulu üyeleri şikayeti üstlenebilir; disiplin kurulu başkanı gerekirse sorumluluğu doğrudan devralabilir.",
      `<button class="btn btn-primary btn-sm" type="button" data-action="open-complaint">${icon("plus")} Şikayet Yaz</button>`
    )}
    <div class="card-grid application-grid">
      ${
        rows.length
          ? rows
              .map(
                (item) => `
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
                      <div class="meta-row"><span>Kanıt dosyası</span><strong>${item.evidence_file ? `<a href="${esc(item.evidence_file)}" download="${esc(item.evidence_filename || "ihp-kanit")}">Dosyayı aç</a>` : "Eklenmedi"}</strong></div>
                      <div class="meta-row"><span>Tarih</span><strong>${formatDate(item.created_at, true)}</strong></div>
                    </div>
                    ${complaintActions(item)}
                  </article>
                `
              )
              .join("")
          : emptyCard("Şikayet yok", "Yeni şikayetler burada listelenecek.")
      }
    </div>
  `;
}

function openComplaint() {
  const members = (state.cache.complaintMembers || state.cache.members || [])
    .filter((member) => member.id !== state.profile?.id && !isTechnicalSuperAdmin(member));
  modal({
    title: "Şikayet yaz",
    subtitle: "Bu kayıt disiplin kurulu yetkililerine gider.",
    body: `
      <form class="form-stack" data-form="complaint">
        <div class="form-grid">
          <div class="form-group"><label for="complaint-accused">İlgili üye</label><select class="field" id="complaint-accused" name="accusedProfileId"><option value="">Genel şikayet</option>${members.map((member) => `<option value="${esc(member.id)}">${esc(member.display_name)}</option>`).join("")}</select></div>
          <div class="form-group"><label for="complaint-priority">Öncelik</label><select class="field" id="complaint-priority" name="priority">${["normal", "important", "urgent"].map((value) => `<option value="${value}">${priorityLabel(value)}</option>`).join("")}</select></div>
        </div>
        <div class="form-group"><label for="complaint-subject">Başlık</label><input class="field" id="complaint-subject" name="subject" required minlength="3" maxlength="140" /></div>
        <div class="form-group"><label for="complaint-description">Açıklama</label><textarea class="field" id="complaint-description" name="description" required minlength="10" maxlength="1600"></textarea></div>
        <div class="form-group"><label for="complaint-evidence-note">Kanıt notu (isteğe bağlı)</label><textarea class="field" id="complaint-evidence-note" name="evidenceNote" maxlength="1200" placeholder="Varsa kanıtı kısaca açıklayın."></textarea></div>
        <div class="form-group">
          <label for="complaint-evidence-file">Fotoğraf veya dosya (isteğe bağlı)</label>
          <input class="field" id="complaint-evidence-file" type="file" data-evidence-upload data-evidence-target="complaint-evidence-data" data-evidence-name-target="complaint-evidence-name" />
          <input id="complaint-evidence-data" name="evidenceFile" type="hidden" />
          <input id="complaint-evidence-name" name="evidenceFilename" type="hidden" />
        </div>
        <p class="security-note">Şikayet, disiplin kurulu tarafından incelenir. Sorumluluğu alan yetkili ve karar notu kayıt üzerinde görünür.</p>
        <div class="modal-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button><button class="btn btn-primary btn-sm" type="submit">Şikayeti gönder</button></div>
      </form>
    `
  });
}

function openComplaintReview(item, status) {
  if (!item || !canHandleComplaint(item)) return;
  modal({
    title: statusLabel(status),
    subtitle: `${complaintTargetLabel(item)} hakkındaki şikayet.`,
    body: `
      <form class="form-stack" data-form="complaint-review" data-id="${esc(item.id)}" data-status="${esc(status)}">
        <div class="setup-box">
          <strong>${esc(item.subject)}</strong>
          <p class="security-note">${esc(complaintPersonLabel(item))} → ${esc(complaintTargetLabel(item))}</p>
        </div>
        <div class="form-group">
          <label for="complaint-decision-note">İşlem / karar notu</label>
          <textarea class="field" id="complaint-decision-note" name="decisionNote" required maxlength="800">${esc(item.decision_note || "")}</textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button>
          <button class="btn btn-primary btn-sm" type="submit">Kaydet</button>
        </div>
      </form>
    `
  });
}

function investigationSubjectLabel(item) {
  return item.subject?.display_name || "İlgili üye";
}

function investigationActions(item) {
  const buttons = [];
  if (!item) return "";
  if (hasRole("super_admin")) {
    buttons.push(`<button class="table-action" type="button" data-action="edit-investigation" data-id="${esc(item.id)}">Düzenle</button>`);
    buttons.push(`<button class="table-action danger-action" type="button" data-action="delete-investigation" data-id="${esc(item.id)}">Sil</button>`);
  }
  if (["cancelled", "closed"].includes(item.status)) return buttons.length ? `<div class="inline-actions">${buttons.join("")}</div>` : "";
  const assignedToOther = item.assigned_to && item.assigned_to !== state.profile?.id;
  if (!item.assigned_to || (assignedToOther && hasRole("super_admin", "discipline_chair"))) {
    buttons.push(`<button class="table-action" type="button" data-action="claim-investigation" data-id="${esc(item.id)}">${item.assigned_to ? "Sorumluluğu devral" : "Sorumluluğu al"}</button>`);
  }
  if (hasRole("super_admin", "discipline_chair") || item.assigned_to === state.profile?.id) {
    buttons.push(`<button class="table-action" type="button" data-action="open-investigation-review" data-id="${esc(item.id)}" data-status="closed">Kapat</button>`);
  }
  if (hasRole("super_admin", "discipline_chair")) {
    buttons.push(`<button class="table-action danger-action" type="button" data-action="open-investigation-review" data-id="${esc(item.id)}" data-status="cancelled">İptal et</button>`);
  }
  return buttons.length ? `<div class="inline-actions">${buttons.join("")}</div>` : "";
}

function investigationsPage() {
  const rows = state.cache.investigations || [];
  const openRows = rows.filter((item) => ["open", "reviewing"].includes(item.status));
  return `
    ${pageHeader(
      "Soruşturmalar",
      "Disiplin inceleme akışı",
      "Önce soruşturma açılır, sonra ceza kararnamesi yazılır. Böylece disiplin süreci tek çizgide ve anlaşılır kalır.",
      permissions.disciplineManage()
        ? `<button class="btn btn-primary btn-sm" type="button" data-action="open-investigation">${icon("plus")} Soruşturma Aç</button>`
        : ""
    )}
    <section class="metrics-grid">
      ${metric("Açık", openRows.length, "İnceleme bekleyen", "search")}
      ${metric("Kapatılan", rows.filter((item) => item.status === "closed").length, "Tamamlanan soruşturma", "check")}
      ${metric("İptal", rows.filter((item) => item.status === "cancelled").length, "DK başkanı/admin iptali", "x")}
      ${metric("Toplam", rows.length, "Soruşturma arşivi", "clipboard")}
    </section>
    <div class="card-grid application-grid">
      ${
        rows.length
          ? rows
              .map(
                (item) => `
                  <article class="entity-card glass application-card">
                    <div class="entity-top">
                      ${badge(investigationSubjectLabel(item), "blue")}
                      ${badgeForStatus(item.status)}
                    </div>
                    <h3 style="margin-top:.85rem">${esc(item.title)}</h3>
                    <p>${esc(item.description || "Açıklama eklenmedi.")}</p>
                    <div class="meta-list">
                      <div class="meta-row"><span>İlgili üye</span><strong>${esc(investigationSubjectLabel(item))}</strong></div>
                      <div class="meta-row"><span>Sorumlu</span><strong>${esc(item.assignee?.display_name || "Henüz alınmadı")}</strong></div>
                      <div class="meta-row"><span>Karar notu</span><strong>${esc(item.decision_note || "Henüz karar yok")}</strong></div>
                      <div class="meta-row"><span>Kanıt</span><strong>${item.evidence_file ? `<a href="${esc(item.evidence_file)}" download="${esc(item.evidence_filename || "ihp-sorusturma-kanit")}">Dosyayı aç</a>` : esc(item.evidence_note || "Eklenmedi")}</strong></div>
                      <div class="meta-row"><span>Tarih</span><strong>${formatDate(item.created_at, true)}</strong></div>
                    </div>
                    ${investigationActions(item)}
                  </article>
                `
              )
              .join("")
          : emptyCard("Soruşturma yok", "Yeni soruşturmalar burada listelenecek.")
      }
    </div>
  `;
}

function openInvestigation() {
  if (!permissions.disciplineManage()) return;
  const members = investigationTargetMembers();
  modal({
    title: "Soruşturma aç",
    subtitle: "Soruşturma, ilgili üyeye görünür ve disiplin hiyerarşisine göre yönetilir.",
    body: `
      <form class="form-stack" data-form="investigation">
        <div class="form-group"><label for="investigation-subject">İlgili üye</label><select class="field" id="investigation-subject" name="subjectProfileId" required><option value="">Seçin</option>${members.map((member) => `<option value="${esc(member.id)}">${esc(member.display_name)} · ${esc(roleLabels(member))}</option>`).join("")}</select></div>
        <div class="form-group"><label for="investigation-title">Başlık</label><input class="field" id="investigation-title" name="title" required minlength="3" maxlength="140" /></div>
        <div class="form-group"><label for="investigation-description">Açıklama</label><textarea class="field" id="investigation-description" name="description" required minlength="10" maxlength="1600"></textarea></div>
        <div class="form-group"><label for="investigation-evidence-note">Kanıt notu (isteğe bağlı)</label><textarea class="field" id="investigation-evidence-note" name="evidenceNote" maxlength="1200"></textarea></div>
        <div class="form-group">
          <label for="investigation-evidence-file">Fotoğraf veya dosya (isteğe bağlı)</label>
          <input class="field" id="investigation-evidence-file" type="file" data-evidence-upload data-evidence-target="investigation-evidence-data" data-evidence-name-target="investigation-evidence-name" />
          <input id="investigation-evidence-data" name="evidenceFile" type="hidden" />
          <input id="investigation-evidence-name" name="evidenceFilename" type="hidden" />
        </div>
        <div class="modal-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button><button class="btn btn-primary btn-sm" type="submit">Soruşturmayı aç</button></div>
      </form>
    `
  });
}

function openInvestigationReview(item, status) {
  if (!item) return;
  const canReview = hasRole("super_admin", "discipline_chair") || item.assigned_to === state.profile?.id;
  if (!canReview) return;
  modal({
    title: statusLabel(status),
    subtitle: `${investigationSubjectLabel(item)} hakkındaki soruşturma.`,
    body: `
      <form class="form-stack" data-form="investigation-review" data-id="${esc(item.id)}" data-status="${esc(status)}">
        <div class="setup-box">
          <strong>${esc(item.title)}</strong>
          <p class="security-note">${esc(item.description || "")}</p>
        </div>
        <div class="form-group"><label for="investigation-decision-note">Karar / işlem notu</label><textarea class="field" id="investigation-decision-note" name="decisionNote" required maxlength="900">${esc(item.decision_note || "")}</textarea></div>
        <div class="modal-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button><button class="btn btn-primary btn-sm" type="submit">Kaydet</button></div>
      </form>
    `
  });
}

function openInvestigationEdit(item) {
  if (!item || !hasRole("super_admin")) return;
  modal({
    title: "Soruşturmayı düzenle",
    subtitle: "Bu alan yalnızca admin tarafından düzenlenebilir.",
    body: `
      <form class="form-stack" data-form="investigation-edit" data-id="${esc(item.id)}">
        <div class="setup-box">
          <strong>${esc(investigationSubjectLabel(item))}</strong>
          <p class="security-note">Soruşturmanın konusu değişmez; metin ve kanıt bilgisi düzenlenir.</p>
        </div>
        <div class="form-group"><label for="investigation-edit-title">Başlık</label><input class="field" id="investigation-edit-title" name="title" required minlength="3" maxlength="140" value="${esc(item.title || "")}" /></div>
        <div class="form-group"><label for="investigation-edit-description">Açıklama</label><textarea class="field" id="investigation-edit-description" name="description" required minlength="10" maxlength="1600">${esc(item.description || "")}</textarea></div>
        <div class="form-group"><label for="investigation-edit-evidence-note">Kanıt notu</label><textarea class="field" id="investigation-edit-evidence-note" name="evidenceNote" maxlength="1200">${esc(item.evidence_note || "")}</textarea></div>
        <div class="form-group">
          <label for="investigation-edit-evidence-file">Fotoğraf veya dosya</label>
          <input class="field" id="investigation-edit-evidence-file" type="file" data-evidence-upload data-evidence-target="investigation-edit-evidence-data" data-evidence-name-target="investigation-edit-evidence-name" />
          <input id="investigation-edit-evidence-data" name="evidenceFile" type="hidden" value="${esc(item.evidence_file || "")}" />
          <input id="investigation-edit-evidence-name" name="evidenceFilename" type="hidden" value="${esc(item.evidence_filename || "")}" />
        </div>
        <div class="modal-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button><button class="btn btn-primary btn-sm" type="submit">Kaydet</button></div>
      </form>
    `
  });
}


function reportsPage() {
  const data = state.cache.reports || {};
  const profiles = visibleProfiles(data.profiles || []);
  const announcements = data.announcements || [];
  const disciplines = data.disciplines || [];
  const positions = data.positions || [];
  const committees = data.committees || [];
  const applications = data.applications || [];
  const complaints = data.complaints || [];
  const investigations = data.investigations || [];
  const youth = data.youth || [];
  const activeProfiles = profiles.filter((item) => item.status === "active");
  const vacant = positions.filter((item) => item.status === "vacant");
  const max = Math.max(1, ...committees.map((committee) => committee.member_count || 1));

  return `
    ${pageHeader("Raporlama", "Portal görünümü", "Temel göstergeler sade ve okunabilir bir yönetim özeti halinde sunulur.")}
    <section class="metrics-grid">
      ${metric("Toplam üye", profiles.length, `${activeProfiles.length} aktif üye`, "users")}
      ${metric("Kurul", committees.length, "Aktif organizasyon birimleri", "grid")}
      ${metric("Boş görev", vacant.length, "Atama bekleyen sorumluluklar", "briefcase")}
      ${metric("Açık başvuru", applications.filter((item) => ["new", "reviewing"].includes(item.status)).length, "İşlem bekleyen başvurular", "inbox")}
      ${metric("Açık soruşturma", investigations.filter((item) => ["open", "reviewing"].includes(item.status)).length, "Disiplin incelemeleri", "search")}
    </section>
    <section class="dashboard-grid">
      <article class="panel glass">
        <div class="panel-head"><h3>Kurul bazlı görünüm</h3><span>Sade dağılım</span></div>
        <div class="chart">
          ${committees
            .map(
              (item, index) => `
                <div class="chart-column">
                  <div class="chart-bar" style="height:${Math.max(22, ((index + 1) / Math.max(max, committees.length)) * 100)}%"></div>
                  <span>${esc(item.name)}</span>
                </div>
              `
            )
            .join("")}
        </div>
      </article>
      <article class="panel glass">
        <div class="panel-head"><h3>İletişim özeti</h3><span>Güncel durum</span></div>
        <div class="list-row"><div class="list-main"><strong>Toplam duyuru</strong><span>Görüntülenebilir kayıtlar</span></div>${badge(String(announcements.length), "gold")}</div>
        <div class="list-row"><div class="list-main"><strong>Yayınlanan duyuru</strong><span>Aktif iletişim kayıtları</span></div>${badge(String(announcements.filter((item) => item.status === "published").length), "green")}</div>
        <div class="list-row"><div class="list-main"><strong>Boş görev</strong><span>Atama bekleyen sorumluluklar</span></div>${badge(String(vacant.length), "blue")}</div>
        <div class="list-row"><div class="list-main"><strong>Şikayetler</strong><span>Disiplin kuruluna gelen kayıtlar</span></div>${badge(String(complaints.length), "coral")}</div>
        <div class="list-row"><div class="list-main"><strong>Soruşturmalar</strong><span>Açık ve kapanan incelemeler</span></div>${badge(String(investigations.length), "gold")}</div>
        <div class="list-row"><div class="list-main"><strong>Gençlik çalışmaları</strong><span>Aktif veya planlanan işler</span></div>${badge(String(youth.filter((item) => item.status !== "archived").length), "violet")}</div>
        <div class="list-row"><div class="list-main"><strong>Disiplin kayıtları</strong><span>Gizlilik politikasıyla filtrelenir</span></div>${badge(String(disciplines.length), "coral")}</div>
      </article>
    </section>
  `;
}

function auditPage() {
  const rows = state.cache.audit || [];
  return `
    ${pageHeader("Güvenlik", "İşlem geçmişi", "Kritik güncellemeler güvenilir ve takip edilebilir bir sistem düzeni için kayıt altına alınır.")}
    <div class="table-shell glass">
      <table class="data-table">
        <thead><tr><th>İşlem</th><th>Hedef</th><th>Kayıt</th><th>Tarih</th></tr></thead>
        <tbody>
          ${
            rows.length
              ? rows
                  .map(
                    (item) => `
                      <tr>
                        <td><span class="cell-main">${esc(auditSummary(item))}</span><span class="cell-sub">${esc(item.actor?.display_name || "Sistem")}</span></td>
                        <td><span class="cell-main">${esc(auditTargetLabel(item.target_type))}</span></td>
                        <td>${esc(String(item.target_id || "").slice(0, 12))}</td>
                        <td>${formatDate(item.created_at, true)}</td>
                      </tr>
                    `
                  )
                  .join("")
              : `<tr><td colspan="4">${emptyCard("İşlem geçmişi boş", "Kritik işlemler otomatik olarak burada listelenecek.")}</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
}

function auditTargetLabel(target = "") {
  return (
    {
      profiles: "Üye",
      applications: "Başvuru",
      complaints: "Şikayet",
      discipline_records: "Disiplin kaydı",
      announcements: "Duyuru",
      regulations: "Yönetmelik",
      youth_activities: "Gençlik çalışması",
      committees: "Kurul",
      positions: "Görev"
    }[target] || target || "Kayıt"
  );
}

function auditSummary(item) {
  const details = item.details || {};
  if (details.summary) return details.summary;
  if (item.target_type === "profiles" && details.old_roles && details.new_roles) {
    const oldRoles = new Set(details.old_roles);
    const newRoles = new Set(details.new_roles);
    const added = [...newRoles].filter((role) => !oldRoles.has(role)).map(roleLabel);
    const removed = [...oldRoles].filter((role) => !newRoles.has(role)).map(roleLabel);
    if (added.length) return `${added.join(", ")} rolü verildi`;
    if (removed.length) return `${removed.join(", ")} rolü alındı`;
  }
  const action = { insert: "oluşturuldu", update: "güncellendi", delete: "silindi" }[item.action] || item.action;
  return `${auditTargetLabel(item.target_type)} ${action}`;
}

function settingsPage() {
  const settings = state.cache.settings;
  const theme = document.documentElement.dataset.theme || "dark";
  const profile = state.profile;
  return `
    ${pageHeader("Ayarlar", "Portal tercihleri", "Kişisel görünüm tercihinizi ve güvenlik bilgilendirmelerini tek alanda inceleyin.")}
    <section class="dashboard-grid">
      <article class="panel glass">
        <div class="panel-head"><h3>Portal bilgileri</h3><span>Sistem ayarları</span></div>
        <div class="setting-row"><div><strong>Portal adı</strong><span>Topluluk çalışma alanı</span></div><b>${esc(settings?.portal_name || "İHP Topluluk Portalı")}</b></div>
        <div class="setting-row"><div><strong>Kısa açıklama</strong><span>${esc(settings?.short_description || "Topluluk düzeni ve iletişim portalı.")}</span></div></div>
        <div class="setting-row"><div><strong>Bildirimler</strong><span>Sistem içi duyuru tercihleri</span></div>${badge(settings?.notifications_enabled !== false ? "Açık" : "Kapalı", "green")}</div>
      </article>
      <article class="panel glass">
        <div class="panel-head"><h3>Kişisel tercih</h3><span>Bu tarayıcı</span></div>
        <div class="theme-grid">
          ${THEME_OPTIONS.map(([value, label]) => `
            <label class="theme-card ${activeTheme() === value ? "active" : ""}">
              <input type="radio" name="themePreference" value="${esc(value)}" data-theme-select ${activeTheme() === value ? "checked" : ""} />
              <span class="theme-swatch theme-swatch-${esc(value)}"></span>
              <strong>${esc(label)}</strong>
            </label>
          `).join("")}
        </div>
        <div class="setting-row"><div><strong>Aktif roller</strong><span>Veri erişiminizi belirler.</span></div>${badge(roleLabels(state.profile), "gold")}</div>
      </article>
    </section>
    <section class="dashboard-grid" style="margin-top:.85rem">
      <article class="panel glass">
        <div class="panel-head"><h3>Profilim</h3><span>Ad, avatar ve renk</span></div>
        <form class="form-stack" data-form="profile-settings">
          <div class="preview-profile">${avatar(profile)}<div><strong>${esc(profile.display_name)}</strong><span>${esc(roleLabels(profile))}</span></div></div>
          <div class="form-grid">
            <div class="form-group"><label for="profile-name">Ad soyad</label><input class="field" id="profile-name" name="displayName" value="${esc(profile.display_name)}" required minlength="2" maxlength="48" /></div>
            <div class="form-group"><label for="profile-initials">Avatar kısaltması</label><input class="field" id="profile-initials" name="avatarInitials" value="${esc(profile.avatar_initials || "")}" placeholder="TMK" maxlength="4" /></div>
          </div>
          <div class="form-grid">
            <div class="form-group"><label for="profile-color">Avatar rengi</label><input class="field" id="profile-color" name="avatarColor" type="color" value="${esc(profile.avatar_color || "#f3c969")}" /></div>
            <div class="form-group"><label for="profile-file">Profil fotoğrafı yükle</label><input class="field" id="profile-file" type="file" accept="image/*" data-avatar-upload data-avatar-target="profile-avatar-url" /><input id="profile-avatar-url" name="avatarUrl" type="hidden" value="${esc(profile.avatar_url || "")}" /></div>
          </div>
          <button class="btn btn-primary btn-sm" type="submit">Profilimi kaydet</button>
        </form>
      </article>
      <article class="panel glass">
        <div class="panel-head"><h3>Şifre değiştir</h3><span>Eski şifre gerekli</span></div>
        <form class="form-stack" data-form="change-password">
          <div class="form-group"><label for="old-password">Eski şifre</label><input class="field" id="old-password" name="oldPassword" type="password" autocomplete="current-password" required /></div>
          <div class="form-group"><label for="new-password">Yeni şifre</label><input class="field" id="new-password" name="newPassword" type="password" autocomplete="new-password" required minlength="8" /></div>
          <button class="btn btn-primary btn-sm" type="submit">Şifreyi güncelle</button>
        </form>
      </article>
    </section>
    <section class="panel glass" style="margin-top:.85rem">
      <div class="panel-head"><h3>Güvenlik ve gizlilik</h3><span>Koruma ilkeleri</span></div>
      <div class="privacy-strip">${icon("shield")}<span>Portal verileri Supabase Row Level Security ile korunur. Yetkiniz olmayan kayıtlar veri katmanında filtrelenir.</span></div>
      <div class="privacy-strip">${icon("lock")}<span>Disiplin kayıtları herkese açık değildir. Üyeler yalnızca kendilerine açık kayıtları görebilir.</span></div>
      <div class="privacy-strip">${icon("history")}<span>Kritik değişiklikler işlem geçmişine kaydedilir. Kalıcı silme yerine arşivleme tercih edilir.</span></div>
    </section>
    ${
      typeof isSystemProfile === "function" && isSystemProfile(profile)
        ? ""
        : `<section class="panel glass account-danger-zone" style="margin-top:.85rem">
            <div><span class="panel-kicker">Tehlikeli işlem</span><h3>Portal hesabını kalıcı olarak sil</h3><p>Üyeliğiniz, kredi bakiyeniz, gelirleriniz, çekleriniz ve kişisel kayıtlarınız geri getirilemez biçimde kaldırılır.</p></div>
            <button class="btn btn-danger btn-sm" type="button" data-action="open-delete-account">Hesabımı sil</button>
          </section>`
    }
  `;
}

function openDeleteAccount() {
  modal({
    title: "Hesabınızı kalıcı olarak silin",
    subtitle: "Bu işlem geri alınamaz.",
    body: `
      <form class="form-stack account-delete-form" id="delete-account-form" data-form="delete-account">
        <div class="account-delete-warning" role="alert">
          <strong>Tüm üyelik ve finans verileriniz silinecek</strong>
          <ul>
            <li>Kredi bakiyesi, haftalık gelirler, çekler ve kredi geçmişi kaybolur.</li>
            <li>Disiplin kayıtları, başvurular, bildirimler ve profiliniz kaldırılır.</li>
            <li>Aynı hesap daha sonra otomatik olarak geri açılamaz.</li>
          </ul>
        </div>
        <label class="account-delete-consent"><input type="checkbox" name="acceptDataLoss" data-account-delete-consent /><span>Yukarıdaki verilerin ve bütün gelirlerimin kalıcı olarak kaybolacağını okudum ve kabul ediyorum.</span></label>
        <div class="form-group"><label for="delete-account-confirmation">Onaylamak için <strong>HESABIMI SİL</strong> yazın</label><input class="field" id="delete-account-confirmation" name="confirmation" autocomplete="off" data-account-delete-text required /></div>
      </form>
    `,
    actions: `
      <div class="modal-actions">
        <button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button>
        <button class="btn btn-danger btn-sm" type="submit" form="delete-account-form" data-delete-account-submit disabled>Hesabımı kalıcı olarak sil</button>
      </div>
    `
  });
}

function renderPortalPage(page) {
  const pages = {
    overview: dashboardPage,
    members: membersPage,
    presidency: presidencyPage,
    "discipline-council": disciplineCouncilPage,
    positions: positionsPage,
    committees: committeesPage,
    announcements: announcementsPage,
    discipline: disciplinePage,
    complaints: complaintsPage,
    investigations: investigationsPage,
    regulation: regulationPage,
    youth: youthPage,
    applications: applicationsPage,
    reports: reportsPage,
    audit: auditPage,
    settings: settingsPage
  };
  return (pages[page] || dashboardPage)();
}

function audienceLabel(value) {
  return (
    {
      all_members: "Tüm üyeler",
      management: "Yönetim",
      discipline: "Disiplin Kurulu",
      youth: "Gençlik Kolları"
    }[value] || value
  );
}

function priorityLabel(value) {
  return { normal: "Normal", important: "Önemli", urgent: "Acil" }[value] || value;
}

function severityBadge(value) {
  return badge(
    { low: "Düşük", medium: "Orta", high: "Yüksek" }[value] || value,
    { low: "green", medium: "gold", high: "coral" }[value] || "blue"
  );
}

function render() {
  const current = route();
  if (state.booting) {
    app.innerHTML = `<main class="login-shell">${skeletonPage()}</main>`;
    return;
  }

  if (current.startsWith("portal")) {
    if (!getSession() || !state.profile) {
      navigate("login");
      return;
    }
    const page = current.split("/")[1] || "overview";
    const navItem = navItems.find(([id]) => id === page);
    if (!navItem || !navItem[3]()) {
      navigate("portal/overview");
      return;
    }
    app.innerHTML = portalShell(page);
    return;
  }

  app.innerHTML = current === "login" ? loginPage() : publicPage();
}

const navigationSummary = {
  loadedAt: 0,
  promise: null
};

async function loadNavigationSummary(force = false) {
  if (!force && Date.now() - navigationSummary.loadedAt < 30_000) return;
  if (navigationSummary.promise) return navigationSummary.promise;

  navigationSummary.promise = Promise.allSettled([
    loadNotifications(),
    loadApplications(),
    loadComplaints(),
    loadInvestigations()
  ]).then(([notifications, applications, complaints, investigations]) => {
    if (notifications.status === "fulfilled") state.cache.notifications = notifications.value;
    if (applications.status === "fulfilled") state.cache.applicationBadge = applications.value;
    if (complaints.status === "fulfilled") state.cache.complaintBadge = complaints.value;
    if (investigations.status === "fulfilled") state.cache.investigationBadge = investigations.value;
    navigationSummary.loadedAt = Date.now();
  }).finally(() => {
    navigationSummary.promise = null;
  });

  return navigationSummary.promise;
}

async function loadPage(page) {
  state.loading = true;
  state.pageError = null;
  render();
  try {
    await loadNavigationSummary();
    maybeCelebrateRewards();
    if (page === "overview") state.cache.overview = await loadDashboard();
    if (page === "members") {
      const [members, committees] = await Promise.all([loadMembers(), loadCommittees()]);
      state.cache.members = members;
      state.cache.committees = committees;
    }
    if (page === "presidency") {
      const [members, committees] = await Promise.all([loadMembers(), loadCommittees()]);
      state.cache.members = members;
      state.cache.committees = committees;
    }
    if (page === "discipline-council") {
      const [members, complaints] = await Promise.all([
        loadMembers(),
        loadComplaints().catch(() => [])
      ]);
      state.cache.members = members;
      state.cache.complaintBadge = complaints;
    }
    if (page === "positions") state.cache.positions = await loadPositions();
    if (page === "committees") {
      const [committees, members] = await Promise.all([loadCommittees(), loadMembers()]);
      state.cache.committees = committees;
      state.cache.members = members;
    }
    if (page === "announcements") state.cache.announcements = await loadAnnouncements();
    if (page === "discipline") {
      const [records, members, investigations] = await Promise.all([
        loadDisciplineRecords(),
        permissions.disciplineManage() || canAwardPoints() ? loadMembers() : Promise.resolve([]),
        loadInvestigations().catch(() => [])
      ]);
      state.cache.discipline = records;
      state.cache.disciplineMembers = members;
      state.cache.investigations = investigations;
    }
    if (page === "regulation") state.cache.regulation = await loadRegulations();
    if (page === "youth") state.cache.youth = await loadYouthActivities();
    if (page === "applications") {
      const [applications, committees] = await Promise.all([
        loadApplications(),
        loadCommittees()
      ]);
      state.cache.applications = applications;
      state.cache.applicationBadge = applications;
      state.cache.committees = committees;
    }
    if (page === "complaints") {
      const [complaints, members] = await Promise.all([
        loadComplaints(),
        loadMembers()
      ]);
      state.cache.complaints = complaints;
      state.cache.complaintBadge = complaints;
      state.cache.complaintMembers = members;
    }
    if (page === "investigations") {
      const [investigations, members] = await Promise.all([
        loadInvestigations(),
        loadMembers()
      ]);
      state.cache.investigations = investigations;
      state.cache.investigationBadge = investigations;
      state.cache.members = members;
      state.cache.disciplineMembers = members;
    }
    if (page === "reports") state.cache.reports = await loadDashboard();
    if (page === "audit") state.cache.audit = await loadAuditLogs();
    if (page === "settings") state.cache.settings = await loadSettings();
  } catch (error) {
    state.pageError = {
      page,
      message: error?.message || "Bu bölüm şu anda yüklenemedi."
    };
    showToast(error.message, "error");
  } finally {
    state.loading = false;
    render();
  }
}

async function handleRoute() {
  state.sidebarOpen = false;
  const current = route();
  if (current.startsWith("portal")) {
    if (!getSession() || !state.profile) {
      render();
      return;
    }
    const page = current.split("/")[1] || "overview";
    await loadPage(page);
    return;
  }
  render();
}

function roleCheckboxes(selected = ["member"], options = ROLE_OPTIONS) {
  return options.map(
    ([value, label]) => `
      <label class="choice-card ${value === "super_admin" ? "role-admin" : ""}">
        <input type="checkbox" name="roles" value="${esc(value)}" ${selected.includes(value) ? "checked" : ""} />
        <span>${esc(label)}</span>
      </label>
    `
  ).join("");
}

function committeeCheckboxes(selected = []) {
  const committees = (state.cache.committees || []).filter((committee) => committee.status !== "passive");
  if (!committees.length) {
    return `<p class="security-note">Aktif kurul bulunamadı.</p>`;
  }

  return committees.map(
    (committee) => `
      <label class="choice-card">
        <input type="checkbox" name="committee_ids" value="${esc(committee.id)}" ${selected.includes(committee.id) ? "checked" : ""} />
        <span>${esc(committee.name)}</span>
      </label>
    `
  ).join("");
}

function openInvite() {
  const inviteRoleChoices = hasRole("super_admin") ? ROLE_OPTIONS : [["member", ROLE_LABELS.member]];
  modal({
    title: "Üye ekle",
    subtitle: "Ad soyad ve e-posta yazın; sistem rastgele geçici şifre üretip hesabı oluşturur.",
    body: `
      <form class="form-stack" data-form="invite-member">
        <div class="form-grid">
          <div class="form-group"><label for="invite-name">Ad soyad</label><input class="field" id="invite-name" name="displayName" placeholder="Ad Soyad" pattern="[A-Za-zÇĞİÖŞÜçğıöşü .'-]{2,48}" title="Ad soyad yazın." required minlength="2" maxlength="48" /></div>
          <div class="form-group"><label for="invite-email">Giriş e-postası</label><input class="field" id="invite-email" name="email" type="email" required /></div>
        </div>
        <div class="form-group"><label>Roller</label><div class="choice-grid">${roleCheckboxes(["member"], inviteRoleChoices)}</div></div>
        <p class="security-note">Hesap oluşturulunca geçici şifre ekranda gösterilir. Admin dışındaki yetkililer üyeyi düz üye olarak ekler; rol kararları Başkanlık panelinden verilir.</p>
        <div class="modal-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button><button class="btn btn-primary btn-sm" type="submit">Üyeyi oluştur</button></div>
      </form>
    `
  });
}

function openMemberEditor(member) {
  if (!member || !canModerateMember(member)) return;
  const fullAdmin = canFullyEditMembers();
  const roleChoices = fullAdmin
    ? ROLE_OPTIONS
    : ROLE_OPTIONS.filter(([value]) =>
        hasRole("president")
          ? !["super_admin", "president"].includes(value)
          : !["super_admin", "president", "vice_president", "credit_officer"].includes(value)
      );
  modal({
    title: fullAdmin ? "Üyeyi düzenle" : "Rol ve durum yönet",
    subtitle: fullAdmin
      ? "Admin üyenin profil alanlarını, kurullarını ve şifresini düzenleyebilir."
      : "Başkanlık moderasyonu yalnızca rol ve durumla sınırlıdır; profil, fotoğraf ve şifre alanları gösterilmez.",
    body: `
      <form class="form-stack" data-form="member-edit" data-mode="${fullAdmin ? "admin" : "moderate"}" data-id="${esc(member.id)}">
        ${fullAdmin
          ? `<div class="form-grid">
              <div class="form-group"><label for="member-name">Ad soyad</label><input class="field" id="member-name" name="displayName" value="${esc(member.display_name)}" required minlength="2" maxlength="48" /></div>
              <div class="form-group"><label for="member-status">Durum</label><select class="field" id="member-status" name="status">${["active", "passive", "suspended", "left", "pending"].map((value) => `<option value="${value}" ${member.status === value ? "selected" : ""}>${statusLabel(value)}</option>`).join("")}</select></div>
            </div>`
          : `<div class="setup-box">
              <strong>${esc(member.display_name)}</strong>
              <p class="security-note">Profil ve şifre bilgileri bu yetki seviyesinde gizlidir.</p>
            </div>
            <div class="form-group"><label for="member-status">Durum</label><select class="field" id="member-status" name="status">${["active", "passive", "suspended", "left", "pending"].map((value) => `<option value="${value}" ${member.status === value ? "selected" : ""}>${statusLabel(value)}</option>`).join("")}</select></div>`
        }
        <div class="form-group"><label>Roller</label><div class="choice-grid">${roleCheckboxes(rolesOf(member), roleChoices)}</div></div>
        ${
          fullAdmin
            ? `<div class="form-group"><label>Kurullar</label><div class="choice-grid">${committeeCheckboxes(committeeIds(member))}</div><p class="security-note">Yürütme Kurulu yalnızca başkan, başkan yardımcısı, başkan yaveri ve başkanın seçtiği kişilerden oluşur.</p></div>`
            : ""
        }
        ${
          fullAdmin
            ? `<div class="form-grid">
                <div class="form-group"><label for="avatar-initials">Avatar kısaltması</label><input class="field" id="avatar-initials" name="avatarInitials" value="${esc(member.avatar_initials || "")}" placeholder="TMK" maxlength="4" /></div>
                <div class="form-group"><label for="avatar-color">Avatar rengi</label><input class="field" id="avatar-color" name="avatarColor" type="color" value="${esc(member.avatar_color || "#f3c969")}" /></div>
              </div>
              <div class="form-group"><label for="member-discipline-points">Disiplin puanı</label><input class="field" id="member-discipline-points" name="disciplinePoints" type="number" min="0" max="200" step="1" value="${disciplinePoints(member)}" required /><p class="security-note">Admin, üyenin disiplin puanını 0 ile 200 arasında doğrudan düzeltebilir.</p></div>
              <div class="form-group"><label for="avatar-file">Profil fotoğrafı yükle</label><input class="field" id="avatar-file" type="file" accept="image/*" data-avatar-upload data-avatar-target="member-avatar-url" /><input id="member-avatar-url" name="avatarUrl" type="hidden" value="${esc(member.avatar_url || "")}" /></div>
              <div class="form-group"><label for="member-password">Yeni şifre (boş bırakılırsa değişmez)</label><input class="field" id="member-password" name="password" type="text" minlength="8" autocomplete="off" /></div>`
            : ""
        }
        <div class="modal-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button><button class="btn btn-primary btn-sm" type="submit">Kaydet</button></div>
      </form>
    `
  });
}


function showTemporaryPassword(result) {
  modal({
    title: "Üye oluşturuldu",
    subtitle: "Bu geçici şifreyi yalnızca ilgili kişiye iletin.",
    body: `
      <div class="setup-box">
        <strong>${esc(result.displayName || result.email)}</strong>
        <p class="security-note">E-posta: ${esc(result.email)}</p>
        <p class="temp-password">${esc(result.temporaryPassword)}</p>
      </div>
      <div class="modal-actions"><button class="btn btn-primary btn-sm" type="button" data-action="close-modal">Tamam</button></div>
    `
  });
}

function openNotifications() {
  const rows = state.cache.notifications || [];
  modal({
    title: "Bildirimler",
    subtitle: rows.filter((item) => !item.read_at).length
      ? "Okunmamış bildirimleriniz var."
      : "Tüm bildirimler okunmuş görünüyor.",
    body: `
      <div class="notification-list">
        ${
          rows.length
            ? rows
                .map(
                  (item) => `
                    <article class="notification-card ${item.read_at ? "" : "unread"}">
                      <div>
                        <strong>${esc(item.title)}</strong>
                        <p>${esc(item.body || "")}</p>
                        <span>${esc(notificationCategoryLabel(item.category))} · ${formatDate(item.created_at, true)}</span>
                      </div>
                      ${
                        item.read_at
                          ? badge("Okundu", "green")
                          : `<button class="table-action" type="button" data-action="mark-notification" data-id="${esc(item.id)}">Okundu</button>`
                      }
                    </article>
                  `
                )
                .join("")
            : emptyCard("Bildirim yok", "Rol, başvuru veya disiplin hareketleri burada görünecek.")
        }
      </div>
    `,
    actions: `
      <div class="modal-actions">
        <button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Kapat</button>
        ${rows.some((item) => !item.read_at) ? `<button class="btn btn-primary btn-sm" type="button" data-action="mark-all-notifications">Tümünü okundu yap</button>` : ""}
      </div>
    `
  });
}

function notificationCategoryLabel(category = "system") {
  return (
    {
      discipline: "Disiplin işlemi",
      reward: "Ödül",
      application: "Başvuru",
      complaint: "Şikayet",
      role: "Rol değişikliği",
      member: "Üye işlemi",
      announcement: "Duyuru",
      system: "Sistem"
    }[category] || category
  );
}

function openAnnouncement(item = null) {
  modal({
    title: item ? "Duyuruyu düzenle" : "Duyuru oluştur",
    subtitle: "Yayın hedefini ve önceliğini dikkatle seçin.",
    body: `
      <form class="form-stack" data-form="announcement" data-id="${esc(item?.id || "")}">
        <div class="form-group"><label for="announcement-title">Başlık</label><input class="field" id="announcement-title" name="title" value="${esc(item?.title || "")}" required maxlength="120" /></div>
        <div class="form-group"><label for="announcement-content">İçerik</label><textarea class="field" id="announcement-content" name="content" required maxlength="1200">${esc(item?.content || "")}</textarea></div>
        <div class="form-grid">
          <div class="form-group"><label for="announcement-category">Kategori</label><select class="field" id="announcement-category" name="category">${["Genel Duyuru", "Site Çalışmaları", "Görev Dağılımı", "Yönetmelik", "Gençlik Kolları", "Disiplin Kurulu", "Portal Güncellemesi"].map((value) => `<option ${item?.category === value ? "selected" : ""}>${value}</option>`).join("")}</select></div>
          <div class="form-group"><label for="announcement-audience">Hedef kitle</label><select class="field" id="announcement-audience" name="audience">${["all_members", "management", "discipline", "youth"].map((value) => `<option value="${value}" ${item?.audience === value ? "selected" : ""}>${audienceLabel(value)}</option>`).join("")}</select></div>
        </div>
        <div class="form-grid">
          <div class="form-group"><label for="announcement-priority">Öncelik</label><select class="field" id="announcement-priority" name="priority">${["normal", "important", "urgent"].map((value) => `<option value="${value}" ${item?.priority === value ? "selected" : ""}>${priorityLabel(value)}</option>`).join("")}</select></div>
          <div class="form-group"><label for="announcement-status">Durum</label><select class="field" id="announcement-status" name="status">${["draft", "published", "archived"].map((value) => `<option value="${value}" ${item?.status === value ? "selected" : ""}>${statusLabel(value)}</option>`).join("")}</select></div>
        </div>
        <div class="modal-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button><button class="btn btn-primary btn-sm" type="submit">Kaydet</button></div>
      </form>
    `
  });
}

function openDiscipline(item = null) {
  const members = disciplineTargetMembers();
  const usedInvestigationIds = new Set(
    (state.cache.discipline || [])
      .filter((record) => record.id !== item?.id && record.investigation_id)
      .map((record) => record.investigation_id)
  );
  const investigations = (state.cache.investigations || []).filter((row) => (
    row.id === item?.investigation_id
    || (["open", "reviewing"].includes(row.status) && !usedInvestigationIds.has(row.id))
  ));
  modal({
    title: item ? "Disiplin kararını düzelt" : "Ceza kararnamesi yaz",
    subtitle: "Ceza girmek için önce soruşturma açılmış olmalıdır. Kayıt kaydedilince durum otomatik Kararname Yazıldı olur.",
    body: `
      <form class="form-stack" data-form="discipline" data-id="${esc(item?.id || "")}">
        <div class="form-grid">
          <div class="form-group"><label for="discipline-member">İlgili üye</label><select class="field" id="discipline-member" name="member_id" required><option value="">Seçin</option>${members.map((member) => `<option value="${esc(member.id)}" ${item?.member_id === member.id ? "selected" : ""}>${esc(member.display_name)} · ${disciplinePoints(member)} puan</option>`).join("")}</select></div>
          <div class="form-group"><label for="discipline-type">Ceza türü</label><select class="field" id="discipline-type" name="record_type">${["Uyarı", "Kınama", "Geçici Kısıtlama", "Görevden Alma", "Üyelik Askısı"].map((value) => `<option ${item?.record_type === value ? "selected" : ""}>${value}</option>`).join("")}</select></div>
        </div>
        <div class="form-group"><label for="discipline-investigation">İlgili soruşturma</label><select class="field" id="discipline-investigation" name="investigation_id" required><option value="">Soruşturma seçin</option>${investigations.map((row) => `<option value="${esc(row.id)}" ${item?.investigation_id === row.id ? "selected" : ""}>${esc(row.title)} · ${esc(investigationSubjectLabel(row))}</option>`).join("")}</select><p class="security-note">${investigations.length ? "Her soruşturmaya yalnızca bir ceza bağlanabilir. Ceza kaydedildiğinde soruşturma otomatik kapanır." : "Ceza verilebilecek açık ve kullanılmamış soruşturma bulunmuyor."}</p></div>
        <div class="form-group"><label for="discipline-reason">Sebep</label><input class="field" id="discipline-reason" name="reason" value="${esc(item?.reason || "")}" required maxlength="160" /></div>
        <div class="form-group"><label for="discipline-description">Açıklama</label><textarea class="field" id="discipline-description" name="description" required maxlength="1200">${esc(item?.description || "")}</textarea></div>
        <div class="form-grid">
          <div class="form-group"><label for="discipline-severity">Ciddiyet</label><select class="field" id="discipline-severity" name="severity">${["low", "medium", "high"].map((value) => `<option value="${value}" ${item?.severity === value ? "selected" : ""}>${severityBadge(value).replace(/<[^>]+>/g, "")}</option>`).join("")}</select></div>
          <div class="setup-box"><strong>Durum</strong><p class="security-note">Kaydedildiğinde otomatik olarak <strong>Kararname Yazıldı</strong> olur.</p></div>
        </div>
        <div class="form-grid">
          <div class="form-group"><label for="discipline-point-delta">Düşülecek puan</label><input class="field" id="discipline-point-delta" name="point_delta" type="number" min="-100" max="0" step="1" value="${esc(item?.point_delta ?? 0)}" /><p class="security-note">Ceza için 0 veya eksi puan yazın. Örn: -10.</p></div>
          <div class="setup-box"><strong>Puan rehberi</strong><p class="security-note">Ödül puanı bu formdan verilmez. Ayrı Puan Ver ekranını kullanın.</p></div>
        </div>
        <div class="form-group"><label for="discipline-decree">Kararname metni</label><textarea class="field decree-field" id="discipline-decree" name="decree_text" required maxlength="24000" style="min-height:72vh;line-height:1.65;resize:vertical">${esc(item?.decree_text || item?.action_taken || "")}</textarea><p class="security-note">Uzun kararname yazabilirsiniz. Alan yaklaşık dört sayfalık metin için genişletildi.</p></div>
        <div class="form-group">
          <label for="discipline-effect">Sistemde uygulanacak işlem</label>
          <select class="field" id="discipline-effect" name="sanction_effect">
            <option value="none" ${item?.sanction_effect === "none" ? "selected" : ""}>Sadece kayıt oluştur</option>
            <option value="points_only" ${item?.sanction_effect === "points_only" ? "selected" : ""}>Sadece puan uygula</option>
            <option value="remove_roles" ${item?.sanction_effect === "remove_roles" ? "selected" : ""}>Yetkilerini al, üye olarak bırak</option>
            <option value="suspend_member" ${item?.sanction_effect === "suspend_member" ? "selected" : ""}>Üyeliği askıya al</option>
            <option value="passive_member" ${item?.sanction_effect === "passive_member" ? "selected" : ""}>Pasif üyeliğe çek</option>
          </select>
          <p class="security-note">Başkan, başkan yardımcısı ve admin için yetki alma işlemi uygulanmaz.</p>
        </div>
        <input type="hidden" name="privacy_level" value="${esc(item?.privacy_level || "restricted")}" />
        <input type="hidden" name="decision_status" value="decided" />
        <div class="modal-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button><button class="btn btn-primary btn-sm" type="submit">Kaydet</button></div>
      </form>
    `
  });
}

function openAwardPoints() {
  if (!canAwardPoints()) return;
  const sourceMembers = (state.cache.members || []).length ? state.cache.members : state.cache.disciplineMembers || [];
  const members = visibleProfiles(sourceMembers);
  modal({
    title: "Puan ver",
    subtitle: "Ödül puanı ceza kararnamesinden ayrı kaydedilir ve üyeye tebrik bildirimi gider.",
    body: `
      <form class="form-stack" data-form="award-points">
        <div class="form-grid">
          <div class="form-group"><label for="award-member">Üye</label><select class="field" id="award-member" name="member_id" required><option value="">Seçin</option>${members.map((member) => `<option value="${esc(member.id)}">${esc(member.display_name)} · ${disciplinePoints(member)} puan</option>`).join("")}</select></div>
          <div class="form-group"><label for="award-points">Verilecek puan</label><input class="field" id="award-points" name="point_delta" type="number" min="1" max="100" step="1" required value="10" /></div>
        </div>
        <div class="form-group"><label for="award-reason">Ödül gerekçesi</label><input class="field" id="award-reason" name="reason" required maxlength="160" placeholder="Örn: örnek davranış, sorumluluk, katkı" /></div>
        <div class="form-group"><label for="award-decree">Ödül karar metni</label><textarea class="field decree-field" id="award-decree" name="decree_text" required maxlength="24000" style="min-height:72vh;line-height:1.65;resize:vertical"></textarea></div>
        <div class="modal-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button><button class="btn btn-primary btn-sm" type="submit">Puanı ver</button></div>
      </form>
    `
  });
}

function openDisciplineDetails(item) {
  if (!item) return;
  modal({
    title: item.archived ? "Silindi olarak işaretlenen disiplin kaydı" : "Disiplin kaydı detayı",
    subtitle: `${esc(item.profiles?.display_name || state.profile.display_name)} için kayıt.`,
    body: `
      <div class="meta-list detail-list">
        <div class="meta-row"><span>İlgili üye</span><strong>${esc(item.profiles?.display_name || state.profile.display_name)}</strong></div>
        <div class="meta-row"><span>Kayıt türü</span><strong>${esc(item.record_type)}</strong></div>
        <div class="meta-row"><span>Sebep</span><strong>${esc(item.reason)}</strong></div>
        <div class="meta-row"><span>Ciddiyet</span><strong>${severityBadge(item.severity)}</strong></div>
        <div class="meta-row"><span>Durum</span><strong>${item.archived ? "Silindi" : statusLabel(item.decision_status)}</strong></div>
        <div class="meta-row"><span>Puan hareketi</span><strong>${pointDeltaBadge(pointDeltaValue(item))} ${esc(pointTrail(item))}</strong></div>
        <div class="meta-row"><span>Sistemde uygulanan işlem</span><strong>${esc(sanctionEffectLabel(item.sanction_effect))}</strong></div>
        <div class="meta-row"><span>Soruşturma</span><strong>${esc(item.investigation?.title || "Bağlı soruşturma yok")}</strong></div>
        <div class="meta-row"><span>İtiraz</span><strong>${esc(statusLabel(appealStatusOf(item)))}</strong></div>
        <div class="meta-row"><span>İtiraz tarihi</span><strong>${formatDate(item.appealed_at, true)}</strong></div>
        <div class="meta-row"><span>Kaydı yazan</span><strong>${esc(item.creator?.display_name || "Yetkili")}</strong></div>
        <div class="meta-row"><span>Tarih</span><strong>${formatDate(item.created_at, true)}</strong></div>
      </div>
      <div class="setup-box"><strong>Açıklama</strong><p class="security-note">${esc(item.description || "Açıklama yok.")}</p></div>
      <div class="setup-box"><strong>Kararname</strong><p class="security-note">${esc(item.decree_text || item.action_taken || "Kararname metni yok.")}</p></div>
      ${item.appeal_text ? `<div class="setup-box"><strong>İtiraz metni</strong><p class="security-note">${esc(item.appeal_text)}</p></div>` : ""}
      ${item.appeal_decision_note ? `<div class="setup-box"><strong>İtiraz kararı</strong><p class="security-note">${esc(item.appeal_decision_note)}</p></div>` : ""}
      ${item.notes ? `<div class="setup-box"><strong>Not</strong><p class="security-note">${esc(item.notes)}</p></div>` : ""}
    `,
    actions: `<div class="modal-actions"><button class="btn btn-primary btn-sm" type="button" data-action="close-modal">Tamam</button></div>`
  });
}

function openDisciplineAppeal(item) {
  if (!canAppealDiscipline(item)) return;
  modal({
    title: "Disiplin kaydına itiraz",
    subtitle: "İtiraz hakkı karar tarihinden sonraki ilk 3 gün içinde kullanılabilir.",
    body: `
      <form class="form-stack" data-form="discipline-appeal" data-id="${esc(item.id)}">
        <div class="setup-box">
          <strong>${esc(item.reason)}</strong>
          <p class="security-note">${esc(item.decree_text || item.action_taken || "Kararname metni yok.")}</p>
        </div>
        <div class="form-group"><label for="discipline-appeal-text">İtiraz gerekçesi</label><textarea class="field" id="discipline-appeal-text" name="appealText" required minlength="10" maxlength="1600"></textarea></div>
        <div class="modal-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button><button class="btn btn-primary btn-sm" type="submit">İtirazı gönder</button></div>
      </form>
    `
  });
}

function openDisciplineAppealReview(item, appealDecision) {
  if (!canReviewDisciplineAppeal(item)) return;
  modal({
    title: appealDecision === "accepted" ? "İtirazı kabul et" : "İtirazı reddet",
    subtitle: appealDecision === "accepted" ? "Kabul edilirse ceza kaydı iptal edilir." : "Reddedilirse aynı cezaya tekrar itiraz açılamaz.",
    body: `
      <form class="form-stack" data-form="discipline-appeal-review" data-id="${esc(item.id)}" data-status="${esc(appealDecision)}">
        <div class="setup-box">
          <strong>${esc(item.reason)}</strong>
          <p class="security-note">${esc(item.appeal_text || "İtiraz metni yok.")}</p>
        </div>
        <div class="form-group"><label for="appeal-decision-note">İtiraz karar notu</label><textarea class="field" id="appeal-decision-note" name="decisionNote" required maxlength="900"></textarea></div>
        <div class="modal-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button><button class="btn btn-primary btn-sm" type="submit">Kararı kaydet</button></div>
      </form>
    `
  });
}

function syncApplicationCommittee(roleSelect) {
  const committeeSelect = document.querySelector("[data-application-committee]");
  const committeeHidden = document.querySelector("[data-application-committee-hidden]");
  if (!roleSelect || !committeeSelect) return;
  const committeeId = committeeIdForRole(roleSelect.value);
  if (committeeId) {
    committeeSelect.value = committeeId;
    if (committeeHidden) committeeHidden.value = committeeId;
  }
}

function openApplication() {
  const committees = (state.cache.committees || []).filter((committee) => committee.status === "active");
  const requestableRoles = ROLE_OPTIONS.filter(
    ([value]) => !["super_admin", "president", "vice_president", "presidential_aide", "discipline_chair", "youth_chair", "credit_officer"].includes(value)
  );
  modal({
    title: "Başvuru yap",
    subtitle: "Kendi adınızla kurul veya rol başvurusu açılır.",
    body: `
      <form class="form-stack" data-form="application">
        <div class="setup-box">
          <strong>${esc(state.profile.display_name)}</strong>
          <p class="security-note">Başvuru sizin profilinize bağlanır; anonim kayıt oluşturulmaz.</p>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label for="application-committee">Başvurulan kurum</label>
            <select class="field" id="application-committee" name="target_committee_id_display" required data-application-committee disabled>
              <option value="">Seçin</option>
              ${committees.map((committee) => `<option value="${esc(committee.id)}">${esc(committee.name)}</option>`).join("")}
            </select>
            <input type="hidden" name="target_committee_id" data-application-committee-hidden />
            <p class="security-note">Rol seçildiğinde kurum otomatik seçilir.</p>
          </div>
          <div class="form-group">
            <label for="application-role">Talep edilen rol</label>
            <select class="field" id="application-role" name="requested_role" data-application-role>
              ${requestableRoles.map(([value, label]) => `<option value="${esc(value)}">${esc(label)} · ${esc(committeeNameForRole(value))}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label for="application-notes">Başvuru notu</label>
          <textarea class="field" id="application-notes" name="notes" maxlength="700" placeholder="Neden bu kurul veya role başvuruyorsunuz?"></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button>
          <button class="btn btn-primary btn-sm" type="submit">Başvuruyu gönder</button>
        </div>
      </form>
    `
  });
  syncApplicationCommittee(document.getElementById("application-role"));
}


function openYouth(item = null) {
  modal({
    title: item ? "Gençlik çalışmasını düzenle" : "Gençlik çalışması ekle",
    subtitle: "Etkinlik veya aktif çalışma kaydı oluşturun.",
    body: `
      <form class="form-stack" data-form="youth" data-id="${esc(item?.id || "")}">
        <div class="form-group"><label for="youth-title">Başlık</label><input class="field" id="youth-title" name="title" value="${esc(item?.title || "")}" required maxlength="120" /></div>
        <div class="form-group"><label for="youth-description">Açıklama</label><textarea class="field" id="youth-description" name="description" required maxlength="800">${esc(item?.description || "")}</textarea></div>
        <div class="form-grid">
          <div class="form-group"><label for="youth-status">Durum</label><select class="field" id="youth-status" name="status">${["planned", "active", "completed", "archived"].map((value) => `<option value="${value}" ${item?.status === value ? "selected" : ""}>${statusLabel(value)}</option>`).join("")}</select></div>
          <div class="form-group"><label for="youth-date">Başlangıç</label><input class="field" id="youth-date" name="starts_at" type="datetime-local" value="${item?.starts_at ? esc(new Date(item.starts_at).toISOString().slice(0, 16)) : ""}" /></div>
        </div>
        <div class="modal-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button><button class="btn btn-primary btn-sm" type="submit">Kaydet</button></div>
      </form>
    `
  });
}

function formData(form) {
  const values = Object.fromEntries(
    [...new FormData(form).entries()].map(([key, value]) => [key, String(value).trim()])
  );
  const roles = new FormData(form).getAll("roles").map((value) => String(value).trim());
  if (roles.length) values.roles = roles;
  const committeeIds = new FormData(form).getAll("committee_ids").map((value) => String(value).trim());
  if (form.querySelector('[name="committee_ids"]')) values.committee_ids = committeeIds;
  return values;
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Lütfen görsel dosyası seçin."));
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      reject(new Error("Profil fotoğrafı 3 MB altında olmalı."));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Fotoğraf okunamadı."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Fotoğraf işlenemedi."));
      image.onload = () => {
        const maxSize = 320;
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

async function handleAvatarUpload(input) {
  const file = input.files?.[0];
  const targetId = input.dataset.avatarTarget;
  if (!file || !targetId) return;
  const hidden = document.getElementById(targetId);
  const dataUrl = await readImageFile(file);
  hidden.value = dataUrl;
  showToast("Profil fotoğrafı hazırlandı. Kaydetmeyi unutmayın.");
}

function readEvidenceFile(file) {
  return new Promise((resolve, reject) => {
    if (file.size > 4 * 1024 * 1024) {
      reject(new Error("Kanıt dosyası 4 MB altında olmalı."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Kanıt dosyası okunamadı."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

async function handleEvidenceUpload(input) {
  const file = input.files?.[0];
  const targetId = input.dataset.evidenceTarget;
  const nameTargetId = input.dataset.evidenceNameTarget;
  if (!file || !targetId) return;
  const hidden = document.getElementById(targetId);
  const nameHidden = nameTargetId ? document.getElementById(nameTargetId) : null;
  hidden.value = await readEvidenceFile(file);
  if (nameHidden) nameHidden.value = file.name;
  showToast("Kanıt dosyası hazırlandı. Formu göndermeyi unutmayın.");
}

async function submitForm(event) {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();
  const values = formData(form);
  const submit = form.querySelector('[type="submit"]') || (form.id ? document.querySelector(`[type="submit"][form="${form.id}"]`) : null);
  if (!submit) return;
  submit.disabled = true;

  try {
    if (form.dataset.form === "login") {
      if (!getConfig().configured) throw new Error("Supabase bağlantısı henüz yapılandırılmadı.");
      await signIn(values.email, values.password);
      state.profile = await getProfile();
      if (!state.profile) {
        await signOut();
        throw new Error("Hesabınız doğrulandı ancak portal profiliniz bulunamadı. Sistem yöneticisine başvurun.");
      }
      setTheme(state.profile.theme_preference || "dark", false);
      showToast("Giriş başarılı.");
      navigate("portal/overview");
      return;
    }

    if (form.dataset.form === "invite-member") {
      const result = await inviteMember(values);
      await loadPage("members");
      showTemporaryPassword(result);
      showToast("Üye oluşturuldu.");
    }

    if (form.dataset.form === "member-edit") {
      const action = form.dataset.mode === "admin" ? "update" : "moderate";
      await manageMember({ action, id: form.dataset.id, ...values });
      showToast(action === "update" ? "Üye bilgileri güncellendi." : "Üye rol ve durumu güncellendi.");
      closeModal();
      await loadPage(route().split("/")[1] || "members");
    }

    if (form.dataset.form === "profile-settings") {
      await updateRecord("profiles", state.profile.id, {
        display_name: values.displayName,
        avatar_initials: values.avatarInitials || null,
        avatar_color: values.avatarColor || "#f3c969",
        avatar_url: values.avatarUrl || null,
        theme_preference: activeTheme()
      });
      state.profile = await getProfile();
      showToast("Profil güncellendi.");
      await loadPage("settings");
    }

    if (form.dataset.form === "change-password") {
      await changePassword(values.oldPassword, values.newPassword);
      showToast("Şifre güncellendi.");
      form.reset();
      state.profile = await getProfile();
      await loadPage("settings");
    }

    if (form.dataset.form === "delete-account") {
      await deleteOwnAccount({
        confirmation: values.confirmation,
        acceptDataLoss: values.acceptDataLoss === "on"
      });
      await signOut();
      state.profile = null;
      state.cache = {};
      closeModal();
      navigate("home");
      showToast("Portal hesabınız ve ilişkili verileriniz kalıcı olarak silindi.");
      return;
    }

    if (form.dataset.form === "announcement") {
      const payload = { ...values, created_by: state.profile.id };
      if (form.dataset.id) {
        await updateRecord("announcements", form.dataset.id, payload);
      } else {
        await createAnnouncement(payload);
      }
      showToast("Duyuru kaydedildi.");
      closeModal();
      await loadPage("announcements");
    }

    if (form.dataset.form === "discipline") {
      const { sanction_effect: sanctionEffect = "none", point_delta: rawPointDelta = "0", ...recordValues } = values;
      const pointDelta = Number(rawPointDelta || 0);
      if (!Number.isInteger(pointDelta) || pointDelta < -100 || pointDelta > 0) {
        throw new Error("Ceza puanı 0 ile -100 arasında olmalıdır.");
      }
      const effectiveSanction =
        sanctionEffect === "none" && pointDelta !== 0
          ? "points_only"
          : sanctionEffect;
      if (effectiveSanction === "reward_points" || pointDelta > 0) throw new Error("Ödül puanı ayrı Puan Ver ekranından verilir.");
      if (!recordValues.decree_text) throw new Error("Kararname metni zorunludur.");
      if (!recordValues.investigation_id) throw new Error("Ceza girmek için önce soruşturma seçilmelidir.");
      const shouldApply = effectiveSanction !== "none" || pointDelta !== 0;
      const payload = {
        ...recordValues,
        investigation_id: recordValues.investigation_id || null,
        decision_status: "decided",
        point_delta: pointDelta,
        sanction_effect: effectiveSanction,
        action_taken: recordValues.decree_text,
        created_by: state.profile.id
      };
      let savedRecord = null;
      if (form.dataset.id) {
        const rows = await updateRecord("discipline_records", form.dataset.id, payload);
        savedRecord = rows?.[0] || { id: form.dataset.id };
      } else {
        const rows = await createDisciplineRecord(payload);
        savedRecord = rows?.[0] || null;
      }
      if (shouldApply) {
        await applyDisciplineSanction({
          disciplineRecordId: savedRecord?.id || form.dataset.id,
          memberId: payload.member_id,
          effect: effectiveSanction,
          pointDelta,
          reason: payload.decree_text || payload.reason || "Disiplin kararnamesi"
        });
      }
      showToast("Disiplin kaydı kaydedildi.");
      closeModal();
      await loadPage("discipline");
    }

    if (form.dataset.form === "award-points") {
      const pointDelta = Number(values.point_delta || 0);
      if (!Number.isInteger(pointDelta) || pointDelta < 1 || pointDelta > 100) {
        throw new Error("Ödül puanı 1 ile 100 arasında olmalıdır.");
      }
      if (!canAwardPoints()) throw new Error("Puan verme yetkiniz yok.");
      await applyDisciplineSanction({
        memberId: values.member_id,
        effect: "reward_points",
        pointDelta,
        reason: values.decree_text || values.reason,
        recordType: "Ödül",
        description: values.reason,
        decreeText: values.decree_text
      });
      showToast("Ödül puanı verildi.");
      closeModal();
      await loadPage("discipline");
    }

    if (form.dataset.form === "discipline-appeal") {
      await disciplineAppeal({
        action: "appeal",
        id: form.dataset.id,
        appealText: values.appealText || ""
      });
      showToast("İtirazınız gönderildi.");
      closeModal();
      await loadPage("discipline");
    }

    if (form.dataset.form === "discipline-appeal-review") {
      await disciplineAppeal({
        action: form.dataset.status === "accepted" ? "accept" : "reject",
        id: form.dataset.id,
        decisionNote: values.decisionNote || ""
      });
      showToast("İtiraz kararı kaydedildi.");
      closeModal();
      await loadPage("discipline");
    }

    if (form.dataset.form === "application") {
      const payload = {
        candidate_label: state.profile.display_name,
        applicant_profile_id: state.profile.id,
        target_committee_id: values.target_committee_id || null,
        suggested_committee_id: values.target_committee_id || null,
        requested_role: values.requested_role || "member",
        notes: values.notes || "",
        status: "new",
        created_by: state.profile.id
      };
      await createApplication(payload);
      showToast("Başvuru kaydedildi.");
      closeModal();
      await loadPage("applications");
    }

    if (form.dataset.form === "application-review") {
      await reviewApplication({
        id: form.dataset.id,
        status: form.dataset.status,
        decisionNote: values.decisionNote || ""
      });
      showToast("Başvuru sonucu kaydedildi.");
      closeModal();
      await loadPage("applications");
    }

    if (form.dataset.form === "complaint") {
      await createComplaint({
        complainant_profile_id: state.profile.id,
        created_by: state.profile.id,
        accused_profile_id: values.accusedProfileId || null,
        subject: values.subject,
        description: values.description,
        evidence_note: values.evidenceNote || "",
        evidence_file: values.evidenceFile || "",
        evidence_filename: values.evidenceFilename || "",
        priority: values.priority || "normal",
        status: "new"
      });
      showToast("Şikayet kaydedildi.");
      closeModal();
      await loadPage("complaints");
    }

    if (form.dataset.form === "complaint-review") {
      await reviewComplaint({
        id: form.dataset.id,
        status: form.dataset.status,
        decisionNote: values.decisionNote || ""
      });
      showToast("Şikayet işlemi kaydedildi.");
      closeModal();
      await loadPage("complaints");
    }

    if (form.dataset.form === "investigation") {
      await manageInvestigation({
        action: "create",
        subjectProfileId: values.subjectProfileId,
        title: values.title,
        description: values.description,
        evidenceNote: values.evidenceNote || "",
        evidenceFile: values.evidenceFile || "",
        evidenceFilename: values.evidenceFilename || ""
      });
      showToast("Soruşturma açıldı.");
      closeModal();
      await loadPage("investigations");
    }

    if (form.dataset.form === "investigation-review") {
      await manageInvestigation({
        action: form.dataset.status,
        id: form.dataset.id,
        decisionNote: values.decisionNote || ""
      });
      showToast("Soruşturma güncellendi.");
      closeModal();
      await loadPage("investigations");
    }

    if (form.dataset.form === "investigation-edit") {
      await manageInvestigation({
        action: "update",
        id: form.dataset.id,
        title: values.title,
        description: values.description,
        evidenceNote: values.evidenceNote || "",
        evidenceFile: values.evidenceFile || "",
        evidenceFilename: values.evidenceFilename || ""
      });
      showToast("Soruşturma düzenlendi.");
      closeModal();
      await loadPage("investigations");
    }

    if (form.dataset.form === "regulation") {
      const payload = {
        title: values.title,
        content: values.content,
        sort_order: Number(values.sortOrder || 1),
        updated_by: state.profile.id
      };
      if (form.dataset.id) {
        await updateRecord("regulations", form.dataset.id, payload);
      } else {
        await createRegulation(payload);
      }
      showToast("Yönetmelik kaydedildi.");
      closeModal();
      await loadPage("regulation");
    }

    if (form.dataset.form === "youth") {
      const payload = {
        ...values,
        starts_at: values.starts_at || null,
        created_by: state.profile.id
      };
      if (form.dataset.id) {
        await updateRecord("youth_activities", form.dataset.id, payload);
      } else {
        await createYouthActivity(payload);
      }
      showToast("Gençlik çalışması kaydedildi.");
      closeModal();
      await loadPage("youth");
    }
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    submit.disabled = false;
  }
}

async function handleClick(event) {
  const pageTarget = event.target.closest("[data-page]");
  if (pageTarget) {
    navigate(`portal/${pageTarget.dataset.page}`);
    return;
  }

  const target = event.target.closest("[data-action]");
  if (!target) return;

  const action = target.dataset.action;
  if (action === "nav-login") navigate("login");
  if (action === "toggle-sidebar") {
    state.sidebarOpen = !state.sidebarOpen;
    render();
  }
  if (action === "close-sidebar") {
    state.sidebarOpen = false;
    render();
  }
  if (action === "toggle-theme") toggleTheme();
  if (action === "open-invite") openInvite();
  if (action === "open-announcement") openAnnouncement();
  if (action === "open-discipline") openDiscipline();
  if (action === "open-award-points") openAwardPoints();
  if (action === "open-application") openApplication();
  if (action === "open-complaint") openComplaint();
  if (action === "open-investigation") openInvestigation();
  if (action === "open-notifications") openNotifications();
  if (action === "open-delete-account") openDeleteAccount();
  if (action === "open-regulation") openRegulation();
  if (action === "open-youth") openYouth();
  if (action === "close-modal") closeModal();
  if (action === "modal-backdrop" && event.target === target) closeModal();
  if (action === "accordion") {
    const content = target.nextElementSibling;
    content.hidden = !content.hidden;
  }
  if (action === "logout") {
    confirmModal("Çıkış yapılsın mı?", "Portal oturumunuz bu tarayıcı sekmesinde kapatılacaktır.", async () => {
      await signOut();
      state.profile = null;
      state.cache = {};
      closeModal();
      navigate("home");
      showToast("Oturum kapatıldı.");
    });
  }
  if (action === "confirm-action" && state.pendingConfirm) {
    const callback = state.pendingConfirm;
    state.pendingConfirm = null;
    try {
      await callback();
    } catch (error) {
      showToast(error.message, "error");
      closeModal();
    }
  }
  if (action === "archive-announcement") {
    const id = target.dataset.id;
    confirmModal("Duyuru arşivlensin mi?", "Duyuru kalıcı olarak silinmez; arşiv durumuna alınır.", async () => {
      await updateRecord("announcements", id, { status: "archived" });
      closeModal();
      showToast("Duyuru arşivlendi.");
      await loadPage("announcements");
    });
  }
  if (action === "edit-member") {
    const member = visibleMembers().find((item) => item.id === target.dataset.id);
    openMemberEditor(member);
  }
  if (action === "delete-member") {
    const member = visibleMembers().find((item) => item.id === target.dataset.id);
    if (!member) return;
    confirmModal("Üye silinsin mi?", `${member.display_name} hesabı ve profil kaydı kaldırılacak.`, async () => {
      await manageMember({ action: "delete", id: member.id });
      closeModal();
      showToast("Üye silindi.");
      await loadPage(route().split("/")[1] || "members");
    });
  }
  if (action === "remove-discipline-role") {
    const member = visibleMembers().find((item) => item.id === target.dataset.id);
    if (!member || !canRemoveDisciplineRole(member)) return;
    confirmModal("Disiplin yetkisi alınsın mı?", `${member.display_name} için hiyerarşiye uygun disiplin kurulu yetkisi kaldırılacak.`, async () => {
      await manageMember({ action: "set_discipline_role", id: member.id, targetRole: "none" });
      closeModal();
      showToast("Disiplin yetkisi güncellendi.");
      await loadPage(route().split("/")[1] || "members");
    });
  }
  if (action === "set-discipline-role") {
    const member = visibleMembers().find((item) => item.id === target.dataset.id);
    const targetRole = target.dataset.role || "none";
    if (!member || !canSetDisciplineRole(member, targetRole)) return;
    const label = targetRole === "none" ? "disiplin rolü kaldırılacak" : `${roleLabel(targetRole)} yapılacak`;
    confirmModal("Disiplin hiyerarşisi güncellensin mi?", `${member.display_name} için ${label}.`, async () => {
      await manageMember({ action: "set_discipline_role", id: member.id, targetRole });
      closeModal();
      showToast("Disiplin hiyerarşisi güncellendi.");
      await loadPage(route().split("/")[1] || "discipline-council");
    });
  }
  if (action === "edit-announcement") {
    const item = (state.cache.announcements || []).find((row) => row.id === target.dataset.id);
    openAnnouncement(item);
  }
  if (action === "delete-announcement") {
    const id = target.dataset.id;
    confirmModal("Duyuru silinsin mi?", "Bu işlem duyuruyu kalıcı olarak kaldırır.", async () => {
      await deleteRecord("announcements", id);
      closeModal();
      showToast("Duyuru silindi.");
      await loadPage("announcements");
    });
  }
  if (action === "edit-discipline") {
    const item = (state.cache.discipline || []).find((row) => row.id === target.dataset.id);
    openDiscipline(item);
  }
  if (action === "view-discipline") {
    const item = (state.cache.discipline || []).find((row) => row.id === target.dataset.id);
    openDisciplineDetails(item);
  }
  if (action === "open-discipline-appeal") {
    const item = (state.cache.discipline || []).find((row) => row.id === target.dataset.id);
    openDisciplineAppeal(item);
  }
  if (action === "review-discipline-appeal") {
    const item = (state.cache.discipline || []).find((row) => row.id === target.dataset.id);
    openDisciplineAppealReview(item, target.dataset.status || "rejected");
  }
  if (action === "delete-discipline") {
    const id = target.dataset.id;
    const permanent = hasRole("super_admin");
    confirmModal(permanent ? "Disiplin kaydı kalıcı silinsin mi?" : "Disiplin kaydı silindi olarak işaretlensin mi?", permanent ? "Bu işlem kaydı kalıcı olarak kaldırır." : "Kayıt kaybolmaz; Silindi etiketiyle arşivlenir.", async () => {
      if (permanent) {
        await deleteRecord("discipline_records", id);
      } else {
        await updateRecord("discipline_records", id, {
          archived: true,
          notes: `Silindi olarak işaretleyen: ${state.profile.display_name} - ${new Date().toLocaleString("tr-TR")}`
        });
      }
      closeModal();
      showToast(permanent ? "Disiplin kaydı silindi." : "Disiplin kaydı silindi olarak işaretlendi.");
      await loadPage("discipline");
    });
  }
  if (action === "edit-regulation") {
    const item = (state.cache.regulation || []).find((row) => row.id === target.dataset.id);
    openRegulation(item);
  }
  if (action === "delete-regulation") {
    const id = target.dataset.id;
    confirmModal("Yönetmelik silinsin mi?", "Bu bölüm kalıcı olarak kaldırılır.", async () => {
      await deleteRecord("regulations", id);
      closeModal();
      showToast("Yönetmelik silindi.");
      await loadPage("regulation");
    });
  }
  if (action === "open-application-review") {
    const item = (state.cache.applications || []).find((row) => row.id === target.dataset.id);
    openApplicationReview(item, target.dataset.status || "reviewing");
  }
  if (action === "claim-application") {
    const item = (state.cache.applications || []).find((row) => row.id === target.dataset.id);
    if (!canClaimApplication(item)) return;
    await reviewApplication({
      id: item.id,
      status: "reviewing",
      claim: true,
      decisionNote: "Başvuru disiplin kurulu başkanı tarafından üstlenildi."
    });
    showToast("Başvuru sorumluluğu alındı.");
    await loadPage("applications");
  }
  if (action === "delete-application") {
    const id = target.dataset.id;
    confirmModal("Başvuru silinsin mi?", "Bu işlem başvuru kaydını kalıcı olarak kaldırır.", async () => {
      await deleteRecord("applications", id);
      closeModal();
      showToast("Başvuru silindi.");
      await loadPage("applications");
    });
  }
  if (action === "open-complaint-review") {
    const item = (state.cache.complaints || []).find((row) => row.id === target.dataset.id);
    openComplaintReview(item, target.dataset.status || "reviewing");
  }
  if (action === "claim-complaint") {
    const item = (state.cache.complaints || []).find((row) => row.id === target.dataset.id);
    if (!canClaimComplaint(item)) return;
    await reviewComplaint({
      id: item.id,
      status: "reviewing",
      claim: true,
      decisionNote: item.assigned_to ? "Şikayet sorumluluğu devralındı." : "Şikayet sorumluluğu alındı."
    });
    showToast(item.assigned_to ? "Şikayet sorumluluğu devralındı." : "Şikayet sorumluluğu alındı.");
    await loadPage("complaints");
  }
  if (action === "delete-complaint") {
    const id = target.dataset.id;
    confirmModal("Şikayet silinsin mi?", "Bu işlem şikayet kaydını kalıcı olarak kaldırır.", async () => {
      await deleteRecord("complaints", id);
      closeModal();
      showToast("Şikayet silindi.");
      await loadPage("complaints");
    });
  }
  if (action === "claim-investigation") {
    const item = (state.cache.investigations || []).find((row) => row.id === target.dataset.id);
    if (!item) return;
    await manageInvestigation({
      action: "claim",
      id: item.id,
      decisionNote: item.assigned_to ? "Soruşturma sorumluluğu devralındı." : "Soruşturma sorumluluğu alındı."
    });
    showToast(item.assigned_to ? "Soruşturma sorumluluğu devralındı." : "Soruşturma sorumluluğu alındı.");
    await loadPage("investigations");
  }
  if (action === "open-investigation-review") {
    const item = (state.cache.investigations || []).find((row) => row.id === target.dataset.id);
    openInvestigationReview(item, target.dataset.status || "closed");
  }
  if (action === "edit-investigation") {
    const item = (state.cache.investigations || []).find((row) => row.id === target.dataset.id);
    openInvestigationEdit(item);
  }
  if (action === "delete-investigation") {
    const item = (state.cache.investigations || []).find((row) => row.id === target.dataset.id);
    if (!item || !hasRole("super_admin")) return;
    confirmModal("Soruşturma silinsin mi?", `${item.title} kaydı kalıcı olarak kaldırılacak.`, async () => {
      await manageInvestigation({ action: "delete", id: item.id });
      closeModal();
      showToast("Soruşturma silindi.");
      await loadPage("investigations");
    });
  }
  if (action === "edit-youth") {
    const item = (state.cache.youth || []).find((row) => row.id === target.dataset.id);
    openYouth(item);
  }
  if (action === "delete-youth") {
    if (!hasRole("super_admin")) return;
    const id = target.dataset.id;
    confirmModal("Gençlik çalışması silinsin mi?", "Bu çalışma kaydı kaldırılacak.", async () => {
      await deleteRecord("youth_activities", id);
      closeModal();
      showToast("Gençlik çalışması silindi.");
      await loadPage("youth");
    });
  }
  if (action === "mark-notification") {
    await updateRecord("notifications", target.dataset.id, { read_at: new Date().toISOString() });
    state.cache.notifications = await loadNotifications().catch(() => []);
    openNotifications();
  }
  if (action === "mark-all-notifications") {
    const unread = (state.cache.notifications || []).filter((item) => !item.read_at);
    await Promise.all(unread.map((item) => updateRecord("notifications", item.id, { read_at: new Date().toISOString() })));
    state.cache.notifications = await loadNotifications().catch(() => []);
    openNotifications();
  }
  if (action === "export-members") exportMembers();
}

function toggleTheme() {
  const currentIndex = THEME_OPTIONS.findIndex(([value]) => value === activeTheme());
  const next = THEME_OPTIONS[(currentIndex + 1) % THEME_OPTIONS.length][0];
  setTheme(next);
  if (state.profile) {
    updateRecord("profiles", state.profile.id, { theme_preference: next }).catch(() => {});
  }
}

function exportMembers() {
  const members = visibleMembers();
  const lines = [
    "IHP Uye Kayitlari",
    `Olusturma: ${new Date().toLocaleString("tr-TR")}`,
    "",
    ...members.map((member, index) =>
      `${index + 1}. ${member.display_name} | ${roleLabels(member)} | ${committeeLabels(member)} | ${statusLabel(member.status)}`
    )
  ];
  const blob = new Blob([buildPdf(lines)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ihp-uye-kayitlari.pdf";
  link.click();
  URL.revokeObjectURL(url);
  showToast("Üye kayıtları PDF olarak indirildi.");
}

function pdfText(value) {
  const map = {
    "ğ": "g",
    "Ğ": "G",
    "ü": "u",
    "Ü": "U",
    "ş": "s",
    "Ş": "S",
    "ı": "i",
    "İ": "I",
    "ö": "o",
    "Ö": "O",
    "ç": "c",
    "Ç": "C"
  };
  return String(value)
    .replace(/[ğĞüÜşŞıİöÖçÇ]/g, (char) => map[char] || char)
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function buildPdf(lines) {
  const pageSize = 42;
  const pages = [];
  for (let index = 0; index < lines.length; index += pageSize) {
    pages.push(lines.slice(index, index + pageSize));
  }

  const objects = [];
  const addObject = (content) => {
    objects.push(content);
    return objects.length;
  };

  const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
  const pagesId = addObject("");
  const pageIds = [];
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  for (const pageLines of pages) {
    const stream = [
      "BT",
      "/F1 11 Tf",
      "46 800 Td",
      ...pageLines.map((line, index) => `${index ? "0 -17 Td " : ""}(${pdfText(line).slice(0, 104)}) Tj`),
      "ET"
    ].join("\n");
    const contentId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }

  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((content, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${content}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}

async function handleFilter(event) {
  const avatarInput = event.target.closest("[data-avatar-upload]");
  if (avatarInput) {
    try {
      await handleAvatarUpload(avatarInput);
    } catch (error) {
      showToast(error.message, "error");
    }
    return;
  }
  const evidenceInput = event.target.closest("[data-evidence-upload]");
  if (evidenceInput) {
    try {
      await handleEvidenceUpload(evidenceInput);
    } catch (error) {
      showToast(error.message, "error");
    }
    return;
  }
  const applicationRoleInput = event.target.closest("[data-application-role]");
  if (applicationRoleInput) {
    syncApplicationCommittee(applicationRoleInput);
    return;
  }
  const themeInput = event.target.closest("[data-theme-select]");
  if (themeInput) {
    setTheme(themeInput.value);
    if (state.profile) {
      await updateRecord("profiles", state.profile.id, { theme_preference: themeInput.value }).catch(() => {});
    }
    return;
  }
  const deleteAccountInput = event.target.closest("[data-account-delete-consent], [data-account-delete-text]");
  if (deleteAccountInput) {
    const form = deleteAccountInput.closest("form");
    const consent = form?.querySelector("[data-account-delete-consent]")?.checked === true;
    const phrase = form?.querySelector("[data-account-delete-text]")?.value.trim();
    const submit = document.querySelector("[data-delete-account-submit]");
    if (submit) submit.disabled = !(consent && phrase === "HESABIMI SİL");
    return;
  }
  const input = event.target.closest("[data-filter]");
  if (!input) return;
  state.filters[input.dataset.filter] = input.value;
  render();
}

async function boot() {
  document.documentElement.dataset.theme = "blue";
  state.config = await loadConfig();
  if (getSession()) {
    try {
      state.profile = await getProfile();
      setTheme(state.profile?.theme_preference || "blue", false);
    } catch {
      await signOut();
      state.profile = null;
    }
  }
  if (!state.profile) setTheme("blue", false);
  state.booting = false;
  await handleRoute();
}

document.addEventListener("click", handleClick);
document.addEventListener("submit", submitForm);
document.addEventListener("input", handleFilter);
document.addEventListener("change", handleFilter);
document.addEventListener("keydown", (event) => {
  if (!modalRoot.innerHTML) return;
  if (event.key === "Escape") {
    closeModal();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = [...modalRoot.querySelectorAll(
    "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])"
  )];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});
window.addEventListener("hashchange", handleRoute);

boot();
