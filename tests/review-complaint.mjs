import assert from "node:assert/strict";
import handler from "../serverless-handlers/review-complaint.js";

process.env.SUPABASE_URL = "https://mock.supabase.test";
process.env.SUPABASE_ANON_KEY = "anon-test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

async function invoke({
  body,
  actorId = "actor",
  roles = ["discipline_member"],
  complaint,
  profiles = {},
  authStatus = 200
}) {
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    const method = options.method || "GET";
    requests.push({ target, method, body: options.body });
    if (target.includes("/auth/v1/user")) {
      return jsonResponse(
        authStatus === 200 ? { id: actorId, email: `${actorId}@example.test` } : { message: "expired" },
        authStatus
      );
    }
    if (target.includes("/rest/v1/profiles")) {
      const requestedId = decodeURIComponent(target.match(/id=eq\.([^&]+)/)?.[1] || actorId);
      const profile = profiles[requestedId] || {
        id: requestedId,
        role: requestedId === actorId ? roles[0] : "discipline_member",
        roles: requestedId === actorId ? roles : ["discipline_member"],
        status: "active",
        is_system_account: false
      };
      return jsonResponse([profile]);
    }
    if (target.includes("/rest/v1/complaints") && method === "GET") {
      return jsonResponse([complaint]);
    }
    if (target.endsWith("/rest/v1/complaints") && method === "POST") {
      return jsonResponse([{ id: "created-complaint", ...JSON.parse(options.body) }], 201);
    }
    if (target.includes("/rest/v1/complaints") && method === "PATCH") {
      return jsonResponse([{ ...complaint, ...JSON.parse(options.body) }]);
    }
    if (
      (target.endsWith("/rest/v1/audit_logs") || target.endsWith("/rest/v1/notifications"))
      && method === "POST"
    ) {
      return jsonResponse([], 201);
    }
    throw new Error(`Unexpected request: ${method} ${target}`);
  };

  let statusCode = 200;
  let payload = null;
  const request = {
    method: "POST",
    headers: { authorization: "Bearer test-token", "x-ihp-portal": "discipline" },
    body
  };
  const response = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(value) {
      payload = value;
      return value;
    }
  };

  try {
    await handler(request, response);
    return { statusCode, payload, requests };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const expiredSessionResult = await invoke({
  body: { id: "expired", claim: true, status: "reviewing" },
  complaint: null,
  authStatus: 401
});
assert.equal(expiredSessionResult.statusCode, 401);
assert.match(expiredSessionResult.payload.error, /oturumu/);

const officialCreateResult = await invoke({
  actorId: "member",
  roles: ["member"],
  body: {
    action: "create",
    accusedProfileId: "target-member",
    subject: "Resmî şikâyet",
    description: "Olayın tarih ve ayrıntılarını içeren resmî açıklama.",
    evidenceNote: "Mesaj ve ekran görüntüsü kayıtları",
    requestedOutcome: "Disiplin Kurulu tarafından incelenmesi",
    eventDate: new Date().toISOString().slice(0, 10),
    learnedAt: new Date().toISOString().slice(0, 10),
    priority: "normal"
  },
  complaint: null
});
assert.equal(officialCreateResult.statusCode, 200);
assert.equal(officialCreateResult.payload.complaint.source_channel, "dk_portal");
assert.equal(officialCreateResult.payload.complaint.regulation_version, "2026-07-19");

const successfulClaimResult = await invoke({
  body: { id: "available", claim: true, status: "reviewing" },
  complaint: {
    id: "available",
    complainant_profile_id: "reporter",
    assigned_to: null,
    status: "new"
  }
});
assert.equal(successfulClaimResult.statusCode, 200);
assert.equal(successfulClaimResult.payload.complaint.assigned_to, "actor");

const ownComplaint = {
  id: "own",
  complainant_profile_id: "actor",
  assigned_to: null,
  status: "new"
};
const ownResult = await invoke({
  body: { id: "own", claim: true, status: "reviewing" },
  complaint: ownComplaint
});
assert.equal(ownResult.statusCode, 403);
assert.match(ownResult.payload.error, /tarafı olan kişi/);

const accusedResult = await invoke({
  actorId: "accused",
  body: { id: "accused-case", claim: true, status: "reviewing" },
  complaint: {
    id: "accused-case",
    complainant_profile_id: "reporter",
    accused_profile_id: "accused",
    assigned_to: null,
    status: "new"
  }
});
assert.equal(accusedResult.statusCode, 403);
assert.match(accusedResult.payload.error, /tarafı olan kişi/);

const unassignedResult = await invoke({
  body: { id: "unassigned", status: "resolved", decisionNote: "Karar" },
  complaint: {
    id: "unassigned",
    complainant_profile_id: "reporter",
    assigned_to: null,
    status: "new"
  }
});
assert.equal(unassignedResult.statusCode, 409);
assert.match(unassignedResult.payload.error, /sorumlulugu alinmalidir/);

const otherAssigneeResult = await invoke({
  body: { id: "assigned", status: "resolved", decisionNote: "Karar" },
  complaint: {
    id: "assigned",
    complainant_profile_id: "reporter",
    assigned_to: "other-member",
    status: "reviewing"
  }
});
assert.equal(otherAssigneeResult.statusCode, 403);

const selfAssignmentResult = await invoke({
  actorId: "admin",
  roles: ["super_admin"],
  body: {
    id: "admin-edit",
    targetEdit: true,
    assignedTo: "reporter"
  },
  complaint: {
    id: "admin-edit",
    complainant_profile_id: "reporter",
    assigned_to: "other-member",
    status: "new"
  }
});
assert.equal(selfAssignmentResult.statusCode, 400);
assert.match(selfAssignmentResult.payload.error, /tarafı olan kişi/);

console.log("Şikayet sorumluluk ve çıkar çatışması kuralları doğrulandı.");
