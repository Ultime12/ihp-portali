const IHP_ACCESS_LOCK_PATCH_V3 = true;

const ENTRY_ACCOUNT_EMAIL = "giris@tfo.k12.tr";
const REMOVED_QUERY_PAGE = "member" + "-query";

function accessLockIsEntryEmail(email = "") {
  return String(email || "").toLocaleLowerCase("tr") === ENTRY_ACCOUNT_EMAIL;
}

function accessLockIsSystemProfile(profile) {
  return Boolean(profile?.is_system_account) || accessLockIsEntryEmail(profile?.email);
}

function accessLockIsEntryAccount(profile = state.profile) {
  return Boolean(profile?.is_system_account) && accessLockIsEntryEmail(profile?.email) && profile?.status === "active";
}

const accessLockBaseVisibleProfiles = visibleProfiles;
visibleProfiles = function accessLockVisibleProfiles(rows = []) {
  return accessLockBaseVisibleProfiles(rows).filter((profile) => !accessLockIsSystemProfile(profile));
};

permissions.access = () => accessLockIsEntryAccount();
permissions.memberQuery = () => false;

for (let index = navItems.length - 1; index >= 0; index -= 1) {
  if (navItems[index][0] === "access" || navItems[index][0] === REMOVED_QUERY_PAGE) {
    navItems.splice(index, 1);
  }
}

const accessLockSettingsIndex = navItems.findIndex(([id]) => id === "settings");
navItems.splice(
  accessLockSettingsIndex === -1 ? navItems.length : accessLockSettingsIndex,
  0,
  ["access", "Gecis", "check", permissions.access]
);

const accessLockNavAllows = new Map(navItems.map(([id, , , allow]) => [id, allow]));
navItems.forEach((item) => {
  const id = item[0];
  const allow = accessLockNavAllows.get(id) || (() => true);
  item[3] = () => (accessLockIsEntryAccount() ? id === "access" : id !== "access" && allow());
});

function accessLockMemberCode(member) {
  return member?.member_code ? `#${member.member_code}` : "ID yok";
}

async function accessLockServerRequest(path, payload = {}) {
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
  if (!response.ok) throw new Error(body.error || "Islem tamamlanamadi.");
  return body;
}

