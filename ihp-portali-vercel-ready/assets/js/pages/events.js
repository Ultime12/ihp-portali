import { getMyProfile } from "../auth.js";
import { createEvent, fetchEvents, joinEvent } from "../api.js";
import { canAtLeast, emptyState, escapeHtml, formatDate, getFormData, nl2br, toast, requireConfiguredNotice } from "../utils.js";
import { isSupabaseConfigured } from "../supabaseClient.js";

export async function init({ root }) {
  if (!isSupabaseConfigured) { root.innerHTML = requireConfiguredNotice(); return; }
  const profile = await getMyProfile();
  const canManage = canAtLeast(profile, "temsilci");
  root.innerHTML = `
    <section class="section" style="margin-top:0">
      <div class="section-header"><div><h1 style="font-size:42px">Etkinlik Sistemi</h1><p>Etkinlik oluşturma, takvim görünümü ve katılım listesi altyapısı.</p></div></div>
      ${canManage ? renderForm() : ""}
      <div id="eventsList" class="grid grid-2" style="margin-top:18px"></div>
    </section>
  `;
  if (canManage) bindForm();
  await renderList(Boolean(profile));
}

function renderForm() {
  return `<div class="card"><h2>Etkinlik oluştur</h2><form class="form" id="eventForm" style="margin-top:16px">
    <div class="form-grid"><div class="form-row"><label>Başlık</label><input name="title" required></div><div class="form-row"><label>Kategori</label><input name="category" placeholder="Toplantı, Sosyal, Oyun..."></div></div>
    <div class="form-row"><label>Açıklama</label><textarea name="description"></textarea></div>
    <div class="form-grid"><div class="form-row"><label>Başlangıç</label><input name="start_at" type="datetime-local" required></div><div class="form-row"><label>Bitiş</label><input name="end_at" type="datetime-local"></div></div>
    <div class="form-row"><label>Konum</label><input name="location" placeholder="Sınıf, Discord, WhatsApp..."></div>
    <label><input type="checkbox" name="is_game_event" value="true" style="width:auto"> Oyun etkinliği</label>
    <button class="btn btn-primary" type="submit">Etkinliği oluştur</button>
  </form></div>`;
}

function bindForm() {
  document.getElementById("eventForm").addEventListener("submit", async (event) => {
    event.preventDefault(); const btn = event.submitter; btn.disabled = true;
    try {
      const data = getFormData(event.currentTarget);
      await createEvent({ ...data, category: data.category || "Genel", is_game_event: Boolean(data.is_game_event), end_at: data.end_at || null });
      event.currentTarget.reset(); toast("Etkinlik oluşturuldu.", "success"); await renderList(true);
    } catch (error) { toast(error.message, "error"); } finally { btn.disabled = false; }
  });
}

async function renderList(isLoggedIn) {
  const list = document.getElementById("eventsList");
  list.innerHTML = `<div class="empty loading">Etkinlikler yükleniyor...</div>`;
  try {
    const items = await fetchEvents({ limit: 100 });
    list.innerHTML = items.length ? items.map((item) => renderEvent(item, isLoggedIn)).join("") : emptyState("Etkinlik bulunamadı.");
    list.querySelectorAll("[data-join]").forEach((btn) => btn.addEventListener("click", async () => {
      try { await joinEvent(btn.dataset.join); toast("Katılım kaydedildi.", "success"); } catch (e) { toast(e.message, "error"); }
    }));
  } catch (error) { list.innerHTML = `<div class="notice error">${escapeHtml(error.message)}</div>`; }
}

function renderEvent(item, isLoggedIn) {
  return `<article class="card">
    <div class="card-header"><div><span class="badge">${escapeHtml(item.category || "Genel")}</span><h2 style="margin-top:10px">${escapeHtml(item.title)}</h2></div>${item.is_game_event ? '<span class="badge">Oyun</span>' : ""}</div>
    <p class="muted">${formatDate(item.start_at)}${item.end_at ? " - " + formatDate(item.end_at) : ""}<br>${escapeHtml(item.location || "Konum belirtilmedi")}</p>
    <p>${nl2br(item.description || "")}</p>
    ${isLoggedIn ? `<button class="btn btn-primary btn-small" data-join="${item.id}">Katılacağım</button>` : ""}
  </article>`;
}
