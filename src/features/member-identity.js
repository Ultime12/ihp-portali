const IHP_MEMBER_IDENTITY_V1 = true;
const MEMBER_IDENTITY_PAGE = "my-info";

const IDENTITY_ROLE_META = {
  super_admin: { authority: 10, institution: "presidency", unit: "Sistem Yönetimi" },
  president: { authority: 10, institution: "presidency", unit: "Yürütme Kurulu" },
  vice_president: { authority: 9, institution: "executive", unit: "Yürütme Kurulu" },
  presidential_aide: { authority: 8, institution: "executive", unit: "Yürütme Kurulu" },
  discipline_chair: { authority: 8, institution: "discipline", unit: "Disiplin Kurulu" },
  discipline_vice_chair: { authority: 7, institution: "discipline", unit: "Disiplin Kurulu" },
  youth_chair: { authority: 7, institution: "youth", unit: "Gençlik Kolları" },
  chief_representative: { authority: 6, institution: "executive", unit: "Temsilcilik" },
  discipline_member: { authority: 5, institution: "discipline", unit: "Disiplin Kurulu" },
  credit_officer: { authority: 4, institution: "party", unit: "Kredi İşleri" },
  representative: { authority: 4, institution: "party", unit: "Temsilcilik" },
  spokesperson: { authority: 3, institution: "party", unit: "Sosyal Medya Başkanlığı" },
  youth_member: { authority: 3, institution: "youth", unit: "Gençlik Kolları" },
  member: { authority: 1, institution: "party", unit: "Genel Üyelik" }
};

const IDENTITY_INSTITUTIONS = {
  presidency: {
    label: "Genel Başkanlık",
    shortLabel: "Başkanlık",
    artClass: "identity-art-presidency",
    tone: "gold"
  },
  executive: {
    label: "Yürütme Kurulu",
    shortLabel: "Yürütme",
    artClass: "identity-art-executive",
    tone: "gold"
  },
  discipline: {
    label: "Disiplin Kurulu",
    shortLabel: "Disiplin",
    artClass: "identity-art-discipline",
    tone: "red"
  },
  youth: {
    label: "Gençlik Kolları",
    shortLabel: "Gençlik",
    artClass: "identity-art-youth",
    tone: "blue"
  },
  party: {
    label: "İstiklal Hürriyet Partisi",
    shortLabel: "İHP",
    artClass: "identity-art-party",
    tone: "blue"
  }
};

function identityPrimaryRole(profile = state.profile) {
  return [...visibleRolesOf(profile)].sort((left, right) => {
    const authorityDifference =
      (IDENTITY_ROLE_META[right]?.authority || 0) - (IDENTITY_ROLE_META[left]?.authority || 0);
    return authorityDifference || leadershipRank({ roles: [left] }) - leadershipRank({ roles: [right] });
  })[0] || "member";
}

function identityPositions(profile = state.profile) {
  return (state.cache.identityPositions || []).filter(
    (position) => position.assigned_profile_id === profile?.id && position.status === "active"
  );
}

function identityAuthority(profile = state.profile) {
  const role = identityPrimaryRole(profile);
  const assignedLevels = identityPositions(profile)
    .map((position) => Number(position.authority_level))
    .filter((level) => Number.isFinite(level));
  const level = Math.max(IDENTITY_ROLE_META[role]?.authority || 1, ...assignedLevels, 1);
  return Math.max(1, Math.min(10, level));
}

function identityCurrentDuty(profile = state.profile) {
  const positions = [...identityPositions(profile)].sort(
    (left, right) => Number(right.authority_level || 0) - Number(left.authority_level || 0)
  );
  return positions[0]?.title || roleLabel(identityPrimaryRole(profile));
}

function identityUnits(profile = state.profile) {
  const names = committeeNames(profile);
  const roleUnit = IDENTITY_ROLE_META[identityPrimaryRole(profile)]?.unit;
  if (roleUnit && roleUnit !== "Genel Üyelik") names.push(roleUnit);
  return [...new Set(names.filter(Boolean))];
}

function identityMemberWithRole(...targetRoles) {
  return (state.cache.identityMembers || []).find(
    (member) => member.id !== state.profile?.id && targetRoles.some((role) => rolesOf(member).includes(role))
  );
}

