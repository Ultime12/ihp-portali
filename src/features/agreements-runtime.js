const IHP_AGREEMENTS_RUNTIME_PATCH_V2 = true;

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
  if (category === "governance") return "Yürütme Kurulu";
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
    const [notifications, agreements, delegations, members, committees] = await Promise.all([
      loadNotifications().catch(() => state.cache.notifications || []),
      loadAgreementsLocal(),
      loadAgreementDelegationsLocal(),
      loadMembers(),
      loadCommittees()
    ]);
    state.cache.notifications = notifications;
    state.cache.agreements = agreements;
    state.cache.agreementBadge = agreements;
    state.cache.agreementDelegations = delegations;
    state.cache.members = members;
    state.cache.committees = committees;
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
  if (!form || !["agreement", "agreement-decision", "agreement-delegation"].includes(form.dataset.form)) {
    return agreementsBaseSubmitForm(event);
  }
  event.preventDefault();
  const values = formData(form);
  const submit = form.querySelector('[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    if (form.dataset.form === "agreement") {
      if (!String(values.body || "").trim() && !values.fileData) {
        throw new Error("Antlaşma için metin yazın veya dosya ekleyin.");
      }
      if (values.fileData && !agreementFileAllowed(values.fileName, values.fileData)) {
        throw new Error("Antlaşma dosyası PDF, DOC veya DOCX olmalıdır.");
      }
      await agreementAction({
        action: "create",
        title: values.title,
        targetType: values.targetType,
        targetProfileId: values.targetProfileId || null,
        scope: values.scope,
        requiresExecutiveApproval: values.requiresExecutiveApproval === "on",
        purpose: values.purpose,
        obligations: values.obligations,
        effectiveAt: values.effectiveAt,
        expiresAt: values.expiresAt || null,
        body: values.body || "",
        fileName: values.fileName || "",
        fileMime: agreementFileMime(values.fileData || ""),
        fileData: values.fileData || ""
      });
      showToast("Antlaşma yetkili imza akışına gönderildi.");
    } else if (form.dataset.form === "agreement-decision") {
      const result = await agreementAction({
        action: "decide",
        id: form.dataset.id,
        decision: form.dataset.status,
        decisionNote: values.decisionNote || ""
      });
      showToast(result.proposal ? "Antlaşma imzalandı ve Yürütme Kurulu onayına gönderildi." : form.dataset.status === "signed" ? "Antlaşma yürürlüğe girdi." : "Antlaşma reddedildi.");
    } else {
      await agreementAction({
        action: "delegate",
        delegateProfileId: values.delegateProfileId,
        authorityNote: values.authorityNote,
        endsAt: values.endsAt || null
      });
      showToast("Yazılı imza yetkisi kaydedildi.");
    }
    closeModal();
    await loadPage("agreements");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    if (submit) submit.disabled = false;
  }
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
    openAgreementDetail((state.cache.agreements || []).find((item) => item.id === target.dataset.id));
    return;
  }
  if (action === "open-agreement-decision") {
    event.preventDefault();
    openAgreementDecision(
      (state.cache.agreements || []).find((item) => item.id === target.dataset.id),
      target.dataset.status || "signed"
    );
    return;
  }
  if (action === "cancel-agreement") {
    event.preventDefault();
    const item = (state.cache.agreements || []).find((row) => row.id === target.dataset.id);
    if (!item || !agreementCanCancel(item)) return;
    confirmModal("Antlaşma geri çekilsin mi?", "İmza bekleyen kayıt iptal durumuna alınacak.", async () => {
      await agreementAction({ action: "cancel", id: item.id });
      closeModal();
      showToast("Antlaşma geri çekildi.");
      await loadPage("agreements");
    });
    return;
  }
  if (action === "revoke-agreement-delegation") {
    event.preventDefault();
    confirmModal("İmza yetkisi geri alınsın mı?", "Yönetici artık parti adına yeni antlaşma imzalayamayacak.", async () => {
      await agreementAction({ action: "revoke_delegate", id: target.dataset.id });
      closeModal();
      showToast("İmza yetkisi geri alındı.");
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
