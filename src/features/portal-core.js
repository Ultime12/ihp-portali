const IHP_ACCESS_FEATURE_PATCH_V2 = true;
const IHP_ACCESS_FEATURE_PATCH_V1 = false;

const ENTRY_ACCOUNT_EMAIL = "giris@tfo.k12.tr";
const OBSOLETE_QUERY_PAGE = "member" + "-query";
const EXECUTIVE_CORE_ROLES = ["president", "vice_president", "presidential_aide"];

function isEntryEmail(email = "") {
  return String(email || "").toLocaleLowerCase("tr") === ENTRY_ACCOUNT_EMAIL;
}

function isSystemProfile(profile) {
  return Boolean(profile?.is_system_account) || isEntryEmail(profile?.email);
}

function isEntryAccessAccount(profile = state.profile) {
  return Boolean(profile?.is_system_account) && isEntryEmail(profile?.email) && profile?.status === "active";
}

function memberCode(profile) {
  return profile?.member_code ? `#${profile.member_code}` : "ID yok";
}

function ensureFeatureStyles() {
  if (document.getElementById("ihp-feature-v2-styles")) return;
  const style = document.createElement("style");
  style.id = "ihp-feature-v2-styles";
  style.textContent = `
    .brand-logo-image { width: 100%; height: 100%; object-fit: cover; border-radius: inherit; display: block; }
    .member-code-pill { display: inline-flex; align-items: center; gap: .35rem; padding: .32rem .58rem; border-radius: 999px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.07); color: var(--text); font-weight: 800; letter-spacing: .06em; }
    .access-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: .85rem; }
    .access-card { display: flex; flex-direction: column; gap: .75rem; padding: 1rem; border-radius: 22px; }
    .access-card-top { display: flex; align-items: center; justify-content: space-between; gap: .75rem; }
    .executive-manager { display: grid; grid-template-columns: minmax(220px, 1fr) auto; gap: .75rem; align-items: end; }
    .report-action-stack { display: flex; gap: .45rem; flex-wrap: wrap; }
    .logo-preview-box { display: flex; align-items: center; gap: .85rem; }
    .logo-preview-mark { width: 70px; height: 70px; border-radius: 22px; display: grid; place-items: center; background: linear-gradient(135deg, #0b1b31, #d71920); color: white; font-weight: 900; overflow: hidden; }
    .logo-preview-mark img { width: 100%; height: 100%; object-fit: cover; }
    .badge-red { background: rgba(239,68,68,.16); border-color: rgba(239,68,68,.32); color: #ff8d8d; box-shadow: 0 0 0 1px rgba(239,68,68,.08), 0 10px 28px rgba(239,68,68,.12); }
    .role-badge-list { display: inline-flex; flex-wrap: wrap; gap: .35rem; align-items: center; }
    .choice-card.role-admin { border-color: rgba(239,68,68,.34); background: rgba(239,68,68,.08); }
    .choice-card.role-admin span { color: #ff9a9a; font-weight: 900; }
  `;
  document.head.append(style);
}

ROLE_LABELS.super_admin = "Admin";
const adminRoleOption = ROLE_OPTIONS.find(([value]) => value === "super_admin");
if (adminRoleOption) adminRoleOption[1] = "Admin";

const baseVisibleProfiles = visibleProfiles;
visibleProfiles = function patchedVisibleProfiles(rows = []) {
  return baseVisibleProfiles(rows).filter((profile) => !isSystemProfile(profile));
};

const baseRoleLabels = roleLabels;
roleLabels = function patchedRoleLabels(profile = state.profile) {
  if (isSystemProfile(profile)) return "Geçiş hesabı";
  return baseRoleLabels(profile);
};

function ihpRoleBadges(profile = state.profile) {
  if (isSystemProfile(profile)) return badge("Geçiş hesabı", "blue");
  const roles = visibleRolesOf(profile);
  if (!roles.length) return badge("Belirtilmedi", "blue");
  return `<span class="role-badge-list">${roles.map((role) => badge(roleLabel(role), role === "super_admin" ? "red" : "blue")).join("")}</span>`;
}

roleCheckboxes = function patchedRoleCheckboxes(selected = ["member"], options = ROLE_OPTIONS) {
  return options.map(
    ([value, label]) => `
      <label class="choice-card ${value === "super_admin" ? "role-admin" : ""}">
        <input type="checkbox" name="roles" value="${esc(value)}" ${selected.includes(value) ? "checked" : ""} />
        <span>${esc(label)}</span>
      </label>
    `
  ).join("");
};

const baseCanModerateMember = canModerateMember;
canModerateMember = function patchedCanModerateMember(member) {
  return !isSystemProfile(member) && baseCanModerateMember(member);
};

const baseCanDisciplineTarget = canDisciplineTarget;
canDisciplineTarget = function patchedCanDisciplineTarget(member) {
  if (isSystemProfile(member)) return false;
  const targetRoles = rolesOf(member);
  if (
    hasRole("discipline_chair") &&
    !targetRoles.includes("super_admin") &&
    targetRoles.some((role) => ["president", "vice_president"].includes(role))
  ) return true;
  return baseCanDisciplineTarget(member);
};

const baseCanInvestigateTarget = canInvestigateTarget;
canInvestigateTarget = function patchedCanInvestigateTarget(member) {
  return !isSystemProfile(member) && baseCanInvestigateTarget(member);
};

const baseSanctionEffectLabel = sanctionEffectLabel;
sanctionEffectLabel = function patchedSanctionEffectLabel(effect = "none") {
  if (effect === "party_suspension") return "Partiden uzaklaştırma";
  return baseSanctionEffectLabel(effect);
};

permissions.access = () => isEntryAccessAccount();
permissions.memberQuery = () => false;

for (let index = navItems.length - 1; index >= 0; index -= 1) {
  if (navItems[index][0] === OBSOLETE_QUERY_PAGE) navItems.splice(index, 1);
}

if (!navItems.some(([id]) => id === "access")) {
  const settingsIndex = navItems.findIndex(([id]) => id === "settings");
  navItems.splice(settingsIndex === -1 ? navItems.length : settingsIndex, 0, ["access", "Geçiş", "check", permissions.access]);
}

const originalNavAllows = new Map(navItems.map(([id, , , allow]) => [id, allow]));
navItems.forEach((item) => {
  const id = item[0];
  const allow = originalNavAllows.get(id) || (() => true);
  item[3] = () => (isEntryAccessAccount() ? id === "access" : id !== "access" && allow());
});