function identitySupervisor(profile = state.profile) {
  const roles = rolesOf(profile);
  if (roles.includes("super_admin") && !roles.some((role) => PARTY_ROLES.has(role))) {
    return "Bağımsız sistem yetkilisi";
  }
  if (roles.includes("president")) return "Kurumsal en üst makam";

  const supervisorRoleGroups = roles.includes("discipline_vice_chair")
    ? [["discipline_chair"]]
    : roles.includes("discipline_member")
      ? [["discipline_chair"], ["discipline_vice_chair"]]
      : roles.includes("youth_member")
        ? [["youth_chair"]]
        : [["president"], ["vice_president"]];

  for (const targetRoles of supervisorRoleGroups) {
    const supervisor = identityMemberWithRole(...targetRoles);
    if (supervisor) {
      const title = roleLabel(targetRoles[0]);
      return supervisor.display_name === title ? title : `${supervisor.display_name} · ${title}`;
    }
  }

  const linkedCommittee = (state.cache.identityCommittees || []).find(
    (committee) =>
      identityUnits(profile).some((name) => name === committee.name) &&
      committee.profiles?.display_name &&
      committee.profiles.display_name !== profile.display_name
  );
  if (linkedCommittee) return `${linkedCommittee.profiles.display_name} · ${linkedCommittee.name}`;
  return "Başkanlık makamı";
}

function identityAccountStatus(profile = state.profile) {
  if (profile?.status === "active") return { label: "Aktif", tone: "active" };
  if (profile?.status === "suspended") return { label: "Askıda", tone: "suspended" };
  return { label: "Kısıtlı", tone: "restricted" };
}

function identityInstitutionKeys(profile = state.profile) {
  const keys = [];
  const roles = rolesOf(profile);
  const units = identityUnits(profile);
  if (roles.includes("president") || (roles.includes("super_admin") && !roles.some((role) => PARTY_ROLES.has(role)))) {
    keys.push("presidency");
  }
  if (
    roles.some((role) => ["vice_president", "presidential_aide", "chief_representative"].includes(role)) ||
    units.some((name) => ["Yürütme Kurulu", "Yönetim Kurulu"].includes(name))
  ) {
    keys.push("executive");
  }
  if (roles.some((role) => role.startsWith("discipline_")) || units.includes("Disiplin Kurulu")) {
    keys.push("discipline");
  }
  if (roles.some((role) => role.startsWith("youth_")) || units.includes("Gençlik Kolları")) {
    keys.push("youth");
  }
  if (!keys.length || roles.some((role) => ["spokesperson", "credit_officer", "representative", "member"].includes(role))) {
    keys.push("party");
  }
  return [...new Set(keys)];
}

function identityArt(key, modifier = "") {
  const institution = IDENTITY_INSTITUTIONS[key] || IDENTITY_INSTITUTIONS.party;
  return `<span class="identity-art ${institution.artClass} ${modifier}" role="img" aria-label="${esc(institution.label)} arması"></span>`;
}

function identityInstitutionBadge(key) {
  const institution = IDENTITY_INSTITUTIONS[key] || IDENTITY_INSTITUTIONS.party;
  return `
    <article class="identity-office-badge identity-office-badge-${institution.tone}">
      ${identityArt(key, "identity-office-art")}
      <span><small>Kurumsal rozet</small><strong>${esc(institution.shortLabel)}</strong></span>
    </article>
  `;
}

function identityProfilePortrait(profile) {
  return `
    <div class="identity-portrait" style="--identity-avatar:${esc(profile.avatar_color || "#6ea8ff")}">
      ${avatar(profile)}
      <span class="identity-portrait-ring" aria-hidden="true"></span>
    </div>
  `;
}

