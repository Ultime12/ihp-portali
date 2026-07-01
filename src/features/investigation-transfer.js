const IHP_INVESTIGATION_TRANSFER_PATCH_V2 = true;

function ihpInvestigationAssigneeProfileV2(item) {
  const rows = state.cache.members || state.cache.disciplineMembers || [];
  return rows.find((member) => member.id === item?.assigned_to) || null;
}

function ihpInvestigationCanTakeV2(item) {
  if (!item || ["cancelled", "closed"].includes(item.status)) return false;
  if (!item.assigned_to) return hasRole("discipline_chair", "discipline_vice_chair", "discipline_member");
  if (item.assigned_to === state.profile?.id) return false;
  const assignee = ihpInvestigationAssigneeProfileV2(item);
  if (!assignee) return hasRole("discipline_chair");
  const actorRank = disciplineRank(state.profile);
  const assigneeRank = disciplineRank(assignee);
  return actorRank > 0 && assigneeRank > 0 && actorRank > assigneeRank;
}

function ihpInvestigationTransferTargetsV2(item) {
  if (!item || ["cancelled", "closed"].includes(item.status)) return [];
  const actorRank = disciplineRank(state.profile);
  if (actorRank < 2) return [];
  if (item.assigned_to && item.assigned_to !== state.profile?.id && !ihpInvestigationCanTakeV2(item)) return [];
  const rows = state.cache.members || state.cache.disciplineMembers || [];
  return visibleProfiles(rows)
    .filter((member) => member.id !== state.profile?.id && member.id !== item.assigned_to)
    .filter((member) => !(item.recused_profile_ids || []).includes(member.id))
    .filter((member) => member.status === "active")
    .filter((member) => {
      const rank = disciplineRank(member);
      return rank > 0 && actorRank > rank;
    })
    .sort((a, b) => disciplineRank(b) - disciplineRank(a) || a.display_name.localeCompare(b.display_name, "tr"));
}

function ihpInvestigationCanTransferV2(item) {
  return ihpInvestigationTransferTargetsV2(item).length > 0;
}

function ihpInvestigationCanCloseV2(item, status = "closed") {
  if (!item || ["cancelled", "closed"].includes(item.status)) return false;
  if (item.assigned_to !== state.profile?.id) return false;
  if (status === "cancelled") return hasRole("discipline_chair");
  if (item.defense_status === "pending") return false;
  return hasRole("discipline_chair", "discipline_vice_chair", "discipline_member");
}

function ihpDefenseStatusLabelV2(item) {
  return {
    pending: "Savunma bekleniyor",
    submitted: "Savunma sunuldu",
    not_submitted: "Savunma sunulmadı"
  }[item?.defense_status] || "Savunma bekleniyor";
}

investigationActions = function patchedInvestigationActions(item) {
  const buttons = [];
  if (!item) return "";

  if (
    item.subject_profile_id === state.profile?.id &&
    item.defense_status === "pending" &&
    !["cancelled", "closed"].includes(item.status)
  ) {
    buttons.push(`<button class="table-action" type="button" data-action="submit-investigation-defense" data-id="${esc(item.id)}">Savunmamı sun</button>`);
  }

  if (["cancelled", "closed"].includes(item.status)) {
    return buttons.length ? `<div class="inline-actions">${buttons.join("")}</div>` : "";
  }

  if (item.assigned_to === state.profile?.id && item.defense_status === "pending") {
    buttons.push(`<button class="table-action" type="button" data-action="close-investigation-defense" data-id="${esc(item.id)}">Savunma sunulmadı</button>`);
  }
  if (item.assigned_to === state.profile?.id) {
    buttons.push(`<button class="table-action" type="button" data-action="recuse-investigation" data-id="${esc(item.id)}">Çıkar çatışması / çekil</button>`);
  }
  if (!item.assigned_to || ihpInvestigationCanTakeV2(item)) {
    buttons.push(`<button class="table-action" type="button" data-action="claim-investigation" data-id="${esc(item.id)}">${item.assigned_to ? "Sorumluluğu devral" : "Sorumluluğu al"}</button>`);
  }
  if (ihpInvestigationCanTransferV2(item)) {
    buttons.push(`<button class="table-action" type="button" data-action="transfer-investigation" data-id="${esc(item.id)}">Devret</button>`);
  }
  if (ihpInvestigationCanCloseV2(item, "closed")) {
    buttons.push(`<button class="table-action" type="button" data-action="open-investigation-review" data-id="${esc(item.id)}" data-status="closed">Kapat</button>`);
  }
  if (ihpInvestigationCanCloseV2(item, "cancelled")) {
    buttons.push(`<button class="table-action danger-action" type="button" data-action="open-investigation-review" data-id="${esc(item.id)}" data-status="cancelled">İptal et</button>`);
  }
  return buttons.length ? `<div class="inline-actions">${buttons.join("")}</div>` : "";
};

