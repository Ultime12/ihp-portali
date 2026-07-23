const IHP_MAIN_REGULATION_GOVERNANCE_V1 = true;

if (!navItems.some(([id]) => id === "governance")) {
  const regulationIndex = navItems.findIndex(([id]) => id === "regulation");
  navItems.splice(
    regulationIndex < 0 ? navItems.length : regulationIndex,
    0,
    ["governance", "Kararlar ve Seçimler", "check", () => true]
  );
}

STATUS_LABELS.collecting_support = "Teklif desteği";
STATUS_LABELS.voting = "Oylamada";
STATUS_LABELS.approved = "Kabul edildi";
STATUS_LABELS.scheduled = "Takvimde";
STATUS_LABELS.nominations = "Adaylık açık";
STATUS_LABELS.awaiting_result = "Sonuç bekliyor";
STATUS_LABELS.runoff_required = "İkinci tur gerekli";

function governanceData() {
  const source = state.cache.governance;
  const data = source && typeof source === "object" ? source : {};
  return {
    ...data,
    proposals: Array.isArray(data.proposals) ? data.proposals : [],
    elections: Array.isArray(data.elections) ? data.elections : [],
    election_results: data.election_results && typeof data.election_results === "object" ? data.election_results : {},
    executive_members: Array.isArray(data.executive_members) ? data.executive_members : [],
    permissions: data.permissions && typeof data.permissions === "object" ? data.permissions : {}
  };
}

function governanceProposalTypeLabel(type) {
  return {
    executive_decision: "Yürütme Kurulu kararı",
    regulation_change: "Yönetmelik değişikliği",
    temporary_rule: "Geçici düzenleme",
    election_schedule: "Seçim takvimi",
    early_election: "Erken seçim",
    agreement_approval: "Antlaşma onayı"
  }[type] || type;
}

function governanceVoteLabel(vote) {
  return { yes: "Kabul", no: "Ret", abstain: "Çekimser" }[vote] || vote;
}

function governanceCanPropose() {
  return Boolean(governanceData().permissions?.is_executive);
}

function governanceCanFinalize(proposal) {
  return Boolean(
    (governanceCanPropose() || governanceData().permissions?.is_admin) &&
    proposal.status === "voting" &&
    proposal.voting_ends_at &&
    Date.now() >= new Date(proposal.voting_ends_at).valueOf()
  );
}

function governanceProposalActions(proposal) {
  const buttons = [];
  if (
    proposal.status === "collecting_support" &&
    governanceCanPropose() &&
    !proposal.sponsored_by_me
  ) {
    buttons.push(`<button class="table-action" type="button" data-action="governance-support" data-id="${esc(proposal.id)}">Teklifi destekle</button>`);
  }
  if (
    ["collecting_support", "voting"].includes(proposal.status) &&
    (proposal.proposed_by === state.profile?.id || governanceData().permissions?.is_admin)
  ) {
    buttons.push(`<button class="table-action danger-action" type="button" data-action="governance-cancel" data-id="${esc(proposal.id)}">${governanceData().permissions?.is_admin ? "Teknik olarak iptal et" : "Geri çek"}</button>`);
  }
  if (proposal.status === "voting" && proposal.eligible_to_vote && !proposal.my_vote && !proposal.my_recusal) {
    buttons.push(`<button class="table-action" type="button" data-action="governance-vote" data-vote="yes" data-id="${esc(proposal.id)}">Kabul</button>`);
    buttons.push(`<button class="table-action" type="button" data-action="governance-vote" data-vote="no" data-id="${esc(proposal.id)}">Ret</button>`);
    buttons.push(`<button class="table-action" type="button" data-action="governance-vote" data-vote="abstain" data-id="${esc(proposal.id)}">Çekimser</button>`);
    buttons.push(`<button class="table-action danger-action" type="button" data-action="governance-recuse" data-id="${esc(proposal.id)}">Çıkar çatışması bildir</button>`);
  }
  if (governanceCanFinalize(proposal)) {
    buttons.push(`<button class="table-action" type="button" data-action="governance-finalize" data-id="${esc(proposal.id)}">Oylamayı sonuçlandır</button>`);
  }
  return buttons.length ? `<div class="inline-actions">${buttons.join("")}</div>` : "";
}

