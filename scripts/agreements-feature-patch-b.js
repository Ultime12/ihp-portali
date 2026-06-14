const IHP_AGREEMENTS_RUNTIME_PATCH_V1 = true;

function openAgreementDecision(item, status) {
  if (!item || !agreementCanSign(item)) return;
  const signed = status === "signed";
  modal({
    title: signed ? "Antlaşma imzalansın mı?" : "Antlaşma reddedilsin mi?",
    subtitle: `${agreementTargetLabel(item)} için karar.`,
    body: `
      <form class="form-stack" data-form="agreement-decision" data-id="${esc(item.id)}" data-status="${esc(status)}">
        <div class="setup-box">
          <strong>${esc(item.title)}</strong>
          <p class="security-note">${esc(item.proposer?.display_name || "Üye")} tarafından sunuldu. Hedef: ${esc(agreementTargetLabel(item))}</p>
        </div>
        <div class="agreement-detail-body">${esc(item.body || "Metin yerine dosya eklenmiş.")}</div>
        ${item.file_data ? `<a class="agreement-file-link" href="${esc(item.file_data)}" download="${esc(item.file_name || "ihp-antlasma-dosyasi")}">${icon("download")} ${esc(item.file_name || "Dosyayı aç")}</a>` : ""}
        <div class="form-group">
          <label for="agreement-decision-note">Karar notu</label>
          <textarea class="field" id="agreement-decision-note" name="decisionNote" maxlength="900" placeholder="${signed ? "İmzaya dair not ekleyebilirsiniz." : "Reddetme gerekçesini yazın."}"></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button>
          <button class="btn ${signed ? "btn-primary" : "btn-secondary"} btn-sm" type="submit">${signed ? "İmzala" : "Reddet"}</button>
        </div>
      </form>
    `
  });
}

function openAgreementDetail(item) {
  if (!item) return;
  modal({
    title: item.title,
    subtitle: `${agreementTargetLabel(item)} · ${statusLabel(item.status)}`,
    body: `
      <div class="meta-list">
        <div class="meta-row"><span>Sunan</span><strong>${esc(item.proposer?.display_name || "Üye")}</strong></div>
        <div class="meta-row"><span>Hedef</span><strong>${esc(agreementTargetLabel(item))}</strong></div>
        <div class="meta-row"><span>Durum</span><strong>${esc(agreementSignerLabel(item))}</strong></div>
        <div class="meta-row"><span>Karar notu</span><strong>${esc(item.decision_note || "Henüz yok")}</strong></div>
        <div class="meta-row"><span>Tarih</span><strong>${formatDate(item.created_at, true)}</strong></div>
      </div>
      <div class="agreement-detail-body" style="margin-top:.85rem">${esc(item.body || "Metin yerine dosya eklenmiş.")}</div>
      ${item.file_data ? `<div style="margin-top:.85rem"><a class="agreement-file-link" href="${esc(item.file_data)}" download="${esc(item.file_name || "ihp-antlasma-dosyasi")}">${icon("download")} ${esc(item.file_name || "Dosyayı aç")}</a></div>` : ""}
    `,
    actions: `<div class="modal-actions"><button class="btn btn-primary btn-sm" type="button" data-action="close-modal">Kapat</button></div>`
  });
}

function syncAgreementTarget(input) {
  if (!input) return;
  const group = document.querySelector("[data-agreement-member-group]");
  const memberSelect = document.querySelector("[data-agreement-member-select]");
  const isMember = input.value === "member";
  if (group) group.hidden = !isMember;
  if (memberSelect) memberSelect.required = isMember;
}

const agreementsBaseBadgeCountForNav = badgeCountForNav;
badgeCountForNav = function patchedAgreementsBadgeCountForNav(id) {
  if (id === "agreements") {
    const count = agreementPendingSignatureCount();
    return count ? String(count) : "";
  }
  return agreementsBaseBadgeCountForNav(id);
};

const agreementsBaseNotificationCategoryLabel = notificationCategoryLabel;
notificationCategoryLabel = function patchedAgreementNotificationCategoryLabel(category = "system") {
  if (category === "agreement") return "Antlaşma";
  return agreementsBaseNotificationCategoryLabel(category);
};

const agreementsBaseRenderPortalPage = renderPortalPage;
renderPortalPage = function patchedAgreementsRenderPortalPage(page) {
  if (page === "agreements") return agreementsPage();
  return agreementsBaseRenderPortalPage(page);
};

const agreementsBaseLoadPage = loadPage;
loadPage = async function patchedAgreementsLoadPage(page) {
  if (getSession()) {
    state.cache.agreementBadge = await loadAgreementsLocal().catch(() => state.cache.agreementBadge || []);
  }
  if (page !== "agreements") return agreementsBaseLoadPage(page);

  state.loading = true;
  render();
  try {
    const [notifications, agreements, members, committees] = await Promise.all([
      loadNotifications().catch(() => state.cache.notifications || []),
      loadAgreementsLocal(),
      loadMembers(),
      loadCommittees()
    ]);
    state.cache.notifications = notifications;
    state.cache.agreements = agreements;
    state.cache.agreementBadge = agreements;
    state.cache.members = members;
    state.cache.committees = committees;
    maybeCelebrateRewards();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    state.loading = false;
    render();
  }
};