investigationsPage = function patchedMainRegulationInvestigationsPage() {
  const rows = state.cache.investigations || [];
  const openRows = rows.filter((item) => ["open", "reviewing"].includes(item.status));
  return `
    ${pageHeader(
      "Soruşturmalar",
      "Bağımsız inceleme ve savunma hakkı",
      "Soruşturma Disiplin Kurulu tarafından yürütülür. Hakkında işlem yapılan üye savunmasını bu alandan sunar.",
      permissions.disciplineManage()
        ? `<button class="btn btn-primary btn-sm" type="button" data-action="open-investigation">${icon("plus")} Soruşturma Aç</button>`
        : ""
    )}
    <section class="metrics-grid">
      ${metric("Açık", openRows.length, "İncelemesi süren", "search")}
      ${metric("Savunma bekleyen", rows.filter((item) => item.defense_status === "pending" && !["closed", "cancelled"].includes(item.status)).length, "Karar öncesi hak", "clipboard")}
      ${metric("Kapatılan", rows.filter((item) => item.status === "closed").length, "Tamamlanan", "check")}
      ${metric("Toplam", rows.length, "Kurumsal arşiv", "shield")}
    </section>
    <div class="card-grid application-grid">
      ${
        rows.length
          ? rows.map((item) => `
              <article class="entity-card glass application-card">
                <div class="entity-top">
                  ${badge(investigationSubjectLabel(item), "blue")}
                  ${badgeForStatus(item.status)}
                </div>
                <h3 style="margin-top:.85rem">${esc(item.title)}</h3>
                <p>${esc(item.description || "Açıklama eklenmedi.")}</p>
                <div class="meta-list">
                  <div class="meta-row"><span>İlgili üye</span><strong>${esc(investigationSubjectLabel(item))}</strong></div>
                  <div class="meta-row"><span>Sorumlu soruşturmacı</span><strong>${esc(item.assignee?.display_name || "Atanmadı")}</strong></div>
                  <div class="meta-row"><span>Savunma</span><strong>${esc(ihpDefenseStatusLabelV2(item))}</strong></div>
                  ${item.defense_text ? `<div class="meta-row"><span>Savunma metni</span><strong>${esc(item.defense_text)}</strong></div>` : ""}
                  ${item.defense_note ? `<div class="meta-row"><span>Savunma işlem notu</span><strong>${esc(item.defense_note)}</strong></div>` : ""}
                  ${item.recusal_note ? `<div class="meta-row"><span>Çekilme kaydı</span><strong>${esc(item.recusal_note)}</strong></div>` : ""}
                  <div class="meta-row"><span>Karar notu</span><strong>${esc(item.decision_note || "Henüz karar yok")}</strong></div>
                  <div class="meta-row"><span>Kanıt</span><strong>${item.evidence_file ? `<a href="${esc(item.evidence_file)}" download="${esc(item.evidence_filename || "ihp-sorusturma-kanit")}">Dosyayı aç</a>` : esc(item.evidence_note || "Eklenmedi")}</strong></div>
                  <div class="meta-row"><span>Tarih</span><strong>${formatDate(item.created_at, true)}</strong></div>
                </div>
                ${investigationActions(item)}
              </article>
            `).join("")
          : emptyCard("Soruşturma yok", "Size görünen bir soruşturma kaydı bulunmuyor.")
      }
    </div>
  `;
};