async function accessLockRestList(path) {
  const cfg = getConfig();
  const token = getSession()?.access_token || "";
  const response = await fetch(`${cfg.supabaseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: cfg.supabaseAnonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });
  const body = await response.json().catch(() => []);
  if (!response.ok) throw new Error(body?.message || body?.hint || "Veri alinamadi.");
  return body;
}

async function accessLockLoadCheckins() {
  return accessLockRestList(
    "access_checkins?select=id,member_id,requested_by,status,requested_at,expires_at,approved_at,note,member:profiles!access_checkins_member_id_fkey(id,display_name,email,role,roles,status,member_code,is_system_account),requester:profiles!access_checkins_requested_by_fkey(id,display_name)&order=requested_at.desc&limit=100"
  );
}

function accessLockStatusLabel(status = "pending") {
  return (
    {
      pending: "Kod bekleniyor",
      approved: "Onaylandi",
      expired: "Suresi doldu",
      cancelled: "Iptal"
    }[status] || status
  );
}

function accessLockStatusBadge(status = "pending") {
  return badge(
    accessLockStatusLabel(status),
    { pending: "gold", approved: "green", expired: "gray", cancelled: "coral" }[status] || "blue"
  );
}

function accessLockPage() {
  const q = (state.filters.accessSearch || "").toLocaleLowerCase("tr");
  const members = visibleMembers().filter(
    (member) =>
      !q ||
      member.display_name.toLocaleLowerCase("tr").includes(q) ||
      String(member.email || "").toLocaleLowerCase("tr").includes(q) ||
      String(member.member_code || "").includes(q)
  );
  const checkins = state.cache.accessCheckins || [];
  const pending = checkins.filter((item) => item.status === "pending");

  return `
    ${pageHeader(
      "Gecis",
      "Sadece gecis gorevlisi",
      "Bu ekran yalnizca giris@tfo.k12.tr hesabina aciktir. Kod hedef uyenin bildirim kutusuna gider; gecis gorevlisi kodu uyeden alip burada girer.",
      `<span class="member-code-pill">${esc(ENTRY_ACCOUNT_EMAIL)}</span>`
    )}
    <section class="metrics-grid">
      ${metric("Bekleyen kod", pending.length, "Onay bekleyen gecis", "inbox")}
      ${metric("Uye", members.length, "Sistem hesabi haric", "users")}
      ${metric("Kod suresi", "10 dk", "Bildirim kodu", "lock")}
    </section>
    <div class="toolbar">
      <label class="search-field">
        ${icon("search")}
        <input class="field" type="search" placeholder="Uye adi, e-posta veya ID ara..." data-filter="accessSearch" value="${esc(state.filters.accessSearch || "")}" />
      </label>
    </div>
    <section class="dashboard-grid">
      <article class="panel glass">
        <div class="panel-head"><h3>Uyeye kod gonder</h3><span>Kod ekranda gosterilmez</span></div>
        <div class="table-shell">
          <table class="data-table">
            <thead><tr><th>Uye</th><th>Uye ID</th><th>Rol</th><th>Islem</th></tr></thead>
            <tbody>
              ${
                members.length
                  ? members
                      .map(
                        (member) => `
                          <tr>
                            <td><span class="cell-main member-cell">${avatar(member)} ${esc(member.display_name)}</span><span class="cell-sub">${esc(member.email || "")}</span></td>
                            <td><span class="member-code-pill">${esc(accessLockMemberCode(member))}</span></td>
                            <td>${esc(roleLabels(member))}</td>
                            <td><button class="table-action" type="button" data-action="send-access-code" data-id="${esc(member.id)}">Bildirime kod gonder</button></td>
                          </tr>
                        `
                      )
                      .join("")
                  : `<tr><td colspan="4">${emptyCard("Uye bulunamadi", "Arama metnini degistirin.")}</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </article>
      <article class="panel glass">
        <div class="panel-head"><h3>Gecis onayi</h3><span>Uyeden alinan kod girilir</span></div>
        <div class="notification-list">
          ${
            checkins.length
              ? checkins
                  .map(
                    (item) => `
                      <article class="notification-card ${item.status === "pending" ? "unread" : ""}">
                        <div>
                          <strong>${esc(item.member?.display_name || "Uye")}</strong>
                          <p>${accessLockStatusLabel(item.status)} - ${formatDate(item.requested_at, true)}</p>
                          <span>${esc(item.member?.member_code ? `#${item.member.member_code}` : "")}</span>
                        </div>
                        ${
                          item.status === "pending"
                            ? `<form class="inline-actions" data-form="access-code" data-id="${esc(item.id)}">
                                <input class="field" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="6 haneli kod" required />
                                <button class="table-action" type="submit">Onayla</button>
                              </form>`
                            : accessLockStatusBadge(item.status)
                        }
                      </article>
                    `
                  )
                  .join("")
              : emptyCard("Gecis kaydi yok", "Kod gonderildiginde burada gorunecek.")
          }
        </div>
      </article>
    </section>
  `;
}

const accessLockBaseRenderPortalPage = renderPortalPage;
renderPortalPage = function accessLockRenderPortalPage(page) {
  if (page === "access") return accessLockIsEntryAccount() ? accessLockPage() : dashboardPage();
  if (page === REMOVED_QUERY_PAGE) return dashboardPage();
  return accessLockBaseRenderPortalPage(page);
};

const accessLockBaseRender = render;
render = function accessLockRender() {
  const current = route();
  if (state.profile && accessLockIsEntryAccount() && current.startsWith("portal")) {
    const page = current.split("/")[1] || "overview";
    if (page !== "access") {
      navigate("portal/access");
      return;
    }
  }
  return accessLockBaseRender();
};

const accessLockBaseLoadPage = loadPage;
loadPage = async function accessLockLoadPage(page) {
  if (accessLockIsEntryAccount() && page !== "access") {
    navigate("portal/access");
    return;
  }
  if (!accessLockIsEntryAccount() && (page === "access" || page === REMOVED_QUERY_PAGE)) {
    navigate("portal/overview");
    return;
  }
  if (page === "access") {
    state.loading = true;
    render();
    try {
      const [notifications, members, checkins] = await Promise.all([
        loadNotifications().catch(() => state.cache.notifications || []),
        loadMembers(),
        accessLockLoadCheckins()
      ]);
      state.cache.notifications = notifications;
      state.cache.members = members;
      state.cache.accessCheckins = checkins;
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      state.loading = false;
      render();
    }
    return;
  }
  return accessLockBaseLoadPage(page);
};

const accessLockBaseSubmitForm = submitForm;
submitForm = async function accessLockSubmitForm(event) {
  const form = event.target.closest("form[data-form]");
  if (form?.dataset.form === "access-code") {
    event.preventDefault();
    if (!accessLockIsEntryAccount()) return;
    const values = formData(form);
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      await accessLockServerRequest("/api/access-checkin", {
        action: "confirm",
        id: form.dataset.id,
        code: values.code
      });
      showToast("Gecis onaylandi.");
      await loadPage("access");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      if (submit) submit.disabled = false;
    }
    return;
  }
  return accessLockBaseSubmitForm(event);
};

const accessLockBaseHandleClick = handleClick;
handleClick = async function accessLockHandleClick(event) {
  const target = event.target.closest("[data-action]");
  if (target?.dataset.action === "send-access-code") {
    event.preventDefault();
    if (!accessLockIsEntryAccount()) return;
    const member = visibleMembers().find((item) => item.id === target.dataset.id);
    if (!member) return;
    target.disabled = true;
    try {
      await accessLockServerRequest("/api/access-checkin", {
        action: "request",
        memberId: member.id
      });
      showToast(`${member.display_name} icin kod bildirimi gonderildi.`);
      await loadPage("access");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      target.disabled = false;
    }
    return;
  }
  return accessLockBaseHandleClick(event);
};