function governanceProposalCard(proposal) {
  const threshold = Number(proposal.required_ratio) >= 0.6666 ? "Üye tam sayısının üçte ikisi" : "Salt çoğunluk";
  return `
    <article class="entity-card glass governance-card">
      <div class="entity-top">
        ${badge(governanceProposalTypeLabel(proposal.proposal_type), "violet")}
        ${badgeForStatus(proposal.status)}
      </div>
      <h3 style="margin-top:.85rem">${esc(proposal.title)}</h3>
      <p>${esc(proposal.summary || "Açıklama eklenmedi.")}</p>
      <div class="meta-list">
        <div class="meta-row"><span>Teklif sahibi</span><strong>${esc(proposal.proposer?.display_name || "Yürütme Kurulu üyesi")}</strong></div>
        <div class="meta-row"><span>Karar eşiği</span><strong>${esc(threshold)}</strong></div>
        <div class="meta-row"><span>Destek</span><strong>${proposal.sponsor_count || 0}</strong></div>
        <div class="meta-row"><span>Oy durumu</span><strong>${proposal.yes_count || 0} kabul · ${proposal.no_count || 0} ret · ${proposal.abstain_count || 0} çekimser</strong></div>
        <div class="meta-row"><span>Çekilme kaydı</span><strong>${proposal.recusal_count || 0}</strong></div>
        <div class="meta-row"><span>Oylama</span><strong>${formatDate(proposal.voting_starts_at, true)} - ${formatDate(proposal.voting_ends_at, true)}</strong></div>
        ${proposal.my_vote ? `<div class="meta-row"><span>Oyunuz</span><strong>${esc(governanceVoteLabel(proposal.my_vote))}</strong></div>` : ""}
        ${proposal.my_recusal ? `<div class="meta-row"><span>Katılım durumu</span><strong>Çıkar çatışması nedeniyle çekildiniz</strong></div>` : ""}
        ${proposal.regulation ? `<div class="meta-row"><span>Yönetmelik</span><strong>${esc(proposal.regulation.title)}</strong></div>` : ""}
        ${proposal.agreement ? `<div class="meta-row"><span>Antlaşma</span><strong>${esc(proposal.agreement.title)}</strong></div>` : ""}
      </div>
      ${proposal.proposed_content ? `<details class="setup-box"><summary>Teklif metnini göster</summary><div class="regulation-body">${esc(proposal.proposed_content)}</div></details>` : ""}
      ${governanceProposalActions(proposal)}
    </article>
  `;
}

function governanceElectionActions(election) {
  const buttons = [];
  const isAdmin = Boolean(governanceData().permissions?.is_admin);
  if (election.phase === "nominations" && !election.is_candidate && !isAdmin) {
    buttons.push(`<button class="table-action" type="button" data-action="governance-nominate" data-id="${esc(election.id)}">Aday ol</button>`);
  }
  if (election.phase === "nominations" && election.is_candidate && !isAdmin) {
    buttons.push(`<button class="table-action danger-action" type="button" data-action="governance-withdraw" data-id="${esc(election.id)}">Adaylıktan çekil</button>`);
  }
  if (election.phase === "voting" && !election.my_ballot && election.candidates?.length && !isAdmin) {
    buttons.push(`<button class="table-action" type="button" data-action="governance-election-vote" data-id="${esc(election.id)}">Oy kullan</button>`);
  }
  if (election.phase === "awaiting_result" && (governanceCanPropose() || isAdmin)) {
    buttons.push(`<button class="table-action" type="button" data-action="governance-election-finalize" data-id="${esc(election.id)}">Sonucu ilan et</button>`);
  }
  return buttons.length ? `<div class="inline-actions">${buttons.join("")}</div>` : "";
}

