const IHP_WHATSAPP_NOTIFICATIONS_PATCH_V1 = true;

function whatsappEnsureStyles() {
  if (document.getElementById("ihp-whatsapp-notifications-styles")) return;
  const style = document.createElement("style");
  style.id = "ihp-whatsapp-notifications-styles";
  style.textContent = `
    .whatsapp-panel { border-color: rgba(37, 211, 102, .22); background: linear-gradient(145deg, rgba(37,211,102,.08), rgba(255,255,255,.04)); }
    .whatsapp-status { display: inline-flex; align-items: center; gap: .45rem; color: var(--muted); font-size: .9rem; line-height: 1.45; }
    .whatsapp-status strong { color: var(--text); }
    .whatsapp-switch { display: flex; align-items: center; gap: .65rem; padding: .8rem .9rem; border: 1px solid rgba(255,255,255,.12); border-radius: 1rem; background: rgba(255,255,255,.05); cursor: pointer; }
    .whatsapp-switch input { width: 18px; height: 18px; accent-color: #25d366; }
    .whatsapp-help { color: var(--muted); font-size: .86rem; line-height: 1.5; margin: -.25rem 0 0; }
  `;
  document.head.append(style);
}

function whatsappNormalizePhone(value = "") {
  const digits = String(value || "").replace(/[^\d]/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) return `90${digits.slice(1)}`;
  return digits;
}

function whatsappPhoneLooksValid(value = "") {
  return /^[1-9]\d{9,14}$/.test(value);
}

const whatsappBaseSettingsPage = settingsPage;
settingsPage = function patchedWhatsappSettingsPage() {
  whatsappEnsureStyles();
  const base = whatsappBaseSettingsPage();
  if (!state.profile || (typeof isSystemProfile === "function" && isSystemProfile(state.profile))) return base;
  const phone = state.profile.whatsapp_phone || "";
  const enabled = state.profile.whatsapp_notifications_enabled === true;
  return `
    ${base}
    <section class="panel glass whatsapp-panel" style="margin-top:.85rem">
      <div class="panel-head">
        <h3>WhatsApp bildirimleri</h3>
        <span>Gizli bildirim modu</span>
      </div>
      <form class="form-stack" data-form="whatsapp-settings">
        <div class="setting-row">
          <div>
            <strong>${enabled ? "WhatsApp bildirimi açık" : "WhatsApp bildirimi kapalı"}</strong>
            <span>Mesajda ceza, başvuru veya anlaşma detayı yazmaz; sadece portalda yeni bildirim olduğunu söyler.</span>
          </div>
          ${badge(enabled ? "Açık" : "Kapalı", enabled ? "green" : "blue")}
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label for="whatsapp-phone">WhatsApp numarası</label>
            <input class="field" id="whatsapp-phone" name="whatsappPhone" value="${esc(phone)}" placeholder="905551112233" inputmode="numeric" maxlength="16" />
          </div>
          <div class="form-group">
            <label>Bildirim izni</label>
            <label class="whatsapp-switch">
              <input type="checkbox" name="whatsappEnabled" value="yes" ${enabled ? "checked" : ""} />
              <span>WhatsApp bildirimlerini aç</span>
            </label>
          </div>
        </div>
        <p class="whatsapp-help">Numarayı ülke koduyla yaz: Türkiye için örnek <strong>905551112233</strong>. Başında + veya boşluk olmasa daha temiz çalışır.</p>
        <button class="btn btn-primary btn-sm" type="submit">WhatsApp ayarını kaydet</button>
      </form>
    </section>
  `;
};

const whatsappBaseSubmitForm = submitForm;
submitForm = async function patchedWhatsappSubmitForm(event) {
  const form = event.target.closest('form[data-form="whatsapp-settings"]');
  if (!form) return whatsappBaseSubmitForm(event);

  event.preventDefault();
  const submit = form.querySelector('[type="submit"]');
  if (submit) submit.disabled = true;

  try {
    const values = formData(form);
    const enabled = form.querySelector('[name="whatsappEnabled"]')?.checked === true;
    const phone = whatsappNormalizePhone(values.whatsappPhone);
    if (enabled && !whatsappPhoneLooksValid(phone)) {
      throw new Error("WhatsApp numarasını ülke koduyla yazmalısın. Örnek: 905551112233");
    }

    await updateRecord("profiles", state.profile.id, {
      whatsapp_phone: phone || null,
      whatsapp_notifications_enabled: enabled
    });
    state.profile = await getProfile();
    showToast(enabled ? "WhatsApp bildirimleri açıldı." : "WhatsApp bildirimleri kapatıldı.");
    await loadPage("settings");
  } catch (error) {
    showToast(error.message || "WhatsApp ayarı kaydedilemedi.");
  } finally {
    if (submit) submit.disabled = false;
  }
};
