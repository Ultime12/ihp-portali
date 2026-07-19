const IHP_INVESTIGATION_TRANSFER_PATCH_V2 = true;

function ihpInvestigationAssigneeProfileV2(item) {
  const rows = state.cache.members || state.cache.disciplineMembers || [];
  return rows.find((member) => member.id === item?.assigned_to) || null;
}

function ihpInvestigationCanTakeV2(item) {
  if (!item || ["cancelled", "closed"].includes(item.status)) return false;
  if (item.subject_profile_id === state.profile?.id) return false;
  if (item.source_complaint?.complainant_profile_id === state.profile?.id) return false;
  if ((item.recused_profile_ids || []).includes(state.profile?.id)) return false;
  if (hasRole("super_admin")) return item.assigned_to !== state.profile?.id;
  if (!item.assigned_to) return hasRole("discipline_chair", "discipline_vice_chair", "discipline_member");
  if (item.assigned_to === state.profile?.id) return false;
  if (item.status === "open" && item.assigned_to === item.opened_by) {
    return hasRole("discipline_chair", "discipline_vice_chair", "discipline_member");
  }
  const assignee = ihpInvestigationAssigneeProfileV2(item);
  if (!assignee) return hasRole("discipline_chair");
  const actorRank = disciplineRank(state.profile);
  const assigneeRank = disciplineRank(assignee);
  return actorRank > 0 && assigneeRank > 0 && actorRank > assigneeRank;
}

function ihpInvestigationTransferTargetsV2(item) {
  if (!item || ["cancelled", "closed"].includes(item.status)) return [];
  const isAdmin = hasRole("super_admin");
  const actorRank = disciplineRank(state.profile);
  if (!isAdmin && actorRank < 2) return [];
  if (item.assigned_to && item.assigned_to !== state.profile?.id && !ihpInvestigationCanTakeV2(item)) return [];
  const rows = state.cache.members || state.cache.disciplineMembers || [];
  return visibleProfiles(rows)
    .filter((member) => member.id !== state.profile?.id && member.id !== item.assigned_to)
    .filter((member) => member.id !== item.subject_profile_id)
    .filter((member) => member.id !== item.source_complaint?.complainant_profile_id)
    .filter((member) => !(item.recused_profile_ids || []).includes(member.id))
    .filter((member) => member.status === "active")
    .filter((member) => {
      const rank = disciplineRank(member);
      return rank > 0 && (isAdmin || actorRank > rank);
    })
    .sort((a, b) => disciplineRank(b) - disciplineRank(a) || a.display_name.localeCompare(b.display_name, "tr"));
}

function ihpInvestigationCanTransferV2(item) {
  return ihpInvestigationTransferTargetsV2(item).length > 0;
}

function ihpInvestigationCanCloseV2(item, status = "closed") {
  if (!item || ["cancelled", "closed"].includes(item.status)) return false;
  if (hasRole("super_admin")) {
    return status === "cancelled" || (
      item.defense_status !== "pending" &&
      (!item.hearing_required || item.hearing_held_at)
    );
  }
  if (item.assigned_to !== state.profile?.id) return false;
  if (status === "cancelled") return hasRole("discipline_chair");
  if (item.defense_status === "pending") return false;
  if (item.hearing_required && !item.hearing_held_at) return false;
  return hasRole("discipline_chair", "discipline_vice_chair", "discipline_member");
}

function ihpDefenseStatusLabelV2(item) {
  return investigationDefenseStatusLabel(item);
}

