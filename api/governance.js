import {
  effectiveElectorateSize,
  electionOutcome,
  proposalOutcome,
  supermajoritySize,
  supportThreshold
} from "../server/governance-rules.js";

const PROPOSAL_TYPES = new Set([
  "executive_decision",
  "regulation_change",
  "temporary_rule",
  "election_schedule",
  "early_election",
  "agreement_approval"
]);
const VOTES = new Set(["yes", "no", "abstain"]);
const ACTIONS = new Set([
  "list",
  "propose",
  "support",
  "vote",
  "recuse",
  "finalize",
  "cancel",
  "nominate",
  "withdraw",
  "vote_election",
  "finalize_election"
]);
const CORE_EXECUTIVE_ROLES = new Set(["president", "vice_president", "presidential_aide"]);
const MAX_VOTING_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

function json(response, status, body) {
  return response.status(status).json(body);
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${process.env.SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  return response;
}

async function fetchRows(path) {
  const response = await supabaseRequest(path);
  const rows = await response.json().catch(() => []);
  if (!response.ok) throw new Error(rows?.message || "Veri okunamadı.");
  return Array.isArray(rows) ? rows : [];
}

async function fetchOne(path) {
  const rows = await fetchRows(path);
  return rows[0] || null;
}

async function writeRows(path, options) {
  const response = await supabaseRequest(path, options);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.hint || "İşlem tamamlanamadı.");
    error.code = payload?.code || "";
    error.status = response.status;
    throw error;
  }
  return payload;
}

function rolesOf(profile) {
  const roles = Array.isArray(profile?.roles) && profile.roles.length ? [...profile.roles] : [];
  if (profile?.role && !roles.includes(profile.role)) roles.unshift(profile.role);
  return [...new Set(roles.filter(Boolean))];
}

function hasRole(profile, role) {
  return rolesOf(profile).includes(role);
}

function primaryRole(roles) {
  const priority = [
    "president",
    "vice_president",
    "presidential_aide",
    "discipline_chair",
    "discipline_vice_chair",
    "youth_chair",
    "spokesperson",
    "credit_officer",
    "chief_representative",
    "representative",
    "discipline_member",
    "youth_member",
    "member"
  ];
  return priority.find((role) => roles.includes(role)) || "member";
}

async function authenticateActor(request) {
  const bearer = request.headers.authorization || "";
  if (!bearer.startsWith("Bearer ")) return null;
  const token = bearer.slice(7);
  const authResponse = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`
    }
  });
  if (!authResponse.ok) return null;
  const authUser = await authResponse.json();
  const profile = await fetchOne(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(authUser.id)}&select=id,display_name,email,role,roles,status,is_system_account&limit=1`
  );
  if (!profile || profile.status !== "active" || profile.is_system_account) return null;
  return { authUser, profile };
}

async function executiveMembers() {
  const [profiles, extras] = await Promise.all([
    fetchRows("/rest/v1/profiles?status=eq.active&is_system_account=eq.false&select=id,display_name,role,roles"),
    fetchRows("/rest/v1/executive_committee_members?select=profile_id")
  ]);
  const extraIds = new Set(extras.map((row) => row.profile_id));
  return profiles.filter((profile) =>
    rolesOf(profile).some((role) => CORE_EXECUTIVE_ROLES.has(role)) || extraIds.has(profile.id)
  );
}

function isExecutive(actor, members) {
  return members.some((member) => member.id === actor.authUser.id);
}

function cleanText(value, max) {
  return String(value || "").trim().slice(0, max);
}

function parseDate(value, fallback = null) {
  const date = value ? new Date(value) : fallback;
  return date instanceof Date && Number.isFinite(date.valueOf()) ? date : null;
}

function votingWindow(body) {
  const now = new Date();
  const startsAt = parseDate(body.votingStartsAt, now);
  const endsAt = parseDate(body.votingEndsAt, new Date(now.valueOf() + 3 * 24 * 60 * 60 * 1000));
  if (!startsAt || !endsAt || endsAt <= startsAt) throw new Error("Oylama başlangıç ve bitiş zamanı geçersiz.");
  if (endsAt.valueOf() - startsAt.valueOf() > MAX_VOTING_WINDOW_MS) {
    throw new Error("Oylama süresi en fazla 14 gün olabilir.");
  }
  return { startsAt, endsAt };
}

