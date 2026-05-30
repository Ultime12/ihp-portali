import { getMyProfile } from "../auth.js";
import { fetchAnnouncements, fetchEvents } from "../api.js";
import { canAtLeast, escapeHtml, formatDate, nl2br, pagePath, roleBadge, truncate } from "../utils.js";

export async function init({ root }) {
  const profile = await getMyProfile(true);
  const [announcements, events] = await Promise.all([
    fetchAnnouncements({ limit: 5 }).catch(() => []),
    fetchEvents({ limit: 5 }).catch(() => []),
  ]);

  root.innerHTML = `
    <section class="section" style="margin-top:0">
      <div class="section-header"><div><h1 style="font-size:42px">Hoş geldin, ${escapeHtml(profile.full_name || "Üye")}</h1><p>İHP Portalı kişisel panelin.</p></div>${roleBadge(profile.role)}</div>
      <div class="grid grid-3">
        <div class="card">
          <div class="score-ring" style="--score:${Number(profile.discipline_score || 0)}"><span>${Number(profile.discipline_score || 0)}</span></div>
          <h3 style="text-align:center">Disiplin puanı</h3>
          <p class="muted" style="text-align:center">Başlangıç puanı 100’dür. Geçmiş profil sayfanda tutulur.</p>
        </div>
        <div class="card">
          <h3>Görev bilgisi</h3>
          <p><strong>Görev:</strong> ${escapeHtml(profile.duty || "Üye")}</p>
          <p><strong>Sınıf:</strong> ${escapeHtml(profile.class_name || "Belirtilmedi")}</p>
          <p><strong>Katılım:</strong> ${formatDate(profile.joined_at, false)}</p>
          <div>${(profile.badges || []).map((b) => `<span class="badge">${escapeHtml(b)}</span>`).join(" ") || '<span class="muted">Rozet yok</span>'}</div>
        </div>
        <div class="card">
          <h3>Hızlı işlemler</h3>
          <div class="grid" style="gap:10px;margin-top:14px">
            <a class="btn btn-ghost" href="${pagePath("profile")}">Profilimi düzenle</a>
            <a class="btn btn-ghost" href="${pagePath("elections")}">Seçim sistemine git</a>
            <a class="btn btn-ghost" href="${pagePath("gaming")}">Oyun merkezine git</a>
            ${canAtLeast(profile, "yonetici") ? `<a class="btn btn-primary" href="${pagePath("admin")}">Yönetici paneli</a>` : ""}
          </div>
        </div>
      </div>
    </section>
    <section class="section grid grid-2">
      <div>
        <div class="section-header"><div><h2>Duyurular</h2><p>Son resmî duyurular.</p></div></div>
        <div class="grid">${announcements.map(renderAnnouncement).join("") || '<div class="empty">Duyuru yok.</div>'}</div>
      </div>
      <div>
        <div class="section-header"><div><h2>Etkinlikler</h2><p>Yaklaşan programlar.</p></div></div>
        <div class="grid">${events.map(renderEvent).join("") || '<div class="empty">Etkinlik yok.</div>'}</div>
      </div>
    </section>
  `;
}

function renderAnnouncement(item) {
  return `<article class="card compact"><h3>${escapeHtml(item.title)}</h3><p class="muted">${escapeHtml(item.category || "Genel")} · ${formatDate(item.created_at)}</p><p>${nl2br(truncate(item.body, 150))}</p></article>`;
}
function renderEvent(item) {
  return `<article class="card compact"><h3>${escapeHtml(item.title)}</h3><p class="muted">${formatDate(item.start_at)} · ${escapeHtml(item.location || "-")}</p></article>`;
}
