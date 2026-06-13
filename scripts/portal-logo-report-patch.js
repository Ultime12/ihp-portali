const IHP_LOGO_REPORT_PATCH_V1 = true;

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
    .report-action-stack { display: flex; gap: .45rem; flex-wrap: wrap; }
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
  const canReport = logoReportCanDownload();

  return `
    ${pageHeader(
      "Üye listesi",
      "Parti kadrosu",
      "Giriş yapan her üye kadrodaki isimleri görebilir. DK yetkilileri üyeler için resmi PDF raporu indirebilir.",
      `<button class="btn btn-secondary btn-sm" type="button" data-action="export-members">${icon("download")} PDF</button>`
    )}
    ${toolbar("memberSearch", [
      ["memberRole", "Rol", ROLE_OPTIONS],
      ["memberStatus", "Durum", ["active", "passive", "suspended", "left", "pending"].map((id) => [id, statusLabel(id)])]
    ])}
    <div class="table-shell glass">
      <table class="data-table">
        <thead><tr><th>Üye</th><th>Üye ID</th><th>Roller</th><th>Kurul</th><th>Durum</th><th>İşlem</th></tr></thead>
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
                        <td>
                          <div class="report-action-stack">
                            ${canReport ? `<button class="table-action" type="button" data-action="export-member-report" data-id="${esc(item.id)}">${icon("download")} Üye Raporu PDF</button>` : ""}
                            ${canEditMembers() || isDisciplineRoleManager() ? `<span class="cell-sub">Yetkili panelden yönetilir</span>` : `<span class="cell-sub">${formatDate(item.updated_at, true)}</span>`}
                          </div>
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

function logoReportLineWrap(value, max = 92) {
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

function logoReportDownload(lines, filename) {
  const blob = new Blob([buildPdf(lines)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function logoReportRecordLine(item, index) {
  const delta = Number(item.point_delta || 0);
  const pointText = delta > 0 ? `+${delta}` : String(delta);
  return `${index + 1}. ${item.record_type || "Kayıt"} | ${statusLabel(item.decision_status)} | ${pointText} puan | ${formatDate(item.created_at, true)}`;
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
  const memberRecords = records.filter((item) => item.member_id === member.id);
  const awards = memberRecords.filter((item) => Number(item.point_delta || 0) > 0 || item.sanction_effect === "reward_points");
  const sanctions = memberRecords.filter((item) => !awards.includes(item));
  const memberInvestigations = investigations.filter((item) => item.subject_profile_id === member.id || item.subject?.id === member.id);
  const createdBy = state.profile?.display_name || "Yetkili";
  const code = logoReportMemberCode(member);
  const initials = logoReportInitials(member);

  const lines = [
    "IHP DISIPLIN KURULU UYE RAPORU",
    `Rapor tarihi: ${new Date().toLocaleString("tr-TR")}`,
    `Raporu olusturan: ${createdBy}`,
    `Rapor konusu: ${member.display_name} (${code})`,
    "",
    "KIMLIK VE PROFIL",
    `Ad soyad: ${member.display_name}`,
    `E-posta: ${member.email || "Gizli / yok"}`,
    `Uye ID: ${code}`,
    `Profil isareti: ${initials}`,
    `Avatar rengi: ${member.avatar_color || "Belirtilmedi"}`,
    `Uyelik durumu: ${statusLabel(member.status)}`,
    `Katilim tarihi: ${formatDate(member.joined_at || member.created_at)}`,
    "",
    "ROLLER VE KURULLAR",
    `Roller: ${roleLabels(member)}`,
    `Kurullar: ${committeeLabels(member)}`,
    `Disiplin puani: ${disciplinePoints(member)}`,
    member.suspended_until ? `Aktif uzaklastirma bitisi: ${formatDate(member.suspended_until, true)}` : "Aktif uzaklastirma: Yok",
    "",
    "DISIPLIN CEZALARI VE KARARNAMELER"
  ];

  if (sanctions.length) {
    sanctions.forEach((item, index) => {
      lines.push(logoReportRecordLine(item, index));
      lines.push(`Islem: ${sanctionEffectLabel(item.sanction_effect)}`);
      lines.push(`Gerekce: ${item.reason || item.description || "Yok"}`);
      lines.push("Kararname:");
      lines.push(...logoReportLineWrap(item.decree_text || item.action_taken || "Kararname metni yok."));
      lines.push("");
    });
  } else {
    lines.push("Bu uye hakkinda disiplin cezasi bulunmuyor.", "");
  }

  lines.push("ODULLER");
  if (awards.length) {
    awards.forEach((item, index) => {
      lines.push(logoReportRecordLine(item, index));
      lines.push(`Gerekce: ${item.reason || item.description || "Yok"}`);
      lines.push(...logoReportLineWrap(item.decree_text || item.action_taken || "Odul karar metni yok."));
      lines.push("");
    });
  } else {
    lines.push("Bu uye hakkinda odul kaydi bulunmuyor.", "");
  }

  lines.push("SORUSTURMALAR");
  if (memberInvestigations.length) {
    memberInvestigations.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.title || "Sorusturma"} | ${statusLabel(item.status)} | ${formatDate(item.created_at, true)}`);
      lines.push(...logoReportLineWrap(item.description || "Aciklama yok."));
      if (item.decision_note) lines.push(...logoReportLineWrap(`Karar notu: ${item.decision_note}`));
      lines.push("");
    });
  } else {
    lines.push("Bu uye hakkinda sorusturma bulunmuyor.", "");
  }

  lines.push("ONAY");
  lines.push("Bu rapor portal verileri uzerinden otomatik olusturulmustur.");
  lines.push("Yetkili imza: ______________________________");

  logoReportDownload(lines, `ihp-dk-uye-raporu-${member.member_code || member.display_name}.pdf`);
  showToast("Üye raporu PDF olarak indirildi.");
}

const logoReportBaseLoadPage = loadPage;
loadPage = async function patchedLogoReportLoadPage(page) {
  if (getSession() && !state.cache.settings) {
    state.cache.settings = await loadSettings().catch(() => state.cache.settings || null);
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