function memberIdentityPage() {
  const profile = state.profile;
  const status = identityAccountStatus(profile);
  const authority = identityAuthority(profile);
  const primaryRole = identityPrimaryRole(profile);
  const institutions = identityInstitutionKeys(profile);
  const primaryInstitution = institutions[0] || IDENTITY_ROLE_META[primaryRole]?.institution || "party";
  const units = identityUnits(profile);
  const portalLogo = state.cache.identitySettings?.logo_url || state.cache.settings?.logo_url || "";
  const brandMark = portalLogo
    ? `<img src="${esc(portalLogo)}" alt="İHP portal logosu" />`
    : `<img src="/assets/identity/party-mark.png" alt="İstiklal Hürriyet Partisi logosu" />`;

  return `
    <section class="identity-page">
      <header class="identity-page-head">
        <div>
          <span class="eyebrow">Dijital üye kimliği</span>
          <h2>Bilgilerim</h2>
          <p>Görev, kurul ve yetki bilgileriniz portal kayıtlarından otomatik hazırlanır.</p>
        </div>
        <span class="identity-live-status">${icon("check")} Canlı kayıt</span>
      </header>

      <div class="identity-card-deck" data-identity-deck>
        <article class="digital-id-card digital-id-front" data-identity-side="front" aria-label="Dijital üye kimliğinin ön yüzü">
          <span class="identity-glow identity-glow-one" aria-hidden="true"></span>
          <span class="identity-glow identity-glow-two" aria-hidden="true"></span>
          <header class="digital-id-header">
            <div class="digital-id-brand">
              <span class="digital-id-logo">${brandMark}</span>
              <span><strong>İHP</strong><small>Dijital Üye Kimliği</small></span>
            </div>
            <span class="identity-status identity-status-${status.tone}"><i></i>${esc(status.label)}</span>
          </header>

          <div class="digital-id-main">
            ${identityProfilePortrait(profile)}
            <div class="identity-person">
              <span class="identity-overline">Üye profili</span>
              <h3>${esc(profile.display_name)}</h3>
              <p>${esc(profile.email || "E-posta bilgisi yok")}</p>
              <strong>${esc(identityCurrentDuty(profile))}</strong>
            </div>
          </div>

          <dl class="identity-facts">
            <div><dt>Üye ID</dt><dd>${esc(profile.member_code || "Atanmadı")}</dd></div>
            <div><dt>Katılım</dt><dd>${formatDate(profile.joined_at || profile.created_at)}</dd></div>
            <div><dt>Yetki</dt><dd>Seviye ${authority} / 10</dd></div>
          </dl>

          <footer class="digital-id-footer">
            <span>${icon("shield")} Portal tarafından doğrulandı</span>
            <b>İHP · 2026</b>
          </footer>
        </article>

        <article class="digital-id-card digital-id-back" data-identity-side="back" aria-label="Dijital üye kimliğinin arka yüzü">
          <span class="identity-glow identity-glow-three" aria-hidden="true"></span>
          <div class="identity-insignia">
            <span class="identity-insignia-halo" aria-hidden="true"></span>
            ${identityArt(primaryInstitution, "identity-main-art")}
            <small>Bağlı makam</small>
            <strong>${esc(IDENTITY_INSTITUTIONS[primaryInstitution]?.label || "İstiklal Hürriyet Partisi")}</strong>
          </div>

          <div class="identity-command">
            <span class="identity-overline">Kurumsal bağ</span>
            <h3>${esc(identityCurrentDuty(profile))}</h3>
            <div class="identity-command-grid">
              <div><span>Kurul / birim</span><strong>${esc(units.length ? units.join(", ") : "Genel üyelik")}</strong></div>
              <div><span>Amir / bağlı yetkili</span><strong>${esc(identitySupervisor(profile))}</strong></div>
            </div>
            <div class="identity-authority">
              <div><span>Yetki seviyesi</span><strong>${authority}<small>/10</small></strong></div>
              <div class="identity-authority-track" role="meter" aria-label="Yetki seviyesi" aria-valuemin="1" aria-valuemax="10" aria-valuenow="${authority}">
                <i style="--authority-width:${authority * 10}%"></i>
              </div>
            </div>
          </div>

          <footer class="identity-badge-rail">
            ${institutions.map(identityInstitutionBadge).join("")}
          </footer>
        </article>
      </div>

      <div class="identity-mobile-switch">
        <button class="identity-flip-button" type="button" data-action="toggle-identity-card" aria-label="Rozeti göster" aria-pressed="false" title="Rozeti göster">
          ${icon("shield")}
        </button>
        <span data-identity-switch-label>Rozeti göster</span>
      </div>

      <section class="identity-detail-strip glass">
        <div>${icon("briefcase")}<span><small>Mevcut görev</small><strong>${esc(identityCurrentDuty(profile))}</strong></span></div>
        <div>${icon("grid")}<span><small>Bağlı yapı</small><strong>${esc(units.length ? units.join(", ") : "Genel üyelik")}</strong></span></div>
        <div>${icon("users")}<span><small>Bağlı yetkili</small><strong>${esc(identitySupervisor(profile))}</strong></span></div>
      </section>
    </section>
  `;
}