openInvestigationReview = function patchedOpenInvestigationReview(item, status) {
  if (!ihpInvestigationCanCloseV2(item, status)) {
    showToast(
      item?.defense_status === "pending"
        ? "Savunma aşaması tamamlanmadan soruşturma kapatılamaz."
        : "Bu işlem için önce soruşturma sorumluluğunu devralmalısınız.",
      "error"
    );
    return;
  }
  modal({
    title: statusLabel(status),
    subtitle: `${investigationSubjectLabel(item)} hakkındaki soruşturma.`,
    body: `
      <form class="form-stack" data-form="investigation-review" data-id="${esc(item.id)}" data-status="${esc(status)}">
        <div class="setup-box"><strong>${esc(item.title)}</strong><p class="security-note">${esc(item.description || "")}</p></div>
        <div class="form-group"><label for="investigation-decision-note">Karar / işlem notu</label><textarea class="field" id="investigation-decision-note" name="decisionNote" required maxlength="900">${esc(item.decision_note || "")}</textarea></div>
        <p class="security-note">Soruşturma yalnızca sorumlu DK görevlisi tarafından ve savunma aşaması tamamlandıktan sonra kapatılabilir.</p>
        <div class="modal-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button><button class="btn btn-primary btn-sm" type="submit">Kaydet</button></div>
      </form>
    `
  });
};

function ihpOpenDefenseV2(item) {
  modal({
    title: "Soruşturma savunması",
    subtitle: "Savunmanız değiştirilemez biçimde dosyaya kaydedilir.",
    body: `
      <form class="form-stack" data-form="investigation-defense" data-id="${esc(item.id)}">
        <div class="setup-box"><strong>${esc(item.title)}</strong><p class="security-note">${esc(item.description || "")}</p></div>
        <div class="form-group"><label for="investigation-defense-text">Savunma metniniz</label><textarea class="field decree-field" id="investigation-defense-text" name="defenseText" required minlength="20" maxlength="12000" style="min-height:320px"></textarea></div>
        <div class="modal-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button><button class="btn btn-primary btn-sm" type="submit">Savunmayı sun</button></div>
      </form>
    `
  });
}

function ihpOpenCloseDefenseV2(item) {
  modal({
    title: "Savunma aşamasını kapat",
    subtitle: "Üyenin savunma sunmadığına ilişkin gerekçe kurumsal kayda yazılır.",
    body: `
      <form class="form-stack" data-form="investigation-defense-close" data-id="${esc(item.id)}">
        <div class="form-group"><label for="investigation-defense-close-note">Gerekçe</label><textarea class="field" id="investigation-defense-close-note" name="decisionNote" required minlength="10" maxlength="1200"></textarea></div>
        <div class="modal-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button><button class="btn btn-primary btn-sm" type="submit">Aşamayı kapat</button></div>
      </form>
    `
  });
}

function ihpOpenRecusalV2(item) {
  modal({
    title: "Dosyadan çekil",
    subtitle: "Çıkar çatışması kurumsal kayda yazılır ve dosya başka bir DK görevlisine bırakılır.",
    body: `
      <form class="form-stack" data-form="investigation-recusal" data-id="${esc(item.id)}">
        <div class="form-group"><label for="investigation-recusal-note">Çıkar çatışması açıklaması</label><textarea class="field" id="investigation-recusal-note" name="decisionNote" required minlength="10" maxlength="1200"></textarea></div>
        <div class="modal-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button><button class="btn btn-primary btn-sm" type="submit">Çekilmeyi kaydet</button></div>
      </form>
    `
  });
}

