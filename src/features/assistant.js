const IHP_ASSISTANT_V1 = true;

function canUseIhpAssistant() {
  return Boolean(
    state.profile &&
    state.profile.status === "active" &&
    !state.profile.is_system_account &&
    !(typeof isEntryAccessAccount === "function" && isEntryAccessAccount())
  );
}

function ihpAssistantState() {
  if (!state.cache.ihpAssistantUi) {
    state.cache.ihpAssistantUi = {
      open: false,
      loading: false,
      sending: false,
      error: "",
      data: null,
      pendingQuestion: ""
    };
  }
  return state.cache.ihpAssistantUi;
}

function scrollIhpAssistantToBottom({ focus = false } = {}) {
  const apply = () => {
    const messages = document.querySelector("[data-assistant-messages]");
    if (messages) messages.scrollTop = messages.scrollHeight;
    if (focus) document.querySelector("[data-assistant-input]")?.focus();
  };
  requestAnimationFrame(() => {
    apply();
    requestAnimationFrame(apply);
    setTimeout(apply, 90);
  });
}

function assistantCredit(value) {
  return `${Number(value || 0).toLocaleString("tr-TR")} kredi`;
}

function assistantDate(value) {
  if (!value) return "";
  return formatDate(value, true);
}

function assistantText(value = "") {
  return esc(value).replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>");
}

function assistantSourceMarkup(sources = []) {
  if (!Array.isArray(sources) || !sources.length) return "";
  return `
    <div class="ihp-assistant-sources" aria-label="Yanıt kaynakları">
      ${sources.slice(0, 5).map((source) => `<span title="${esc(source.title)}">${esc(source.id)} · ${esc(source.title.replace(/^(Yönetmelik|Duyuru):\s*/i, ""))}</span>`).join("")}
    </div>
  `;
}

function assistantMessageMarkup(item) {
  const charged = Number(item.charged_amount || 0);
  return `
    <article class="ihp-assistant-turn">
      <div class="ihp-assistant-message user">
        <span>${avatar(state.profile)}</span>
        <div><p>${assistantText(item.question)}</p></div>
      </div>
      <div class="ihp-assistant-message assistant">
        <span class="ihp-assistant-orb">İHP</span>
        <div>
          <p>${assistantText(item.answer)}</p>
          ${assistantSourceMarkup(item.sources)}
          <small>${charged ? assistantCredit(charged) : "Haftalık paket"} · ${assistantDate(item.created_at)}</small>
        </div>
      </div>
    </article>
  `;
}

function assistantLoadingMarkup(question) {
  return `
    <article class="ihp-assistant-turn">
      <div class="ihp-assistant-message user">
        <span>${avatar(state.profile)}</span>
        <div><p>${assistantText(question)}</p></div>
      </div>
      <div class="ihp-assistant-message assistant thinking">
        <span class="ihp-assistant-orb">İHP</span>
        <div><i></i><i></i><i></i><small>Portal kayıtları inceleniyor</small></div>
      </div>
    </article>
  `;
}

function assistantWelcomeMarkup() {
  return `
    <section class="ihp-assistant-welcome">
      <span class="ihp-assistant-welcome-mark">İHP</span>
      <h3>Merhaba, ${esc((state.profile?.display_name || "Üye").split(" ")[0])}.</h3>
      <p>Yönetmelikler, kurullar, görevler, duyurular, kararlar ve seçimler hakkında portal kayıtlarına dayanarak yardımcı olabilirim.</p>
      <div class="ihp-assistant-suggestions">
        <button type="button" data-assistant-prompt="Partinin temel ilkeleri nelerdir?">Temel ilkeler</button>
        <button type="button" data-assistant-prompt="Aktif kurulları ve görevlerini özetle.">Kurullar</button>
        <button type="button" data-assistant-prompt="Benim portal görevlerim nelerdir?">Görevlerim</button>
      </div>
    </section>
  `;
}

