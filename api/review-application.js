import { emailProfile } from "./_mail.js";

const VALID_DECISIONS = new Set(["reviewing", "accepted", "rejected"]);
const REQUESTABLE_ROLES = new Set([
  "spokesperson",
  "discipline_vice_chair",
  "discipline_member",
  "youth_member",
  "representative",
  "chief_representative",
  "member"
]);

function json(response, status, body) {
  return response.status(status).json(body);
}

async function supabaseRequest(path, options = {}) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
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
  const profileResponse = await supabaseRequest(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(authUser.id)}&select=id,role,roles,status&limit=1`
  );
  const [profile] = await profileResponse.json().catch(() => []);
  if (!profile || profile.status !== "active") return null;

  const roles = Array.isArray(profile.roles) && profile.roles.length ? profile.roles : [profile.role];
  return { authUser, profile, roles };
}

function hasAny(roles, allowed) {
  return roles.some((role) => allowed.has(role));
}

function rolesOf(profile) {
  const roles = Array.isArray(profile?.roles) && profile.roles.length ? [...profile.roles] : [];
  if (profile?.role && !roles.includes(profile.role)) roles.unshift(profile.role);
  return [...new Set(roles.filter(Boolean))];
}

function primaryRole(roles) {
  const priority = [
    "super_admin",
    "president",
    "vice_president",
    "presidential_aide",
    "discipline_chair",
    "discipline_vice_chair",
    "youth_chair",
    "spokesperson",
    "chief_representative",
    "representative",
    "discipline_member",
    "youth_member",
    "member"
  ];
  return priority.find((role) => roles.includes(role)) || roles[0] || "member";
}

async function fetchSingle(path) {
  const response = await supabaseRequest(path);
  const [row] = await response.json().catch(() => []);
  return response.ok ? row || null : null;
}

async function actorCommitteeIds(actorId) {
  const response = await supabaseRequest(
    `/rest/v1/profile_committees?profile_id=eq.${encodeURIComponent(actorId)}&select=committee_id`
  );
  const rows = await response.json().catch(() => []);
  return response.ok ? rows.map((row) => row.committee_id).filter(Boolean) : [];
}

function normalizeCommitteeName(name = "") {
  return String(name).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function isExecutiveCommittee(name = "") {
  const normalized = normalizeCommitteeName(name);
  return normalized === "Yurutme Kurulu" || normalized === "Yonetim Kurulu";
}

function canReview(actor, committee, application, actorCommittees = []) {
  const actorRoles = actor.roles;
  const committeeName = committee?.name || "";
  const committeeId = committee?.id || "";
  if (actorRoles.includes("super_admin")) return true;
  if (application.claimed_by && application.claimed_by !== actor.authUser.id && !actorRoles.includes("discipline_chair")) {
    return false;
  }
  if (
    (isExecutiveCommittee(committeeName) || actorCommittees.includes(committeeId)) &&
    hasAny(actorRoles, new Set(["president", "vice_president", "presidential_aide"]))
  ) {
    return true;
  }
  if (committeeName === "Disiplin Kurulu") {
    return hasAny(actorRoles, new Set(["discipline_chair", "discipline_vice_chair", "discipline_member"]));
  }
  if (committeeName === "Gen\u00e7lik Kollar\u0131") return actorRoles.includes("youth_chair");
  return false;
}

function canAcceptRequestedRole(actorRoles, committeeName, requestedRole) {
  if (actorRoles.includes("super_admin")) return true;
  if (committeeName === "Disiplin Kurulu") {
    if (actorRoles.includes("discipline_member")) return requestedRole === "discipline_member";
    if (actorRoles.includes("discipline_vice_chair")) return ["discipline_member", "discipline_vice_chair"].includes(requestedRole);
    if (actorRoles.includes("discipline_chair")) {
      return ["discipline_member", "discipline_vice_chair"].includes(requestedRole);
    }
  }
  if (committeeName === "Gen\u00e7lik Kollar\u0131") {
    return actorRoles.includes("youth_chair") && ["youth_member"].includes(requestedRole);
  }
  if (hasAny(actorRoles, new Set(["president", "vice_president", "presidential_aide"]))) {
    return !["super_admin"].includes(requestedRole);
  }
  return false;
}

async function addCommitteeMembership(profileId, committeeId, actorId) {
  if (!committeeId) return;
  await supabaseRequest("/rest/v1/profile_committees?on_conflict=profile_id,committee_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      profile_id: profileId,
      committee_id: committeeId,
      role_in_committee: "application",
      assigned_by: actorId
    })
  });
}

async function notify(profileId, actorId, title, body) {
  if (!profileId) return;
  await supabaseRequest("/rest/v1/notifications", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      recipient_id: profileId,
      actor_id: actorId,
      title,
      body,
      category: "application",
      link: "#/portal/applications"
    })
  }).catch(() => undefined);
  await emailProfile(supabaseRequest, profileId, {
    subject: title,
    title,
    body,
    actionUrl: "#/portal/applications",
    actionLabel: "Basvurulari ac"
  }).catch(() => undefined);
}

async function audit(actorId, applicationId, summary, details = {}) {
  await supabaseRequest("/rest/v1/audit_logs", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      action: "update",
      actor_id: actorId,
      target_type: "applications",
      target_id: applicationId,
      details: { summary, ...details }
    })
  }).catch(() => undefined);
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return json(response, 405, { error: "Yalnizca POST istegi kabul edilir." });
  }

  if (
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_ANON_KEY ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return json(response, 500, { error: "Sunucu yapilandirmasi eksik." });
  }

  const actor = await authenticateActor(request);
  if (!actor) return json(response, 401, { error: "Oturum bulunamadi." });

  const { id, status, decisionNote = "", claim = false } = request.body || {};
  if (!id || !VALID_DECISIONS.has(status)) {
    return json(response, 400, { error: "Basvuru karari gecersiz." });
  }

  const application = await fetchSingle(
    `/rest/v1/applications?id=eq.${encodeURIComponent(id)}&select=*&limit=1`
  );
  if (!application) return json(response, 404, { error: "Basvuru bulunamadi." });

  const committeeId = application.target_committee_id || application.suggested_committee_id;
  const committee = committeeId
    ? await fetchSingle(`/rest/v1/committees?id=eq.${encodeURIComponent(committeeId)}&select=id,name&limit=1`)
    : null;
  const actorCommittees = await actorCommitteeIds(actor.authUser.id);
  if (!canReview(actor, committee, application, actorCommittees)) {
    return json(response, 403, { error: "Bu basvuruyu sonuclandirma yetkiniz yok." });
  }

  const requestedRole = application.requested_role || "member";
  if (status === "accepted" && !REQUESTABLE_ROLES.has(requestedRole)) {
    return json(response, 400, { error: "Bu rol basvuru uzerinden verilemez." });
  }
  if (status === "accepted" && !canAcceptRequestedRole(actor.roles, committee?.name || "", requestedRole)) {
    return json(response, 403, { error: "Bu rol icin onay hiyerarsisi uygun degil." });
  }

  if (claim) {
    if (!actor.roles.includes("super_admin") && ((committee?.name || "") !== "Disiplin Kurulu" || !actor.roles.includes("discipline_chair"))) {
      return json(response, 403, { error: "Sorumlulugu yalnizca disiplin kurulu baskani alabilir." });
    }
    const claimResponse = await supabaseRequest(`/rest/v1/applications?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        status: "reviewing",
        decision_note: String(decisionNote).slice(0, 600),
        claimed_by: actor.authUser.id,
        claimed_at: new Date().toISOString(),
        decided_by: actor.authUser.id,
        decided_at: new Date().toISOString()
      })
    });
    const claimed = await claimResponse.json().catch(() => null);
    if (!claimResponse.ok) {
      return json(response, claimResponse.status, { error: claimed?.message || "Sorumluluk kaydedilemedi." });
    }
    await audit(actor.authUser.id, id, "Basvuru sorumlulugu alindi", { status: "reviewing" });
    await notify(application.applicant_profile_id, actor.authUser.id, "Basvurunuz incelemeye alindi", "Disiplin kurulu baskani basvurunuzun sorumlulugunu aldi.");
    return json(response, 200, { ok: true, application: claimed?.[0] || null });
  }

  if (status === "accepted" && application.applicant_profile_id) {
    const applicant = await fetchSingle(
      `/rest/v1/profiles?id=eq.${encodeURIComponent(application.applicant_profile_id)}&select=id,role,roles,status,committee_id&limit=1`
    );
    if (!applicant) return json(response, 404, { error: "Basvuran profil bulunamadi." });

    const nextRoles = [...new Set([...rolesOf(applicant), requestedRole])];
    const profilePayload = {
      roles: nextRoles,
      role: primaryRole(nextRoles),
      status: "active",
      committee_id: applicant.committee_id || committeeId || null
    };

    const profileResponse = await supabaseRequest(
      `/rest/v1/profiles?id=eq.${encodeURIComponent(applicant.id)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(profilePayload)
      }
    );
    if (!profileResponse.ok) {
      const result = await profileResponse.json().catch(() => ({}));
      return json(response, profileResponse.status, { error: result.message || "Profil guncellenemedi." });
    }

    await addCommitteeMembership(applicant.id, committeeId, actor.authUser.id);
  }

  const decisionResponse = await supabaseRequest(`/rest/v1/applications?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      status,
      decision_note: String(decisionNote).slice(0, 600),
      decided_by: actor.authUser.id,
      decided_at: new Date().toISOString()
    })
  });
  const result = await decisionResponse.json().catch(() => null);
  if (!decisionResponse.ok) {
    return json(response, decisionResponse.status, {
      error: result?.message || "Basvuru sonucu kaydedilemedi."
    });
  }

  await audit(actor.authUser.id, id, `Basvuru ${status === "accepted" ? "kabul edildi" : status === "rejected" ? "reddedildi" : "incelemeye alindi"}`, {
    status,
    requested_role: requestedRole
  });
  await notify(
    application.applicant_profile_id,
    actor.authUser.id,
    status === "accepted" ? "Basvurunuz kabul edildi" : status === "rejected" ? "Basvurunuz reddedildi" : "Basvurunuz incelemeye alindi",
    `${committee?.name || "Kurul"} basvurunuz ${status === "accepted" ? "kabul edildi" : status === "rejected" ? "reddedildi" : "incelemeye alindi"}. ${decisionNote ? `Not: ${decisionNote}` : ""}`
  );

  return json(response, 200, { ok: true, application: result?.[0] || null });
}
