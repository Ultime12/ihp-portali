const IHP_LOGO_REPORT_PATCH_V1 = true;
const IHP_DISCIPLINE_OPERATIONS_PATCH_V2 = true;

const logoReportDisciplinePages = new Set([
  "discipline-operations",
  "discipline-council",
  "discipline",
  "complaints",
  "investigations"
]);

function logoReportCanDownload() {
  return hasRole("super_admin", "discipline_chair", "discipline_vice_chair", "discipline_member");
}

function logoReportMemberCode(member) {
  return member?.member_code ? `#${member.member_code}` : "ID yok";
}

function logoReportInitials(member) {
  return (
    member?.avatar_initials ||
    String(member?.display_name || "Uye")
      .split(" ")
      .map((word) => word[0])
      .join("")
      .slice(0, 3)
  ).toLocaleUpperCase("tr");
}

function logoReportSafeFileName(value) {
  return String(value || "uye")
    .toLocaleLowerCase("tr")
    .replaceAll("ı", "i")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "uye";
}

function logoReportEnsureStyles() {
  if (document.getElementById("ihp-logo-report-patch-styles")) return;
  const style = document.createElement("style");
  style.id = "ihp-logo-report-patch-styles";
  style.textContent = `
    .brand-logo-image { width: 100%; height: 100%; object-fit: cover; border-radius: inherit; display: block; }
    .member-code-pill { display: inline-flex; align-items: center; gap: .35rem; padding: .32rem .58rem; border-radius: 999px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.07); color: var(--text); font-weight: 800; letter-spacing: .06em; }
    .logo-preview-box { display: flex; align-items: center; gap: .85rem; }
    .logo-preview-mark { width: 74px; height: 74px; border-radius: 22px; display: grid; place-items: center; background: linear-gradient(135deg, #0b1b31, #d71920); color: white; font-weight: 900; overflow: hidden; box-shadow: inset 0 0 0 1px rgba(255,255,255,.2); }
    .logo-preview-mark img { width: 100%; height: 100%; object-fit: cover; }
    .report-action-stack { display: flex; gap: .45rem; flex-wrap: wrap; align-items: center; }
    .app-nav .nav-divider { height: 1px; margin: .8rem .55rem .7rem; background: linear-gradient(90deg, transparent, rgba(255,255,255,.2), transparent); }
    .discipline-operations-grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(280px, .8fr); gap: .85rem; align-items: start; }
    .discipline-report-hero { padding: 1rem; border-radius: 1.25rem; border: 1px solid rgba(255,255,255,.12); background: linear-gradient(135deg, rgba(87,143,255,.18), rgba(215,25,32,.12)); }
    .discipline-report-hero strong { display: block; font-size: 1.1rem; margin-bottom: .35rem; }
    .discipline-report-hero p { margin: 0; color: var(--muted); line-height: 1.55; }
    .discipline-report-tools { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .65rem; margin-top: .85rem; }
    .discipline-report-tools .quick-card { min-height: 88px; }
    .report-member-row { display: flex; align-items: center; gap: .75rem; min-width: 220px; }
    .report-member-row .avatar { flex: 0 0 auto; }
    .report-status-stack { display: flex; gap: .35rem; flex-wrap: wrap; align-items: center; }
    .report-empty-note { padding: 1rem; border-radius: 1rem; border: 1px dashed rgba(255,255,255,.16); color: var(--muted); }
    @media (max-width: 980px) {
      .discipline-operations-grid { grid-template-columns: 1fr; }
      .discipline-report-tools { grid-template-columns: 1fr; }
    }
  `;
  document.head.append(style);
}

