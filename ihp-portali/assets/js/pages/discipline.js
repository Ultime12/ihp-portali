import { getMyProfile } from "../auth.js";
import { adjustDiscipline, createInvestigation, fetchDisciplineHistory, fetchInvestigations, fetchProfiles, updateInvestigation } from "../api.js";
import { canAtLeast, emptyState, escapeHtml, formatDate, getFormData, nl2br, statusBadge, toast } from "../utils.js";

export async function init({ root }) {
  const profile = await getMyProfile();
  if (!profile?.is_discipline_member && !canAtLeast(profile, "yonetici")) {
    root.innerHTML = `<div class="notice error"><strong>Erişim reddedildi.</strong><br>Bu panel yalnızca disiplin kurulu üyelerine açıktır.</div>`;
    return;
  }
  const members = await fetchProfiles();
  root.innerHTML = `
    <section class="section" style="margin-top:0">
      <div class="section-header"><div><h1 style="font-size:42px">Disiplin Kurulu Paneli</h1><p>Soruşturma açma, savunma alma, karar verme ve puan güncelleme.</p></div></div>
      <div class="grid grid-2">
        <div class="card"><h2>Soruşturma aç</h2>${investigationForm(members)}</div>
        <div class="card"><h2>Disiplin puanı işlemi</h2>${scoreForm(members)}</div>
      </div>
      <section class="section"><div class="section-header"><div><h2>Soruşturma dosyaları</h2></div></div><div id="investigations" class="grid"></div></section>
      <section class="section"><div class="section-header"><div><h2>Puan geçmişi</h2></div></div><div id="disciplineHistory" class="timeline"></div></section>
    </section>`;
  bindForms();
  await Promise.all([renderInvestigations(), renderHistory()]);
}

function memberOptions(members) {
  return members.map((m) => `<option value="${m.id}">${escapeHtml(m.full_name || m.id)} · ${escapeHtml(m.duty || m.role)}</option>`).join("");
}
function investigationForm(members) { return `<form class="form" id="investigationForm" style="margin-top:16px"><div class="form-row"><label>Üye</label><select name="member_id" required>${memberOptions(members)}</select></div><div class="form-row"><label>Başlık</label><input name="title" required></div><div class="form-row"><label>Açıklama</label><textarea name="description" required></textarea></div><button class="btn btn-primary" type="submit">Soruşturma aç</button></form>`; }
function scoreForm(members) { return `<form class="form" id="scoreForm" style="margin-top:16px"><div class="form-row"><label>Üye</label><select name="member_id" required>${memberOptions(members)}</select></div><div class="form-row"><label>Puan değişimi</label><input name="delta" type="number" placeholder="Örn. -10 veya 5" required></div><div class="form-row"><label>Sebep</label><textarea name="reason" required></textarea></div><button class="btn btn-primary" type="submit">Puanı güncelle</button></form>`; }
function bindForms() {
  document.getElementById("investigationForm").addEventListener("submit", async (event) => { event.preventDefault(); const btn=event.submitter; btn.disabled=true; try { await createInvestigation(getFormData(event.currentTarget)); event.currentTarget.reset(); toast("Soruşturma açıldı.", "success"); await renderInvestigations(); } catch(e){ toast(e.message,"error"); } finally { btn.disabled=false; } });
  document.getElementById("scoreForm").addEventListener("submit", async (event) => { event.preventDefault(); const btn=event.submitter; btn.disabled=true; try { const data=getFormData(event.currentTarget); await adjustDiscipline(data.member_id, data.delta, data.reason); event.currentTarget.reset(); toast("Disiplin puanı güncellendi.", "success"); await renderHistory(); } catch(e){ toast(e.message,"error"); } finally { btn.disabled=false; } });
}
async function renderInvestigations() {
  const box=document.getElementById("investigations"); box.innerHTML=`<div class="empty loading">Yükleniyor...</div>`;
  const items=await fetchInvestigations();
  box.innerHTML=items.length ? items.map(renderInvestigation).join("") : emptyState("Soruşturma yok.");
  box.querySelectorAll("[data-close-investigation]").forEach((btn)=>btn.addEventListener("click", async()=>{ const decision=prompt("Karar metni:"); if(!decision) return; try{ await updateInvestigation(btn.dataset.closeInvestigation,{ status:"decided", decision_text:decision, decided_at:new Date().toISOString()}); toast("Karar kaydedildi.","success"); await renderInvestigations(); }catch(e){toast(e.message,"error");} }));
}
function renderInvestigation(item) { return `<article class="card compact"><div class="card-header"><div><h3>${escapeHtml(item.title)}</h3><p class="muted">${escapeHtml(item.member?.full_name || "Üye")} · ${formatDate(item.created_at)}</p></div>${statusBadge(item.status)}</div><p>${nl2br(item.description)}</p>${item.defense_text ? `<p><strong>Savunma:</strong><br>${nl2br(item.defense_text)}</p>` : ""}${item.decision_text ? `<p><strong>Karar:</strong><br>${nl2br(item.decision_text)}</p>` : `<button class="btn btn-primary btn-small" data-close-investigation="${item.id}">Karar ver</button>`}</article>`; }
async function renderHistory() {
  const box=document.getElementById("disciplineHistory"); box.innerHTML=`<div class="empty loading">Yükleniyor...</div>`;
  const items=await fetchDisciplineHistory();
  box.innerHTML=items.length ? items.map((r)=>`<div class="timeline-item"><strong>${escapeHtml(r.member?.full_name || "Üye")} · ${r.delta > 0 ? "+" : ""}${r.delta} puan</strong><p>${nl2br(r.reason)}</p><p class="muted">${formatDate(r.created_at)} · ${r.previous_score} → ${r.new_score}</p></div>`).join("") : emptyState("Kayıt yok.");
}