investigationActions = function patchedInvestigationActions(item) {
  const buttons = [];
  if (!item) return "";
  if (hasRole("super_admin")) {
    buttons.push(`<button class="table-action" type="button" data-action="edit-investigation" data-id="${esc(item.id)}">Düzelt</button>`);
    if (item.regulation_version !== "2026-07-19") {
      buttons.push(`<button class="table-action danger-action" type="button" data-action="delete-investigation" data-id="${esc(item.id)}">Kalıcı sil</button>`);
    }
  }

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
  if (Number(item.extension_days || 0) === 0 && hasRole("super_admin", "discipline_chair")) {
    buttons.push(`<button class="table-action" type="button" data-action="open-investigation-extension" data-id="${esc(item.id)}">Süreyi uzat</button>`);
  }
  if (
    item.defense_status === "pending" &&
    !item.defense_extended_at &&
    (hasRole("super_admin", "discipline_chair") || item.assigned_to === state.profile?.id)
  ) {
    buttons.push(`<button class="table-action" type="button" data-action="open-defense-extension" data-id="${esc(item.id)}">Savunma ek süresi</button>`);
  }
  if ((hasRole("super_admin") || item.assigned_to === state.profile?.id) && !item.hearing_scheduled_at) {
    buttons.push(`<button class="table-action" type="button" data-action="open-hearing-schedule" data-id="${esc(item.id)}">Duruşma planla</button>`);
  }
  if ((hasRole("super_admin") || item.assigned_to === state.profile?.id) && item.hearing_scheduled_at && !item.hearing_held_at) {
    buttons.push(`<button class="table-action" type="button" data-action="open-hearing-complete" data-id="${esc(item.id)}">Duruşmayı kaydet</button>`);
  }
  if (ihpInvestigationCanCloseV2(item, "closed")) {
    buttons.push(`<button class="table-action" type="button" data-action="open-investigation-review" data-id="${esc(item.id)}" data-status="closed">Kapat</button>`);
  }
  if (ihpInvestigationCanCloseV2(item, "cancelled")) {
    buttons.push(`<button class="table-action danger-action" type="button" data-action="open-investigation-review" data-id="${esc(item.id)}" data-status="cancelled">İptal et</button>`);
  }
  return buttons.length ? `<div class="inline-actions">${buttons.join("")}</div>` : "";
};

openInvestigationReview = function patchedOpenInvestigationReview(item, status) {
  if (!ihpInvestigationCanCloseV2(item, status)) {
    showToast(
      item?.defense_status === "pending"
        ? "Savunma aşaması tamamlanmadan soruşturma kapatılamaz."
        : item?.hearing_required && !item?.hearing_held_at
          ? "Zorunlu duruşma tamamlanmadan soruşturma kapatılamaz."
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

function ihpOpenDefenseExtensionV2(item) {
  modal({
    title: "Savunma ek süresi",
    subtitle: "Doğrulanabilir mazeret varsa yalnızca bir kez ek süre verilebilir.",
    body: `
      <form class="form-stack" data-form="investigation-defense-extension" data-id="${esc(item.id)}">
        <div class="setup-box"><strong>${esc(item.case_number || item.title)}</strong><p class="security-note">Mevcut son tarih: ${formatDate(item.defense_due_at, true)}</p></div>
        <div class="form-group"><label for="investigation-defense-due-at">Yeni savunma son tarihi</label><input class="field" id="investigation-defense-due-at" name="defenseDueAt" type="datetime-local" required /></div>
        <div class="form-group"><label for="investigation-defense-extension-reason">Doğrulanabilir mazeret</label><textarea class="field" id="investigation-defense-extension-reason" name="decisionNote" required minlength="10" maxlength="2000"></textarea></div>
        <div class="modal-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button><button class="btn btn-primary btn-sm" type="submit">Ek süreyi kaydet</button></div>
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
    form?.dataset.form === "investigation-recusal" ||
    form?.dataset.form === "investigation-defense-extension"
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
          : form.dataset.form === "investigation-defense-extension"
            ? "extend_defense"
            : "recuse";
      await manageInvestigation({
        action,
        id: form.dataset.id,
        defenseText: values.defenseText || "",
        defenseDueAt: values.defenseDueAt || "",
        decisionNote: values.decisionNote || ""
      });
      showToast(
        action === "submit_defense"
          ? "Savunmanız dosyaya kaydedildi."
          : action === "close_defense"
            ? "Savunma aşaması kapatıldı."
            : action === "extend_defense"
              ? "Savunma ek süresi kaydedildi."
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
  if (target?.dataset.action === "open-defense-extension") {
    event.preventDefault();
    const item = (state.cache.investigations || []).find((row) => row.id === target.dataset.id);
    if (item) ihpOpenDefenseExtensionV2(item);
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
