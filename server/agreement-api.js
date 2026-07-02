const ACTIONS = new Set(["create", "decide", "cancel", "delegate", "revoke_delegate"]);
const TARGET_TYPES = new Set(["member", "discipline", "youth", "party"]);
const SCOPES = new Set(["personal", "committee", "party"]);
const CORE_EXECUTIVE_ROLES = new Set(["president", "vice_president", "presidential_aide"]);
const PARTY_MANAGER_ROLES = new Set([
  "president",
  "vice_president",
  "presidential_aide",
  "spokesperson",
  "credit_officer",
  "discipline_chair",
  "discipline_vice_chair",
  "youth_chair",
  "chief_representative"
]);

function json(response, status, body) {
  return response.status(status).json(body);
}

async function supabaseRequest(path, options = {}) {
  return fetch(`${process.env.SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
}

async function rows(path) {
  const response = await supabaseRequest(path);
  const payload = await response.json().catch(() => []);
  if (!response.ok) throw new Error(payload?.message || "Veri okunamadı.");
  return Array.isArray(payload) ? payload : [];
}

async function one(path) {
  return (await rows(path))[0] || null;
}

async function write(path, options) {
  const response = await supabaseRequest(path, options);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.hint || "Antlaşma işlemi tamamlanamadı.");
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

function hasRole(profile, ...roles) {
  const current = rolesOf(profile);
  return roles.some((role) => current.includes(role));
}

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function validDate(value) {
  const date = new Date(value || "");
  return Number.isFinite(date.valueOf()) ? date : null;
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
  const profile = await one(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(authUser.id)}&select=id,display_name,role,roles,status,is_system_account&limit=1`
  );
  if (!profile || profile.status !== "active" || (profile.is_system_account && !hasRole(profile, "super_admin"))) return null;
  return { authUser, profile };
}

async function executiveMembers() {
  const [profiles, extras] = await Promise.all([
    rows("/rest/v1/profiles?status=eq.active&is_system_account=eq.false&select=id,display_name,role,roles"),
    rows("/rest/v1/executive_committee_members?select=profile_id")
  ]);
  const extraIds = new Set(extras.map((item) => item.profile_id));
  return profiles.filter((profile) =>
    rolesOf(profile).some((role) => CORE_EXECUTIVE_ROLES.has(role)) || extraIds.has(profile.id)
  );
}

async function activeDelegation(profileId) {
  const now = new Date().toISOString();
  return one(
    `/rest/v1/agreement_delegations?delegate_profile_id=eq.${encodeURIComponent(profileId)}&revoked_at=is.null&starts_at=lte.${encodeURIComponent(now)}&or=(ends_at.is.null,ends_at.gt.${encodeURIComponent(now)})&select=id&limit=1`
  );
}

async function canSign(actor, agreement) {
  if (hasRole(actor.profile, "super_admin")) return true;
  if (agreement.target_type === "member") return agreement.target_profile_id === actor.authUser.id;
  if (agreement.target_type === "discipline") return hasRole(actor.profile, "discipline_chair");
  if (agreement.target_type === "youth") return hasRole(actor.profile, "youth_chair");
  if (agreement.target_type === "party") {
    return hasRole(actor.profile, "president") || Boolean(await activeDelegation(actor.authUser.id));
  }
  return false;
}

