const IHP_REGULATION_PDF_V1 = true;
const REGULATION_DOCUMENT_BUCKET = "regulation-documents";
const REGULATION_PDF_MAX_BYTES = 25 * 1024 * 1024;

function regulationPdfCanManage() {
  return hasRole("super_admin");
}

function regulationPdfUrl(item) {
  return state.cache.regulationPdfUrls?.[item.id]?.path === item.pdf_path
    ? state.cache.regulationPdfUrls[item.id].url
    : "";
}

function regulationStaticPdfUrl(path = "") {
  return String(path).startsWith("static:") ? String(path).slice(7) : "";
}

async function refreshRegulationPdfUrls(rows = state.cache.regulation || []) {
  const next = { ...(state.cache.regulationPdfUrls || {}) };
  await Promise.all(rows.map(async (item) => {
    if (!item.pdf_path) {
      delete next[item.id];
      return;
    }
    const staticUrl = regulationStaticPdfUrl(item.pdf_path);
    if (staticUrl) {
      next[item.id] = { path: item.pdf_path, url: staticUrl };
      return;
    }
    if (next[item.id]?.path === item.pdf_path && next[item.id]?.url) return;
    try {
      next[item.id] = {
        path: item.pdf_path,
        url: await createSignedStorageUrl(REGULATION_DOCUMENT_BUCKET, item.pdf_path, 3600)
      };
    } catch {
      next[item.id] = { path: item.pdf_path, url: "" };
    }
  }));
  state.cache.regulationPdfUrls = next;
}

function regulationPdfDocument(item) {
  const url = regulationPdfUrl(item);
  if (!item.pdf_path) {
    return regulationPdfCanManage()
      ? `<div class="regulation-pdf-empty"><span>${icon("book")}</span><div><strong>PDF belge eklenmedi</strong><p>Bu yönetmeliği sayfa düzeni korunmuş bir PDF olarak yayınlayabilirsiniz.</p></div><button class="btn btn-secondary btn-sm" type="button" data-action="open-regulation-pdf" data-id="${esc(item.id)}">${icon("paperclip")} PDF Yükle</button></div>`
      : "";
  }
  return `
    <section class="regulation-pdf-panel">
      <header>
        <div><span class="regulation-pdf-icon">PDF</span><span><strong>${esc(item.pdf_file_name || "Yönetmelik.pdf")}</strong><small>${item.pdf_uploaded_at ? `Yayınlanma: ${formatDate(item.pdf_uploaded_at, true)}` : "Yayınlanmış yönetmelik belgesi"}</small></span></div>
        <div class="inline-actions">
          ${url ? `<a class="table-action" href="${esc(url)}" target="_blank" rel="noopener">${icon("download")} Tam ekranda aç</a>` : `<button class="table-action" type="button" data-action="reload-regulation-pdf">Bağlantıyı yenile</button>`}
          ${regulationPdfCanManage() ? `<button class="table-action" type="button" data-action="open-regulation-pdf" data-id="${esc(item.id)}">Değiştir</button><button class="table-action danger-action" type="button" data-action="delete-regulation-pdf" data-id="${esc(item.id)}">Kaldır</button>` : ""}
        </div>
      </header>
      ${url
        ? `<div class="regulation-pdf-viewer"><iframe src="${esc(url)}#toolbar=1&navpanes=0&view=FitH" title="${esc(item.title)} PDF belgesi" loading="lazy"></iframe></div>`
        : `<div class="regulation-pdf-error">Belge bağlantısı şu anda oluşturulamadı.</div>`}
    </section>
  `;
}

regulationPage = function regulationPdfPage() {
  const rows = state.cache.regulation || [];
  const proposals = governanceData().proposals.filter((item) => item.proposal_type === "regulation_change");
  return `
    ${pageHeader(
      "Topluluk rehberi",
      "İHP Parti ve Topluluk Yönetmeliği",
      "Yürürlükteki metinleri okuyabilir, yayınlanmış PDF nüshalarını sayfa düzeniyle görüntüleyebilirsiniz.",
      canEditRegulations()
        ? `<button class="btn btn-primary btn-sm" type="button" data-action="open-regulation">${icon("plus")} Değişiklik Teklifi</button>`
        : ""
    )}
    ${proposals.length ? `<section class="panel glass" style="margin-bottom:.9rem"><div class="panel-head"><h3>Değişiklik kayıtları</h3><span>${proposals.length} teklif</span></div><div class="card-grid application-grid">${proposals.map(governanceProposalCard).join("")}</div></section>` : ""}
    <div class="accordion regulation-accordion">
      ${rows.length ? rows.map((item, index) => `
        <article class="accordion-item glass">
          <button class="accordion-btn" type="button" data-action="accordion"><span>${String(index + 1).padStart(2, "0")} · ${esc(item.title)}</span>${icon("chevron")}</button>
          <div class="accordion-content" ${index ? "hidden" : ""}>
            ${regulationPdfDocument(item)}
            <div class="regulation-body">${esc(item.content)}</div>
            ${canEditRegulations() ? `<div class="inline-actions"><button class="table-action" type="button" data-action="edit-regulation" data-id="${esc(item.id)}">Değişiklik teklif et</button></div>` : ""}
          </div>
        </article>
      `).join("") : emptyCard("Yönetmelik bölümü yok", "Yürütme Kurulu kararıyla ilk metin oluşturulabilir.")}
    </div>
  `;
};

