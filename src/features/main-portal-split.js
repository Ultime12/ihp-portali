const IHP_MAIN_PORTAL_SPLIT_V1 = true;
globalThis.__IHP_MAIN_PORTAL_OWN_DATA__ = true;
const MAIN_DISCIPLINE_PAGES = new Set([
  "discipline-operations",
  "discipline-council",
  "discipline",
  "investigations"
]);
const MAIN_FINANCE_PAGES = new Set([
  "credit",
  "finance",
  "credit-management"
]);

for (let index = navItems.length - 1; index >= 0; index -= 1) {
  if (MAIN_DISCIPLINE_PAGES.has(navItems[index][0]) || MAIN_FINANCE_PAGES.has(navItems[index][0])) navItems.splice(index, 1);
}

permissions.disciplineView = () => false;
permissions.disciplineManage = () => false;
permissions.disciplineCouncil = () => false;

const mainBaseCanReviewApplication = canReviewApplication;
canReviewApplication = function mainCanReviewApplication(item) {
  if (targetCommitteeName(item) === "Disiplin Kurulu") return false;
  return mainBaseCanReviewApplication(item);
};

canHandleComplaint = () => false;
canClaimComplaint = () => false;
complaintActions = () => "";

complaintsPage = function mainComplaintsPage() {
  const rows = (state.cache.complaints || []).filter(
    (item) => item.complainant_profile_id === state.profile?.id
  );
  return `
    ${pageHeader(
      "Şikayetlerim",
      "Disiplin kuruluna güvenli bildirim",
      "Şikayetinizi bu alandan iletebilirsiniz. İnceleme ve karar işlemleri bağımsız Disiplin Kurulu sisteminde yürütülür.",
      isTechnicalSuperAdmin() ? "" : `<button class="btn btn-primary btn-sm" type="button" data-action="open-complaint">${icon("plus")} Şikayet Yaz</button>`
    )}
    <div class="card-grid application-grid">
      ${
        rows.length
          ? rows.map((item) => `
              <article class="entity-card glass application-card">
                <div class="entity-top">
                  ${badge(complaintTargetLabel(item), "blue")}
                  ${badgeForStatus(item.status)}
                </div>
                <h3 style="margin-top:.85rem">${esc(item.subject)}</h3>
                <p>${esc(item.description || "Açıklama eklenmedi.")}</p>
                <div class="meta-list">
                  <div class="meta-row"><span>Öncelik</span><strong>${esc(priorityLabel(item.priority || "normal"))}</strong></div>
                  <div class="meta-row"><span>Sorumlu</span><strong>${esc(item.assignee?.display_name || "Henüz alınmadı")}</strong></div>
                  <div class="meta-row"><span>Karar notu</span><strong>${esc(item.decision_note || "Henüz karar yok")}</strong></div>
                  <div class="meta-row meta-row-stack"><span>Dosya ekleri</span>${caseAttachmentsMarkup(item)}</div>
                  <div class="meta-row"><span>Tarih</span><strong>${formatDate(item.created_at, true)}</strong></div>
                </div>
              </article>
            `).join("")
          : emptyCard("Henüz şikayetiniz yok", "Yeni bir bildirim oluşturduğunuzda süreç burada görünecek.")
      }
    </div>
  `;
};
