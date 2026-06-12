const IHP_ACCESS_FEATURE_PATCH_V1 = true;

const ACCESS_MANAGER_ROLES = [
  "super_admin",
  "president",
  "vice_president",
  "presidential_aide",
  "discipline_chair",
  "discipline_vice_chair",
  "discipline_member"
];

function canUseAccessPanel() {
  return hasRole(...ACCESS_MANAGER_ROLES);
}

permissions.access = canUseAccessPanel;
permissions.memberQuery = permissions.disciplineCouncil;

if (!navItems.some(([id]) => id === "access")) {
  const disciplineIndex = navItems.findIndex(([id]) => id === "discipline-council");
  navItems.splice(
    disciplineIndex === -1 ? 4 : disciplineIndex + 1,
    0,
    ["access", "Geçiş", "check", permissions.access],
    ["member-query", "Sorgu", "search", permissions.memberQuery]
  );
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

async function portalRestList(path) {
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
  if (!response.ok) throw new Error(body?.message || body?.hint || "Veri alınamadı.");
  return body;
}

async function loadAccessCheckinsLocal() {
  return portalRestList(
    "access_checkins?select=id,member_id,requested_by,status,requested_at,expires_at,approved_at,note,member:profiles!access_checkins_member_id_fkey(id,display_name,email,role,roles,status,discipline_points,suspended_until),requester:profiles!access_checkins_requested_by_fkey(id,display_name)&order=requested_at.desc&limit=100"
  );
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
      String(member.email || "").toLocaleLowerCase("tr").includes(q)
  );
  const checkins = state.cache.accessCheckins || [];
  const pending = accessPendingRows();
  const approvedToday = checkins.filter((item) => {
    if (item.status !== "approved" || !item.approved_at) return false;
    return new Date(item.approved_at).toDateString() === new Date().toDateString();
  });

  return `
    ${pageHeader(
      "Geçiş kontrolü",
      "Kodlu check-list onayı",
      "Yetkili kişi listeden üyeyi seçer, kod üyenin bildirim kutusuna gider. Kod girilince geçiş onaylandı olarak kaydedilir."
    )}
    <section class="metrics-grid">
      ${metric("Bekleyen kod", pending.length, "Onay bekleyen geçiş", "bell")}
      ${metric("Bugün onaylanan", approvedToday.length, "Tamamlanan geçiş", "check")}
      ${metric("Üye listesi", members.length, "Arama sonucundaki kişi", "users")}
    </section>
    <div class="toolbar">
      <label class="search-field">
        ${icon("search")}
        <input class="field" type="search" placeholder="Üye adı veya e-posta ara..." data-filter="accessSearch" value="${esc(state.filters.accessSearch || "")}" />
      </label>
    </div>
    <section class="dashboard-grid">
      <article class="panel glass">
        <div class="panel-head"><h3>Check-list</h3><span>Kod gönder</span></div>
        <div class="table-shell">
          <table class="data-table">
            <thead><tr><th>Üye</th><th>Rol</th><th>Durum</th><th>İşlem</th></tr></thead>
            <tbody>
              ${
                members.length
                  ? members
                      .map(
                        (member) => `
                          <tr>
                            <td><span class="cell-main member-cell">${avatar(member)} ${esc(member.display_name)}</span><span class="cell-sub">${esc(member.email || member.id.slice(0, 8))}</span></td>
                            <td>${esc(roleLabels(member))}</td>
                            <td>${badge(accessMemberStatus(member), member.status === "active" ? "green" : "gold")}</td>
                            <td><button class="table-action" type="button" data-action="send-access-code" data-id="${esc(member.id)}">Kod gönder</button></td>
                          </tr>
                        `
                      )
                      .join("")
                  : `<tr><td colspan="4">${emptyCard("Üye bulunamadı", "Arama metnini değiştirin.")}</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </article>
      <article class="panel glass">
        <div class="panel-head"><h3>Geçiş kayıtları</h3><span>Kod gir ve onayla</span></div>
        <div class="notification-list">
          ${
            checkins.length
              ? checkins
                  .slice(0, 20)
                  .map(
                    (item) => `
                      <article class="notification-card ${item.status === "pending" ? "unread" : ""}">
                        <div>
                          <strong>${esc(item.member?.display_name || "Üye")}</strong>
                          <p>${accessStatusLabel(item.status)} · İstek: ${formatDate(item.requested_at, true)} · Bitiş: ${formatDate(item.expires_at, true)}</p>
                          <span>İsteyen: ${esc(item.requester?.display_name || "Yetkili")}</span>
                        </div>
                        ${
                          item.status === "pending"
                            ? `<form class="inline-actions" data-form="access-code" data-id="${esc(item.id)}">
                                <input class="field" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="6 haneli kod" required />
                                <button class="table-action" type="submit">Onayla</button>
                              </form>`
                            : accessStatusBadge(item.status)
                        }
                      </article>
                    `
                  )
                  .join("")
              : emptyCard("Geçiş kaydı yok", "Kod gönderildiğinde burada görünecek.")
          }
        </div>
      </article>
    </section>
  `;
}

function queryDisciplineCards(member) {
  const records = (state.cache.queryDiscipline || []).filter((item) => item.member_id === member.id);
  if (!records.length) {
    return emptyCard("Disiplin kaydı yok", "Bu üye için görülebilir disiplin kaydı bulunmuyor.");
  }
  return records
    .slice(0, 8)
    .map(
      (item) => `
        <article class="entity-card glass">
          <div class="entity-top">
            ${badge(item.archived ? "Silindi" : statusLabel(item.decision_status), item.archived ? "gray" : "gold")}
            ${pointDeltaBadge(pointDeltaValue(item))}
          </div>
          <h3 style="margin-top:.85rem">${esc(item.record_type || "Disiplin kaydı")}</h3>
          <p>${esc(item.reason || item.description || "Açıklama yok.")}</p>
          <div class="meta-list">
            <div class="meta-row"><span>İşlem</span><strong>${esc(sanctionEffectLabel(item.sanction_effect))}</strong></div>
            <div class="meta-row"><span>Puan</span><strong>${esc(pointTrail(item) || "Değişim yok")}</strong></div>
            <div class="meta-row"><span>Kararname</span><strong>${esc((item.decree_text || item.action_taken || "Yok").slice(0, 140))}</strong></div>
            <div class="meta-row"><span>Tarih</span><strong>${formatDate(item.created_at, true)}</strong></div>
          </div>
          <button class="table-action" type="button" data-action="view-discipline" data-id="${esc(item.id)}">Detay</button>
        </article>
      `
    )
    .join("");
}

function memberQueryPage() {
  const q = (state.filters.querySearch || "").toLocaleLowerCase("tr");
  const members = visibleMembers()
    .filter(
      (member) =>
        q &&
        (member.display_name.toLocaleLowerCase("tr").includes(q) ||
          String(member.email || "").toLocaleLowerCase("tr").includes(q))
    )
    .slice(0, 10);

  return `
    ${pageHeader(
      "Disiplin sorgu paneli",
      "Üye bilgisi ve disiplin özeti",
      "Bu ekran yalnızca disiplin kurulu yetkililerine açıktır. İsim yazınca üyenin rolü, puanı, durumu ve kayıtları tek ekranda görünür."
    )}
    <div class="toolbar">
      <label class="search-field">
        ${icon("search")}
        <input class="field" type="search" placeholder="Üye adı yazın..." data-filter="querySearch" value="${esc(state.filters.querySearch || "")}" />
      </label>
    </div>
    ${
      q
        ? members.length
          ? members
              .map(
                (member) => `
                  <section class="hero-panel glass">
                    <div class="entity-top">
                      <div class="member-cell">${avatar(member)} <div><h2>${esc(member.display_name)}</h2><p>${esc(roleLabels(member))}</p></div></div>
                      ${badgeForStatus(member.status)}
                    </div>
                    <section class="metrics-grid" style="margin-top:1rem">
                      ${metric("Disiplin puanı", disciplinePoints(member), "Başlangıç 100 puan", "sparkles")}
                      ${metric("Kurul", committeeLabels(member), "Bağlı kurumlar", "grid")}
                      ${metric("Durum", accessMemberStatus(member), "Üyelik bilgisi", "shield")}
                    </section>
                    ${
                      member.suspended_until
                        ? `<div class="setup-box"><strong>Uzaklaştırma bitişi</strong><p class="security-note">${formatDate(member.suspended_until, true)} tarihinde otomatik aktif olur.</p></div>`
                        : ""
                    }
                  </section>
                  <section class="card-grid" style="margin-top:.85rem">${queryDisciplineCards(member)}</section>
                `
              )
              .join("")
          : emptyCard("Sonuç yok", "Bu isimle eşleşen üye bulunamadı.")
        : emptyCard("Sorgu için isim yazın", "Üye adını yazınca sonuçlar burada açılacak.")
    }
  `;
}

const baseSanctionEffectLabel = sanctionEffectLabel;
sanctionEffectLabel = function patchedSanctionEffectLabel(effect = "none") {
  if (effect === "party_suspension") return "Partiden uzaklaştırma";
  return baseSanctionEffectLabel(effect);
};

const baseNotificationCategoryLabel = notificationCategoryLabel;
notificationCategoryLabel = function patchedNotificationCategoryLabel(category = "system") {
  if (category === "access") return "Geçiş";
  return baseNotificationCategoryLabel(category);
};

const baseBadgeCountForNav = badgeCountForNav;
badgeCountForNav = function patchedBadgeCountForNav(id) {
  if (id === "access") {
    const count = accessPendingRows().length;
    return count ? String(count) : "";
  }
  return baseBadgeCountForNav(id);
};

const baseRenderPortalPage = renderPortalPage;
renderPortalPage = function patchedRenderPortalPage(page) {
  if (page === "access") return accessPage();
  if (page === "member-query") return memberQueryPage();
  return baseRenderPortalPage(page);
};

const baseLoadPage = loadPage;
loadPage = async function patchedLoadPage(page) {
  await restoreSuspensionsOnce();
  if (page === "access") {
    state.loading = true;
    render();
    try {
      state.cache.notifications = await loadNotifications().catch(() => state.cache.notifications || []);
      maybeCelebrateRewards();
      const [members, checkins] = await Promise.all([loadMembers(), loadAccessCheckinsLocal()]);
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
  if (page === "member-query") {
    state.loading = true;
    render();
    try {
      state.cache.notifications = await loadNotifications().catch(() => state.cache.notifications || []);
      maybeCelebrateRewards();
      const [members, records] = await Promise.all([loadMembers(), loadDisciplineRecords()]);
      state.cache.members = members;
      state.cache.queryDiscipline = records;
      state.cache.discipline = records;
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      state.loading = false;
      render();
    }
    return;
  }
  return baseLoadPage(page);
};

const baseOpenDiscipline = openDiscipline;
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
      `<div class="form-group">
        <label for="discipline-sanction-days">Partiden uzaklaştırma süresi (gün)</label>
        <input class="field" id="discipline-sanction-days" name="sanction_days" type="number" min="1" max="365" step="1" value="${esc(item?.sanction_days || "")}" placeholder="Örn: 7" />
        <p class="security-note">Sadece süreli partiden uzaklaştırma seçilirse zorunludur. Süre bitince üyelik otomatik aktif olur.</p>
      </div>`
    );
  }
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

const baseSubmitForm = submitForm;
submitForm = async function patchedSubmitForm(event) {
  const form = event.target.closest("form[data-form]");
  if (!form) return;

  if (form.dataset.form === "access-code") {
    event.preventDefault();
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
      if (!recordValues.investigation_id) throw new Error("Ceza girmek için önce soruşturma seçilmelidir.");

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
  if (target?.dataset.action === "send-access-code") {
    event.preventDefault();
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
  return baseHandleClick(event);
};
