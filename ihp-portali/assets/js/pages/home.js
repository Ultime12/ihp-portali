import { fetchAnnouncements, fetchEvents, fetchOfficials, fetchProfiles } from "../api.js";
import { isSupabaseConfigured } from "../supabaseClient.js";
import { escapeHtml, formatDate, nl2br, pagePath, requireConfiguredNotice, roleBadge, truncate } from "../utils.js";

const demoOfficials = [
  ["Genel Başkan", "Tuna Mert Köse"],
  ["Başkan Yardımcısı", "Yiğit Erşahin"],
  ["Başkan Yaveri", "Oğuz Pamir Özmen"],
  ["Parti Sözcüsü", "Emir Kaan Altuntaş"],
  ["Baş Temsilci", "Özgün Gece"],
];

export async function init({ root }) {
  root.innerHTML = `
    <section class="hero">
      <div class="hero-grid">
        <div>
          <div class="eyebrow">İHP Resmî Dijital Merkezi</div>
          <h1>İstiklal Hürriyet Partisi Portalı</h1>
          <p>Üyelik, duyuru, seçim, disiplin, yürütme kurulu ve oyun topluluğu yönetimini tek merkezde birleştiren modern öğrenci topluluğu sistemi.</p>
          <div class="hero-actions">
            <a class="btn btn-primary" href="${pagePath("register")}">Üye kaydı oluştur</a>
            <a class="btn btn-secondary" href="${pagePath("dashboard")}">Portala gir</a>
          </div>
        </div>
        <div class="card" style="background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.18);color:#fff">
          <h3 style="color:#fff">Slogan</h3>
          <p style="color:rgba(255,255,255,.82)">Birlik, hürriyet ve adalet için dijital yönetim.</p>
          <div class="grid" style="gap:10px;margin-top:18px">
            <span class="badge">Lacivert · Kırmızı · Beyaz</span>
            <span class="badge">Mobil uyumlu</span>
            <span class="badge">Karanlık mod destekli</span>
          </div>
        </div>
      </div>
    </section>
    <div id="homeDynamic" class="section"></div>
  `;

  if (!isSupabaseConfigured) {
    document.getElementById("homeDynamic").innerHTML = `
      ${requireConfiguredNotice()}
      ${renderDemo()}
    `;
    return;
  }

  try {
    const [announcements, events, officials, profiles] = await Promise.all([
      fetchAnnouncements({ limit: 3, publicOnly: true }),
      fetchEvents({ limit: 3 }),
      fetchOfficials(),
      fetchProfiles().catch(() => []),
    ]);
    document.getElementById("homeDynamic").innerHTML = `
      <section class="grid grid-4">
        <div class="stat-card"><div class="stat-number">${profiles.length || "-"}</div><div class="stat-label">Üye</div></div>
        <div class="stat-card"><div class="stat-number">${announcements.length}</div><div class="stat-label">Son duyuru</div></div>
        <div class="stat-card"><div class="stat-number">${events.length}</div><div class="stat-label">Yaklaşan etkinlik</div></div>
        <div class="stat-card"><div class="stat-number">100</div><div class="stat-label">Başlangıç disiplin puanı</div></div>
      </section>
      <section class="section grid grid-2">
        <div>
          <div class="section-header"><div><h2>Son duyurular</h2><p>Sabitleme ve kategori destekli resmî duyurular.</p></div><a class="btn btn-ghost btn-small" href="${pagePath("announcements")}">Tümü</a></div>
          <div class="grid">${announcements.length ? announcements.map(renderAnnouncement).join("") : emptyMini("Henüz duyuru yok.")}</div>
        </div>
        <div>
          <div class="section-header"><div><h2>Son etkinlikler</h2><p>Toplantılar, faaliyetler ve oyun etkinlikleri.</p></div><a class="btn btn-ghost btn-small" href="${pagePath("events")}">Takvim</a></div>
          <div class="grid">${events.length ? events.map(renderEvent).join("") : emptyMini("Etkinlik bulunamadı.")}</div>
        </div>
      </section>
      <section class="section">
        <div class="section-header"><div><h2>Yönetim kadrosu</h2><p>İHP görev dağılımı özeti.</p></div></div>
        <div class="grid grid-3">${officials.map(renderOfficial).join("")}</div>
      </section>
    `;
  } catch (error) {
    document.getElementById("homeDynamic").innerHTML = `<div class="notice error">${escapeHtml(error.message)}</div>${renderDemo()}`;
  }
}

function renderAnnouncement(item) {
  return `<article class="card compact">
    <div class="card-header"><div><h3>${escapeHtml(item.title)}</h3><div class="muted">${escapeHtml(item.category || "Genel")} · ${formatDate(item.created_at)}</div></div>${item.pinned ? '<span class="badge">Sabit</span>' : ""}</div>
    <p>${nl2br(truncate(item.body, 180))}</p>
  </article>`;
}

function renderEvent(item) {
  return `<article class="card compact">
    <h3>${escapeHtml(item.title)}</h3>
    <p class="muted">${formatDate(item.start_at)} · ${escapeHtml(item.location || "Konum yok")}</p>
    <p>${nl2br(truncate(item.description, 150))}</p>
  </article>`;
}

function renderOfficial(item) {
  const title = Array.isArray(item) ? item[0] : item.role_title;
  const name = Array.isArray(item) ? item[1] : item.full_name;
  return `<div class="card compact"><span class="badge">${escapeHtml(title)}</span><h3 style="margin-top:10px">${escapeHtml(name)}</h3></div>`;
}

function emptyMini(text) {
  return `<div class="empty">${escapeHtml(text)}</div>`;
}

function renderDemo() {
  return `<section class="section">
    <div class="section-header"><div><h2>Yönetim kadrosu özeti</h2><p>Veritabanı bağlanana kadar gösterilen başlangıç kadrosu.</p></div></div>
    <div class="grid grid-3">${demoOfficials.map(renderOfficial).join("")}</div>
  </section>`;
}