function governanceElectionCard(election) {
  const results = governanceData().election_results?.[election.id] || {};
  return `
    <article class="entity-card glass governance-card">
      <div class="entity-top">
        ${badge("Başkanlık seçimi", "gold")}
        ${badgeForStatus(election.phase)}
      </div>
      <h3 style="margin-top:.85rem">${esc(election.title)}</h3>
      <p>${esc(election.description || "Resmî seçim takvimi")}</p>
      <div class="meta-list">
        <div class="meta-row"><span>Adaylık</span><strong>${formatDate(election.nomination_starts_at, true)} - ${formatDate(election.nomination_ends_at, true)}</strong></div>
        <div class="meta-row"><span>Oy verme</span><strong>${formatDate(election.voting_starts_at, true)} - ${formatDate(election.voting_ends_at, true)}</strong></div>
        <div class="meta-row"><span>Adaylar</span><strong>${(election.candidates || []).map((candidate) => esc(candidate.profile?.display_name || "Üye")).join(", ") || "Henüz aday yok"}</strong></div>
        ${election.my_ballot ? `<div class="meta-row"><span>Oy durumu</span><strong>Oyunuz güvenli biçimde kaydedildi</strong></div>` : ""}
        ${election.winner ? `<div class="meta-row"><span>Seçilen Başkan</span><strong>${esc(election.winner.display_name)}</strong></div>` : ""}
        ${Object.keys(results).length ? `<div class="meta-row"><span>Sonuç</span><strong>${(election.candidates || []).map((candidate) => `${esc(candidate.profile?.display_name || "Üye")}: ${results[candidate.profile_id] || 0}`).join(" · ")}</strong></div>` : ""}
      </div>
      ${governanceElectionActions(election)}
    </article>
  `;
}

function governancePage() {
  const data = governanceData();
  return `
    ${pageHeader(
      "Kararlar ve Seçimler",
      "Yürütme Kurulu ve demokratik katılım",
      "Teklif, destek, resmî oylama ve seçim sonuçları Ana Yönetmelikteki çoğunluk kurallarıyla kaydedilir.",
      governanceCanPropose()
        ? `<button class="btn btn-primary btn-sm" type="button" data-action="open-governance-proposal">${icon("plus")} Teklif Oluştur</button>`
        : ""
    )}
    <section class="metrics-grid">
      ${metric("Açık oylama", data.proposals.filter((item) => item.status === "voting").length, "Yürütme Kurulu", "check")}
      ${metric("Destek bekleyen", data.proposals.filter((item) => item.status === "collecting_support").length, "En az üçte bir", "users")}
      ${metric("Seçimler", data.elections.length, "Resmî takvim", "shield")}
      ${metric("Yürütme üyesi", data.executive_members.length, "Oy hakkı bulunan", "briefcase")}
    </section>
    <section class="panel glass" style="margin-bottom:.9rem">
      <div class="panel-head"><div><span class="panel-kicker">Kurumsal kayıt</span><h3>Yürütme Kurulu kararları</h3></div></div>
      <div class="card-grid application-grid">
        ${data.proposals.length ? data.proposals.map(governanceProposalCard).join("") : emptyCard("Henüz teklif yok", "Yeni teklifler burada görüşülüp oylanacak.")}
      </div>
    </section>
    <section class="panel glass">
      <div class="panel-head"><div><span class="panel-kicker">Demokratik katılım</span><h3>Başkanlık seçimleri</h3></div></div>
      <div class="card-grid application-grid">
        ${data.elections.length ? data.elections.map(governanceElectionCard).join("") : emptyCard("Seçim takvimi yok", "Yürütme Kurulu onaylı seçim takvimi burada yayımlanacak.")}
      </div>
    </section>
  `;
}

function governanceLocalDate(hoursFromNow) {
  const date = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  const offset = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.valueOf() - offset).toISOString().slice(0, 16);
}