function ihpOpenInvestigationTransferV2(item) {
  const targets = ihpInvestigationTransferTargetsV2(item);
  if (!targets.length) {
    showToast("Devredilebilecek alt rütbeli DK personeli bulunamadı.", "error");
    return;
  }
  modal({
    title: "Soruşturmayı devret",
    subtitle: "Sorumluluk yalnızca DK hiyerarşisinde alt rütbeye devredilebilir.",
    body: `
      <form class="form-stack" data-form="investigation-transfer" data-id="${esc(item.id)}">
        <div class="setup-box"><strong>${esc(item.title)}</strong><p class="security-note">Mevcut sorumlu: ${esc(item.assignee?.display_name || "Henüz alınmadı")}</p></div>
        <div class="form-group">
          <label for="investigation-transfer-assignee">Devredilecek DK personeli</label>
          <select class="field" id="investigation-transfer-assignee" name="assignedTo" required>
            <option value="">Seçin</option>
            ${targets.map((member) => `<option value="${esc(member.id)}">${esc(member.display_name)} · ${esc(disciplineRankLabel(member))}</option>`).join("")}
          </select>
        </div>
        <div class="form-group"><label for="investigation-transfer-note">Devir notu</label><textarea class="field" id="investigation-transfer-note" name="decisionNote" maxlength="900"></textarea></div>
        <div class="modal-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button><button class="btn btn-primary btn-sm" type="submit">Devret</button></div>
      </form>
    `
  });
}

const ihpInvestigationBaseSubmitFormV2 = submitForm;
submitForm = async function patchedInvestigationSubmitForm(event) {
  const form = event.target.closest("form[data-form]");
  if (
    form?.dataset.form === "investigation-defense" ||
    form?.dataset.form === "investigation-defense-close" ||
    form?.dataset.form === "investigation-recusal"
  ) {
    event.preventDefault();
    const submit = form.querySelector('[type="submit"]');
    const values = formData(form);
    if (submit) submit.disabled = true;
    try {
      const action = form.dataset.form === "investigation-defense"
        ? "submit_defense"
        : form.dataset.form === "investigation-defense-close"
          ? "close_defense"
          : "recuse";
      await manageInvestigation({
        action,
        id: form.dataset.id,
        defenseText: values.defenseText || "",
        decisionNote: values.decisionNote || ""
      });
      showToast(
        action === "submit_defense"
          ? "Savunmanız dosyaya kaydedildi."
          : action === "close_defense"
            ? "Savunma aşaması kapatıldı."
            : "Çıkar çatışması kaydedildi ve dosyadan çekildiniz."
      );
      closeModal();
      await loadPage("investigations");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      if (submit) submit.disabled = false;
    }
    return;
  }

  if (!form || form.dataset.form !== "investigation-transfer") {
    return ihpInvestigationBaseSubmitFormV2(event);
  }
  event.preventDefault();
  const submit = form.querySelector('[type="submit"]');
  const values = formData(form);
  if (submit) submit.disabled = true;
  try {
    await manageInvestigation({
      action: "transfer",
      id: form.dataset.id,
      assignedTo: values.assignedTo,
      decisionNote: values.decisionNote || "Soruşturma sorumluluğu devredildi."
    });
    showToast("Soruşturma sorumluluğu devredildi.");
    closeModal();
    await loadPage("investigations");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    if (submit) submit.disabled = false;
  }
};

const ihpInvestigationBaseHandleClickV2 = handleClick;
handleClick = async function patchedInvestigationHandleClick(event) {
  const target = event.target.closest("[data-action]");
  if (target?.dataset.action === "transfer-investigation") {
    event.preventDefault();
    const item = (state.cache.investigations || []).find((row) => row.id === target.dataset.id);
    if (item) ihpOpenInvestigationTransferV2(item);
    return;
  }
  if (target?.dataset.action === "submit-investigation-defense") {
    event.preventDefault();
    const item = (state.cache.investigations || []).find((row) => row.id === target.dataset.id);
    if (item) ihpOpenDefenseV2(item);
    return;
  }
  if (target?.dataset.action === "close-investigation-defense") {
    event.preventDefault();
    const item = (state.cache.investigations || []).find((row) => row.id === target.dataset.id);
    if (item) ihpOpenCloseDefenseV2(item);
    return;
  }
  if (target?.dataset.action === "recuse-investigation") {
    event.preventDefault();
    const item = (state.cache.investigations || []).find((row) => row.id === target.dataset.id);
    if (item) ihpOpenRecusalV2(item);
    return;
  }
  return ihpInvestigationBaseHandleClickV2(event);
};