async function createExecutiveApprovalProposal(agreement, actor) {
  const members = await executiveMembers();
  if (!members.length) throw new Error("Antlaşmayı onaylayacak Yürütme Kurulu bulunamadı.");
  const now = new Date();
  const end = new Date(now.valueOf() + 3 * 24 * 60 * 60 * 1000);
  const inserted = await write("/rest/v1/governance_proposals", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      proposal_type: "agreement_approval",
      title: `Antlaşma onayı: ${agreement.title}`.slice(0, 180),
      summary: `${agreement.purpose}\n${agreement.obligations}`.slice(0, 1600),
      proposed_content: agreement.body || agreement.purpose,
      target_agreement_id: agreement.id,
      proposed_by: actor.authUser.id,
      status: "voting",
      is_secret: false,
      required_ratio: 0.5,
      voting_starts_at: now.toISOString(),
      voting_ends_at: end.toISOString(),
      electorate_count: members.length
    })
  });
  const proposal = inserted?.[0];
  await write("/rest/v1/governance_electorate", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(members.map((member) => ({
      proposal_id: proposal.id,
      profile_id: member.id,
      is_president: hasRole(member, "president")
    })))
  });
  return proposal;
}

function targetCommitteeId(body, committees) {
  if (body.targetType === "discipline") {
    return committees.find((item) => item.name === "Disiplin Kurulu")?.id || null;
  }
  if (body.targetType === "youth") {
    return committees.find((item) => item.name === "Gençlik Kolları")?.id || null;
  }
  return null;
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
    const action = String(body.action || "");
    if (!ACTIONS.has(action)) return json(response, 400, { error: "Antlaşma işlemi geçersiz." });

    if (action === "create") {
      const title = clean(body.title, 160);
      const purpose = clean(body.purpose, 1200);
      const obligations = clean(body.obligations, 4000);
      const agreementBody = clean(body.body, 12000);
      const targetType = String(body.targetType || "");
      const scope = targetType === "party" ? "party" : String(body.scope || "personal");
      const effectiveAt = validDate(body.effectiveAt);
      const expiresAt = body.expiresAt ? validDate(body.expiresAt) : null;
      if (
        title.length < 3 ||
        purpose.length < 5 ||
        obligations.length < 5 ||
        !TARGET_TYPES.has(targetType) ||
        !SCOPES.has(scope) ||
        !effectiveAt
      ) {
        return json(response, 400, { error: "Taraf, amaç, yükümlülük ve yürürlük bilgileri eksiksiz girilmelidir." });
      }
      if (!agreementBody && !body.fileData) {
        return json(response, 400, { error: "Antlaşma metni veya PDF/Word dosyası zorunludur." });
      }
      if (expiresAt && expiresAt <= effectiveAt) {
        return json(response, 400, { error: "Bitiş tarihi yürürlük tarihinden sonra olmalıdır." });
      }
      if (targetType === "member" && (!body.targetProfileId || body.targetProfileId === actor.authUser.id)) {
        return json(response, 400, { error: "Antlaşma sunulacak farklı bir üye seçin." });
      }
      const committees = await rows("/rest/v1/committees?status=eq.active&select=id,name");
      const committeeId = targetCommitteeId(body, committees);
      if (["discipline", "youth"].includes(targetType) && !committeeId) {
        return json(response, 400, { error: "Hedef kurul bulunamadı." });
      }
      const requiresExecutiveApproval = scope === "party" || Boolean(body.requiresExecutiveApproval);
      const inserted = await write("/rest/v1/agreements", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          title,
          body: agreementBody,
          purpose,
          obligations,
          proposer_id: actor.authUser.id,
          target_type: targetType,
          target_profile_id: targetType === "member" ? body.targetProfileId : null,
          target_committee_id: committeeId,
          file_name: clean(body.fileName, 180),
          file_mime: clean(body.fileMime, 120),
          file_data: String(body.fileData || ""),
          effective_at: effectiveAt.toISOString(),
          expires_at: expiresAt?.toISOString() || null,
          scope,
          requires_executive_approval: requiresExecutiveApproval,
          status: "pending"
        })
      });
      return json(response, 200, { ok: true, agreement: inserted?.[0] || null });
    }

    if (action === "delegate") {
      if (!hasRole(actor.profile, "president", "super_admin")) {
        return json(response, 403, { error: "Parti adına imza yetkisini yalnızca Başkan devredebilir." });
      }
      const delegate = await one(
        `/rest/v1/profiles?id=eq.${encodeURIComponent(body.delegateProfileId || "")}&status=eq.active&is_system_account=eq.false&select=id,role,roles&limit=1`
      );
      if (!delegate || !rolesOf(delegate).some((role) => PARTY_MANAGER_ROLES.has(role))) {
        return json(response, 400, { error: "İmza yetkisi yalnızca aktif bir yöneticiye devredilebilir." });
      }
      const startsAt = validDate(body.startsAt) || new Date();
      const endsAt = body.endsAt ? validDate(body.endsAt) : null;
      const authorityNote = clean(body.authorityNote, 800);
      if (authorityNote.length < 5 || (endsAt && endsAt <= startsAt)) {
        return json(response, 400, { error: "Yetki kapsamı veya tarih aralığı geçersiz." });
      }
      await write("/rest/v1/agreement_delegations", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          delegate_profile_id: delegate.id,
          delegated_by: actor.authUser.id,
          authority_note: authorityNote,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt?.toISOString() || null
        })
      });
      return json(response, 200, { ok: true });
    }

    if (action === "revoke_delegate") {
      if (!hasRole(actor.profile, "president", "super_admin")) {
        return json(response, 403, { error: "İmza yetkisini yalnızca Başkan geri alabilir." });
      }
      await write(`/rest/v1/agreement_delegations?id=eq.${encodeURIComponent(body.id || "")}&revoked_at=is.null`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ revoked_at: new Date().toISOString() })
      });
      return json(response, 200, { ok: true });
    }

    const agreement = await one(
      `/rest/v1/agreements?id=eq.${encodeURIComponent(body.id || "")}&select=*&limit=1`
    );
    if (!agreement) return json(response, 404, { error: "Antlaşma bulunamadı." });

    if (action === "cancel") {
      if (agreement.status !== "pending" || (agreement.proposer_id !== actor.authUser.id && !hasRole(actor.profile, "super_admin"))) {
        return json(response, 403, { error: "Yalnızca kendi imza bekleyen antlaşmanızı geri çekebilirsiniz." });
      }
      await write(`/rest/v1/agreements?id=eq.${encodeURIComponent(agreement.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          status: "cancelled",
          decision_note: clean(body.decisionNote || "Sunan kişi tarafından geri çekildi.", 900)
        })
      });
      return json(response, 200, { ok: true });
    }

    if (action === "decide") {
      if (agreement.status !== "pending" || !(await canSign(actor, agreement))) {
        return json(response, 403, { error: "Bu antlaşmayı imzalama veya reddetme yetkiniz yok." });
      }
      const decision = body.decision === "signed" ? "signed" : "rejected";
      const decisionNote = clean(body.decisionNote, 900);
      if (decision === "rejected") {
        await write(`/rest/v1/agreements?id=eq.${encodeURIComponent(agreement.id)}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            status: "rejected",
            rejected_by: actor.authUser.id,
            rejected_at: new Date().toISOString(),
            decision_note: decisionNote
          })
        });
        return json(response, 200, { ok: true });
      }

      let proposal = null;
      if (agreement.requires_executive_approval) {
        proposal = await createExecutiveApprovalProposal(agreement, actor);
      }
      await write(`/rest/v1/agreements?id=eq.${encodeURIComponent(agreement.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          status: proposal ? "pending_executive" : "active",
          signed_by: actor.authUser.id,
          signed_at: new Date().toISOString(),
          authorized_by: actor.authUser.id,
          activated_at: proposal ? null : new Date().toISOString(),
          executive_proposal_id: proposal?.id || null,
          decision_note: decisionNote
        })
      });
      return json(response, 200, { ok: true, proposal });
    }

    return json(response, 400, { error: "Antlaşma işlemi tamamlanamadı." });
  } catch (error) {
    return json(response, error.status || 500, { error: error.message || "Antlaşma işlemi tamamlanamadı." });
  }
}