const logoReportBaseBrand = brand;
brand = function patchedLogoReportBrand() {
  logoReportEnsureStyles();
  const logo = state.cache.settings?.logo_url || "";
  const mark = logo
    ? `<span class="brand-mark"><img class="brand-logo-image" src="${esc(logo)}" alt="IHP" /></span>`
    : `<span class="brand-mark brand-initials">İHP</span>`;
  const href = state.profile ? "#/portal/overview" : "#/home";
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

if (!navItems.some(([id]) => id === "discipline-operations")) {
  const disciplineIndex = navItems.findIndex(([id]) => id === "discipline-council");
  navItems.splice(
    disciplineIndex === -1 ? navItems.length : disciplineIndex,
    0,
    ["discipline-operations", "Disiplin İşlemleri", "clipboard", permissions.disciplineCouncil]
  );
}

function logoReportNavButton([id, label, iconName], page) {
  const count = badgeCountForNav(id);
  return `
    <button class="nav-item ${page === id ? "active" : ""}" type="button" data-page="${id}">
      <span>${icon(iconName)} ${esc(label)}</span>
      ${count ? `<b class="nav-badge">${esc(count)}</b>` : ""}
    </button>
  `;
}

const logoReportBaseNavSection = navSection;
navSection = function patchedLogoReportNavSection(page) {
  logoReportEnsureStyles();
  const allowed = navItems.filter(([, , , allow]) => allow());
  const portalItems = allowed.filter(([id]) => !logoReportDisciplinePages.has(id));
  const disciplineItems = allowed.filter(([id]) => logoReportDisciplinePages.has(id));
  return `
    ${portalItems.map((item) => logoReportNavButton(item, page)).join("")}
    ${
      disciplineItems.length
        ? `<div class="nav-divider" aria-hidden="true"></div><p class="nav-section-label">Disiplin İşlemleri</p>${disciplineItems.map((item) => logoReportNavButton(item, page)).join("")}`
        : ""
    }
  `;
};

const logoReportBaseMembersPage = membersPage;
membersPage = function patchedLogoReportMembersPage() {
  const rows = visibleMembers();
  const q = (state.filters.memberSearch || "").toLocaleLowerCase("tr");
  const filtered = rows.filter(
    (item) =>
      (!q ||
        item.display_name.toLocaleLowerCase("tr").includes(q) ||
        String(item.email || "").toLocaleLowerCase("tr").includes(q) ||
        String(item.member_code || "").includes(q)) &&
      (!state.filters.memberRole || rolesOf(item).includes(state.filters.memberRole)) &&
      (!state.filters.memberStatus || item.status === state.filters.memberStatus)
  );

  return `
    ${pageHeader(
      "Üye listesi",
      "Parti kadrosu",
      "Giriş yapan her üye gerçek üyelerin isimlerini ve 6 haneli üye ID bilgisini görebilir. Disiplin raporları ayrı olarak Disiplin İşlemleri ekranından alınır.",
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
                        <td><span class="member-code-pill">${esc(logoReportMemberCode(item))}</span></td>
                        <td>${esc(roleLabels(item))}</td>
                        <td>${esc(committeeLabels(item))}</td>
                        <td>${badgeForStatus(item.status)}</td>
                        <td>${formatDate(item.joined_at || item.created_at)}</td>
                        <td>${canEditMembers() || isDisciplineRoleManager() ? `<span class="cell-sub">Yetkili panelden yönetilir</span>` : `<span class="cell-sub">${formatDate(item.updated_at, true)}</span>`}</td>
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

function logoReportMemberSummary(member) {
  const records = state.cache.discipline || [];
  const investigations = state.cache.investigations || [];
  const memberRecords = records.filter((item) => item.member_id === member.id);
  const awards = memberRecords.filter((item) => Number(item.point_delta || 0) > 0 || item.sanction_effect === "reward_points");
  const sanctions = memberRecords.filter((item) => !awards.includes(item));
  const memberInvestigations = investigations.filter((item) => item.subject_profile_id === member.id || item.subject?.id === member.id);
  return { sanctions, awards, investigations: memberInvestigations };
}

function disciplineOperationsPage() {
  logoReportEnsureStyles();
  if (!logoReportCanDownload()) {
    return `
      ${pageHeader("Disiplin İşlemleri", "Yetki gerekli", "Bu alan yalnızca disiplin kurulu yetkilileri ve süper admin tarafından görülebilir.")}
      ${emptyCard("Erişim yok", "Üye raporu alma yetkiniz bulunmuyor.")}
    `;
  }

  const members = visibleMembers();
  const query = (state.filters.disciplineReportSearch || "").toLocaleLowerCase("tr");
  const filtered = members.filter(
    (member) =>
      !query ||
      member.display_name.toLocaleLowerCase("tr").includes(query) ||
      String(member.email || "").toLocaleLowerCase("tr").includes(query) ||
      String(member.member_code || "").includes(query)
  );
  const records = state.cache.discipline || [];
  const investigations = state.cache.investigations || [];
  const activeInvestigations = investigations.filter((item) => ["open", "reviewing"].includes(item.status)).length;
  const reportRows = filtered
    .map((member) => ({ member, summary: logoReportMemberSummary(member) }))
    .sort((a, b) => a.member.display_name.localeCompare(b.member.display_name, "tr"));

  return `
    ${pageHeader(
      "Disiplin İşlemleri",
      "Üye Raporu Al",
      "Disiplin raporları üyeler listesinden ayrıldı. Buradan üye seçip resmi DK raporu oluşturabilirsiniz.",
      `<button class="btn btn-secondary btn-sm" type="button" data-page="discipline">${icon("shield")} Disiplin kayıtları</button><button class="btn btn-secondary btn-sm" type="button" data-page="investigations">${icon("search")} Soruşturmalar</button>`
    )}
    <div class="dashboard-grid">
      ${metric("Raporlanabilir üye", members.length, "Sistem hesapları hariç gerçek üyeler", "users")}
      ${metric("Disiplin kaydı", records.length, "Ceza ve ödül kayıtları", "shield")}
      ${metric("Açık soruşturma", activeInvestigations, "Devam eden soruşturmalar", "search")}
      ${metric("Rapor yetkisi", "DK", "Raporlar bu bölümden alınır", "download")}
    </div>
    <div class="discipline-operations-grid">
      <section class="panel glass">
        <div class="panel-head"><h3>Üye Raporu Al</h3><span>Disiplin raporu merkezi</span></div>
        <div class="form-group">
          <label for="discipline-report-search">Üye ara</label>
          <input class="field" id="discipline-report-search" type="search" placeholder="Ad, e-posta veya 6 haneli üye ID..." data-filter="disciplineReportSearch" value="${esc(state.filters.disciplineReportSearch || "")}" />
        </div>
        <div class="table-shell">
          <table class="data-table">
            <thead><tr><th>Üye</th><th>Özet</th><th>Durum</th><th>Rapor</th></tr></thead>
            <tbody>
              ${
                reportRows.length
                  ? reportRows
                      .map(
                        ({ member, summary }) => `
                          <tr>
                            <td>
                              <div class="report-member-row">
                                ${avatar(member)}
                                <div>
                                  <strong>${esc(member.display_name)}</strong>
                                  <span class="cell-sub">${esc(logoReportMemberCode(member))} · ${esc(member.email || "E-posta yok")}</span>
                                </div>
                              </div>
                            </td>
                            <td>
                              <div class="report-status-stack">
                                ${badge(`${summary.sanctions.length} ceza`, summary.sanctions.length ? "coral" : "green")}
                                ${badge(`${summary.awards.length} ödül`, summary.awards.length ? "green" : "gray")}
                                ${badge(`${summary.investigations.length} soruşturma`, summary.investigations.length ? "blue" : "gray")}
                              </div>
                            </td>
                            <td>
                              ${badgeForStatus(member.status)}
                              <span class="cell-sub">Puan: ${esc(disciplinePoints(member))}</span>
                            </td>
                            <td><button class="table-action" type="button" data-action="export-member-report" data-id="${esc(member.id)}">${icon("download")} Üye Raporu Al</button></td>
                          </tr>
                        `
                      )
                      .join("")
                  : `<tr><td colspan="4">${emptyCard("Üye bulunamadı", "Arama bilgisini değiştirip tekrar deneyin.")}</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </section>
      <aside class="discipline-report-hero">
        <strong>Raporlar burada tutulur</strong>
        <p>Üyeler sayfası artık sadece kadro görünümü. Disiplin Kurulu raporu, ceza-ödül-soruşturma bilgileriyle birlikte bu ekrandan hazırlanır.</p>
        <div class="discipline-report-tools">
          <button class="quick-card" type="button" data-page="discipline-council">${icon("shield")}<strong>DK Hiyerarşi</strong></button>
          <button class="quick-card" type="button" data-page="complaints">${icon("clipboard")}<strong>Şikayetler</strong></button>
          <button class="quick-card" type="button" data-page="discipline">${icon("shield")}<strong>Kayıtlar</strong></button>
          <button class="quick-card" type="button" data-page="investigations">${icon("search")}<strong>Soruşturmalar</strong></button>
        </div>
      </aside>
    </div>
  `;
}

const logoReportBaseRenderPortalPage = renderPortalPage;
renderPortalPage = function patchedLogoReportRenderPortalPage(page) {
  if (page === "discipline-operations") return disciplineOperationsPage();
  return logoReportBaseRenderPortalPage(page);
};

const logoReportBaseSettingsPage = settingsPage;
settingsPage = function patchedLogoReportSettingsPage() {
  logoReportEnsureStyles();
  const base = logoReportBaseSettingsPage();
  if (!hasRole("super_admin")) return base;
  const logo = state.cache.settings?.logo_url || "";
  return `
    ${base}
    <section class="panel glass" style="margin-top:.85rem">
      <div class="panel-head"><h3>Parti logosu</h3><span>Sadece süper admin</span></div>
      <form class="form-stack" data-form="portal-logo">
        <div class="logo-preview-box">
          <span class="logo-preview-mark">${logo ? `<img src="${esc(logo)}" alt="İHP logosu" />` : "İHP"}</span>
          <div><strong>Sol üst marka alanı</strong><span class="cell-sub">Logo yüklenirse portalın sol üst kutusunda gösterilir. Boş bırakılırsa İHP kısaltması kalır.</span></div>
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
  `;
};

function logoReportPlainText(value = "") {
  if (typeof pdfText === "function") return pdfText(value);
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)")
    .replace(/[^\x20-\x7E]/g, "");
}

function logoReportWrap(value, max = 78) {
  const words = String(value || "Yok").replace(/\s+/g, " ").trim().split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    if (`${current} ${word}`.trim().length > max) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : ["Yok"];
}

function logoReportPdfDownload(pdf, filename) {
  const blob = new Blob([pdf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function logoReportProfessionalPdf({ member, sanctions, awards, investigations, createdBy }) {
  const pages = [];
  let commands = [];
  let pageNo = 0;
  let y = 742;

  const color = (hex, stroke = false) => {
    const clean = String(hex || "#000000").replace("#", "");
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    commands.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} ${stroke ? "RG" : "rg"}`);
  };
  const rect = (x, yy, w, h, fill = false) => commands.push(`${x} ${yy} ${w} ${h} re ${fill ? "f" : "S"}`);
  const line = (x1, y1, x2, y2) => commands.push(`${x1} ${y1} m ${x2} ${y2} l S`);
  const text = (x, yy, value, size = 10, font = "F1") => {
    commands.push(`BT /${font} ${size} Tf ${x} ${yy} Td (${logoReportPlainText(value)}) Tj ET`);
  };
  const finishPage = () => {
    color("#9aa7bd");
    line(44, 54, 551, 54);
    text(44, 36, "IHP Disiplin Kurulu Uye Raporu", 8, "F1");
    text(510, 36, `Sayfa ${pageNo}`, 8, "F2");
    pages.push(commands);
  };
  const newPage = () => {
    if (commands.length) finishPage();
    pageNo += 1;
    commands = [];
    color("#071426");
    rect(0, 778, 595, 64, true);
    color("#d71920");
    rect(0, 778, 595, 4, true);
    color("#ffffff");
    text(44, 806, "IHP DISIPLIN KURULU", 10, "F2");
    text(44, 787, "UYE RAPORU", 18, "F2");
    text(432, 806, new Date().toLocaleDateString("tr-TR"), 9, "F1");
    y = 742;
  };
  const ensure = (height = 40) => {
    if (y - height < 72) newPage();
  };
  const section = (title) => {
    ensure(34);
    color("#d71920");
    rect(44, y - 4, 4, 18, true);
    color("#071426");
    text(56, y, title, 12, "F2");
    color("#d8dee9", true);
    line(44, y - 9, 551, y - 9);
    y -= 32;
  };
  const kv = (label, value, x, width = 238) => {
    color("#6b7280");
    text(x, y, label, 8, "F2");
    color("#111827");
    logoReportWrap(value, width > 230 ? 42 : 30).slice(0, 2).forEach((lineText, index) => {
      text(x, y - 14 - index * 12, lineText, 10, "F1");
    });
  };
  const twoColumns = (rows) => {
    rows.forEach(([leftLabel, leftValue, rightLabel, rightValue]) => {
      ensure(46);
      kv(leftLabel, leftValue, 52);
      kv(rightLabel, rightValue, 315);
      y -= 48;
    });
  };
  const paragraph = (value, max = 92) => {
    const lines = logoReportWrap(value, max);
    for (const lineText of lines) {
      ensure(16);
      color("#111827");
      text(52, y, lineText, 9, "F1");
      y -= 14;
    }
  };
  const card = (title, meta, bodyLines = []) => {
    const lines = bodyLines.flatMap((item) => logoReportWrap(item, 88));
    const height = Math.max(64, 44 + lines.length * 13);
    ensure(height + 8);
    color("#eef2f7");
    rect(44, y - height + 16, 507, height, true);
    color("#c7d2e5", true);
    rect(44, y - height + 16, 507, height, false);
    color("#071426");
    text(58, y, title, 11, "F2");
    color("#4b5563");
    text(58, y - 15, meta, 8, "F1");
    let yy = y - 34;
    for (const lineText of lines) {
      color("#111827");
      text(58, yy, lineText, 9, "F1");
      yy -= 13;
    }
    y -= height + 8;
  };

  newPage();

  const code = logoReportMemberCode(member);
  const initials = logoReportInitials(member);
  const avatarColor = /^#[0-9A-Fa-f]{6}$/.test(member.avatar_color || "") ? member.avatar_color : "#24385f";
  color(avatarColor);
  rect(44, 666, 94, 94, true);
  color("#ffffff");
  text(66, 704, initials, initials.length > 2 ? 26 : 32, "F2");
  color("#071426");
  text(160, 724, member.display_name || "Uye", 18, "F2");
  color("#4b5563");
  text(160, 704, `${code} · ${member.email || "E-posta yok"}`, 10, "F1");
  text(160, 686, `Raporu olusturan: ${createdBy}`, 10, "F1");
  text(160, 668, `Rapor tarihi: ${new Date().toLocaleString("tr-TR")}`, 10, "F1");
  y = 636;

  section("Kimlik ve Profil Bilgileri");
  twoColumns([
    ["Ad soyad", member.display_name || "Belirtilmedi", "6 haneli uye ID", code],
    ["E-posta", member.email || "Gizli / yok", "Uyelik durumu", statusLabel(member.status)],
    ["Katilim tarihi", formatDate(member.joined_at || member.created_at), "Disiplin puani", String(disciplinePoints(member))],
    ["Profil isareti", initials, "Avatar rengi", member.avatar_color || "Belirtilmedi"]
  ]);

  section("Rol ve Kurul Ozeti");
  twoColumns([
    ["Roller", roleLabels(member), "Kurullar", committeeLabels(member)],
    ["Aktif uzaklastirma", member.suspended_until ? formatDate(member.suspended_until, true) : "Yok", "Profil fotografi", member.avatar_url ? "Kayitli" : "Yok / kisaltma kullanildi"]
  ]);

  section("Rapor Ozeti");
  twoColumns([
    ["Ceza kaydi", `${sanctions.length} kayit`, "Odul kaydi", `${awards.length} kayit`],
    ["Sorusturma", `${investigations.length} kayit`, "Rapor kapsami", "Portal verileri"]
  ]);

  section("Disiplin Cezalari ve Kararnameler");
  if (sanctions.length) {
    sanctions.forEach((item, index) => {
      const delta = Number(item.point_delta || 0);
      const pointText = delta > 0 ? `+${delta}` : String(delta);
      card(
        `${index + 1}. ${item.record_type || "Ceza kaydi"}`,
        `${statusLabel(item.decision_status)} · ${pointText} puan · ${formatDate(item.created_at, true)}`,
        [
          `Uygulanan islem: ${sanctionEffectLabel(item.sanction_effect)}`,
          `Gerekce: ${item.reason || item.description || "Yok"}`,
          `Kararname: ${item.decree_text || item.action_taken || "Kararname metni yok."}`,
          item.appeal_status ? `Itiraz durumu: ${statusLabel(item.appeal_status)}` : ""
        ].filter(Boolean)
      );
    });
  } else {
    paragraph("Bu uye hakkinda disiplin cezasi bulunmuyor.");
  }

  section("Oduller");
  if (awards.length) {
    awards.forEach((item, index) => {
      const delta = Number(item.point_delta || 0);
      card(
        `${index + 1}. Odul kaydi`,
        `${delta > 0 ? `+${delta}` : delta} puan · ${formatDate(item.created_at, true)}`,
        [
          `Gerekce: ${item.reason || item.description || "Yok"}`,
          `Karar metni: ${item.decree_text || item.action_taken || "Odul karar metni yok."}`
        ]
      );
    });
  } else {
    paragraph("Bu uye hakkinda odul kaydi bulunmuyor.");
  }

  section("Sorusturmalar");
  if (investigations.length) {
    investigations.forEach((item, index) => {
      card(
        `${index + 1}. ${item.title || "Sorusturma"}`,
        `${statusLabel(item.status)} · ${formatDate(item.created_at, true)}`,
        [
          `Aciklama: ${item.description || "Aciklama yok."}`,
          item.decision_note ? `Karar notu: ${item.decision_note}` : ""
        ].filter(Boolean)
      );
    });
  } else {
    paragraph("Bu uye hakkinda sorusturma bulunmuyor.");
  }

  section("Onay");
  paragraph("Bu rapor IHP Portal verileri uzerinden otomatik olarak olusturulmustur. Resmi degerlendirme icin Disiplin Kurulu yetkilisi tarafindan kontrol edilmelidir.");
  y -= 18;
  color("#071426");
  text(52, y, "Yetkili imza: ______________________________", 10, "F2");
  finishPage();

  const objects = [];
  const addObject = (content) => {
    objects.push(content);
    return objects.length;
  };
  const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
  const pagesId = addObject("");
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const fontBoldId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pageIds = pages.map((pageCommands) => {
    const stream = pageCommands.join("\n");
    const contentId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    return addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`);
  });
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

async function logoReportExportMemberReport(memberId) {
  if (!logoReportCanDownload()) {
    showToast("Üye raporu yalnızca DK yetkilileri ve süper admin tarafından indirilebilir.", "error");
    return;
  }
  const member = visibleMembers().find((item) => item.id === memberId) || (state.cache.members || []).find((item) => item.id === memberId);
  if (!member) throw new Error("Üye bulunamadı.");

  const [records, investigations] = await Promise.all([
    loadDisciplineRecords().catch(() => state.cache.discipline || []),
    loadInvestigations().catch(() => state.cache.investigations || [])
  ]);
  state.cache.discipline = records;
  state.cache.investigations = investigations;

  const memberRecords = records.filter((item) => item.member_id === member.id);
  const awards = memberRecords.filter((item) => Number(item.point_delta || 0) > 0 || item.sanction_effect === "reward_points");
  const sanctions = memberRecords.filter((item) => !awards.includes(item));
  const memberInvestigations = investigations.filter((item) => item.subject_profile_id === member.id || item.subject?.id === member.id);
  const createdBy = state.profile?.display_name || "Yetkili";

  const pdf = logoReportProfessionalPdf({
    member,
    sanctions,
    awards,
    investigations: memberInvestigations,
    createdBy
  });
  logoReportPdfDownload(pdf, `ihp-dk-uye-raporu-${logoReportSafeFileName(member.member_code || member.display_name)}.pdf`);
  showToast("Üye raporu Disiplin İşlemleri üzerinden indirildi.");
}

const logoReportBaseLoadPage = loadPage;
loadPage = async function patchedLogoReportLoadPage(page) {
  if (getSession() && !state.cache.settings) {
    state.cache.settings = await loadSettings().catch(() => state.cache.settings || null);
  }
  if (page === "discipline-operations") {
    state.loading = true;
    render();
    try {
      const [notifications, members, records, investigations, complaints, settings] = await Promise.all([
        loadNotifications().catch(() => state.cache.notifications || []),
        loadMembers(),
        loadDisciplineRecords().catch(() => state.cache.discipline || []),
        loadInvestigations().catch(() => state.cache.investigations || []),
        loadComplaints().catch(() => state.cache.complaints || []),
        loadSettings().catch(() => state.cache.settings || null)
      ]);
      state.cache.notifications = notifications;
      state.cache.members = members;
      state.cache.discipline = records;
      state.cache.investigations = investigations;
      state.cache.investigationBadge = investigations;
      state.cache.complaints = complaints;
      state.cache.complaintBadge = complaints;
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
  return logoReportBaseLoadPage(page);
};

const logoReportBaseSubmitForm = submitForm;
submitForm = async function patchedLogoReportSubmitForm(event) {
  const form = event.target.closest("form[data-form]");
  if (form?.dataset.form === "portal-logo") {
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
      showToast("Parti logosu güncellendi.");
      render();
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      if (submit) submit.disabled = false;
    }
    return;
  }
  return logoReportBaseSubmitForm(event);
};

const logoReportBaseHandleClick = handleClick;
handleClick = async function patchedLogoReportHandleClick(event) {
  const target = event.target.closest("[data-action]");
  const action = target?.dataset.action;
  if (action === "export-member-report") {
    event.preventDefault();
    target.disabled = true;
    try {
      await logoReportExportMemberReport(target.dataset.id);
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
  return logoReportBaseHandleClick(event);
};