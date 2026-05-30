import { getMyProfile } from "../auth.js";
import { createApplication, fetchApplications, updateApplicationStatus } from "../api.js";
import { canAtLeast, emptyState, escapeHtml, formatDate, getFormData, nl2br, statusBadge, toast, requireConfiguredNotice } from "../utils.js";
import { isSupabaseConfigured } from "../supabaseClient.js";

export async function init({ root }) {
  if (!isSupabaseConfigured) { root.innerHTML = requireConfiguredNotice(); return; }
  const profile = await getMyProfile();
  const canManage = canAtLeast(profile, "yonetici");
  root.innerHTML = `
    <section class="section" style="margin-top:0">
      <div class="section-header"><div><h1 style="font-size:42px">Başvuru Sistemi</h1><p>Yeni kişilerin başvuruları yönetici paneline düşer.</p></div></div>
      <div class="grid grid-2">
        <div class="card"><h2>Yeni başvuru</h2>${renderForm()}</div>
        <div class="card"><h2>Başvuru süreci</h2><p class="muted">Başvurular beklemede durumuyla kaydedilir. Yönetici incelemesinden sonra onaylanır veya reddedilir.</p><div class="timeline"><div class="timeline-item"><strong>1. Form</strong><p>Ad, sınıf, katılma nedeni ve ilgi alanları alınır.</p></div><div class="timeline-item"><strong>2. İnceleme</strong><p>Yönetim başvuruyu değerlendirir.</p></div><div class="timeline-item"><strong>3. Üyelik</strong><p>Uygunsa kişi kayıt sayfasından hesap açar ve rol atanır.</p></div></div></div>
      </div>
      ${canManage ? `<section class="section"><div class="section-header"><div><h2>Başvuru yönetimi</h2><p>Yalnızca yetkililer görür.</p></div></div><div id="applicationsList"></div></section>` : ""}
    </section>
  `;
  bindForm();
  if (canManage) await renderApplications();
}

function renderForm() {
  return `<form class="form" id="applicationForm" style="margin-top:16px">
    <div class="form-row"><label>Ad Soyad</label><input name="full_name" required></div>
    <div class="form-row"><label>Sınıf</label><input name="class_name" required></div>
    <div class="form-row"><label>E-posta</label><input name="applicant_email" type="email" placeholder="İsteğe bağlı"></div>
    <div class="form-row"><label>Katılma nedeni</label><textarea name="join_reason" required></textarea></div>
    <div class="form-row"><label>İlgi alanları</label><input name="interests" placeholder="Oyun, sosyal medya, etkinlik..."></div>
    <button class="btn btn-primary" type="submit">Başvuruyu gönder</button>
  </form>`;
}

function bindForm() {
  document.getElementById("applicationForm").addEventListener("submit", async (event) => {
    event.preventDefault(); const btn = event.submitter; btn.disabled = true;
    try { await createApplication(getFormData(event.currentTarget)); event.currentTarget.reset(); toast("Başvuru alındı.", "success"); await renderApplications().catch(() => {}); }
    catch (error) { toast(error.message, "error"); } finally { btn.disabled = false; }
  });
}

async function renderApplications() {
  const box = document.getElementById("applicationsList");
  if (!box) return;
  box.innerHTML = `<div class="empty loading">Başvurular yükleniyor...</div>`;
  try {
    const items = await fetchApplications();
    box.innerHTML = items.length ? `<div class="table-wrap"><table><thead><tr><th>Ad</th><th>Sınıf</th><th>Neden</th><th>İlgi</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>${items.map(renderRow).join("")}</tbody></table></div>` : emptyState("Başvuru yok.");
    box.querySelectorAll("[data-status]").forEach((btn) => btn.addEventListener("click", async () => {
      try { await updateApplicationStatus(btn.dataset.id, btn.dataset.status); toast("Başvuru güncellendi.", "success"); await renderApplications(); }
      catch (e) { toast(e.message, "error"); }
    }));
  } catch (error) { box.innerHTML = `<div class="notice error">${escapeHtml(error.message)}</div>`; }
}

function renderRow(item) {
  return `<tr><td><strong>${escapeHtml(item.full_name)}</strong><br><span class="muted">${formatDate(item.created_at)}</span></td><td>${escapeHtml(item.class_name)}</td><td>${nl2br(item.join_reason)}</td><td>${escapeHtml(item.interests || "-")}</td><td>${statusBadge(item.status)}</td><td><button class="btn btn-small btn-ghost" data-id="${item.id}" data-status="approved">Onayla</button> <button class="btn btn-small btn-danger" data-id="${item.id}" data-status="rejected">Reddet</button></td></tr>`;
}
