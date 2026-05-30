import { adminCreateUser, adminDeleteUser, fetchProfiles, updateProfileAdmin } from "../api.js";
import { ROLE_LABELS, emptyState, escapeHtml, formatDate, getFormData, splitList, toast } from "../utils.js";

export async function init({ root }) {
  root.innerHTML = `
    <section class="section" style="margin-top:0">
      <div class="section-header"><div><h1 style="font-size:42px">Yönetici Paneli</h1><p>Üye yönetimi, görev atama, kurul yetkileri ve rol sistemi.</p></div></div>
      <div class="notice warn"><strong>Güvenlik notu:</strong> Üye oluşturma/silme işlemleri tarayıcıdan service_role anahtarı kullanmadan Supabase Edge Function üzerinden yapılır. Fonksiyonları deploy etmediysen, üyeler kayıt sayfasından hesap açar ve buradan rol/görev atanır.</div>
      <section class="section grid grid-2">
        <div class="card"><h2>Üye ekle</h2>${createUserForm()}</div>
        <div class="card"><h2>Rol yetki özeti</h2><div class="timeline"><div class="timeline-item"><strong>Genel Başkan / Başkan Yardımcısı</strong><p>Tüm yönetim modülleri.</p></div><div class="timeline-item"><strong>Yönetici</strong><p>Üye, duyuru, seçim ve disiplin yönetimi.</p></div><div class="timeline-item"><strong>Temsilci</strong><p>Etkinlik ve oyun modülleri.</p></div><div class="timeline-item"><strong>Üye</strong><p>Profil, başvuru, seçim, katılım.</p></div></div></div>
      </section>
      <section class="section"><div class="section-header"><div><h2>Üyeler</h2><p>Rol, görev, rozet, kurul ve disiplin bilgilerini düzenle.</p></div></div><div id="membersTable"></div></section>
    </section>`;
  bindCreateUser();
  await renderMembers();
}

function createUserForm() {
  return `<form class="form" id="createUserForm" style="margin-top:16px">
    <div class="form-row"><label>Ad Soyad</label><input name="full_name" required></div>
    <div class="form-row"><label>E-posta</label><input name="email" type="email" required></div>
    <div class="form-row"><label>Geçici şifre</label><input name="password" type="text" minlength="6" required></div>
    <div class="form-row"><label>Sınıf</label><input name="class_name"></div>
    <div class="form-row"><label>Rol</label><select name="role">${roleOptions("uye")}</select></div>
    <div class="form-row"><label>Görev</label><input name="duty" placeholder="Üye"></div>
    <button class="btn btn-primary" type="submit">Üye oluştur</button>
  </form>`;
}

function bindCreateUser() {
  document.getElementById("createUserForm").addEventListener("submit", async (event) => {
    event.preventDefault(); const btn=event.submitter; btn.disabled=true;
    try { await adminCreateUser(getFormData(event.currentTarget)); event.currentTarget.reset(); toast("Üye oluşturuldu.", "success"); await renderMembers(); }
    catch (error) { toast(`Edge Function hatası: ${error.message}`, "error"); }
    finally { btn.disabled=false; }
  });
}

async function renderMembers() {
  const box = document.getElementById("membersTable"); box.innerHTML = `<div class="empty loading">Üyeler yükleniyor...</div>`;
  try {
    const members = await fetchProfiles();
    if (!members.length) { box.innerHTML = emptyState("Üye bulunamadı."); return; }
    box.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Üye</th><th>Rol/Görev</th><th>Puan</th><th>Kurullar</th><th>Rozetler</th><th>İşlem</th></tr></thead><tbody>${members.map(renderRow).join("")}</tbody></table></div>`;
    box.querySelectorAll("form[data-member]").forEach((form) => form.addEventListener("submit", async (event) => {
      event.preventDefault(); const btn=event.submitter; btn.disabled=true;
      try {
        const data=getFormData(event.currentTarget);
        await updateProfileAdmin(event.currentTarget.dataset.member, {
          full_name: data.full_name,
          class_name: data.class_name || null,
          role: data.role,
          duty: data.duty || null,
          badges: splitList(data.badges),
          is_executive_member: Boolean(data.is_executive_member),
          is_discipline_member: Boolean(data.is_discipline_member),
        });
        toast("Üye güncellendi.", "success"); await renderMembers();
      } catch(e) { toast(e.message, "error"); } finally { btn.disabled=false; }
    }));
    box.querySelectorAll("[data-delete-user]").forEach((btn)=>btn.addEventListener("click", async()=>{
      if(!confirm("Bu üye Auth dahil silinsin mi? Edge Function deploy edilmiş olmalı.")) return;
      try { await adminDeleteUser(btn.dataset.deleteUser); toast("Üye silindi.", "success"); await renderMembers(); }
      catch(e){ toast(`Silme hatası: ${e.message}`, "error"); }
    }));
  } catch (error) { box.innerHTML = `<div class="notice error">${escapeHtml(error.message)}</div>`; }
}

function roleOptions(selected) {
  return Object.entries(ROLE_LABELS).filter(([key]) => key !== "ziyaretci").map(([key,label]) => `<option value="${key}" ${key===selected?"selected":""}>${label}</option>`).join("");
}

function renderRow(m) {
  return `<tr><td><form class="form" data-member="${m.id}"><input name="full_name" value="${escapeHtml(m.full_name || "")}" required><input name="class_name" value="${escapeHtml(m.class_name || "")}" placeholder="Sınıf"><span class="muted">Katılım: ${formatDate(m.joined_at,false)}</span></td><td><select name="role">${roleOptions(m.role)}</select><input name="duty" value="${escapeHtml(m.duty || "")}" placeholder="Görev"></td><td><strong>${Number(m.discipline_score || 0)}</strong></td><td><label><input type="checkbox" name="is_executive_member" value="true" style="width:auto" ${m.is_executive_member?"checked":""}> Yürütme</label><br><label><input type="checkbox" name="is_discipline_member" value="true" style="width:auto" ${m.is_discipline_member?"checked":""}> Disiplin</label></td><td><input name="badges" value="${escapeHtml((m.badges || []).join(", "))}" placeholder="Rozetler virgülle"></td><td><button class="btn btn-primary btn-small" type="submit">Kaydet</button><button class="btn btn-danger btn-small" type="button" data-delete-user="${m.id}" style="margin-top:8px">Sil</button></form></td></tr>`;
}
