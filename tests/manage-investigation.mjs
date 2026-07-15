import assert from "node:assert/strict";
import handler from "../serverless-handlers/manage-investigation.js";

process.env.SUPABASE_URL = "https://mock.supabase.test";
process.env.SUPABASE_ANON_KEY = "anon-test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";
delete process.env.RESEND_API_KEY;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

async function invoke({
  body,
  actorId = "investigator",
  actorRoles = ["discipline_member", "member"],
  investigation = null,
  profiles = {}
}) {
  const requests = [];
  const profileFor = (id) => profiles[id] || {
    id,
    role: id === actorId ? actorRoles[0] : "member",
    roles: id === actorId ? actorRoles : ["member"],
    status: "active",
    is_system_account: false
  };
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    const method = options.method || "GET";
    requests.push({ target, method, body: options.body });

    if (target.includes("/auth/v1/user")) {
      return jsonResponse({ id: actorId, email: `${actorId}@example.test` });
    }
    if (target.includes("/rest/v1/profiles")) {
      const requestedId = decodeURIComponent(target.match(/id=eq\.([^&]+)/)?.[1] || actorId);
      return jsonResponse([profileFor(requestedId)]);
    }
    if (target.endsWith("/rest/v1/investigations") && method === "POST") {
      const payload = JSON.parse(options.body);
      return jsonResponse([{ id: "investigation-created", ...payload }], 201);
    }
    if (target.includes("/rest/v1/investigations?id=eq.") && method === "GET") {
      return jsonResponse(investigation ? [investigation] : []);
    }
    if (target.includes("/rest/v1/investigations?id=eq.") && method === "PATCH") {
      const payload = JSON.parse(options.body);
      return jsonResponse([{ ...investigation, ...payload }]);
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
    headers: { authorization: "Bearer test-token" },
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

const createResult = await invoke({
  body: {
    action: "create",
    subjectProfileId: "president",
    title: "Dosya incelemesi",
    description: "Üst görevdeki üye hakkında ayrıntılı olay incelemesi."
  },
  profiles: {
    president: {
      id: "president",
      role: "president",
      roles: ["president", "member"],
      status: "active",
      is_system_account: false
    }
  }
});
assert.equal(createResult.statusCode, 200);
assert.equal(createResult.payload.investigation.assigned_to, null);
assert.equal(createResult.payload.investigation.assigned_at, null);
assert.equal(
  createResult.requests.some((entry) => entry.target.endsWith("/rest/v1/notifications")),
  true,
  "Soruşturma açılışı üyeye otomatik uyarı göndermeli."
);

const selfCreateResult = await invoke({
  actorId: "investigator",
  body: {
    action: "create",
    subjectProfileId: "investigator",
    title: "Kendi dosyası",
    description: "Kişinin kendi hakkında açmaya çalıştığı soruşturma."
  }
});
assert.equal(selfCreateResult.statusCode, 400);

const unassignedClaim = await invoke({
  actorId: "investigator",
  body: { action: "claim", id: "unassigned" },
  investigation: {
    id: "unassigned",
    subject_profile_id: "subject",
    opened_by: "opener",
    assigned_to: null,
    status: "open",
    defense_status: "pending",
    recused_profile_ids: []
  }
});
assert.equal(unassignedClaim.statusCode, 200);
assert.equal(unassignedClaim.payload.investigation.assigned_to, "investigator");

const legacyClaim = await invoke({
  actorId: "investigator",
  body: { action: "claim", id: "legacy" },
  investigation: {
    id: "legacy",
    subject_profile_id: "subject",
    opened_by: "legacy-opener",
    assigned_to: "legacy-opener",
    status: "open",
    defense_status: "pending",
    recused_profile_ids: []
  },
  profiles: {
    "legacy-opener": {
      id: "legacy-opener",
      role: "discipline_member",
      roles: ["discipline_member", "member"],
      status: "active",
      is_system_account: false
    }
  }
});
assert.equal(legacyClaim.statusCode, 200);
assert.equal(legacyClaim.payload.investigation.assigned_to, "investigator");

const occupiedClaim = await invoke({
  actorId: "investigator",
  body: { action: "claim", id: "occupied" },
  investigation: {
    id: "occupied",
    subject_profile_id: "subject",
    opened_by: "different-opener",
    assigned_to: "other-member",
    status: "reviewing",
    defense_status: "submitted",
    recused_profile_ids: []
  },
  profiles: {
    "other-member": {
      id: "other-member",
      role: "discipline_member",
      roles: ["discipline_member", "member"],
      status: "active",
      is_system_account: false
    }
  }
});
assert.equal(occupiedClaim.statusCode, 403);

const subjectClaim = await invoke({
  actorId: "subject",
  actorRoles: ["discipline_member", "member"],
  body: { action: "claim", id: "own-investigation" },
  investigation: {
    id: "own-investigation",
    subject_profile_id: "subject",
    opened_by: "opener",
    assigned_to: null,
    status: "open",
    defense_status: "pending",
    recused_profile_ids: []
  }
});
assert.equal(subjectClaim.statusCode, 403);
assert.match(subjectClaim.payload.error, /Kendi hakkinizdaki/);

console.log("Soruşturma hedef, sorumluluk ve çıkar çatışması kuralları doğrulandı.");
