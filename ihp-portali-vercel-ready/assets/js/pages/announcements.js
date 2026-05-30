import { getMyProfile } from "../auth.js";
import { canAtLeast, emptyState, escapeHtml, formatDate, getFormData, nl2br, statusBadge, toast, truncate, requireConfiguredNotice } from "../utils.js";
import { isSupabaseConfigured } from "../supabaseClient.js";
import { createAnnouncement, deleteAnnouncement, fetchAnnouncements, updateAnnouncement } from "../api.js";

export async function init({ root }) {
  if (!isSupabaseConfigured) {
    root.innerHTML = requireConfiguredNotice();
    return;
  }
  const profile = await getMyProfile();
  const canManage = canAtLeast(profile, "yonetici");
  root.innerHTML = `
    <section class="section" style="margin-top:0">
      <div class="section-header"><div><h1 style="font-size:42px">Duyuru Sistemi</h1><p>Kategori, sabitleme, yayınlama ve yetkili düzenleme destekli duyuru alanı.</p></div></div>
      ${canManage ? renderForm() : ""}
      <div id="announcementsList" class="grid" style="margin-top:18px"></div>
    </section>
  `;
  if (canManage) bindForm();
  await renderList(canManage);
}

function renderForm() {
  return `<div class="card"><h2>Duyuru oluştur</h2><form class="form" id="announcementForm" style="margin-top:16px">
    <div class="form-grid">
      <div class="form-row"><label>Başlık</label><input name="title" required></div>
      <div class="form-row"><label>Kategori</label><input name="category" placeholder="Genel, Seçim, Etkinlik..."></div>
    </div>
    <div class="form-row"><label>Metin</label><textarea name="body" required></textarea></div>
    <div class="form-grid">
      <div class="form-row"><label>Görünürlük</label><select name="visibility"><option value="public">Herkese açık</option><option value="members">Sadece üyeler</option></select></div>
      <div class="form-row"><label>Durum</label><select name="published"><option value="true">Yayında</option><option value="false">Taslak</option></select></div>
    </div>
    <label><input type="checkbox" name="pinned" value="true" style="width:auto"> Sabitle</label>
    <button class="btn btn-primary" type="submit">Duyuruyu yayınla</button>
  </form></div>`;
}

function bindForm() {
  document.getElementById("announcementForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const btn = event.submitter;
    btn.disabled = true;
    try {
      const data = getFormData(event.currentTarget);
      await createAnnouncement({
        title: data.title,
        body: data.body,
        category: data.category || "Genel",
        visibility: data.visibility,
        published: data.published === "true",
        pinned: Boolean(data.pinned),
      });
      event.currentTarget.reset();
      toast("Duyuru oluşturuldu.", "success");
      await renderList(true);
    } catch (error) {
      toast(error.message, "error");
    } finally {
      btn.disabled = false;
    }
  });
}

async function renderList(canManage) {
  const list = document.getElementById("announcementsList");
  list.innerHTML = `<div class="empty loading">Duyurular yükleniyor...</div>`;
  try {
    const items = await fetchAnnouncements({ limit: 100 });
    list.innerHTML = items.length ? items.map((item) => renderItem(item, canManage)).join("") : emptyState("Duyuru bulunamadı.");
    if (canManage) {
      list.querySelectorAll("[data-delete]").forEach((btn) => btn.addEventListener("click", async () => {
        if (!confirm("Bu duyuru silinsin mi?")) return;
        try { await deleteAnnouncement(btn.dataset.delete); toast("Duyuru silindi.", "success"); await renderList(true); } catch (e) { toast(e.message, "error"); }
      }));
      list.querySelectorAll("[data-pin]").forEach((btn) => btn.addEventListener("click", async () => {
        try { await updateAnnouncement(btn.dataset.pin, { pinned: btn.dataset.value !== "true" }); toast("Sabitleme güncellendi.", "success"); await renderList(true); } catch (e) { toast(e.message, "error"); }
      }));
      list.querySelectorAll("[data-publish]").forEach((btn) => btn.addEventListener("click", async () => {
        try { await updateAnnouncement(btn.dataset.publish, { published: btn.dataset.value !== "true" }); toast("Yayın durumu güncellendi.", "success"); await renderList(true); } catch (e) { toast(e.message, "error"); }
      }));
    }
  } catch (error) {
    list.innerHTML = `<div class="notice error">${escapeHtml(error.message)}</div>`;
  }
}

function renderItem(item, canManage) {
  return `<article class="card">
    <div class="card-header">
      <div><h2>${escapeHtml(item.title)}</h2><p class="muted">${escapeHtml(item.category || "Genel")} · ${formatDate(item.created_at)} · ${escapeHtml(item.author?.full_name || "Sistem")}</p></div>
      <div class="grid" style="gap:8px;justify-items:end">${item.pinned ? '<span class="badge">Sabit</span>' : ""}${statusBadge(item.published ? "published" : "draft")}</div>
    </div>
    <p>${nl2br(item.body)}</p>
    ${canManage ? `<div class="hero-actions"><button class="btn btn-ghost btn-small" data-pin="${item.id}" data-value="${item.pinned}">${item.pinned ? "Sabiti kaldır" : "Sabitle"}</button><button class="btn btn-ghost btn-small" data-publish="${item.id}" data-value="${item.published}">${item.published ? "Taslağa al" : "Yayınla"}</button><button class="btn btn-danger btn-small" data-delete="${item.id}">Sil</button></div>` : ""}
  </article>`;
}
