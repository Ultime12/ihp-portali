import { getMyProfile } from "../auth.js";
import { becomeCandidate, createElection, electionResults, fetchCandidates, fetchElections, voteCandidate } from "../api.js";
import { canAtLeast, emptyState, escapeHtml, formatDate, getFormData, nl2br, statusBadge, toast } from "../utils.js";

export async function init({ root }) {
  const profile = await getMyProfile();
  const canManage = canAtLeast(profile, "yonetici");
  root.innerHTML = `
    <section class="section" style="margin-top:0">
      <div class="section-header"><div><h1 style="font-size:42px">Seçim Sistemi</h1><p>Aday olma, oy kullanma, sonuç görüntüleme ve geçmiş seçim arşivi.</p></div></div>
      ${canManage ? renderElectionForm() : ""}
      <div class="grid grid-2 section">
        <div class="card"><h2>Seçimler</h2><div id="electionList" class="grid" style="margin-top:16px"></div></div>
        <div class="card"><h2>Seçim detayı</h2><div id="electionDetail" style="margin-top:16px"></div></div>
      </div>
    </section>
  `;
  if (canManage) bindElectionForm();
  await renderElections();
}

function renderElectionForm() {
  return `<div class="card"><h2>Seçim aç</h2><form class="form" id="electionForm" style="margin-top:16px">
    <div class="form-grid"><div class="form-row"><label>Başlık</label><input name="title" required></div><div class="form-row"><label>Durum</label><select name="status"><option value="open">Açık</option><option value="draft">Taslak</option><option value="closed">Kapalı</option></select></div></div>
    <div class="form-row"><label>Açıklama</label><textarea name="description"></textarea></div>
    <div class="form-grid"><div class="form-row"><label>Başlangıç</label><input name="start_at" type="datetime-local"></div><div class="form-row"><label>Bitiş</label><input name="end_at" type="datetime-local"></div></div>
    <button class="btn btn-primary" type="submit">Seçimi oluştur</button>
  </form></div>`;
}

function bindElectionForm() {
  document.getElementById("electionForm").addEventListener("submit", async (event) => {
    event.preventDefault(); const btn = event.submitter; btn.disabled = true;
    try { const data = getFormData(event.currentTarget); await createElection({ ...data, start_at: data.start_at || null, end_at: data.end_at || null }); event.currentTarget.reset(); toast("Seçim oluşturuldu.", "success"); await renderElections(); }
    catch (error) { toast(error.message, "error"); } finally { btn.disabled = false; }
  });
}

async function renderElections() {
  const box = document.getElementById("electionList");
  const detail = document.getElementById("electionDetail");
  box.innerHTML = `<div class="empty loading">Seçimler yükleniyor...</div>`;
  const elections = await fetchElections();
  box.innerHTML = elections.length ? elections.map(renderElectionCard).join("") : emptyState("Seçim yok.");
  box.querySelectorAll("[data-election]").forEach((btn) => btn.addEventListener("click", () => renderDetail(btn.dataset.election)));
  if (elections[0]) renderDetail(elections[0].id); else detail.innerHTML = emptyState("Seçim seçilmedi.");
}

function renderElectionCard(item) {
  return `<button class="card compact" style="text-align:left" data-election="${item.id}"><div class="card-header"><div><h3>${escapeHtml(item.title)}</h3><p class="muted">${formatDate(item.start_at)} - ${formatDate(item.end_at)}</p></div>${statusBadge(item.status)}</div></button>`;
}

async function renderDetail(electionId) {
  const detail = document.getElementById("electionDetail");
  detail.innerHTML = `<div class="empty loading">Detay yükleniyor...</div>`;
  try {
    const [candidates, results] = await Promise.all([fetchCandidates(electionId), electionResults(electionId).catch(() => [])]);
    detail.innerHTML = `
      <form class="form" id="candidateForm"><div class="form-row"><label>Adaylık açıklamam</label><textarea name="statement" placeholder="Neden aday olduğunu yaz"></textarea></div><button class="btn btn-primary" type="submit">Aday ol</button></form>
      <hr style="border:0;border-top:1px solid var(--border);margin:20px 0">
      <h3>Adaylar</h3>
      <div class="grid" style="margin-top:12px">${candidates.length ? candidates.map(renderCandidate).join("") : emptyState("Henüz aday yok.")}</div>
      <h3 style="margin-top:22px">Sonuçlar</h3>
      <div class="grid" style="margin-top:12px">${results.length ? results.map(renderResult).join("") : emptyState("Sonuç bilgisi yok.")}</div>
    `;
    document.getElementById("candidateForm").addEventListener("submit", async (event) => {
      event.preventDefault(); const btn = event.submitter; btn.disabled = true;
      try { const data = getFormData(event.currentTarget); await becomeCandidate(electionId, data.statement); toast("Adaylık kaydedildi.", "success"); await renderDetail(electionId); }
      catch (error) { toast(error.message, "error"); } finally { btn.disabled = false; }
    });
    detail.querySelectorAll("[data-vote]").forEach((btn) => btn.addEventListener("click", async () => {
      try { await voteCandidate(electionId, btn.dataset.vote); toast("Oy kaydedildi.", "success"); await renderDetail(electionId); }
      catch (error) { toast(error.message, "error"); }
    }));
  } catch (error) { detail.innerHTML = `<div class="notice error">${escapeHtml(error.message)}</div>`; }
}

function renderCandidate(item) {
  return `<div class="card compact"><div class="card-header"><div><h3>${escapeHtml(item.member?.full_name || "Aday")}</h3><p class="muted">${escapeHtml(item.member?.duty || item.member?.role || "Üye")}</p></div><button class="btn btn-primary btn-small" data-vote="${item.id}">Oy ver</button></div><p>${nl2br(item.statement || "")}</p></div>`;
}
function renderResult(row) {
  return `<div class="card compact"><strong>${escapeHtml(row.full_name)}</strong><p class="muted">${row.vote_count} oy</p></div>`;
}