if (!navItems.some(([id]) => id === MEMBER_IDENTITY_PAGE)) {
  const overviewIndex = navItems.findIndex(([id]) => id === "overview");
  navItems.splice(overviewIndex + 1, 0, [MEMBER_IDENTITY_PAGE, "Bilgilerim", "info", () => !isEntryAccessAccount()]);
}

if (typeof premiumNavGroups !== "undefined") {
  premiumNavGroups[0][1].add(MEMBER_IDENTITY_PAGE);
}

const identityBaseRenderPortalPage = renderPortalPage;
renderPortalPage = function identityRenderPortalPage(page) {
  return page === MEMBER_IDENTITY_PAGE ? memberIdentityPage() : identityBaseRenderPortalPage(page);
};

const identityBaseLoadPage = loadPage;
loadPage = async function identityLoadPage(page) {
  if (page !== MEMBER_IDENTITY_PAGE) return identityBaseLoadPage(page);
  state.loading = true;
  state.pageError = null;
  render();
  try {
    await loadNavigationSummary();
    const [positions, members, committees, settings] = await Promise.all([
      loadPositions().catch(() => []),
      loadMembers().catch(() => []),
      loadCommittees().catch(() => []),
      loadSettings().catch(() => null)
    ]);
    state.cache.identityPositions = positions;
    state.cache.identityMembers = visibleProfiles(members);
    state.cache.identityCommittees = committees;
    state.cache.identitySettings = settings;
    if (settings) state.cache.settings = settings;
  } catch (error) {
    state.pageError = {
      page,
      message: error?.message || "Dijital kimlik şu anda hazırlanamadı."
    };
    showToast(state.pageError.message, "error");
  } finally {
    state.loading = false;
    render();
  }
};

const identityMobileQuery = matchMedia("(max-width: 720px)");

function syncIdentityCardAccessibility() {
  const deck = document.querySelector("[data-identity-deck]");
  if (!deck) return;
  const mobile = identityMobileQuery.matches;
  const showingBack = deck.classList.contains("show-back");
  const front = deck.querySelector('[data-identity-side="front"]');
  const back = deck.querySelector('[data-identity-side="back"]');
  const button = document.querySelector('[data-action="toggle-identity-card"]');
  const label = document.querySelector("[data-identity-switch-label]");
  const hideFront = mobile && showingBack;
  const hideBack = mobile && !showingBack;

  if (front) {
    front.setAttribute("aria-hidden", String(hideFront));
    front.inert = hideFront;
  }
  if (back) {
    back.setAttribute("aria-hidden", String(hideBack));
    back.inert = hideBack;
  }
  if (button) {
    const actionLabel = showingBack ? "Kimliği göster" : "Rozeti göster";
    button.setAttribute("aria-label", actionLabel);
    button.setAttribute("title", actionLabel);
    button.setAttribute("aria-pressed", String(showingBack));
    if (label) label.textContent = actionLabel;
  }
}

const identityBaseHandleClick = handleClick;
handleClick = async function identityHandleClick(event) {
  const target = event.target.closest("[data-action]");
  if (target?.dataset.action === "toggle-identity-card") {
    event.preventDefault();
    const deck = document.querySelector("[data-identity-deck]");
    if (!deck) return;
    deck.classList.toggle("show-back");
    syncIdentityCardAccessibility();
    return;
  }
  return identityBaseHandleClick(event);
};

const identityBaseRender = render;
render = function identityRender() {
  identityBaseRender();
  requestAnimationFrame(syncIdentityCardAccessibility);
};

identityMobileQuery.addEventListener?.("change", syncIdentityCardAccessibility);