function assistantReadyContent(ui) {
  const data = ui.data || {};
  const settings = data.settings || {};
  const account = data.account;
  const subscription = data.subscription;
  const history = Array.isArray(data.history) ? data.history : [];
  const perMessage = Number(settings.per_message_cost ?? 10000);
  const weekly = Number(settings.weekly_cost ?? 250000);
  const maxChars = Number(settings.max_input_chars || 2000);

  if (!data.configured) {
    return `
      <div class="ihp-assistant-state">
        ${icon("info")}
        <strong>Asistan bağlantısı hazırlanıyor</strong>
        <p>Gemini sunucu bağlantısı henüz etkin görünmüyor. Yeni deployment tamamlandığında tekrar deneyin.</p>
      </div>
    `;
  }

  if (!settings.enabled) {
    return `
      <div class="ihp-assistant-state">
        ${icon("info")}
        <strong>Asistan geçici olarak kapalı</strong>
        <p>Admin yeniden etkinleştirdiğinde buradan kullanabilirsiniz.</p>
      </div>
    `;
  }

  if (!account) {
    return `
      <div class="ihp-assistant-state">
        ${icon("wallet")}
        <strong>Aktif kredi hesabı gerekli</strong>
        <p>Mesaj ücretleri İHP Kredi hesabından güvenli biçimde tahsil edilir.</p>
        <button class="btn btn-primary btn-sm" type="button" data-page="credit">Kredi hesabına git</button>
      </div>
    `;
  }

  return `
    <div class="ihp-assistant-planbar">
      <div>
        <span>Kullanılabilir bakiye</span>
        <strong>${assistantCredit(account.balance)}</strong>
      </div>
      ${subscription
        ? `<span class="ihp-assistant-plan active">${icon("check")} Paket ${assistantDate(subscription.valid_until)} tarihine kadar aktif</span>`
        : `<button class="ihp-assistant-plan" type="button" data-action="assistant-weekly">${icon("sparkles")} 7 gün · ${assistantCredit(weekly)}</button>`}
    </div>
    <div class="ihp-assistant-messages" data-assistant-messages>
      ${history.length ? history.map(assistantMessageMarkup).join("") : assistantWelcomeMarkup()}
      ${ui.sending && ui.pendingQuestion ? assistantLoadingMarkup(ui.pendingQuestion) : ""}
    </div>
    <form class="ihp-assistant-compose" data-form="assistant-message">
      <textarea
        aria-label="İHP Asistana mesaj"
        data-assistant-input
        maxlength="${maxChars}"
        rows="1"
        placeholder="İHP hakkında bir şey sorun..."
        ${ui.sending ? "disabled" : ""}
      ></textarea>
      <button type="submit" aria-label="Mesajı gönder" ${ui.sending ? "disabled" : ""}>${icon("arrow")}</button>
    </form>
    <div class="ihp-assistant-payment-note">
      ${subscription
        ? `<span>${icon("check")} Bu konuşma haftalık pakete dahil.</span>`
        : `<span>Her başarılı mesaj ${assistantCredit(perMessage)}. Hata olursa otomatik iade edilir.</span>`}
      <span>Günlük sohbet geçmişi her gece yenilenir.</span>
    </div>
  `;
}

function assistantPanelMarkup(ui) {
  return `
    <section class="ihp-assistant-panel ${ui.open ? "open" : ""}" role="dialog" aria-modal="false" aria-label="İHP Dijital Asistan" aria-hidden="${ui.open ? "false" : "true"}">
      <header class="ihp-assistant-head">
        <div class="ihp-assistant-title">
          <span class="ihp-assistant-orb">İHP</span>
          <div><strong>İHP Dijital Asistan</strong><small><i></i> Portal bilgisiyle çalışan yardımcı</small></div>
        </div>
        <div class="ihp-assistant-head-actions">
          ${hasRole("super_admin") && ui.data?.settings ? `<button class="icon-btn" type="button" data-action="assistant-settings" aria-label="Asistan ayarları">${icon("settings")}</button>` : ""}
          <button class="icon-btn" type="button" data-action="assistant-close" aria-label="Asistanı kapat">${icon("x")}</button>
        </div>
      </header>
      <div class="ihp-assistant-body">
        ${ui.loading
          ? `<div class="ihp-assistant-state loading"><span class="ihp-assistant-loader"></span><strong>Asistan hazırlanıyor</strong><p>Kredi hesabınız ve portal bilgileri kontrol ediliyor.</p></div>`
          : ui.error
            ? `<div class="ihp-assistant-state">${icon("info")}<strong>Bağlantı kurulamadı</strong><p>${esc(ui.error)}</p><button class="btn btn-secondary btn-sm" type="button" data-action="assistant-retry">Tekrar dene</button></div>`
            : assistantReadyContent(ui)}
      </div>
    </section>
  `;
}