const baseBrand = brand;
brand = function patchedBrand() {
  ensureFeatureStyles();
  const logo = state.cache.settings?.logo_url || "";
  const mark = logo
    ? `<span class="brand-mark"><img class="brand-logo-image" src="${esc(logo)}" alt="İHP" /></span>`
    : `<span class="brand-mark brand-initials">İHP</span>`;
  const href = state.profile ? (isEntryAccessAccount() ? "#/portal/access" : "#/portal/overview") : "#/home";
  return `
    <a class="brand" href="${href}" aria-label="İHP ana sayfa">
      ${mark}
      <span class="brand-copy">
        <strong>İHP Portalı</strong>
        <span>Öğrenci topluluğu</span>
      </span>
    </a>
  `;
};

async function portalServerRequest(path, payload = {}) {
  const token = getSession()?.access_token || "";
  const response = await fetch(path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "İşlem tamamlanamadı.");
  return body;
}

async function portalRestRequest(path, options = {}) {
  const cfg = getConfig();
  const token = getSession()?.access_token || "";
  const response = await fetch(`${cfg.supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: cfg.supabaseAnonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => (options.method === "DELETE" ? null : []));
  if (!response.ok) throw new Error(body?.message || body?.hint || "Veri alınamadı.");
  return body;
}

async function portalRestList(path) {
  return portalRestRequest(path);
}

async function loadAccessCheckinsLocal() {
  return portalRestList(
    "access_checkins?select=id,member_id,requested_by,status,requested_at,expires_at,approved_at,note,member:profiles!access_checkins_member_id_fkey(id,display_name,email,role,roles,status,discipline_points,suspended_until,member_code,avatar_initials,avatar_color,avatar_url,is_system_account),requester:profiles!access_checkins_requested_by_fkey(id,display_name)&order=requested_at.desc&limit=100"
  );
}

async function loadExecutiveExtrasLocal() {
  return portalRestList(
    "executive_committee_members?select=profile_id,added_by,added_at,profile:profiles!executive_committee_members_profile_id_fkey(id,display_name,email,role,roles,status,member_code,avatar_initials,avatar_color,avatar_url,is_system_account)&order=added_at.desc"
  ).catch(() => []);
}

async function loadInvestigationsForReport() {
  return loadInvestigations().catch(() => state.cache.investigations || []);
}

let suspensionRestoreChecked = false;
async function restoreSuspensionsOnce() {
  if (suspensionRestoreChecked || !getSession()) return;
  suspensionRestoreChecked = true;
  const result = await portalServerRequest("/api/restore-suspensions", {}).catch(() => null);
  if (result?.restored) {
    state.profile = await getProfile().catch(() => state.profile);
  }
}

function accessStatusLabel(status = "pending") {
  return (
    {
      pending: "Kod bekleniyor",
      approved: "Onaylandı",
      expired: "Süresi doldu",
      cancelled: "İptal"
    }[status] || status
  );
}

function accessStatusBadge(status = "pending") {
  return badge(
    accessStatusLabel(status),
    {
      pending: "gold",
      approved: "green",
      expired: "gray",
      cancelled: "coral"
    }[status] || "blue"
  );
}

function accessMemberStatus(member) {
  if (member?.status === "suspended" && member.suspended_until) {
    return `${statusLabel(member.status)} · ${formatDate(member.suspended_until, true)} bitiş`;
  }
  return statusLabel(member?.status);
}

function accessPendingRows() {
  return (state.cache.accessCheckins || []).filter((item) => item.status === "pending");
}

function accessPage() {
  const rows = visibleMembers();
  const q = (state.filters.accessSearch || "").toLocaleLowerCase("tr");
  const members = rows.filter(
    (member) =>
      !q ||
      member.display_name.toLocaleLowerCase("tr").includes(q) ||
      String(member.email || "").toLocaleLowerCase("tr").includes(q) ||
      String(member.member_code || "").includes(q)
  );
  const checkins = state.cache.accessCheckins || [];
  const pending = accessPendingRows();

  return `
    ${pageHeader(
      "Geçiş",
      "Kapı kontrol ekranı",
      "Bu ekran sadece özel geçiş hesabına açıktır. Bir üyeye tıklayınca 6 haneli onay kodu yalnızca o üyenin portal bildirim kutusuna gider.",
      `<span class="member-code-pill">${icon("check")} ${esc(ENTRY_ACCOUNT_EMAIL)}</span>`
    )}
    <section class="metrics-grid">
      ${metric("Bekleyen kod", pending.length, "Henüz onaylanmamış geçiş", "inbox")}
      ${metric("Bugün onay", checkins.filter((item) => item.status === "approved" && new Date(item.approved_at || item.requested_at).toDateString() === new Date().toDateString()).length, "Onaylanan geçiş", "check")}
      ${metric("Üye", rows.length, "Geçiş yapılabilecek gerçek üye", "users")}
      ${metric("Süre", "10 dk", "Kod geçerliliği", "lock")}
    </section>
    <div class="toolbar">
      <label class="search-field">
        ${icon("search")}
        <input class="field" type="search" placeholder="Üye adı, e-posta veya ID ara..." aria-label="Geçiş üyesi ara" data-filter="accessSearch" value="${esc(state.filters.accessSearch || "")}" />
      </label>
    </div>
    <section class="access-grid">
      ${
        members.length
          ? members
              .map(
                (member) => `
                  <article class="glass access-card">
                    <div class="access-card-top">
                      <div class="preview-profile">${avatar(member)}<div><strong>${esc(member.display_name)}</strong><span>${esc(member.email || memberCode(member))}</span></div></div>
                      <span class="member-code-pill">${esc(memberCode(member))}</span>
                    </div>
                    <div class="meta-list">
                      <div class="meta-row"><span>Rol</span><strong>${ihpRoleBadges(member)}</strong></div>
                      <div class="meta-row"><span>Durum</span><strong>${esc(accessMemberStatus(member))}</strong></div>
                      <div class="meta-row"><span>Puan</span><strong>${esc(disciplinePoints(member))}</strong></div>
                    </div>
                    <button class="btn btn-primary btn-sm" type="button" data-action="send-access-code" data-id="${esc(member.id)}">${icon("bell")} Bildirime kod gönder</button>
                  </article>
                `
              )
              .join("")
          : emptyCard("Üye bulunamadı", "Arama metnini değiştirin.")
      }
    </section>
    <section class="panel glass" style="margin-top:.85rem">
      <div class="panel-head"><h3>Bekleyen geçişler</h3><span>Kod sadece bildirime gider</span></div>
      <div class="table-shell">
        <table class="data-table">
          <thead><tr><th>Üye</th><th>Durum</th><th>İstek</th><th>Kod gir</th></tr></thead>
          <tbody>
            ${
              checkins.length
                ? checkins
                    .map(
                      (item) => `
                        <tr>
                          <td><span class="cell-main">${esc(item.member?.display_name || "Üye")}</span><span class="cell-sub">${esc(item.member?.member_code ? `#${item.member.member_code}` : "")}</span></td>
                          <td>${accessStatusBadge(item.status)}</td>
                          <td>${formatDate(item.requested_at, true)}</td>
                          <td>
                            ${
                              item.status === "pending"
                                ? `<form class="inline-form" data-form="access-code" data-id="${esc(item.id)}"><input class="field compact-field" name="code" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" placeholder="6 hane" required /><button class="table-action" type="submit">Onayla</button></form>`
                                : `<span class="cell-sub">${formatDate(item.approved_at || item.expires_at, true)}</span>`
                            }
                          </td>
                        </tr>
                      `
                    )
                    .join("")
                : `<tr><td colspan="4">${emptyCard("Geçiş kaydı yok", "Kod gönderildiğinde burada görünecek.")}</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function executiveExtraIds() {
  return new Set((state.cache.executiveExtras || []).map((row) => row.profile_id));
}

function isCoreExecutiveMember(member) {
  return rolesOf(member).some((role) => EXECUTIVE_CORE_ROLES.includes(role));
}

function isExecutiveMember(member) {
  return !isSystemProfile(member) && (isCoreExecutiveMember(member) || executiveExtraIds().has(member.id));
}

function sortedByName(rows) {
  return [...rows].sort((a, b) => a.display_name.localeCompare(b.display_name, "tr"));
}

const baseCommitteeMemberNames = committeeMemberNames;
committeeMemberNames = function patchedCommitteeMemberNames(name) {
  if (!isExecutiveCommittee(name)) return baseCommitteeMemberNames(name);
  const members = sortedByName(visibleMembers().filter(isExecutiveMember));
  return members.length ? members.map((member) => member.display_name).join(", ") : "Henüz üye yok";
};

const baseCommitteeChairLabel = committeeChairLabel;
committeeChairLabel = function patchedCommitteeChairLabel(item) {
  if (isExecutiveCommittee(item.name)) return "Başkanlık tarafından belirlenir";
  return baseCommitteeChairLabel(item);
};

function executiveManagerPanel() {
  if (!hasRole("super_admin", "president")) return "";
  const executiveIds = executiveExtraIds();
  const addable = sortedByName(visibleMembers().filter((member) => !isExecutiveMember(member)));
  const manualRows = (state.cache.executiveExtras || []).filter((row) => row.profile && !isSystemProfile(row.profile));
  return `
    <section class="panel glass" style="margin-bottom:.85rem">
      <div class="panel-head"><h3>Yürütme Kurulu özel üyeleri</h3><span>Başkanın ayrıca seçtiği kişiler</span></div>
      <form class="executive-manager" data-form="executive-member">
        <div class="form-group">
          <label for="executive-member-id">Yürütmeye eklenecek kişi</label>
          <select class="field" id="executive-member-id" name="profileId" ${addable.length ? "" : "disabled"}>
            ${
              addable.length
                ? addable.map((member) => `<option value="${esc(member.id)}">${esc(member.display_name)} · ${esc(memberCode(member))}</option>`).join("")
                : `<option value="">Eklenebilir üye yok</option>`
            }
          </select>
        </div>
        <button class="btn btn-primary btn-sm" type="submit" ${addable.length ? "" : "disabled"}>${icon("userPlus")} Yürütmeye ekle</button>
      </form>
      <div class="hierarchy-list" style="margin-top:.85rem">
        ${
          manualRows.length
            ? manualRows
                .map(
                  (row) => `
                    <article class="hierarchy-card glass">
                      <div class="hierarchy-main">
                        <div class="preview-profile">${avatar(row.profile)}<div><strong>${esc(row.profile.display_name)}</strong><span>${ihpRoleBadges(row.profile)}</span></div></div>
                        <p>Başkanlık tarafından özel yürütme üyesi olarak eklendi.</p>
                      </div>
                      <div class="hierarchy-actions">
                        ${badge("Özel üye", "gold")}
                        <button class="table-action danger-action" type="button" data-action="remove-executive-member" data-id="${esc(row.profile_id)}">Çıkar</button>
                      </div>
                    </article>
                  `
                )
                .join("")
            : `<div class="privacy-strip">${icon("info")}<span>Şu anda başkan tarafından ayrıca eklenmiş yürütme üyesi yok.</span></div>`
        }
      </div>
    </section>
  `;
}

presidencyPage = function patchedPresidencyPage() {
  const rows = sortedByName(visibleMembers()).sort((a, b) => leadershipRank(a) - leadershipRank(b));
  const executiveRows = rows.filter(isExecutiveMember);
  return `
    ${pageHeader(
      "Başkanlık",
      "Yönetim ve rol düzeni",
      "Yürütme Kurulu sadece Başkan, Başkan Yardımcısı, Başkan Yaveri ve başkanın ayrıca eklediği kişilerden oluşur.",
      canManageMembers()
        ? `<button class="btn btn-primary btn-sm" type="button" data-action="open-invite">${icon("userPlus")} Üye Ekle</button>`
        : ""
    )}
    <section class="metrics-grid">
      ${metric("Toplam üye", rows.length, "Sistem hesabı hariç", "users")}
      ${metric("Yürütme", executiveRows.length, "Sıkı yürütme kuralı", "briefcase")}
      ${metric("Özel eklenen", (state.cache.executiveExtras || []).length, "Başkan seçimi", "check")}
      ${metric("Aktif", rows.filter((item) => item.status === "active").length, "Aktif hesap", "check")}
    </section>
    ${executiveManagerPanel()}
    <section class="panel glass" style="margin-bottom:.85rem">
      <div class="panel-head"><h3>Yürütme Kurulu</h3><span>Otomatik + başkan seçimi</span></div>
      <div class="hierarchy-list">
        ${
          executiveRows.length
            ? executiveRows
                .map(
                  (member, index) => `
                    <article class="hierarchy-card glass">
                      <div class="rank-pill">${String(index + 1).padStart(2, "0")}</div>
                      <div class="hierarchy-main">
                        <div class="preview-profile">${avatar(member)}<div><strong>${esc(member.display_name)}</strong><span>${ihpRoleBadges(member)}</span></div></div>
                        <p>${isCoreExecutiveMember(member) ? "Çekirdek başkanlık rolü" : "Başkan tarafından özel eklendi"} · ${esc(memberCode(member))}</p>
                      </div>
                      <div class="hierarchy-actions">
                        ${badgeForStatus(member.status)}
                        ${!isCoreExecutiveMember(member) && hasRole("super_admin", "president") ? `<button class="table-action danger-action" type="button" data-action="remove-executive-member" data-id="${esc(member.id)}">Yürütmeden çıkar</button>` : ""}
                      </div>
                    </article>
                  `
                )
                .join("")
            : emptyCard("Yürütme üyesi yok", "Başkanlık rolleri veya özel seçim eklendiğinde burada görünecek.")
        }
      </div>
    </section>
    <section class="panel glass">
      <div class="panel-head"><h3>Rol yönetimi</h3><span>Başkanlık işlemleri</span></div>
      <div class="hierarchy-list">
        ${
          rows.length
            ? rows
                .map(
                  (member, index) => `
                    <article class="hierarchy-card glass">
                      <div class="rank-pill">${String(index + 1).padStart(2, "0")}</div>
                      <div class="hierarchy-main">
                        <div class="preview-profile">${avatar(member)}<div><strong>${esc(member.display_name)}</strong><span>${ihpRoleBadges(member)}</span></div></div>
                        <p>${esc(memberCode(member))} · ${esc(committeeLabels(member))}</p>
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
    </section>
  `;
};

membersPage = function patchedMembersPage() {
  const rows = visibleMembers();
  const q = (state.filters.memberSearch || "").toLocaleLowerCase("tr");
  const filtered = rows.filter(
    (item) =>
      (!q ||
        item.display_name.toLocaleLowerCase("tr").includes(q) ||
        String(item.member_code || "").includes(q)) &&
      (!state.filters.memberRole || rolesOf(item).includes(state.filters.memberRole)) &&
      (!state.filters.memberStatus || item.status === state.filters.memberStatus)
  );
  const canReport = permissions.disciplineCouncil();

  return `
    ${pageHeader(
      "Üye listesi",
      "Parti kadrosu",
      "Giriş yapan her üye gerçek üyelerin isimlerini ve 6 haneli üye ID bilgisini görebilir. Sistem hesapları bu listede görünmez.",
      `<button class="btn btn-secondary btn-sm" type="button" data-action="export-members">${icon("download")} PDF</button>`
    )}
    ${toolbar("memberSearch", [
      ["memberRole", "Rol", ROLE_OPTIONS],
      ["memberStatus", "Durum", ["active", "passive", "suspended", "left", "pending"].map((id) => [id, statusLabel(id)])]
    ])}
    <div class="table-shell glass">
      <table class="data-table">
        <thead><tr><th>Üye</th><th>Üye ID</th><th>Roller</th><th>Kurul</th><th>Durum</th><th>Katılım</th><th>İşlem</th></tr></thead>
        <tbody>
          ${
            filtered.length
              ? filtered
                  .map(
                    (item) => `
                      <tr>
                        <td><span class="cell-main member-cell">${avatar(item)} ${esc(item.display_name)}</span><span class="cell-sub">${esc(hasRole("super_admin") || item.id === state.profile?.id ? item.email || item.id.slice(0, 8) : "Profil detayı gizli")}</span></td>
                        <td><span class="member-code-pill">${esc(memberCode(item))}</span></td>
                        <td>${ihpRoleBadges(item)}</td>
                        <td>${esc(committeeLabels(item))}</td>
                        <td>${badgeForStatus(item.status)}</td>
                        <td>${formatDate(item.joined_at)}</td>
                        <td>
                          <div class="report-action-stack">
                            ${canReport ? `<button class="table-action" type="button" data-action="export-member-report" data-id="${esc(item.id)}">${icon("download")} Üye Raporu PDF</button>` : ""}
                            ${
                              canEditMembers() || isDisciplineRoleManager()
                                ? `<span class="cell-sub">Yetkili panelden yönetilir</span>`
                                : `<span class="cell-sub">${formatDate(item.updated_at, true)}</span>`
                            }
                          </div>
                        </td>
                      </tr>
                    `
                  )
                  .join("")
              : `<tr><td colspan="7">${emptyCard("Eşleşen kayıt yok", "Arama veya filtre seçimini değiştirin.")}</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
};

const baseSettingsPage = settingsPage;
settingsPage = function patchedSettingsPage() {
  const base = baseSettingsPage();
  const logo = state.cache.settings?.logo_url || "";
  const memberIdPanel = isSystemProfile(state.profile)
    ? ""
    : `<section class="panel glass" style="margin-top:.85rem"><div class="panel-head"><h3>Üye ID</h3><span>Kimlik kodu</span></div><div class="setting-row"><div><strong>${esc(memberCode(state.profile))}</strong><span>Bu kod üyeyi sistem içinde tanımak için kullanılır.</span></div></div></section>`;
  const logoPanel = hasRole("super_admin")
    ? `
      <section class="panel glass" style="margin-top:.85rem">
        <div class="panel-head"><h3>Parti logosu</h3><span>Sadece admin</span></div>
        <form class="form-stack" data-form="portal-logo">
          <div class="logo-preview-box">
            <span class="logo-preview-mark">${logo ? `<img src="${esc(logo)}" alt="İHP logosu" />` : "İHP"}</span>
            <div><strong>Sol üst marka alanı</strong><span class="cell-sub">Logo yüklenirse kare alanda gösterilir; boş bırakılırsa İHP kısaltması görünür.</span></div>
          </div>
          <div class="form-grid">
            <div class="form-group"><label for="portal-logo-file">Logo yükle</label><input class="field" id="portal-logo-file" type="file" accept="image/*" data-avatar-upload data-avatar-target="portal-logo-url" /></div>
            <div class="form-group"><label for="portal-logo-url">Logo verisi</label><input class="field" id="portal-logo-url" name="logoUrl" value="${esc(logo)}" placeholder="Logo seçilince otomatik dolar" /></div>
          </div>
          <div class="modal-actions">
            <button class="btn btn-secondary btn-sm" type="button" data-action="clear-portal-logo">İHP yazısına dön</button>
            <button class="btn btn-primary btn-sm" type="submit">${icon("upload")} Logoyu kaydet</button>
          </div>
        </form>
      </section>
    `
    : "";
  return `${base}${memberIdPanel}${logoPanel}`;
};

const baseRenderPortalPage = renderPortalPage;
renderPortalPage = function patchedRenderPortalPage(page) {
  if (page === "access") return accessPage();
  if (page === OBSOLETE_QUERY_PAGE) return dashboardPage();
  return baseRenderPortalPage(page);
};

const baseRender = render;
render = function patchedRender() {
  const current = route();
  if (state.profile && isEntryAccessAccount() && current.startsWith("portal")) {
    const page = current.split("/")[1] || "overview";
    if (page !== "access") {
      navigate("portal/access");
      return;
    }
  }
  return baseRender();
};

const baseLoadPage = loadPage;
loadPage = async function patchedLoadPage(page) {
  await restoreSuspensionsOnce();
  if (getSession() && !state.cache.settings) {
    state.cache.settings = await loadSettings().catch(() => state.cache.settings || null);
  }

  if (isEntryAccessAccount() && page !== "access") {
    navigate("portal/access");
    return;
  }

  if (page === "access") {
    if (!isEntryAccessAccount()) {
      navigate("portal/overview");
      return;
    }
    state.loading = true;
    render();
    try {
      const [notifications, members, checkins, settings] = await Promise.all([
        loadNotifications().catch(() => state.cache.notifications || []),
        loadMembers(),
        loadAccessCheckinsLocal(),
        loadSettings().catch(() => state.cache.settings || null)
      ]);
      state.cache.notifications = notifications;
      state.cache.members = members;
      state.cache.accessCheckins = checkins;
      state.cache.settings = settings || state.cache.settings;
      maybeCelebrateRewards();
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      state.loading = false;
      render();
    }
    return;
  }

  await baseLoadPage(page);

  if (["presidency", "committees"].includes(page)) {
    state.cache.executiveExtras = await loadExecutiveExtrasLocal();
    render();
  }
};

const baseBadgeCountForNav = badgeCountForNav;
badgeCountForNav = function patchedBadgeCountForNav(id) {
  if (id === "access") {
    const count = accessPendingRows().length;
    return count ? String(count) : "";
  }
  return baseBadgeCountForNav(id);
};

const baseOpenDiscipline = openDiscipline;

function syncDisciplineSuspensionField(effectSelect = document.getElementById("discipline-effect")) {
  const field = document.querySelector("[data-discipline-suspension]");
  const input = document.getElementById("discipline-sanction-days");
  if (!effectSelect || !field || !input) return;
  const visible = effectSelect.value === "party_suspension";
  field.hidden = !visible;
  input.disabled = !visible;
  input.required = visible;
  if (!visible) input.value = "";
}

function chairProtectedPointPenaltySelection() {
  if (!hasRole("discipline_chair")) return false;
  const memberId = document.getElementById("discipline-member")?.value;
  const member = (state.cache.disciplineMembers || []).find((item) => item.id === memberId);
  const memberRoles = rolesOf(member);
  const effect = document.getElementById("discipline-effect")?.value || "none";
  const pointDelta = Number(document.getElementById("discipline-point-delta")?.value || 0);
  return (
    pointDelta < 0 &&
    ["none", "points_only"].includes(effect) &&
    memberRoles.some((role) => ["president", "vice_president"].includes(role)) &&
    !memberRoles.includes("super_admin")
  );
}

function syncDisciplineInvestigationRequirement() {
  const select = document.getElementById("discipline-investigation");
  if (!select) return;
  const optional = chairProtectedPointPenaltySelection();
  select.required = !optional;
  const note = select.closest(".form-group")?.querySelector(".security-note");
  if (note) {
    note.textContent = optional
      ? "DK Başkanı, başkan veya başkan yardımcısına yalnızca puan cezası verirken soruşturma seçmeden kararname yazabilir."
      : "Ceza kararı soruşturma olmadan girilemez. Önce Soruşturmalar bölümünden kayıt açın.";
  }
}

openDiscipline = function patchedOpenDiscipline(item = null) {
  baseOpenDiscipline(item);
  const effect = document.getElementById("discipline-effect");
  if (!effect) return;
  if (!effect.querySelector('option[value="party_suspension"]')) {
    effect.insertAdjacentHTML(
      "beforeend",
      `<option value="party_suspension" ${item?.sanction_effect === "party_suspension" ? "selected" : ""}>Partiden uzaklaştır (süreli)</option>`
    );
  }
  if (!document.getElementById("discipline-sanction-days")) {
    effect.closest(".form-group")?.insertAdjacentHTML(
      "afterend",
      `<div class="form-group" data-discipline-suspension hidden>
        <label for="discipline-sanction-days">Partiden uzaklaştırma süresi (gün)</label>
        <input class="field" id="discipline-sanction-days" name="sanction_days" type="number" min="1" max="365" step="1" value="${esc(item?.sanction_days || "")}" placeholder="Örn: 7" disabled />
        <p class="security-note">Sadece süreli partiden uzaklaştırma seçilirse zorunludur. Süre bitince üyelik otomatik aktif olur.</p>
      </div>`
    );
  }
  syncDisciplineSuspensionField(effect);
  syncDisciplineInvestigationRequirement();
};

const disciplineBaseHandleFilter = handleFilter;
handleFilter = async function patchedDisciplineHandleFilter(event) {
  const effectSelect = event.target.closest("#discipline-effect");
  if (effectSelect) {
    syncDisciplineSuspensionField(effectSelect);
    syncDisciplineInvestigationRequirement();
    return;
  }
  if (event.target.closest("#discipline-member, #discipline-point-delta")) {
    syncDisciplineInvestigationRequirement();
    return;
  }
  return disciplineBaseHandleFilter(event);
};

const baseOpenDisciplineDetails = openDisciplineDetails;
openDisciplineDetails = function patchedOpenDisciplineDetails(item) {
  baseOpenDisciplineDetails(item);
  if (!item?.sanction_days) return;
  const detailList = modalRoot.querySelector(".detail-list");
  detailList?.insertAdjacentHTML(
    "beforeend",
    `<div class="meta-row"><span>Uzaklaştırma süresi</span><strong>${esc(item.sanction_days)} gün · ${formatDate(item.sanction_until, true)}</strong></div>`
  );
};

function pdfAscii(value) {
  const map = {
    "ı": "i",
    "İ": "I",
    "ğ": "g",
    "Ğ": "G",
    "ü": "u",
    "Ü": "U",
    "ş": "s",
    "Ş": "S",
    "ö": "o",
    "Ö": "O",
    "ç": "c",
    "Ç": "C"
  };
  return String(value ?? "")
    .replace(/[ıİğĞüÜşŞöÖçÇ]/g, (char) => map[char] || char)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function hexToRgb(hex, fallback = "#0b1b31") {
  const value = /^#[0-9a-f]{6}$/i.test(hex || "") ? hex : fallback;
  return [parseInt(value.slice(1, 3), 16) / 255, parseInt(value.slice(3, 5), 16) / 255, parseInt(value.slice(5, 7), 16) / 255];
}

function jpegBytes(dataUrl = "") {
  const match = String(dataUrl).match(/^data:image\/jpeg;base64,(.+)$/);
  if (!match) return null;
  const binary = atob(match[1]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function jpegSize(bytes) {
  if (!bytes || bytes.length < 4) return { width: 320, height: 320 };
  let index = 2;
  while (index < bytes.length) {
    if (bytes[index] !== 0xff) break;
    const marker = bytes[index + 1];
    const length = (bytes[index + 2] << 8) + bytes[index + 3];
    if ([0xc0, 0xc1, 0xc2, 0xc3].includes(marker)) {
      return {
        height: (bytes[index + 5] << 8) + bytes[index + 6],
        width: (bytes[index + 7] << 8) + bytes[index + 8]
      };
    }
    index += 2 + length;
  }
  return { width: 320, height: 320 };
}

function createPdfBuilder(title, logoUrl, options = {}) {
  const width = 595;
  const height = 842;
  const margin = 42;
  const pages = [];
  const images = [];
  let page = null;
  let y = 0;
  const logoBytes = jpegBytes(logoUrl);
  const logoName = logoBytes ? addImage(logoBytes) : "";

  function addImage(bytes) {
    const name = `Im${images.length + 1}`;
    images.push({ name, bytes, ...jpegSize(bytes) });
    return name;
  }

  function rgb(hex) {
    return hexToRgb(hex).map((part) => part.toFixed(3)).join(" ");
  }

  function fill(hex) {
    page.ops.push(`${rgb(hex)} rg`);
  }

  function stroke(hex) {
    page.ops.push(`${rgb(hex)} RG`);
  }

  function rect(x, rectY, rectW, rectH, fillColor = null, strokeColor = null) {
    if (fillColor) fill(fillColor);
    if (strokeColor) stroke(strokeColor);
    page.ops.push(`${x} ${rectY} ${rectW} ${rectH} re ${fillColor && strokeColor ? "B" : fillColor ? "f" : "S"}`);
  }

  function text(x, textY, value, size = 10, font = "F1", color = "#0f172a") {
    fill(color);
    page.ops.push(`BT /${font} ${size} Tf ${x} ${textY} Td (${pdfAscii(value)}) Tj ET`);
  }

  function image(name, x, imageY, imageW, imageH) {
    if (!name) return;
    page.ops.push(`q ${imageW} 0 0 ${imageH} ${x} ${imageY} cm /${name} Do Q`);
  }

  function header() {
    rect(0, height - 86, width, 86, "#0b1b31");
    rect(0, height - 91, width, 5, "#d71920");
    if (logoName) {
      image(logoName, margin, height - 72, 42, 42);
    } else {
      rect(margin, height - 72, 42, 42, "#ffffff");
      text(margin + 8, height - 55, "IHP", 13, "F2", "#0b1b31");
    }
    text(margin + 56, height - 48, title, 16, "F2", "#ffffff");
    text(margin + 56, height - 66, options.subtitle || "Disiplin Kurulu resmi raporu", 9, "F1", "#cbd5e1");
    y = height - 118;
  }

  function addPage() {
    page = { ops: [] };
    pages.push(page);
    header();
  }

  function ensureSpace(space) {
    if (y - space < 76) addPage();
  }

  function wrap(value, maxWidth, size = 10) {
    const words = String(value || "Belirtilmedi").split(/\s+/).filter(Boolean);
    const chars = Math.max(14, Math.floor(maxWidth / (size * 0.52)));
    const lines = [];
    let line = "";
    words.forEach((word) => {
      const next = line ? `${line} ${word}` : word;
      if (next.length > chars) {
        if (line) lines.push(line);
        line = word;
      } else {
        line = next;
      }
    });
    if (line) lines.push(line);
    return lines.length ? lines : ["Belirtilmedi"];
  }

  function paragraph(label, value, options = {}) {
    const size = options.size || 9.5;
    const maxWidth = options.width || width - margin * 2;
    const lines = wrap(value, maxWidth, size);
    ensureSpace(24 + lines.length * (size + 4));
    text(margin, y, label, 10, "F2", "#d71920");
    y -= 16;
    lines.forEach((line) => {
      text(margin, y, line, size, "F1", "#1f2937");
      y -= size + 4;
    });
    y -= 8;
  }

  function section(label) {
    ensureSpace(32);
    rect(margin, y - 20, width - margin * 2, 24, "#eef2ff");
    text(margin + 12, y - 12, label, 11, "F2", "#0b1b31");
    y -= 38;
  }

  function keyValueRows(rows) {
    rows.forEach(([key, value], index) => {
      ensureSpace(24);
      const rowY = y - 18;
      rect(margin, rowY, width - margin * 2, 24, index % 2 ? "#ffffff" : "#f8fafc", "#e5e7eb");
      text(margin + 12, rowY + 8, key, 8.5, "F2", "#475569");
      text(margin + 190, rowY + 8, value || "Belirtilmedi", 8.5, "F1", "#111827");
      y -= 24;
    });
    y -= 12;
  }

  function avatarBlock(member) {
    ensureSpace(112);
    const avatarBytes = jpegBytes(member.avatar_url);
    const avatarName = avatarBytes ? addImage(avatarBytes) : "";
    const avatarColor = member.avatar_color || "#334155";
    const boxY = y - 96;
    rect(margin, boxY, width - margin * 2, 104, "#ffffff", "#e5e7eb");
    if (avatarName) {
      image(avatarName, margin + 16, boxY + 16, 72, 72);
    } else {
      rect(margin + 16, boxY + 16, 72, 72, avatarColor);
      text(margin + 30, boxY + 47, member.avatar_initials || initialsFor(member), 22, "F2", "#ffffff");
    }
    text(margin + 106, boxY + 66, member.display_name, 18, "F2", "#0b1b31");
    text(margin + 106, boxY + 46, member.email || "E-posta yok", 9, "F1", "#475569");
    text(margin + 106, boxY + 28, `${memberCode(member)} · ${roleLabels(member)}`, 9, "F1", "#475569");
    y -= 124;
  }

  function finish() {
    pages.forEach((item, index) => {
      page = item;
      rect(0, 0, width, 46, "#f8fafc");
      text(margin, 24, options.footer || "IHP Disiplin Kurulu - gizli ve yetkili kullanim icindir.", 8, "F1", "#64748b");
      text(width - margin - 70, 24, `Sayfa ${index + 1}/${pages.length}`, 8, "F1", "#64748b");
    });
    return buildBinaryPdf(pages, images, width, height);
  }

  addPage();
  return { addImage, avatarBlock, keyValueRows, paragraph, section, finish, text, rect, ensureSpace, get y() { return y; }, set y(value) { y = value; } };
}

function buildBinaryPdf(pages, images, width, height) {
  const encoder = new TextEncoder();
  const objects = [];
  const addObject = (parts) => {
    objects.push(Array.isArray(parts) ? parts : [String(parts)]);
    return objects.length;
  };
  const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
  const pagesId = addObject("");
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const boldId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const imageIds = new Map();
  images.forEach((item) => {
    const objectId = addObject([
      `<< /Type /XObject /Subtype /Image /Width ${item.width} /Height ${item.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${item.bytes.length} >>\nstream\n`,
      item.bytes,
      "\nendstream"
    ]);
    imageIds.set(item.name, objectId);
  });
  const pageIds = [];
  pages.forEach((item) => {
    const stream = item.ops.join("\n");
    const contentId = addObject(`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`);
    const xObjects = [...imageIds.entries()].map(([name, objectId]) => `/${name} ${objectId} 0 R`).join(" ");
    const resources = `<< /Font << /F1 ${fontId} 0 R /F2 ${boldId} 0 R >> ${xObjects ? `/XObject << ${xObjects} >>` : ""} >>`;
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${width} ${height}] /Resources ${resources} /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  });
  objects[pagesId - 1] = [`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`];

  const chunks = [];
  const offsets = [0];
  let byteLength = 0;
  const append = (part) => {
    const chunk = typeof part === "string" ? encoder.encode(part) : part;
    chunks.push(chunk);
    byteLength += chunk.length;
  };
  append("%PDF-1.4\n%IHP\n");
  objects.forEach((parts, index) => {
    offsets.push(byteLength);
    append(`${index + 1} 0 obj\n`);
    parts.forEach(append);
    append("\nendobj\n");
  });
  const xref = byteLength;
  append(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  offsets.slice(1).forEach((offset) => append(`${String(offset).padStart(10, "0")} 00000 n \n`));
  append(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks, { type: "application/pdf" });
}

function initialsFor(member) {
  return (member.avatar_initials || member.display_name || "IHP")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 4)
    .toLocaleUpperCase("tr");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function recordSummaryLine(item) {
  const parts = [
    formatDate(item.created_at, true),
    item.record_type || "kayıt",
    sanctionEffectLabel(item.sanction_effect || "none"),
    pointDeltaValue(item) ? `${pointDeltaValue(item)} puan` : "",
    item.appeal_status ? `itiraz: ${statusLabel(item.appeal_status)}` : ""
  ].filter(Boolean);
  return parts.join(" · ");
}

async function exportMemberReport(memberId) {
  const member = visibleMembers().find((item) => item.id === memberId) || (state.cache.members || []).find((item) => item.id === memberId);
  if (!member || isSystemProfile(member)) throw new Error("Üye bulunamadı.");
  const [records, investigations, settings] = await Promise.all([
    loadDisciplineRecords(),
    loadInvestigationsForReport(),
    loadSettings().catch(() => state.cache.settings || null)
  ]);
  const memberRecords = records.filter((item) => item.member_id === member.id);
  const memberInvestigations = investigations.filter((item) => item.subject_profile_id === member.id);
  const awards = memberRecords.filter((item) => pointDeltaValue(item) > 0 || item.sanction_effect === "reward_points");
  const penalties = memberRecords.filter((item) => !awards.includes(item));
  const builder = createPdfBuilder("IHP Disiplin Kurulu Uye Raporu", settings?.logo_url || state.cache.settings?.logo_url || "");

  builder.avatarBlock(member);
  builder.section("Rapor Bilgileri");
  builder.keyValueRows([
    ["Rapor tarihi", new Date().toLocaleString("tr-TR")],
    ["Raporu olusturan", state.profile?.display_name || "Yetkili"],
    ["Portal", settings?.portal_name || "IHP Portalı"]
  ]);
  builder.section("Uye Bilgileri");
  builder.keyValueRows([
    ["Ad soyad", member.display_name],
    ["E-posta", member.email || "Gizli"],
    ["6 haneli uye ID", member.member_code || "Yok"],
    ["Roller", roleLabels(member)],
    ["Kurullar", committeeLabels(member)],
    ["Uyelik durumu", statusLabel(member.status)],
    ["Katilim tarihi", formatDate(member.joined_at)],
    ["Disiplin puani", String(disciplinePoints(member))],
    ["Aktif uzaklastirma bitisi", member.suspended_until ? formatDate(member.suspended_until, true) : "Yok"]
  ]);

  builder.section("Ozet");
  builder.keyValueRows([
    ["Ceza kaydi", String(penalties.length)],
    ["Odul kaydi", String(awards.length)],
    ["Sorusturma", String(memberInvestigations.length)],
    ["Itirazda / karara baglanan", String(memberRecords.filter((item) => item.appeal_status).length)]
  ]);

  builder.section("Disiplin Cezalari ve Kararnameler");
  if (penalties.length) {
    penalties.forEach((item, index) => {
      builder.paragraph(`${index + 1}. ${recordSummaryLine(item)}`, `${item.reason || "Gerekce belirtilmedi"}\n${item.description || ""}`);
      builder.paragraph("Kararname", item.decree_text || item.action_taken || "Kararname metni yok.");
      if (item.appeal_text || item.appeal_status) {
        builder.paragraph("Itiraz", `${statusLabel(item.appeal_status || "submitted")} · ${item.appeal_text || "Itiraz metni yok."} ${item.appeal_decision_note || ""}`);
      }
    });
  } else {
    builder.paragraph("Kayit", "Bu uye hakkinda disiplin cezasi bulunmuyor.");
  }

  builder.section("Oduller");
  if (awards.length) {
    awards.forEach((item, index) => {
      builder.paragraph(`${index + 1}. ${recordSummaryLine(item)}`, `${item.reason || "Odul"} · ${item.description || ""}`);
    });
  } else {
    builder.paragraph("Kayit", "Bu uye hakkinda odul kaydi bulunmuyor.");
  }

  builder.section("Sorusturmalar");
  if (memberInvestigations.length) {
    memberInvestigations.forEach((item, index) => {
      builder.paragraph(`${index + 1}. ${item.title || "Sorusturma"} · ${statusLabel(item.status)}`, `${item.description || ""}\nKarar notu: ${item.decision_note || "Yok"}`);
    });
  } else {
    builder.paragraph("Kayit", "Bu uye hakkinda sorusturma bulunmuyor.");
  }

  downloadBlob(builder.finish(), `ihp-uye-raporu-${member.member_code || member.display_name}.pdf`);
  showToast("Üye raporu PDF olarak indirildi.");
}

exportMembers = function patchedExportMembers() {
  const members = visibleMembers();
  const builder = createPdfBuilder("IHP Uye Kayitlari", state.cache.settings?.logo_url || "");
  builder.section("Uye Listesi");
  builder.keyValueRows([
    ["Olusturma", new Date().toLocaleString("tr-TR")],
    ["Uye sayisi", String(members.length)]
  ]);
  members.forEach((member, index) => {
    builder.paragraph(
      `${index + 1}. ${member.display_name} · ${memberCode(member)}`,
      `${roleLabels(member)} · ${committeeLabels(member)} · ${statusLabel(member.status)}`
    );
  });
  downloadBlob(builder.finish(), "ihp-uye-kayitlari.pdf");
  showToast("Üye kayıtları PDF olarak indirildi.");
};

const baseSubmitForm = submitForm;
submitForm = async function patchedSubmitForm(event) {
  const form = event.target.closest("form[data-form]");
  if (!form) return;

  if (form.dataset.form === "access-code") {
    event.preventDefault();
    if (!isEntryAccessAccount()) return;
    const values = formData(form);
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      await portalServerRequest("/api/access-checkin", {
        action: "confirm",
        id: form.dataset.id,
        code: values.code
      });
      showToast("Geçiş onaylandı.");
      await loadPage("access");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      if (submit) submit.disabled = false;
    }
    return;
  }

  if (form.dataset.form === "portal-logo") {
    event.preventDefault();
    if (!hasRole("super_admin")) return;
    const values = formData(form);
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const rows = await updateRecord("portal_settings", "main", {
        logo_url: values.logoUrl || null,
        updated_by: state.profile.id
      });
      state.cache.settings = rows?.[0] || (await loadSettings());
      showToast("Portal logosu güncellendi.");
      render();
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      if (submit) submit.disabled = false;
    }
    return;
  }

  if (form.dataset.form === "executive-member") {
    event.preventDefault();
    const values = formData(form);
    if (!values.profileId) return;
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      await portalRestRequest("executive_committee_members", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ profile_id: values.profileId, added_by: state.profile.id })
      });
      state.cache.executiveExtras = await loadExecutiveExtrasLocal();
      showToast("Üye yürütme kuruluna eklendi.");
      render();
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      if (submit) submit.disabled = false;
    }
    return;
  }

  if (form.dataset.form === "discipline") {
    event.preventDefault();
    const values = formData(form);
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const {
        sanction_effect: sanctionEffect = "none",
        point_delta: rawPointDelta = "0",
        sanction_days: rawSanctionDays = "",
        ...recordValues
      } = values;
      const pointDelta = Number(rawPointDelta || 0);
      if (!Number.isInteger(pointDelta) || pointDelta < -100 || pointDelta > 0) {
        throw new Error("Ceza puanı 0 ile -100 arasında olmalıdır.");
      }
      const sanctionDays = rawSanctionDays ? Number(rawSanctionDays) : null;
      const effectiveSanction = sanctionEffect === "none" && pointDelta !== 0 ? "points_only" : sanctionEffect;
      if (effectiveSanction === "party_suspension" && (!Number.isInteger(sanctionDays) || sanctionDays < 1 || sanctionDays > 365)) {
        throw new Error("Partiden uzaklaştırma için 1-365 gün arası süre girin.");
      }
      if (effectiveSanction === "reward_points" || pointDelta > 0) throw new Error("Ödül puanı ayrı Puan Ver ekranından verilir.");
      if (!recordValues.decree_text) throw new Error("Kararname metni zorunludur.");
      const allowWithoutInvestigation = chairProtectedPointPenaltySelection();
      if (!recordValues.investigation_id && !allowWithoutInvestigation) throw new Error("Ceza girmek için önce soruşturma seçilmelidir.");

      const shouldApply = effectiveSanction !== "none" || pointDelta !== 0;
      const payload = {
        ...recordValues,
        investigation_id: recordValues.investigation_id || null,
        decision_status: "decided",
        point_delta: pointDelta,
        sanction_effect: effectiveSanction,
        sanction_days: effectiveSanction === "party_suspension" ? sanctionDays : null,
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
          sanctionDays,
          reason: payload.decree_text || payload.reason || "Disiplin kararnamesi",
          decreeText: payload.decree_text,
          description: payload.description || payload.reason
        });
      }
      showToast("Disiplin kaydı kaydedildi.");
      closeModal();
      await loadPage("discipline");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      if (submit) submit.disabled = false;
    }
    return;
  }

  return baseSubmitForm(event);
};

const baseHandleClick = handleClick;
handleClick = async function patchedHandleClick(event) {
  const target = event.target.closest("[data-action]");
  const action = target?.dataset.action;

  if (action === "send-access-code") {
    event.preventDefault();
    if (!isEntryAccessAccount()) return;
    const member = visibleMembers().find((item) => item.id === target.dataset.id);
    if (!member) return;
    target.disabled = true;
    try {
      await portalServerRequest("/api/access-checkin", {
        action: "request",
        memberId: member.id
      });
      showToast(`${member.display_name} için kod bildirimi gönderildi.`);
      await loadPage("access");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      target.disabled = false;
    }
    return;
  }

  if (action === "remove-executive-member") {
    event.preventDefault();
    if (!hasRole("super_admin", "president")) return;
    const id = target.dataset.id;
    confirmModal("Yürütme üyeliği kaldırılsın mı?", "Bu kişi özel yürütme üyeliğinden çıkarılacak; diğer rolleri değişmez.", async () => {
      await portalRestRequest(`executive_committee_members?profile_id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" }
      });
      state.cache.executiveExtras = await loadExecutiveExtrasLocal();
      closeModal();
      showToast("Yürütme üyeliği kaldırıldı.");
      render();
    });
    return;
  }

  if (action === "export-member-report") {
    event.preventDefault();
    target.disabled = true;
    try {
      await exportMemberReport(target.dataset.id);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      target.disabled = false;
    }
    return;
  }

  if (action === "clear-portal-logo") {
    event.preventDefault();
    const input = document.getElementById("portal-logo-url");
    if (input) input.value = "";
    showToast("Logo alanı temizlendi. Kaydedince İHP yazısına döner.");
    return;
  }

  return baseHandleClick(event);
};