function electionMetadata(body) {
  const nominationStartsAt = parseDate(body.nominationStartsAt);
  const nominationEndsAt = parseDate(body.nominationEndsAt);
  const votingStartsAt = parseDate(body.electionVotingStartsAt);
  const votingEndsAt = parseDate(body.electionVotingEndsAt);
  if (
    !nominationStartsAt ||
    !nominationEndsAt ||
    !votingStartsAt ||
    !votingEndsAt ||
    nominationEndsAt <= nominationStartsAt ||
    votingStartsAt < nominationEndsAt ||
    votingEndsAt <= votingStartsAt
  ) {
    throw new Error("Adaylık ve seçim takvimi geçersiz.");
  }
  return {
    nomination_starts_at: nominationStartsAt.toISOString(),
    nomination_ends_at: nominationEndsAt.toISOString(),
    voting_starts_at: votingStartsAt.toISOString(),
    voting_ends_at: votingEndsAt.toISOString()
  };
}

async function snapshotElectorate(proposalId, members) {
  const rows = members.map((member) => ({
    proposal_id: proposalId,
    profile_id: member.id,
    is_president: hasRole(member, "president")
  }));
  if (!rows.length) throw new Error("Yürütme Kurulu üyesi bulunamadı.");
  await writeRows("/rest/v1/governance_electorate", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(rows)
  });
  await writeRows(`/rest/v1/governance_proposals?id=eq.${encodeURIComponent(proposalId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      status: "voting",
      electorate_count: rows.length
    })
  });
}

async function proposalCounts(proposalId) {
  const votes = await fetchRows(
    `/rest/v1/governance_votes?proposal_id=eq.${encodeURIComponent(proposalId)}&select=voter_id,vote`
  );
  const counts = { yes: 0, no: 0, abstain: 0 };
  for (const row of votes) {
    if (Object.hasOwn(counts, row.vote)) counts[row.vote] += 1;
  }
  return { votes, counts };
}

async function syncProposalCounts(proposalId) {
  const { votes, counts } = await proposalCounts(proposalId);
  await writeRows(`/rest/v1/governance_proposals?id=eq.${encodeURIComponent(proposalId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      yes_count: counts.yes,
      no_count: counts.no,
      abstain_count: counts.abstain
    })
  });
  return { votes, counts };
}

async function notifyAll(actorId, title, body, link = "#/portal/governance") {
  const recipients = await fetchRows(
    "/rest/v1/profiles?status=eq.active&is_system_account=eq.false&select=id"
  );
  if (!recipients.length) return;
  await writeRows("/rest/v1/notifications", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(recipients.map((recipient) => ({
      recipient_id: recipient.id,
      actor_id: actorId,
      title: cleanText(title, 140),
      body: cleanText(body, 600),
      category: "governance",
      link
    })))
  });
}