function assistantWidget() {
  if (!canUseIhpAssistant()) return "";
  const ui = ihpAssistantState();
  return `
    <div class="ihp-assistant-widget ${ui.open ? "is-open" : ""}">
      ${assistantPanelMarkup(ui)}
      <button
        class="ihp-assistant-launcher"
        type="button"
        data-action="assistant-toggle"
        aria-label="${ui.open ? "İHP Dijital Asistanı kapat" : "İHP Dijital Asistanı aç"}"
        aria-expanded="${ui.open ? "true" : "false"}"
      >
        <span>İHP</span>
        <b>Asistan</b>
        <i></i>
      </button>
    </div>
  `;
}

async function loadIhpAssistant() {
  const ui = ihpAssistantState();
  ui.loading = true;
  ui.error = "";
  render();
  try {
    ui.data = await portalServerRequest("/api/manage-member", { module: "assistant", action: "status" });
  } catch (error) {
    ui.error = error.message;
  } finally {
    ui.loading = false;
    render();
    scrollIhpAssistantToBottom({ focus: true });
  }
}

const ihpAssistantBasePortalShell = portalShell;
portalShell = function ihpAssistantPortalShell(page) {
  return `${ihpAssistantBasePortalShell(page)}${assistantWidget()}`;
};

const ihpAssistantBaseSubmitForm = submitForm;
submitForm = async function ihpAssistantSubmitForm(event) {
  const settingsForm = event.target.closest('form[data-form="assistant-settings"]');
  if (settingsForm) {
    event.preventDefault();
    if (!hasRole("super_admin")) return;
    const submit = settingsForm.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const ui = ihpAssistantState();
      ui.data = await portalServerRequest("/api/manage-member", {
        module: "assistant",
        action: "update_settings",
        enabled: Boolean(settingsForm.querySelector("[data-assistant-enabled]")?.checked),
        perMessageCost: Number(settingsForm.querySelector("[data-assistant-message-cost]")?.value),
        weeklyCost: Number(settingsForm.querySelector("[data-assistant-weekly-cost]")?.value),
        maxInputChars: Number(settingsForm.querySelector("[data-assistant-max-input]")?.value),
        maxOutputTokens: Number(settingsForm.querySelector("[data-assistant-max-output]")?.value)
      });
      closeModal();
      showToast("İHP Dijital Asistan paketleri güncellendi.", "success");
      render();
    } catch (error) {
      showToast(error.message, "error");
      if (submit) submit.disabled = false;
    }
    return;
  }

  const form = event.target.closest('form[data-form="assistant-message"]');
  if (!form) return ihpAssistantBaseSubmitForm(event);
  event.preventDefault();
  const ui = ihpAssistantState();
  if (ui.sending) return;
  const input = form.querySelector("[data-assistant-input]");
  const message = input?.value.trim() || "";
  if (message.length < 2) {
    showToast("Lütfen en az 2 karakterlik bir mesaj yazın.", "error");
    return;
  }
  ui.sending = true;
  ui.pendingQuestion = message;
  if (input) input.value = "";
  render();
  scrollIhpAssistantToBottom();
  try {
    ui.data = await portalServerRequest("/api/manage-member", {
      module: "assistant",
      action: "message",
      message
    });
    ui.error = "";
  } catch (error) {
    showToast(error.message, "error");
    try {
      ui.data = await portalServerRequest("/api/manage-member", { module: "assistant", action: "status" });
    } catch {
      // The original error is already visible to the member.
    }
  } finally {
    ui.sending = false;
    ui.pendingQuestion = "";
    render();
    scrollIhpAssistantToBottom({ focus: true });
  }
};

