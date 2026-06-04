const UPPER_ROLES = new Set(["super_admin", "president", "vice_president", "presidential_aide"]);
const VALID_DECISIONS = new Set(["reviewing", "accepted", "rejected"]);
const REQUESTABLE_ROLES = new Set([
  "spokesperson",
  "discipline_chair",
  "discipline_member",
  "youth_chair",
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

function canReview(actorRoles, committeeName) {
  if (hasAny(actorRoles, UPPER_ROLES)) return true;
  if (committeeName === "Disiplin Kurulu") return actorRoles.includes("discipline_chair");
  if (committeeName === "Gen\u00e7lik Kollar\u0131") return actorRoles.includes("youth_chair");
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

  const { id, status, decisionNote = "" } = request.body || {};
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
  if (!canReview(actor.roles, committee?.name || "")) {
    return json(response, 403, { error: "Bu basvuruyu sonuclandirma yetkiniz yok." });
  }

  const requestedRole = application.requested_role || "member";
  if (status === "accepted" && !REQUESTABLE_ROLES.has(requestedRole)) {
    return json(response, 400, { error: "Bu rol basvuru uzerinden verilemez." });
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

  return json(response, 200, { ok: true, application: result?.[0] || null });
}
