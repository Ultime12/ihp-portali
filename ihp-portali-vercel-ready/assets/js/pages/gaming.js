import { getMyProfile } from "../auth.js";
import { createGameEvent, createTeam, createTournament, fetchGameData } from "../api.js";
import { canAtLeast, emptyState, escapeHtml, formatDate, getFormData, nl2br, toast, requireConfiguredNotice } from "../utils.js";
import { isSupabaseConfigured } from "../supabaseClient.js";

export async function init({ root }) {
  if (!isSupabaseConfigured) { root.innerHTML = requireConfiguredNotice(); return; }
  const profile = await getMyProfile();
  const canManage = canAtLeast(profile, "temsilci");
  root.innerHTML = `
    <section class="hero">
      <div class="hero-grid"><div><div class="eyebrow">Oyun Merkezi</div><h1>Turnuvalar, takımlar ve şampiyonlar</h1><p>İHP üyelerinin oyun topluluğu tarafını portalın ana parçalarından biri yapar.</p></div><div class="card" style="background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.18);color:#fff"><h3 style="color:#fff">Modüller</h3><p>Oyun etkinlikleri · Turnuvalar · Takımlar · Şampiyonlar tablosu</p></div></div>
    </section>
    ${canManage ? `<section class="section grid grid-3"><div class="card"><h2>Oyun etkinliği</h2>${gameEventForm()}</div><div class="card"><h2>Turnuva</h2>${tournamentForm()}</div><div class="card"><h2>Takım</h2>${teamForm()}</div></section>` : ""}
    <section class="section grid grid-2"><div><div class="section-header"><div><h2>Oyun etkinlikleri</h2></div></div><div id="gameEvents" class="grid"></div></div><div><div class="section-header"><div><h2>Turnuvalar</h2></div></div><div id="tournaments" class="grid"></div></div><div><div class="section-header"><div><h2>Takımlar</h2></div></div><div id="teams" class="grid"></div></div><div><div class="section-header"><div><h2>Şampiyonlar tablosu</h2></div></div><div id="champions" class="grid"></div></div></section>`;
  if (canManage) bindForms();
  await renderData();
}
function gameEventForm(){ return `<form class="form" id="gameEventForm" style="margin-top:16px"><div class="form-row"><label>Başlık</label><input name="title" required></div><div class="form-row"><label>Oyun</label><input name="game_name" required></div><div class="form-row"><label>Tarih</label><input name="start_at" type="datetime-local" required></div><div class="form-row"><label>Açıklama</label><textarea name="description"></textarea></div><button class="btn btn-primary" type="submit">Oluştur</button></form>`; }
function tournamentForm(){ return `<form class="form" id="tournamentForm" style="margin-top:16px"><div class="form-row"><label>Ad</label><input name="name" required></div><div class="form-row"><label>Oyun</label><input name="game_name" required></div><div class="form-row"><label>Durum</label><select name="status"><option value="open">Açık</option><option value="closed">Kapalı</option><option value="archived">Arşiv</option></select></div><button class="btn btn-primary" type="submit">Turnuva aç</button></form>`; }
function teamForm(){ return `<form class="form" id="teamForm" style="margin-top:16px"><div class="form-row"><label>Takım adı</label><input name="name" required></div><div class="form-row"><label>Oyun</label><input name="game_name" required></div><button class="btn btn-primary" type="submit">Takım oluştur</button></form>`; }
function bindForms(){
  document.getElementById("gameEventForm")?.addEventListener("submit", async(e)=>{e.preventDefault(); try{await createGameEvent(getFormData(e.currentTarget)); e.currentTarget.reset(); toast("Oyun etkinliği oluşturuldu.","success"); await renderData();}catch(err){toast(err.message,"error");}});
  document.getElementById("tournamentForm")?.addEventListener("submit", async(e)=>{e.preventDefault(); try{await createTournament(getFormData(e.currentTarget)); e.currentTarget.reset(); toast("Turnuva oluşturuldu.","success"); await renderData();}catch(err){toast(err.message,"error");}});
  document.getElementById("teamForm")?.addEventListener("submit", async(e)=>{e.preventDefault(); try{await createTeam(getFormData(e.currentTarget)); e.currentTarget.reset(); toast("Takım oluşturuldu.","success"); await renderData();}catch(err){toast(err.message,"error");}});
}
async function renderData(){
  const data=await fetchGameData();
  document.getElementById("gameEvents").innerHTML=data.events.length?data.events.map((i)=>`<article class="card compact"><h3>${escapeHtml(i.title)}</h3><p class="muted">${escapeHtml(i.game_name)} · ${formatDate(i.start_at)}</p><p>${nl2br(i.description||"")}</p></article>`).join(""):emptyState("Oyun etkinliği yok.");
  document.getElementById("tournaments").innerHTML=data.tournaments.length?data.tournaments.map((i)=>`<article class="card compact"><h3>${escapeHtml(i.name)}</h3><p class="muted">${escapeHtml(i.game_name)} · ${escapeHtml(i.status)}</p></article>`).join(""):emptyState("Turnuva yok.");
  document.getElementById("teams").innerHTML=data.teams.length?data.teams.map((i)=>`<article class="card compact"><h3>${escapeHtml(i.name)}</h3><p class="muted">${escapeHtml(i.game_name)} · Kaptan: ${escapeHtml(i.captain?.full_name||"-")}</p></article>`).join(""):emptyState("Takım yok.");
  document.getElementById("champions").innerHTML=data.champions.length?data.champions.map((i)=>`<article class="card compact"><h3>${escapeHtml(i.title)}</h3><p class="muted">${escapeHtml(i.game_name)} · ${escapeHtml(i.member?.full_name||i.team_name||"-")}</p><p>${formatDate(i.achieved_at,false)}</p></article>`).join(""):emptyState("Şampiyon kaydı yok.");
}