async function applyElectionWinner(winnerId) {
  const presidents = await fetchRows(
    "/rest/v1/profiles?status=eq.active&is_system_account=eq.false&select=id,role,roles"
  );
  for (const profile of presidents) {
    const roles = rolesOf(profile);
    const nextRoles = profile.id === winnerId
      ? [...new Set([...roles.filter((role) => role !== "president"), "president"])]
      : roles.filter((role) => role !== "president");
    if (!nextRoles.length) nextRoles.push("member");
    if (roles.includes("president") || profile.id === winnerId) {
      await writeRows(`/rest/v1/profiles?id=eq.${encodeURIComponent(profile.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ roles: nextRoles, role: primaryRole(nextRoles) })
      });
    }
  }
}

async function enactProposal(proposal, actorId) {
  if (proposal.proposal_type === "regulation_change") {
    if (!proposal.target_regulation_id) throw new Error("Hedef yönetmelik bulunamadı.");
    await writeRows(`/rest/v1/regulations?id=eq.${encodeURIComponent(proposal.target_regulation_id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        content: proposal.proposed_content,
        updated_by: actorId
      })
    });
  }

  if (["election_schedule", "early_election"].includes(proposal.proposal_type)) {
    const metadata = proposal.metadata || {};
    await writeRows("/rest/v1/elections", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        proposal_id: proposal.id,
        title: proposal.title,
        description: proposal.summary,
        status: "scheduled",
        nomination_starts_at: metadata.nomination_starts_at,
        nomination_ends_at: metadata.nomination_ends_at,
        voting_starts_at: metadata.voting_starts_at,
        voting_ends_at: metadata.voting_ends_at,
        created_by: proposal.proposed_by
      })
    });
  }

  if (proposal.proposal_type === "agreement_approval") {
    if (!proposal.target_agreement_id) throw new Error("Onaylanacak antlaşma bulunamadı.");
    await writeRows(`/rest/v1/agreements?id=eq.${encodeURIComponent(proposal.target_agreement_id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        status: "active",
        activated_at: new Date().toISOString(),
        executive_proposal_id: proposal.id
      })
    });
  }
}

async function finalizeProposal(proposal, actor, members, force = false) {
  if (proposal.status !== "voting") throw new Error("Bu teklif oylamada değil.");
  const now = Date.now();
  const endsAt = new Date(proposal.voting_ends_at).valueOf();
  const [{ votes, counts }, recusals] = await Promise.all([
    syncProposalCounts(proposal.id),
    fetchRows(`/rest/v1/governance_recusals?proposal_id=eq.${encodeURIComponent(proposal.id)}&select=profile_id`)
  ]);
  const participatingCount = votes.length + recusals.length;
  if (!force && now < endsAt && participatingCount < proposal.electorate_count) {
    const threshold = supermajoritySize(proposal.electorate_count, Number(proposal.required_ratio));
    if (Number(proposal.required_ratio) < 2 / 3 || counts.yes < threshold) {
      throw new Error("Oylama süresi henüz tamamlanmadı.");
    }
  }

  const president = members.find((member) => hasRole(member, "president"));
  const presidentVote = votes.find((vote) => vote.voter_id === president?.id)?.vote || "";
  const outcome = proposalOutcome({
    electorateCount: effectiveElectorateSize(
      proposal.electorate_count,
      recusals.length,
      Number(proposal.required_ratio)
    ),
    yesCount: counts.yes,
    noCount: counts.no,
    abstainCount: counts.abstain,
    requiredRatio: Number(proposal.required_ratio),
    presidentVote
  });
  const status = outcome.approved ? "approved" : "rejected";
  await writeRows(`/rest/v1/governance_proposals?id=eq.${encodeURIComponent(proposal.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      status,
      yes_count: counts.yes,
      no_count: counts.no,
      abstain_count: counts.abstain,
      decided_at: new Date().toISOString(),
      enacted_at: outcome.approved ? new Date().toISOString() : null
    })
  });
  if (outcome.approved) await enactProposal(proposal, actor.authUser.id);
  await notifyAll(
    actor.authUser.id,
    outcome.approved ? "Yürütme Kurulu kararı kabul edildi" : "Yürütme Kurulu teklifi reddedildi",
    proposal.title
  );
  return { status, outcome, counts, recusalCount: recusals.length };
}

function electionPhase(election) {
  if (["closed", "runoff_required", "cancelled"].includes(election.status)) return election.status;
  const now = Date.now();
  if (now < new Date(election.nomination_starts_at).valueOf()) return "scheduled";
  if (now < new Date(election.nomination_ends_at).valueOf()) return "nominations";
  if (now < new Date(election.voting_starts_at).valueOf()) return "scheduled";
  if (now < new Date(election.voting_ends_at).valueOf()) return "voting";
  return "awaiting_result";
}