function openRegulationPdfUpload(item) {
  if (!item || !regulationPdfCanManage()) return;
  modal({
    title: item.pdf_path ? "Yönetmelik PDF'ini değiştir" : "Yönetmelik PDF'i yükle",
    subtitle: item.title,
    body: `
      <form class="form-stack" data-form="regulation-pdf" data-id="${esc(item.id)}">
        <div class="regulation-upload-drop">
          ${icon("book")}
          <strong>PDF belgesini seçin</strong>
          <p>Dosya en fazla 25 MB olabilir. Yalnızca PDF kabul edilir.</p>
          <input class="field" type="file" name="pdf" accept="application/pdf,.pdf" required data-regulation-pdf-file />
          <small data-regulation-pdf-status>Henüz dosya seçilmedi.</small>
        </div>
        <div class="modal-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button><button class="btn btn-primary btn-sm" type="submit">Yükle ve Yayınla</button></div>
      </form>
    `
  });
}

function safeRegulationPdfName(value = "yonetmelik.pdf") {
  const base = String(value).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-140);
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}

const regulationPdfBaseHandleClick = handleClick;
handleClick = async function regulationPdfHandleClick(event) {
  const target = event.target.closest("[data-action]");
  const action = target?.dataset.action;
  if (action === "open-regulation-pdf") {
    event.preventDefault();
    openRegulationPdfUpload((state.cache.regulation || []).find((item) => item.id === target.dataset.id));
    return;
  }
  if (action === "reload-regulation-pdf") {
    event.preventDefault();
    state.cache.regulationPdfUrls = {};
    await refreshRegulationPdfUrls();
    render();
    return;
  }
  if (action === "delete-regulation-pdf") {
    event.preventDefault();
    const item = (state.cache.regulation || []).find((row) => row.id === target.dataset.id);
    if (!item || !regulationPdfCanManage()) return;
    confirmModal("PDF belge kaldırılsın mı?", "Yönetmelik metni korunur; yalnızca yayınlanmış PDF nüshası kaldırılır.", async () => {
      await updateRecord("regulations", item.id, {
        pdf_path: null,
        pdf_file_name: null,
        pdf_byte_size: null,
        pdf_uploaded_at: null,
        pdf_uploaded_by: null
      });
      if (item.pdf_path && !regulationStaticPdfUrl(item.pdf_path)) {
        await removeStorageObject(REGULATION_DOCUMENT_BUCKET, item.pdf_path).catch(() => undefined);
      }
      delete state.cache.regulationPdfUrls?.[item.id];
      closeModal();
      showToast("Yönetmelik PDF'i kaldırıldı.", "success");
      await loadPage("regulation");
    });
    return;
  }
  return regulationPdfBaseHandleClick(event);
};

const regulationPdfBaseHandleFilter = handleFilter;
handleFilter = async function regulationPdfHandleFilter(event) {
  const input = event.target.closest("[data-regulation-pdf-file]");
  if (!input) return regulationPdfBaseHandleFilter(event);
  const file = input.files?.[0];
  const status = input.parentElement?.querySelector("[data-regulation-pdf-status]");
  if (!file) {
    if (status) status.textContent = "Henüz dosya seçilmedi.";
    return;
  }
  if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf") || file.size < 1 || file.size > REGULATION_PDF_MAX_BYTES) {
    input.value = "";
    if (status) status.textContent = "Yalnızca 25 MB veya daha küçük PDF yükleyebilirsiniz.";
    showToast("Geçerli bir PDF dosyası seçin.", "error");
    return;
  }
  if (status) status.textContent = `${file.name} · ${(file.size / 1048576).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} MB`;
};

const regulationPdfBaseSubmitForm = submitForm;
submitForm = async function regulationPdfSubmitForm(event) {
  const form = event.target.closest('form[data-form="regulation-pdf"]');
  if (!form) return regulationPdfBaseSubmitForm(event);
  event.preventDefault();
  if (!regulationPdfCanManage()) return;
  const item = (state.cache.regulation || []).find((row) => row.id === form.dataset.id);
  const file = form.querySelector("[data-regulation-pdf-file]")?.files?.[0];
  if (!item || !file || file.type !== "application/pdf" || file.size > REGULATION_PDF_MAX_BYTES) {
    showToast("Geçerli bir PDF dosyası seçin.", "error");
    return;
  }
  const submit = form.querySelector('[type="submit"]');
  if (submit) { submit.disabled = true; submit.textContent = "Yükleniyor..."; }
  const objectPath = `${state.profile.id}/${item.id}/${Date.now()}-${safeRegulationPdfName(file.name)}`;
  try {
    await uploadStorageObject(REGULATION_DOCUMENT_BUCKET, objectPath, file, "application/pdf");
    try {
      await updateRecord("regulations", item.id, {
        pdf_path: objectPath,
        pdf_file_name: file.name.slice(0, 180),
        pdf_byte_size: file.size,
        pdf_uploaded_at: new Date().toISOString(),
        pdf_uploaded_by: state.profile.id
      });
    } catch (error) {
      await removeStorageObject(REGULATION_DOCUMENT_BUCKET, objectPath).catch(() => undefined);
      throw error;
    }
    if (item.pdf_path && !regulationStaticPdfUrl(item.pdf_path)) {
      await removeStorageObject(REGULATION_DOCUMENT_BUCKET, item.pdf_path).catch(() => undefined);
    }
    delete state.cache.regulationPdfUrls?.[item.id];
    closeModal();
    showToast("Yönetmelik PDF'i yayınlandı.", "success");
    await loadPage("regulation");
  } catch (error) {
    showToast(error.message, "error");
    if (submit) { submit.disabled = false; submit.textContent = "Yükle ve Yayınla"; }
  }
};

const regulationPdfBaseLoadPage = loadPage;
loadPage = async function regulationPdfLoadPage(page) {
  await regulationPdfBaseLoadPage(page);
  if (page !== "regulation") return;
  await refreshRegulationPdfUrls();
  render();
};
