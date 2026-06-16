const IHP_INVESTIGATION_TRANSFER_PATCH_V1 = true;

function ihpInvestigationAssigneeProfileV1(item) {
  const rows = state.cache.members || state.cache.disciplineMembers || [];
  return rows.find((member) => member.id === item?.assigned_to) || null;
}

function ihpInvestigationCanTakeV1(item) {
  if (!item || ["cancelled", "closed"].includes(item.status)) return false;
  if (!item.assigned_to) return hasRole("super_admin", "discipline_chair", "discipline_vice_chair", "discipline_member");
  if (item.assigned_to === state.profile?.id) return false;
  if (hasRole("super_admin")) return true;
  const assignee = ihpInvestigationAssigneeProfileV1(item);
  if (!assignee) return hasRole("discipline_chair");
  const actorRank = disciplineRank(state.profile);
  const assigneeRank = disciplineRank(assignee);
  return actorRank > 0 && assigneeRank > 0 && actorRank > assigneeRank;
}

function ihpInvestigationTransferTargetsV1(item) {
  if (!item || ["cancelled", "closed"].includes(item.status)) return [];
  const actorRank = disciplineRank(state.profile);
  if (!hasRole("super_admin") && actorRank < 2) return [];
  if (item.assigned_to && item.assigned_to !== state.profile?.id && !ihpInvestigationCanTakeV1(item)) return [];
  const rows = state.cache.members || state.cache.disciplineMembers || [];
  return visibleProfiles(rows)
    .filter((member) => member.id !== state.profile?.id && member.id !== item.assigned_to)
    .filter((member) => member.status === "active")
    .filter((member) => {
      const rank = disciplineRank(member);
      if (rank <= 0) return false;
      if (hasRole("super_admin")) return !rolesOf(member).includes("super_admin");
      return actorRank > rank;
    })
    .sort((a, b) => disciplineRank(b) - disciplineRank(a) || a.display_name.localeCompare(b.display_name, "tr"));
}

function ihpInvestigationCanTransferV1(item) {
  return ihpInvestigationTransferTargetsV1(item).length > 0;
}

function ihpInvestigationCanCloseV1(item, status = "closed") {
  if (!item || ["cancelled", "closed"].includes(item.status)) return false;
  if (item.assigned_to !== state.profile?.id) return false;
  if (status === "cancelled") return hasRole("super_admin", "discipline_chair");
  return hasRole("super_admin", "discipline_chair", "discipline_vice_chair", "discipline_member");
}

investigationActions = function patchedInvestigationActions(item) {
  const buttons = [];
  if (!item) return "";
  if (hasRole("super_admin")) {
    buttons.push(`<button class="table-action" type="button" data-action="edit-investigation" data-id="${esc(item.id)}">Düzenle</button>`);
    buttons.push(`<button class="table-action danger-action" type="button" data-action="delete-investigation" data-id="${esc(item.id)}">Sil</button>`);
  }
  if (["cancelled", "closed"].includes(item.status)) {
    return buttons.length ? `<div class="inline-actions">${buttons.join("")}</div>` : "";
  }
  if (!item.assigned_to || ihpInvestigationCanTakeV1(item)) {
    buttons.push(`<button class="table-action" type="button" data-action="claim-investigation" data-id="${esc(item.id)}">${item.assigned_to ? "Sorumluluğu devral" : "Sorumluluğu al"}</button>`);
  }
  if (ihpInvestigationCanTransferV1(item)) {
    buttons.push(`<button class="table-action" type="button" data-action="transfer-investigation" data-id="${esc(item.id)}">Devret</button>`);
  }
  if (ihpInvestigationCanCloseV1(item, "closed")) {
    buttons.push(`<button class="table-action" type="button" data-action="open-investigation-review" data-id="${esc(item.id)}" data-status="closed">Kapat</button>`);
  }
  if (ihpInvestigationCanCloseV1(item, "cancelled")) {
    buttons.push(`<button class="table-action danger-action" type="button" data-action="open-investigation-review" data-id="${esc(item.id)}" data-status="cancelled">İptal et</button>`);
  }
  return buttons.length ? `<div class="inline-actions">${buttons.join("")}</div>` : "";
};

openInvestigationReview = function patchedOpenInvestigationReview(item, status) {
  if (!ihpInvestigationCanCloseV1(item, status)) {
    showToast("Bu işlem için önce soruşturma sorumluluğunu devralmalısınız.", "error");
    return;
  }
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
        <p class="security-note">Soruşturma ancak sorumluluğu sizdeyken kapatılabilir veya iptal edilebilir.</p>
        <div class="modal-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button><button class="btn btn-primary btn-sm" type="submit">Kaydet</button></div>
      </form>
    `
  });
};

function ihpOpenInvestigationTransferV1(item) {
  const targets = ihpInvestigationTransferTargetsV1(item);
  if (!targets.length) {
    showToast("Devredilebilecek alt rütbeli DK personeli bulunamadı.", "error");
    return;
  }
  modal({
    title: "Soruşturmayı devret",
    subtitle: "Sorumluluk yalnızca DK hiyerarşisinde alt rütbeye devredilebilir.",
    body: `
      <form class="form-stack" data-form="investigation-transfer" data-id="${esc(item.id)}">
        <div class="setup-box">
          <strong>${esc(item.title)}</strong>
          <p class="security-note">Mevcut sorumlu: ${esc(item.assignee?.display_name || "Henüz alınmadı")}</p>
        </div>
        <div class="form-group">
          <label for="investigation-transfer-assignee">Devredilecek DK personeli</label>
          <select class="field" id="investigation-transfer-assignee" name="assignedTo" required>
            <option value="">Seçin</option>
            ${targets.map((member) => `<option value="${esc(member.id)}">${esc(member.display_name)} · ${esc(disciplineRankLabel(member))}</option>`).join("")}
          </select>
        </div>
        <div class="form-group"><label for="investigation-transfer-note">Devir notu</label><textarea class="field" id="investigation-transfer-note" name="decisionNote" maxlength="900" placeholder="Sorumluluk devri nedeni veya kısa not."></textarea></div>
        <div class="modal-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button><button class="btn btn-primary btn-sm" type="submit">Devret</button></div>
      </form>
    `
  });
}

const ihpInvestigationBaseSubmitFormV1 = submitForm;
submitForm = async function patchedInvestigationSubmitForm(event) {
  const form = event.target.closest("form[data-form]");
  if (!form || form.dataset.form !== "investigation-transfer") {
    return ihpInvestigationBaseSubmitFormV1(event);
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

const ihpInvestigationBaseHandleClickV1 = handleClick;
handleClick = async function patchedInvestigationHandleClick(event) {
  const target = event.target.closest("[data-action]");
  if (target?.dataset.action === "transfer-investigation") {
    event.preventDefault();
    const item = (state.cache.investigations || []).find((row) => row.id === target.dataset.id);
    if (item) ihpOpenInvestigationTransferV1(item);
    return;
  }
  return ihpInvestigationBaseHandleClickV1(event);
};