const agreementsBaseSubmitForm = submitForm;
submitForm = async function patchedAgreementsSubmitForm(event) {
  const form = event.target.closest("form[data-form]");
  if (!form) return;

  if (form.dataset.form === "agreement") {
    event.preventDefault();
    const values = formData(form);
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      if (!String(values.body || "").trim() && !values.fileData) {
        throw new Error("Antlaşma için metin yazın veya dosya ekleyin.");
      }
      if (values.fileData && !agreementFileAllowed(values.fileName, values.fileData)) {
        throw new Error("Antlaşma dosyası PDF, DOC veya DOCX olmalıdır.");
      }
      if (values.targetType === "member" && !values.targetProfileId) {
        throw new Error("Antlaşma sunulacak üyeyi seçin.");
      }

      const payload = {
        title: values.title,
        body: values.body || "",
        proposer_id: state.profile.id,
        target_type: values.targetType || "member",
        target_profile_id: values.targetType === "member" ? values.targetProfileId : null,
        target_committee_id:
          values.targetType === "discipline"
            ? agreementCommitteeByName("Disiplin Kurulu")
            : values.targetType === "youth"
              ? agreementCommitteeByName("Gençlik Kolları")
              : null,
        file_name: values.fileName || "",
        file_mime: agreementFileMime(values.fileData || ""),
        file_data: values.fileData || "",
        status: "pending"
      };

      await agreementsRestRequest("agreements", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(payload)
      });
      showToast("Antlaşma imzaya sunuldu.");
      closeModal();
      await loadPage("agreements");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      if (submit) submit.disabled = false;
    }
    return;
  }

  if (form.dataset.form === "agreement-decision") {
    event.preventDefault();
    const values = formData(form);
    const status = form.dataset.status === "signed" ? "signed" : "rejected";
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const payload = {
        status,
        decision_note: values.decisionNote || ""
      };
      if (status === "signed") {
        payload.signed_by = state.profile.id;
        payload.signed_at = new Date().toISOString();
        payload.rejected_by = null;
        payload.rejected_at = null;
      } else {
        payload.rejected_by = state.profile.id;
        payload.rejected_at = new Date().toISOString();
        payload.signed_by = null;
        payload.signed_at = null;
      }
      await agreementsRestRequest(`agreements?id=eq.${encodeURIComponent(form.dataset.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(payload)
      });
      showToast(status === "signed" ? "Antlaşma imzalandı." : "Antlaşma reddedildi.");
      closeModal();
      await loadPage("agreements");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      if (submit) submit.disabled = false;
    }
    return;
  }

  return agreementsBaseSubmitForm(event);
};

const agreementsBaseHandleClick = handleClick;
handleClick = async function patchedAgreementsHandleClick(event) {
  const target = event.target.closest("[data-action]");
  const action = target?.dataset.action;

  if (action === "open-agreement") {
    event.preventDefault();
    openAgreement();
    return;
  }

  if (action === "view-agreement") {
    event.preventDefault();
    const item = (state.cache.agreements || []).find((row) => row.id === target.dataset.id);
    openAgreementDetail(item);
    return;
  }

  if (action === "open-agreement-decision") {
    event.preventDefault();
    const item = (state.cache.agreements || []).find((row) => row.id === target.dataset.id);
    openAgreementDecision(item, target.dataset.status || "signed");
    return;
  }

  if (action === "cancel-agreement") {
    event.preventDefault();
    const item = (state.cache.agreements || []).find((row) => row.id === target.dataset.id);
    if (!item || !agreementCanCancel(item)) return;
    confirmModal("Antlaşma iptal edilsin mi?", "İmzaya sunulan kayıt iptal durumuna alınacak.", async () => {
      await agreementsRestRequest(`agreements?id=eq.${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ status: "cancelled", decision_note: "Sunan kişi tarafından iptal edildi." })
      });
      closeModal();
      showToast("Antlaşma iptal edildi.");
      await loadPage("agreements");
    });
    return;
  }

  if (action === "delete-agreement") {
    event.preventDefault();
    const item = (state.cache.agreements || []).find((row) => row.id === target.dataset.id);
    if (!item || !agreementCanDelete(item)) return;
    confirmModal("Antlaşma kalıcı silinsin mi?", "Bu işlem antlaşma kaydını tamamen kaldırır.", async () => {
      await agreementsRestRequest(`agreements?id=eq.${encodeURIComponent(item.id)}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" }
      });
      closeModal();
      showToast("Antlaşma silindi.");
      await loadPage("agreements");
    });
    return;
  }

  return agreementsBaseHandleClick(event);
};

const agreementsBaseHandleFilter = handleFilter;
handleFilter = async function patchedAgreementsHandleFilter(event) {
  const agreementTarget = event.target.closest("[data-agreement-target-type]");
  if (agreementTarget) {
    syncAgreementTarget(agreementTarget);
    return;
  }
  return agreementsBaseHandleFilter(event);
};