function governanceOpenProposal(targetRegulation = null) {
  if (!governanceCanPropose()) return;
  const regulations = state.cache.regulation || [];
  const regulationMode = Boolean(targetRegulation);
  modal({
    title: regulationMode ? "Yönetmelik değişikliği teklif et" : "Yürütme Kurulu teklifi",
    subtitle: "Teklif resmî destek ve oylama sürecinden geçmeden yürürlüğe girmez.",
    body: `
      <form class="form-stack" data-form="governance-proposal">
        <div class="form-grid">
          <div class="form-group">
            <label for="governance-proposal-type">Teklif türü</label>
            <select class="field" id="governance-proposal-type" name="proposalType" data-governance-type ${regulationMode ? "disabled" : ""}>
              <option value="executive_decision">Yürütme Kurulu kararı</option>
              <option value="regulation_change" ${regulationMode ? "selected" : ""}>Yönetmelik değişikliği</option>
              <option value="temporary_rule">Geçici düzenleme</option>
              <option value="election_schedule">Seçim takvimi</option>
              <option value="early_election">Erken seçim</option>
            </select>
            ${regulationMode ? `<input type="hidden" name="proposalType" value="regulation_change" />` : ""}
          </div>
          <div class="form-group"><label for="governance-title">Başlık</label><input class="field" id="governance-title" name="title" required maxlength="180" value="${esc(targetRegulation ? `${targetRegulation.title} değişiklik teklifi` : "")}" /></div>
        </div>
        <div class="form-group"><label for="governance-summary">Gerekçe ve özet</label><textarea class="field" id="governance-summary" name="summary" maxlength="1600" required></textarea></div>
        <div class="form-group" data-governance-regulation ${regulationMode ? "" : "hidden"}>
          <label for="governance-regulation">Hedef yönetmelik</label>
          <select class="field" id="governance-regulation" name="targetRegulationId">
            <option value="">Seçin</option>
            ${regulations.map((item) => `<option value="${esc(item.id)}" ${targetRegulation?.id === item.id ? "selected" : ""}>${esc(item.title)}</option>`).join("")}
          </select>
        </div>
        <div class="form-group"><label for="governance-content">Teklif / yeni metin</label><textarea class="field regulation-editor" id="governance-content" name="proposedContent" maxlength="50000" rows="18">${esc(targetRegulation?.content || "")}</textarea></div>
        <div class="form-grid">
          <div class="form-group"><label for="governance-vote-start">Oylama başlangıcı</label><input class="field" id="governance-vote-start" name="votingStartsAt" type="datetime-local" required value="${governanceLocalDate(0)}" /></div>
          <div class="form-group"><label for="governance-vote-end">Oylama bitişi</label><input class="field" id="governance-vote-end" name="votingEndsAt" type="datetime-local" required value="${governanceLocalDate(72)}" /></div>
        </div>
        <div data-governance-election hidden>
          <div class="form-grid">
            <div class="form-group"><label>Adaylık başlangıcı</label><input class="field" name="nominationStartsAt" type="datetime-local" value="${governanceLocalDate(96)}" /></div>
            <div class="form-group"><label>Adaylık bitişi</label><input class="field" name="nominationEndsAt" type="datetime-local" value="${governanceLocalDate(144)}" /></div>
          </div>
          <div class="form-grid">
            <div class="form-group"><label>Oy verme başlangıcı</label><input class="field" name="electionVotingStartsAt" type="datetime-local" value="${governanceLocalDate(168)}" /></div>
            <div class="form-group"><label>Oy verme bitişi</label><input class="field" name="electionVotingEndsAt" type="datetime-local" value="${governanceLocalDate(216)}" /></div>
          </div>
        </div>
        <label class="account-delete-consent"><input type="checkbox" name="isSecret" /><span>Kişilerle ilgili hassas oylama; kullanılan oyların kimliği gizli kalsın.</span></label>
        <div class="modal-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button><button class="btn btn-primary btn-sm" type="submit">Teklifi kaydet</button></div>
      </form>
    `
  });
  governanceSyncProposalFields();
}

function governanceSyncProposalFields() {
  const type = document.querySelector("[data-governance-type]")?.value || document.querySelector('input[name="proposalType"]')?.value;
  const regulationFields = document.querySelector("[data-governance-regulation]");
  const electionFields = document.querySelector("[data-governance-election]");
  if (regulationFields) regulationFields.hidden = type !== "regulation_change";
  if (electionFields) electionFields.hidden = !["election_schedule", "early_election"].includes(type);
}

function governanceOpenNomination(election) {
  modal({
    title: "Başkanlık adaylığı",
    subtitle: election.title,
    body: `
      <form class="form-stack" data-form="governance-nomination" data-id="${esc(election.id)}">
        <div class="form-group"><label for="governance-statement">Adaylık açıklaması</label><textarea class="field" id="governance-statement" name="statement" maxlength="1200" required></textarea></div>
        <div class="modal-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button><button class="btn btn-primary btn-sm" type="submit">Adaylığı kaydet</button></div>
      </form>
    `
  });
}

function governanceOpenElectionVote(election) {
  modal({
    title: "Başkanlık seçimi",
    subtitle: "Oyunuz kaydedildikten sonra değiştirilemez.",
    body: `
      <form class="form-stack" data-form="governance-election-vote" data-id="${esc(election.id)}">
        <div class="choice-grid">
          ${(election.candidates || []).map((candidate) => `
            <label class="choice-item">
              <input type="radio" name="candidateId" value="${esc(candidate.profile_id)}" required />
              <span><strong>${esc(candidate.profile?.display_name || "Üye")}</strong><small>${esc(candidate.statement || "Adaylık açıklaması yok")}</small></span>
            </label>
          `).join("")}
        </div>
        <div class="modal-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button><button class="btn btn-primary btn-sm" type="submit">Oyumu kaydet</button></div>
      </form>
    `
  });
}

