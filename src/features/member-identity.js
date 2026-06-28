const IHP_MEMBER_CREDENTIAL_V2 = true;

const CREDENTIAL_ROLE_ORDER = [
  "president",
  "vice_president",
  "presidential_aide",
  "discipline_chair",
  "discipline_vice_chair",
  "discipline_member",
  "youth_chair",
  "youth_member",
  "chief_representative",
  "representative"
];

const CREDENTIAL_ROLE_META = {
  president: { institution: "presidency", title: "Genel Başkan", authority: 10 },
  vice_president: { institution: "presidency", title: "Genel Başkan Yardımcısı", authority: 9 },
  presidential_aide: { institution: "presidency", title: "Başkan Yaveri", authority: 8 },
  discipline_chair: { institution: "discipline", title: "Disiplin Kurulu Başkanı", authority: 8 },
  discipline_vice_chair: { institution: "discipline", title: "Disiplin Kurulu Başkan Yardımcısı", authority: 7 },
  discipline_member: { institution: "discipline", title: "Disiplin Kurulu Üyesi", authority: 5 },
  youth_chair: { institution: "youth", title: "Gençlik Kolları Başkanı", authority: 7 },
  youth_member: { institution: "youth", title: "Gençlik Kolları Üyesi", authority: 3 },
  chief_representative: { institution: "executive", title: "Baş Temsilci", authority: 6 },
  representative: { institution: "executive", title: "Temsilci", authority: 4 }
};

const CREDENTIAL_INSTITUTIONS = {
  presidency: {
    label: "Genel Başkanlık",
    asset: "/assets/identity/badge-presidency.png"
  },
  discipline: {
    label: "Disiplin Kurulu",
    asset: "/assets/identity/badge-discipline.png"
  },
  youth: {
    label: "Gençlik Kolları",
    asset: "/assets/identity/badge-youth.png"
  },
  executive: {
    label: "Yürütme Kurulu",
    asset: "/assets/identity/badge-executive.png"
  }
};

function credentialRole(profile = state.profile) {
  const roles = visibleRolesOf(profile);
  return CREDENTIAL_ROLE_ORDER.find((role) => roles.includes(role)) || "";
}

function credentialMeta(profile = state.profile) {
  const role = credentialRole(profile);
  return role ? { role, ...CREDENTIAL_ROLE_META[role] } : null;
}

function credentialAccountStatus(profile = state.profile) {
  if (profile?.status === "active") return { label: "Aktif", tone: "active" };
  if (profile?.status === "suspended") return { label: "Askıda", tone: "suspended" };
  return { label: "Kısıtlı", tone: "restricted" };
}

function credentialInitials(profile) {
  return (
    profile?.avatar_initials ||
    String(profile?.display_name || "Üye")
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word[0])
      .join("")
      .slice(0, 4)
  ).toLocaleUpperCase("tr");
}

const CODE39_PATTERNS = {
  "0": "nnnwwnwnn",
  "1": "wnnwnnnnw",
  "2": "nnwwnnnnw",
  "3": "wnwwnnnnn",
  "4": "nnnwwnnnw",
  "5": "wnnwwnnnn",
  "6": "nnwwwnnnn",
  "7": "nnnwnnwnw",
  "8": "wnnwnnwnn",
  "9": "nnwwnnwnn",
  "*": "nwnnwnwnn"
};

function credentialBarcode(value) {
  const code = String(value || "000000").replace(/\D/g, "").slice(0, 12) || "000000";
  const encoded = `*${code}*`;
  const bars = [];
  let cursor = 0;
  for (const character of encoded) {
    const pattern = CODE39_PATTERNS[character] || CODE39_PATTERNS["0"];
    [...pattern].forEach((widthKey, index) => {
      const width = widthKey === "w" ? 3 : 1;
      if (index % 2 === 0) bars.push(`<rect x="${cursor}" y="0" width="${width}" height="38" rx=".25" />`);
      cursor += width;
    });
    cursor += 1;
  }
  return `
    <span class="official-barcode-shell" role="img" aria-label="Üye kimlik barkodu ${esc(code)}">
      <svg class="official-barcode" viewBox="0 0 ${cursor} 38" preserveAspectRatio="none" aria-hidden="true">${bars.join("")}</svg>
      <small>${esc(code)}</small>
    </span>
  `;
}