const ihpAssistantBaseHandleClick = handleClick;
handleClick = async function ihpAssistantHandleClick(event) {
  const target = event.target.closest("[data-action], [data-assistant-prompt]");
  if (target?.dataset.assistantPrompt) {
    event.preventDefault();
    const input = document.querySelector("[data-assistant-input]");
    if (input) {
      input.value = target.dataset.assistantPrompt;
      input.focus();
    }
    return;
  }

  const action = target?.dataset.action;
  if (action === "assistant-toggle") {
    event.preventDefault();
    const ui = ihpAssistantState();
    ui.open = !ui.open;
    render();
    if (ui.open) {
      scrollIhpAssistantToBottom({ focus: true });
      if (!ui.data && !ui.loading) await loadIhpAssistant();
      scrollIhpAssistantToBottom({ focus: true });
    }
    return;
  }
  if (action === "assistant-close") {
    event.preventDefault();
    ihpAssistantState().open = false;
    render();
    return;
  }
  if (action === "assistant-retry") {
    event.preventDefault();
    await loadIhpAssistant();
    return;
  }
  if (action === "assistant-settings") {
    event.preventDefault();
    if (!hasRole("super_admin")) return;
    const settings = ihpAssistantState().data?.settings || {};
    modal({
      title: "Dijital Asistan ayarları",
      subtitle: "Paketler ve kullanım sınırları",
      body: `
        <form class="form-stack" data-form="assistant-settings">
          <label class="setting-row assistant-enabled-setting">
            <span><strong>Asistan kullanımı</strong><small>Tüm üyeler için sistemi aç veya kapat</small></span>
            <input type="checkbox" data-assistant-enabled ${settings.enabled ? "checked" : ""} />
          </label>
          <div class="form-grid">
            <label>Mesaj başına ücret
              <input class="field" data-assistant-message-cost type="number" min="0" max="9007199254740991" step="1" value="${Number(settings.per_message_cost ?? 10000)}" required />
            </label>
            <label>7 günlük paket
              <input class="field" data-assistant-weekly-cost type="number" min="0" max="9007199254740991" step="1" value="${Number(settings.weekly_cost ?? 250000)}" required />
            </label>
          </div>
          <div class="form-grid">
            <label>En uzun kullanıcı mesajı
              <input class="field" data-assistant-max-input type="number" min="100" max="6000" step="100" value="${Number(settings.max_input_chars || 2000)}" required />
            </label>
            <label>En uzun asistan cevabı
              <input class="field" data-assistant-max-output type="number" min="400" max="8000" step="100" value="${Number(settings.max_output_tokens || 6000)}" required />
            </label>
          </div>
          <div class="modal-actions">
            <button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button>
            <button class="btn btn-primary btn-sm" type="submit">Ayarları kaydet</button>
          </div>
        </form>
      `
    });
    return;
  }
  if (action === "assistant-weekly") {
    event.preventDefault();
    const ui = ihpAssistantState();
    const weeklyCost = Number(ui.data?.settings?.weekly_cost ?? 250000);
    confirmModal(
      "Haftalık asistan paketini aç",
      `${assistantCredit(weeklyCost)} bakiyenizden kesilir ve paket 7 gün boyunca etkin olur. Bu ödeme tamamlandıktan sonra geri alınamaz.`,
      async () => {
        const confirmButton = modalRoot.querySelector('[data-action="confirm-action"]');
        if (confirmButton) confirmButton.disabled = true;
        try {
          ui.data = await portalServerRequest("/api/manage-member", { module: "assistant", action: "subscribe_weekly" });
          closeModal();
          showToast("İHP Dijital Asistan haftalık paketiniz etkinleştirildi.", "success");
          render();
        } catch (error) {
          showToast(error.message, "error");
          if (confirmButton) confirmButton.disabled = false;
        }
      }
    );
    return;
  }
  return ihpAssistantBaseHandleClick(event);
};

document.addEventListener("keydown", (event) => {
  const input = event.target.closest?.("[data-assistant-input]");
  if (!input || event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  input.form?.requestSubmit();
});