function governanceOpenRecusal(proposal) {
  modal({
    title: "Çıkar çatışması bildir",
    subtitle: "Gerekçe kurumsal kayda yazılır ve bu kararda oy kullanamazsınız.",
    body: `
      <form class="form-stack" data-form="governance-recusal" data-id="${esc(proposal.id)}">
        <div class="setup-box"><strong>${esc(proposal.title)}</strong><p class="security-note">Bu kayıt geri alınamaz.</p></div>
        <div class="form-group"><label for="governance-recusal-reason">Çekilme gerekçesi</label><textarea class="field" id="governance-recusal-reason" name="reason" required minlength="10" maxlength="1200"></textarea></div>
        <div class="modal-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button><button class="btn btn-primary btn-sm" type="submit">Çekilmeyi kaydet</button></div>
      </form>
    `
  });
}

const governanceBaseRenderPortalPage = renderPortalPage;
renderPortalPage = function patchedGovernanceRenderPortalPage(page) {
  if (page === "governance") return governancePage();
  return governanceBaseRenderPortalPage(page);
};

const governanceBaseLoadPage = loadPage;
loadPage = async function patchedGovernanceLoadPage(page) {
  await governanceBaseLoadPage(page);
  if (!["governance", "regulation"].includes(page) || !getSession() || !state.profile) return;
  try {
    const [governance, regulations] = await Promise.all([
      governanceAction({ action: "list" }),
      loadRegulations()
    ]);
    if (!getSession() || !state.profile) return;
    state.cache.governance = governance;
    state.cache.regulation = regulations;
    render();
  } catch (error) {
    if (!getSession() || !state.profile || isAuthenticationError(error)) return;
    state.pageError = {
      page,
      message: error?.message || "Yönetim kayıtları yüklenemedi."
    };
    showToast(state.pageError.message, "error");
    render();
  }
};

canEditRegulations = function patchedCanEditRegulations() {
  return Boolean(governanceData().permissions?.can_propose_regulation);
};

regulationPage = function patchedGovernanceRegulationPage() {
  const rows = state.cache.regulation || [];
  const proposals = governanceData().proposals.filter((item) => item.proposal_type === "regulation_change");
  return `
    ${pageHeader(
      "Topluluk rehberi",
      "İHP Parti ve Topluluk Yönetmeliği",
      "Yönetmelik metinleri yalnızca Yürütme Kurulunun usulüne uygun kararıyla değişir.",
      canEditRegulations()
        ? `<button class="btn btn-primary btn-sm" type="button" data-action="open-regulation">${icon("plus")} Değişiklik Teklifi</button>`
        : ""
    )}
    ${proposals.length ? `<section class="panel glass" style="margin-bottom:.9rem"><div class="panel-head"><h3>Değişiklik kayıtları</h3><span>${proposals.length} teklif</span></div><div class="card-grid application-grid">${proposals.map(governanceProposalCard).join("")}</div></section>` : ""}
    <div class="accordion">
      ${rows.length ? rows.map((item, index) => `
        <article class="accordion-item glass">
          <button class="accordion-btn" type="button" data-action="accordion"><span>${String(index + 1).padStart(2, "0")} · ${esc(item.title)}</span>${icon("chevron")}</button>
          <div class="accordion-content" ${index ? "hidden" : ""}>
            <div class="regulation-body">${esc(item.content)}</div>
            ${canEditRegulations() ? `<div class="inline-actions"><button class="table-action" type="button" data-action="edit-regulation" data-id="${esc(item.id)}">Değişiklik teklif et</button></div>` : ""}
          </div>
        </article>
      `).join("") : emptyCard("Yönetmelik bölümü yok", "Yürütme Kurulu kararıyla ilk metin oluşturulabilir.")}
    </div>
  `;
};

openRegulation = function patchedOpenRegulation(item = null) {
  governanceOpenProposal(item);
};