async function listData(actor, members) {
  const [proposals, sponsors, electorate, myVotes, recusals, elections, candidates, myBallots] = await Promise.all([
    fetchRows(
      "/rest/v1/governance_proposals?select=*,proposer:profiles!governance_proposals_proposed_by_fkey(id,display_name),regulation:regulations!governance_proposals_target_regulation_id_fkey(id,title),agreement:agreements!governance_proposals_target_agreement_id_fkey(id,title)&order=created_at.desc"
    ),
    fetchRows("/rest/v1/governance_sponsors?select=proposal_id,profile_id"),
    fetchRows("/rest/v1/governance_electorate?select=proposal_id,profile_id,is_president"),
    fetchRows(`/rest/v1/governance_votes?voter_id=eq.${encodeURIComponent(actor.authUser.id)}&select=proposal_id,vote`),
    fetchRows("/rest/v1/governance_recusals?select=proposal_id,profile_id,reason"),
    fetchRows(
      "/rest/v1/elections?select=*,winner:profiles!elections_winner_profile_id_fkey(id,display_name)&order=created_at.desc"
    ),
    fetchRows(
      "/rest/v1/election_candidates?select=*,profile:profiles!election_candidates_profile_id_fkey(id,display_name,member_code)&order=created_at.asc"
    ),
    fetchRows(`/rest/v1/election_ballots?voter_id=eq.${encodeURIComponent(actor.authUser.id)}&select=election_id,candidate_id`)
  ]);

  const resultCounts = {};
  for (const election of elections) {
    const phase = electionPhase(election);
    election.phase = phase;
    const electionCandidates = candidates.filter((candidate) => candidate.election_id === election.id && candidate.status === "active");
    election.candidates = electionCandidates;
    election.my_ballot = myBallots.find((ballot) => ballot.election_id === election.id) || null;
    election.is_candidate = electionCandidates.some((candidate) => candidate.profile_id === actor.authUser.id);
    if (["closed", "runoff_required"].includes(phase)) {
      const ballots = await fetchRows(
        `/rest/v1/election_ballots?election_id=eq.${encodeURIComponent(election.id)}&select=candidate_id`
      );
      resultCounts[election.id] = electionOutcome(
        electionCandidates.map((candidate) => candidate.profile_id),
        ballots
      ).counts;
    }
  }

  return {
    proposals: proposals.map((proposal) => ({
      ...proposal,
      sponsor_count: sponsors.filter((item) => item.proposal_id === proposal.id).length,
      sponsored_by_me: sponsors.some((item) => item.proposal_id === proposal.id && item.profile_id === actor.authUser.id),
      eligible_to_vote: electorate.some((item) => item.proposal_id === proposal.id && item.profile_id === actor.authUser.id),
      my_vote: myVotes.find((vote) => vote.proposal_id === proposal.id)?.vote || null,
      recusal_count: recusals.filter((item) => item.proposal_id === proposal.id).length,
      my_recusal: recusals.find(
        (item) => item.proposal_id === proposal.id && item.profile_id === actor.authUser.id
      ) || null
    })),
    elections,
    election_results: resultCounts,
    executive_members: members,
    permissions: {
      is_executive: isExecutive(actor, members),
      is_president: hasRole(actor.profile, "president"),
      can_propose_regulation: isExecutive(actor, members)
    }
  };
}

