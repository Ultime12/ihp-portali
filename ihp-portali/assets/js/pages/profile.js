import { getMyProfile } from "../auth.js";
import { updateOwnProfile, fetchDisciplineHistory } from "../api.js";
import { escapeHtml, formatDate, getFormData, nl2br, roleBadge, toast } from "../utils.js";

export async function init({ root }) {
  const profile = await getMyProfile(true);
  const history = await fetchDisciplineHistory(profile.id).catch(() => []);
  root.innerHTML = `
    <section class="section" style="margin-top:0">
      <div class="section-header"><div><h1 style="font-size:42px">Profil</h1><p>Kişisel bilgilerin, görevlerin, rozetlerin ve disiplin geçmişin.</p></div>${roleBadge(profile.role)}</div>
      <div class="grid grid-2">
        <div class="card">
          <h2>Profil bilgileri</h2>
          <form class="form" id="profileForm" style="margin-top:16px">
            <div class="form-row"><label>Ad Soyad</label><input name="full_name" value="${escapeHtml(profile.full_name || "")}" required></div>
            <div class="form-row"><label>Sınıf</label><input name="class_name" value="${escapeHtml(profile.class_name || "")}" placeholder="Örn. 8/A"></div>
            <div class="form-row"><label>Avatar URL</label><input name="avatar_url" value="${escapeHtml(profile.avatar_url || "")}" placeholder="https://..."></div>
            <button class="btn btn-primary" type="submit">Profilimi güncelle</button>
          </form>
        </div>
        <div class="card">
          <div class="score-ring" style="--score:${Number(profile.discipline_score || 0)}"><span>${Number(profile.discipline_score || 0)}</span></div>
          <h3 style="text-align:center">Disiplin puanı</h3>
          <p><strong>Görev:</strong> ${escapeHtml(profile.duty || "Üye")}</p>
          <p><strong>Katılım tarihi:</strong> ${formatDate(profile.joined_at, false)}</p>
          <p><strong>Rozetler:</strong> ${(profile.badges || []).map((b) => `<span class="badge">${escapeHtml(b)}</span>`).join(" ") || "-"}</p>
        </div>
      </div>
    </section>
    <section class="section">
      <div class="section-header"><div><h2>Disiplin geçmişi</h2><p>Tüm puan değişiklikleri sebebiyle birlikte kayıt altında tutulur.</p></div></div>
      <div class="timeline">${history.length ? history.map(renderRecord).join("") : '<div class="empty">Disiplin kaydı yok.</div>'}</div>
    </section>
  `;
  document.getElementById("profileForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const btn = event.submitter;
    btn.disabled = true;
    try {
      await updateOwnProfile(getFormData(event.currentTarget));
      toast("Profil güncellendi.", "success");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      btn.disabled = false;
    }
  });
}

function renderRecord(record) {
  return `<div class="timeline-item"><strong>${record.delta > 0 ? "+" : ""}${record.delta} puan</strong><p>${nl2br(record.reason)}</p><p class="muted">${formatDate(record.created_at)} · Önceki: ${record.previous_score} · Yeni: ${record.new_score}</p></div>`;
}