function officialCredentialCard(profile, meta) {
  const institution = CREDENTIAL_INSTITUTIONS[meta.institution];
  const status = credentialAccountStatus(profile);
  return `
    <article class="official-credential official-credential-${esc(meta.institution)}" data-credential-institution="${esc(meta.institution)}">
      <span class="official-credential-sheen" aria-hidden="true"></span>
      <span class="official-credential-line" aria-hidden="true"></span>
      <header class="official-credential-head">
        <strong>İHP</strong>
        <i aria-hidden="true"></i>
        <span>${esc(institution.label)}</span>
      </header>
      <span class="official-credential-status official-credential-status-${status.tone}">${esc(status.label)}</span>
      <div class="official-credential-emblem">
        <span class="official-credential-emblem-glow" aria-hidden="true"></span>
        <img src="${esc(institution.asset)}" alt="${esc(institution.label)} resmi arması" />
      </div>
      ${credentialBarcode(profile.member_code)}
      <footer class="official-credential-footer">
        <span class="official-credential-rank">${esc(meta.title)}</span>
        <div>
          <strong>${esc(profile.display_name)}</strong>
          <small>#${esc(profile.member_code || "000000")}</small>
        </div>
      </footer>
    </article>
  `;
}

function standardMemberCredential(profile) {
  const status = credentialAccountStatus(profile);
  return `
    <article class="digital-id-card digital-id-front member-standard-card" aria-label="Dijital üye kimliği">
      <span class="identity-glow identity-glow-one" aria-hidden="true"></span>
      <span class="identity-glow identity-glow-two" aria-hidden="true"></span>
      <header class="digital-id-header">
        <div class="digital-id-brand">
          <span class="digital-id-logo"><img src="/assets/identity/party-mark.png" alt="İHP logosu" /></span>
          <span><strong>İHP</strong><small>Dijital Üye Kimliği</small></span>
        </div>
        <span class="identity-status identity-status-${status.tone}"><i></i>${esc(status.label)}</span>
      </header>
      <div class="digital-id-main">
        <div class="identity-portrait" style="--identity-avatar:${esc(profile.avatar_color || "#6ea8ff")}">
          ${avatar(profile)}
          <span class="identity-portrait-ring" aria-hidden="true"></span>
        </div>
        <div class="identity-person">
          <span class="identity-overline">Üye profili</span>
          <h3>${esc(profile.display_name)}</h3>
          <p>${esc(profile.email || "E-posta bilgisi yok")}</p>
          <strong>Üye</strong>
        </div>
      </div>
      <dl class="identity-facts">
        <div><dt>Üye ID</dt><dd>${esc(profile.member_code || "Atanmadı")}</dd></div>
        <div><dt>Katılım</dt><dd>${formatDate(profile.joined_at || profile.created_at)}</dd></div>
        <div><dt>Durum</dt><dd>${esc(status.label)}</dd></div>
      </dl>
      <footer class="digital-id-footer">
        <span>${icon("shield")} Portal tarafından doğrulandı</span>
        <b>${esc(credentialInitials(profile))}</b>
      </footer>
    </article>
  `;
}

function openMemberCredential() {
  const profile = state.profile;
  if (!profile || (typeof isSystemProfile === "function" && isSystemProfile(profile))) return;
  const meta = credentialMeta(profile);
  modal({
    title: meta ? "Görevli Rozeti" : "Dijital Üye Kimliği",
    subtitle: meta ? "Portal hiyerarşisindeki en yüksek makamınız." : "Aktif üyelik kartınız.",
    body: `
      <div class="credential-modal-stage">
        ${meta ? officialCredentialCard(profile, meta) : standardMemberCredential(profile)}
      </div>
    `
  });
  modalRoot.querySelector(".modal")?.classList.add("identity-credential-modal");
}

const memberCredentialBaseHandleClick = handleClick;
handleClick = async function memberCredentialHandleClick(event) {
  const target = event.target.closest("[data-action]");
  if (target?.dataset.action === "open-member-credential") {
    event.preventDefault();
    openMemberCredential();
    return;
  }
  return memberCredentialBaseHandleClick(event);
};