const governanceBaseSubmitForm = submitForm;
submitForm = async function patchedGovernanceSubmitForm(event) {
  const form = event.target.closest("form[data-form]");
  if (!form || !["governance-proposal", "governance-nomination", "governance-election-vote", "governance-recusal"].includes(form.dataset.form)) {
    return governanceBaseSubmitForm(event);
  }
  event.preventDefault();
  const submit = form.querySelector('[type="submit"]');
  const values = formData(form);
  if (submit) submit.disabled = true;
  try {
    if (form.dataset.form === "governance-proposal") {
      const result = await governanceAction({
        action: "propose",
        proposalType: values.proposalType,
        title: values.title,
        summary: values.summary,
        proposedContent: values.proposedContent,
        targetRegulationId: values.targetRegulationId || null,
        votingStartsAt: values.votingStartsAt,
        votingEndsAt: values.votingEndsAt,
        nominationStartsAt: values.nominationStartsAt,
        nominationEndsAt: values.nominationEndsAt,
        electionVotingStartsAt: values.electionVotingStartsAt,
        electionVotingEndsAt: values.electionVotingEndsAt,
        isSecret: values.isSecret === "on"
      });
      state.cache.governance = result.data;
      showToast("Teklif kurumsal sürece kaydedildi.");
    } else if (form.dataset.form === "governance-nomination") {
      const result = await governanceAction({
        action: "nominate",
        electionId: form.dataset.id,
        statement: values.statement
      });
      state.cache.governance = result.data;
      showToast("Adaylığınız kaydedildi.");
    } else if (form.dataset.form === "governance-election-vote") {
      const result = await governanceAction({
        action: "vote_election",
        electionId: form.dataset.id,
        candidateId: values.candidateId
      });
      state.cache.governance = result.data;
      showToast("Oyunuz değiştirilemez biçimde kaydedildi.");
    } else {
      const result = await governanceAction({
        action: "recuse",
        id: form.dataset.id,
        reason: values.reason
      });
      state.cache.governance = result.data;
      showToast("Çıkar çatışması ve çekilme kaydınız oluşturuldu.");
    }
    closeModal();
    render();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    if (submit) submit.disabled = false;
  }
};

const governanceBaseHandleClick = handleClick;
handleClick = async function patchedGovernanceHandleClick(event) {
  const target = event.target.closest("[data-action]");
  const action = target?.dataset.action;
  if (!action?.startsWith("governance-") && action !== "open-governance-proposal") {
    return governanceBaseHandleClick(event);
  }
  event.preventDefault();
  try {
    if (action === "open-governance-proposal") {
      governanceOpenProposal();
      return;
    }
    if (action === "governance-support") {
      const result = await governanceAction({ action: "support", id: target.dataset.id });
      state.cache.governance = result.data;
      showToast("Teklife desteğiniz kaydedildi.");
    }
    if (action === "governance-vote") {
      const result = await governanceAction({ action: "vote", id: target.dataset.id, vote: target.dataset.vote });
      state.cache.governance = result.data;
      showToast("Oyunuz kaydedildi.");
    }
    if (action === "governance-recuse") {
      const proposal = governanceData().proposals.find((item) => item.id === target.dataset.id);
      if (proposal) governanceOpenRecusal(proposal);
      return;
    }
    if (action === "governance-finalize") {
      const result = await governanceAction({ action: "finalize", id: target.dataset.id });
      state.cache.governance = result.data;
      showToast("Oylama sonucu kurumsal kayda işlendi.");
    }
    if (action === "governance-cancel") {
      const result = await governanceAction({ action: "cancel", id: target.dataset.id });
      state.cache.governance = result.data;
      showToast("Teklif geri çekildi.");
    }
    if (action === "governance-nominate") {
      const election = governanceData().elections.find((item) => item.id === target.dataset.id);
      if (election) governanceOpenNomination(election);
      return;
    }
    if (action === "governance-withdraw") {
      const result = await governanceAction({ action: "withdraw", electionId: target.dataset.id });
      state.cache.governance = result.data;
      showToast("Adaylıktan çekilme kaydedildi.");
    }
    if (action === "governance-election-vote") {
      const election = governanceData().elections.find((item) => item.id === target.dataset.id);
      if (election) governanceOpenElectionVote(election);
      return;
    }
    if (action === "governance-election-finalize") {
      const result = await governanceAction({ action: "finalize_election", electionId: target.dataset.id });
      state.cache.governance = result.data;
      showToast("Seçim sonucu ilan edildi.");
    }
    render();
  } catch (error) {
    showToast(error.message, "error");
  }
};

const governanceBaseHandleFilter = handleFilter;
handleFilter = async function patchedGovernanceHandleFilter(event) {
  if (event.target.closest("[data-governance-type]")) {
    governanceSyncProposalFields();
    return;
  }
  return governanceBaseHandleFilter(event);
};
