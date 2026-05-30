import { getMyProfile } from "../auth.js";
import { createExecutiveDecision, createMeeting, fetchExecutiveDecisions, fetchMeetings, voteExecutiveDecision } from "../api.js";
import { canAtLeast, emptyState, escapeHtml, formatDate, getFormData, nl2br, statusBadge, toast } from "../utils.js";

export async function init({ root }) {
  const profile = await getMyProfile();
  if (!profile?.is_executive_member && !canAtLeast(profile, "yonetici")) {
    root.innerHTML = `<div class="notice error"><strong>Erişim reddedildi.</strong><br>Bu panel yalnızca yürütme kurulu üyelerine açıktır.</div>`;
    return;
  }
  root.innerHTML = `
    <section class="section" style="margin-top:0">
      <div class="section-header"><div><h1 style="font-size:42px">Yürütme Kurulu Paneli</h1><p>Karar oluşturma, oylama, karar arşivi ve toplantı kayıtları.</p></div></div>
      <div class="grid grid-2">
        <div class="card"><h2>Karar oluştur</h2>${decisionForm()}</div>
        <div class="card"><h2>Toplantı kaydı</h2>${meetingForm()}</div>
      </div>
      <div class="grid grid-2 section">
        <div><div class="section-header"><div><h2>Karar arşivi</h2></div></div><div id="decisions" class="grid"></div></div>
        <div><div class="section-header"><div><h2>Toplantılar</h2></div></div><div id="meetings" class="grid"></div></div>
      </div>
    </section>`;
  bindForms();
  await Promise.all([renderDecisions(), renderMeetings()]);
}

function decisionForm() { return `<form class="form" id="decisionForm" style="margin-top:16px"><div class="form-row"><label>Başlık</label><input name="title" required></div><div class="form-row"><label>İçerik</label><textarea name="content" required></textarea></div><div class="form-row"><label>Durum</label><select name="status"><option value="open">Oylamada</option><option value="closed">Kapalı</option><option value="archived">Arşiv</option></select></div><button class="btn btn-primary" type="submit">Kararı oluştur</button></form>`; }
function meetingForm() { return `<form class="form" id="meetingForm" style="margin-top:16px"><div class="form-row"><label>Başlık</label><input name="title" required></div><div class="form-row"><label>Tarih</label><input name="meeting_at" type="datetime-local" required></div><div class="form-row"><label>Notlar</label><textarea name="notes"></textarea></div><button class="btn btn-primary" type="submit">Toplantıyı kaydet</button></form>`; }
function bindForms() {
  document.getElementById("decisionForm").addEventListener("submit", async (event) => { event.preventDefault(); const btn = event.submitter; btn.disabled = true; try { await createExecutiveDecision(getFormData(event.currentTarget)); event.currentTarget.reset(); toast("Karar oluşturuldu.", "success"); await renderDecisions(); } catch(e){ toast(e.message,"error"); } finally { btn.disabled=false; } });
  document.getElementById("meetingForm").addEventListener("submit", async (event) => { event.preventDefault(); const btn = event.submitter; btn.disabled = true; try { const data=getFormData(event.currentTarget); await createMeeting({ ...data, committee: "executive" }); event.currentTarget.reset(); toast("Toplantı kaydedildi.", "success"); await renderMeetings(); } catch(e){ toast(e.message,"error"); } finally { btn.disabled=false; } });
}
async function renderDecisions() {
  const box = document.getElementById("decisions"); box.innerHTML = `<div class="empty loading">Yükleniyor...</div>`;
  const items = await fetchExecutiveDecisions();
  box.innerHTML = items.length ? items.map(renderDecision).join("") : emptyState("Karar yok.");
  box.querySelectorAll("[data-exec-vote]").forEach((btn) => btn.addEventListener("click", async () => { try { await voteExecutiveDecision(btn.dataset.execVote, btn.dataset.vote); toast("Oy kaydedildi.", "success"); } catch(e){ toast(e.message,"error"); } }));
}
function renderDecision(item) { return `<article class="card compact"><div class="card-header"><div><h3>${escapeHtml(item.title)}</h3><p class="muted">${formatDate(item.created_at)} · ${escapeHtml(item.creator?.full_name || "")}</p></div>${statusBadge(item.status)}</div><p>${nl2br(item.content)}</p><div class="hero-actions"><button class="btn btn-ghost btn-small" data-exec-vote="${item.id}" data-vote="yes">Evet</button><button class="btn btn-ghost btn-small" data-exec-vote="${item.id}" data-vote="no">Hayır</button><button class="btn btn-ghost btn-small" data-exec-vote="${item.id}" data-vote="abstain">Çekimser</button></div></article>`; }
async function renderMeetings() {
  const box=document.getElementById("meetings"); box.innerHTML=`<div class="empty loading">Yükleniyor...</div>`;
  const items=await fetchMeetings("executive");
  box.innerHTML=items.length ? items.map((m)=>`<article class="card compact"><h3>${escapeHtml(m.title)}</h3><p class="muted">${formatDate(m.meeting_at)}</p><p>${nl2br(m.notes || "")}</p></article>`).join("") : emptyState("Toplantı kaydı yok.");
}