export default async function handler(request, response) {
  if (request.method !== "POST") return json(response, 405, { error: "Yalnızca POST desteklenir." });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return json(response, 500, { error: "Sunucu yapılandırması eksik." });
  }

  try {
    const actor = await authenticateActor(request);
    if (!actor) return json(response, 401, { error: "Geçerli ve aktif üye oturumu bulunamadı." });
    const body = request.body || {};
    const action = String(body.action || "list");
    if (!ACTIONS.has(action)) return json(response, 400, { error: "Yönetişim işlemi geçersiz." });
    const members = await executiveMembers();
    const actorIsExecutive = isExecutive(actor, members);

    if (action === "list") {
      return json(response, 200, await listData(actor, members));
    }

    if (action === "propose") {
      if (!actorIsExecutive) return json(response, 403, { error: "Teklif yalnızca Yürütme Kurulu üyelerince açılabilir." });
      const proposalType = String(body.proposalType || "");
      const title = cleanText(body.title, 180);
      const summary = cleanText(body.summary, 1600);
      const proposedContent = cleanText(body.proposedContent, 50000);
      if (!PROPOSAL_TYPES.has(proposalType) || title.length < 3) {
        return json(response, 400, { error: "Teklif türü veya başlığı geçersiz." });
      }
      if (proposalType === "agreement_approval") {
        return json(response, 400, { error: "Antlaşma onay teklifleri antlaşma imza akışından oluşturulur." });
      }
      const targetRegulationId = proposalType === "regulation_change" ? String(body.targetRegulationId || "") : null;
      if (proposalType === "regulation_change" && (!targetRegulationId || proposedContent.length < 20)) {
        return json(response, 400, { error: "Yönetmelik değişikliği için hedef ve yeni metin zorunludur." });
      }
      if (proposalType === "temporary_rule" && proposedContent.length < 10) {
        return json(response, 400, { error: "Geçici düzenleme metni zorunludur." });
      }
      const { startsAt, endsAt } = votingWindow(body);
      const metadata = ["election_schedule", "early_election"].includes(proposalType)
        ? electionMetadata(body)
        : proposalType === "temporary_rule"
          ? { expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() }
          : {};
      const requiredRatio = ["regulation_change", "early_election"].includes(proposalType) ? 2 / 3 : 0.5;
      const inserted = await writeRows("/rest/v1/governance_proposals", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          proposal_type: proposalType,
          title,
          summary,
          proposed_content: proposedContent,
          target_regulation_id: targetRegulationId,
          metadata,
          proposed_by: actor.authUser.id,
          status: "collecting_support",
          is_secret: Boolean(body.isSecret),
          required_ratio: requiredRatio,
          voting_starts_at: startsAt.toISOString(),
          voting_ends_at: endsAt.toISOString()
        })
      });
      const proposal = inserted?.[0];
      await writeRows("/rest/v1/governance_sponsors", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ proposal_id: proposal.id, profile_id: actor.authUser.id })
      });
      if (hasRole(actor.profile, "president") || supportThreshold(members.length) <= 1) {
        await snapshotElectorate(proposal.id, members);
      }
      await notifyAll(actor.authUser.id, "Yeni Yürütme Kurulu teklifi", title);
      return json(response, 200, { ok: true, proposal, data: await listData(actor, members) });
    }

    if (action === "support") {
      if (!actorIsExecutive) return json(response, 403, { error: "Yalnızca Yürütme Kurulu üyeleri destek verebilir." });
      const proposal = await fetchOne(
        `/rest/v1/governance_proposals?id=eq.${encodeURIComponent(body.id || "")}&select=*&limit=1`
      );
      if (!proposal || proposal.status !== "collecting_support") {
        return json(response, 400, { error: "Destek verilebilecek teklif bulunamadı." });
      }
      await writeRows("/rest/v1/governance_sponsors", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify({ proposal_id: proposal.id, profile_id: actor.authUser.id })
      });
      const sponsors = await fetchRows(
        `/rest/v1/governance_sponsors?proposal_id=eq.${encodeURIComponent(proposal.id)}&select=profile_id`
      );
      if (sponsors.length >= supportThreshold(members.length)) await snapshotElectorate(proposal.id, members);
      return json(response, 200, { ok: true, data: await listData(actor, members) });
    }

    if (action === "vote" || action === "recuse") {
      const proposal = await fetchOne(
        `/rest/v1/governance_proposals?id=eq.${encodeURIComponent(body.id || "")}&select=*&limit=1`
      );
      const vote = String(body.vote || "");
      if (!proposal || proposal.status !== "voting" || (action === "vote" && !VOTES.has(vote))) {
        return json(response, 400, { error: "Oylama bilgisi geçersiz." });
      }
      const now = Date.now();
      if (now < new Date(proposal.voting_starts_at).valueOf() || now > new Date(proposal.voting_ends_at).valueOf()) {
        return json(response, 400, { error: "Oylama şu anda açık değil." });
      }
      const eligible = await fetchOne(
        `/rest/v1/governance_electorate?proposal_id=eq.${encodeURIComponent(proposal.id)}&profile_id=eq.${encodeURIComponent(actor.authUser.id)}&select=profile_id&limit=1`
      );
      if (!eligible) return json(response, 403, { error: "Bu oylamanın seçmen listesinde değilsiniz." });
      const existingRecusal = await fetchOne(
        `/rest/v1/governance_recusals?proposal_id=eq.${encodeURIComponent(proposal.id)}&profile_id=eq.${encodeURIComponent(actor.authUser.id)}&select=profile_id&limit=1`
      );
      if (existingRecusal) {
        return json(response, 409, { error: "Bu oylama için çıkar çatışması bildiriminiz zaten kaydedildi." });
      }
      if (action === "recuse") {
        const reason = cleanText(body.reason, 1200);
        if (reason.length < 10) {
          return json(response, 400, { error: "Çıkar çatışması gerekçesi en az 10 karakter olmalıdır." });
        }
        const existingVote = await fetchOne(
          `/rest/v1/governance_votes?proposal_id=eq.${encodeURIComponent(proposal.id)}&voter_id=eq.${encodeURIComponent(actor.authUser.id)}&select=voter_id&limit=1`
        );
        if (existingVote) {
          return json(response, 409, { error: "Oy kullandıktan sonra bu karar için çekilme kaydı açılamaz." });
        }
        await writeRows("/rest/v1/governance_recusals", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            proposal_id: proposal.id,
            profile_id: actor.authUser.id,
            reason
          })
        });
        const [votes, recusals] = await Promise.all([
          fetchRows(`/rest/v1/governance_votes?proposal_id=eq.${encodeURIComponent(proposal.id)}&select=voter_id`),
          fetchRows(`/rest/v1/governance_recusals?proposal_id=eq.${encodeURIComponent(proposal.id)}&select=profile_id`)
        ]);
        if (votes.length + recusals.length === proposal.electorate_count) {
          await finalizeProposal(proposal, actor, members, true);
        }
        return json(response, 200, { ok: true, data: await listData(actor, members) });
      }
      try {
        await writeRows("/rest/v1/governance_votes", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ proposal_id: proposal.id, voter_id: actor.authUser.id, vote })
        });
      } catch (error) {
        if (error.code === "23505") return json(response, 409, { error: "Bu oylamada oyunuzu daha önce kullandınız." });
        throw error;
      }
      const [{ votes, counts }, recusals] = await Promise.all([
        syncProposalCounts(proposal.id),
        fetchRows(`/rest/v1/governance_recusals?proposal_id=eq.${encodeURIComponent(proposal.id)}&select=profile_id`)
      ]);
      const threshold = supermajoritySize(proposal.electorate_count, Number(proposal.required_ratio));
      if (
        votes.length + recusals.length === proposal.electorate_count ||
        (Number(proposal.required_ratio) >= 2 / 3 && counts.yes >= threshold)
      ) {
        await finalizeProposal({ ...proposal, ...{
          yes_count: counts.yes,
          no_count: counts.no,
          abstain_count: counts.abstain
        } }, actor, members, true);
      }
      return json(response, 200, { ok: true, data: await listData(actor, members) });
    }

    if (action === "finalize") {
      if (!actorIsExecutive) return json(response, 403, { error: "Kararı yalnızca Yürütme Kurulu sonuçlandırabilir." });
      const proposal = await fetchOne(
        `/rest/v1/governance_proposals?id=eq.${encodeURIComponent(body.id || "")}&select=*&limit=1`
      );
      if (!proposal) return json(response, 404, { error: "Teklif bulunamadı." });
      const result = await finalizeProposal(proposal, actor, members);
      return json(response, 200, { ok: true, result, data: await listData(actor, members) });
    }

    if (action === "cancel") {
      const proposal = await fetchOne(
        `/rest/v1/governance_proposals?id=eq.${encodeURIComponent(body.id || "")}&select=*&limit=1`
      );
      if (!proposal || proposal.status !== "collecting_support" || proposal.proposed_by !== actor.authUser.id) {
        return json(response, 403, { error: "Yalnızca kendi destek aşamasındaki teklifinizi geri çekebilirsiniz." });
      }
      await writeRows(`/rest/v1/governance_proposals?id=eq.${encodeURIComponent(proposal.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          status: "cancelled",
          cancellation_reason: cleanText(body.reason || "Teklif sahibi tarafından geri çekildi.", 600),
          decided_at: new Date().toISOString()
        })
      });
      return json(response, 200, { ok: true, data: await listData(actor, members) });
    }

    const election = await fetchOne(
      `/rest/v1/elections?id=eq.${encodeURIComponent(body.electionId || "")}&select=*&limit=1`
    );
    if (!election) return json(response, 404, { error: "Seçim bulunamadı." });
    const phase = electionPhase(election);

    if (action === "nominate") {
      if (phase !== "nominations") return json(response, 400, { error: "Adaylık başvuruları açık değil." });
      try {
        await writeRows("/rest/v1/election_candidates", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            election_id: election.id,
            profile_id: actor.authUser.id,
            statement: cleanText(body.statement, 1200),
            status: "active"
          })
        });
      } catch (error) {
        if (error.code === "23505") return json(response, 409, { error: "Bu seçimde zaten aday kaydınız var." });
        throw error;
      }
      await notifyAll(actor.authUser.id, "Yeni başkan adayı", `${actor.profile.display_name} - ${election.title}`);
      return json(response, 200, { ok: true, data: await listData(actor, members) });
    }

    if (action === "withdraw") {
      if (phase !== "nominations") return json(response, 400, { error: "Adaylıktan çekilme süresi kapandı." });
      await writeRows(
        `/rest/v1/election_candidates?election_id=eq.${encodeURIComponent(election.id)}&profile_id=eq.${encodeURIComponent(actor.authUser.id)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ status: "withdrawn" })
        }
      );
      return json(response, 200, { ok: true, data: await listData(actor, members) });
    }

    if (action === "vote_election") {
      if (phase !== "voting") return json(response, 400, { error: "Oy verme süresi açık değil." });
      const candidateId = String(body.candidateId || "");
      const candidate = await fetchOne(
        `/rest/v1/election_candidates?election_id=eq.${encodeURIComponent(election.id)}&profile_id=eq.${encodeURIComponent(candidateId)}&status=eq.active&select=profile_id&limit=1`
      );
      if (!candidate) return json(response, 400, { error: "Geçerli bir aday seçin." });
      try {
        await writeRows("/rest/v1/election_ballots", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            election_id: election.id,
            voter_id: actor.authUser.id,
            candidate_id: candidateId
          })
        });
      } catch (error) {
        if (error.code === "23505") return json(response, 409, { error: "Bu seçimde oyunuzu daha önce kullandınız." });
        throw error;
      }
      return json(response, 200, { ok: true, data: await listData(actor, members) });
    }

    if (action === "finalize_election") {
      if (!actorIsExecutive) return json(response, 403, { error: "Seçim sonucunu Yürütme Kurulu ilan edebilir." });
      if (Date.now() < new Date(election.voting_ends_at).valueOf()) {
        return json(response, 400, { error: "Oy verme süresi henüz bitmedi." });
      }
      const [candidates, ballots] = await Promise.all([
        fetchRows(`/rest/v1/election_candidates?election_id=eq.${encodeURIComponent(election.id)}&status=eq.active&select=profile_id`),
        fetchRows(`/rest/v1/election_ballots?election_id=eq.${encodeURIComponent(election.id)}&select=candidate_id`)
      ]);
      const outcome = electionOutcome(candidates.map((candidate) => candidate.profile_id), ballots);
      const status = outcome.winnerId ? "closed" : "runoff_required";
      await writeRows(`/rest/v1/elections?id=eq.${encodeURIComponent(election.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          status,
          winner_profile_id: outcome.winnerId,
          result_announced_at: new Date().toISOString()
        })
      });
      if (outcome.winnerId) await applyElectionWinner(outcome.winnerId);
      await notifyAll(
        actor.authUser.id,
        outcome.winnerId ? "Başkanlık seçimi sonuçlandı" : "Başkanlık seçiminde ikinci tur gerekiyor",
        election.title
      );
      return json(response, 200, { ok: true, outcome, data: await listData(actor, members) });
    }

    return json(response, 400, { error: "İşlem tamamlanamadı." });
  } catch (error) {
    return json(response, error.status || 500, { error: error.message || "Yönetişim işlemi tamamlanamadı." });
  }
}
