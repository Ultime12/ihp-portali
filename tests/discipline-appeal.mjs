import assert from "node:assert/strict";
import handler from "../serverless-handlers/discipline-appeal.js";

process.env.SUPABASE_URL = "https://mock.supabase.test";
process.env.SUPABASE_ANON_KEY = "anon-test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  const target = String(url);
  if (target.includes("/auth/v1/user")) {
    return jsonResponse({ id: "reward-member", email: "member@example.test" });
  }
  if (target.includes("/rest/v1/profiles")) {
    return jsonResponse([{
      id: "reward-member",
      role: "member",
      roles: ["member"],
      status: "active"
    }]);
  }
  if (target.includes("/rest/v1/discipline_records") && (!options.method || options.method === "GET")) {
    return jsonResponse([{
      id: "reward-record",
      member_id: "reward-member",
      record_type: "Ödül",
      sanction_effect: "reward_points",
      point_delta: 10,
      decision_status: "decided",
      appeal_status: "none",
      archived: false
    }]);
  }
  throw new Error(`Unexpected request: ${options.method || "GET"} ${target}`);
};

let statusCode = 200;
let payload = null;
const request = {
  method: "POST",
  headers: { authorization: "Bearer test-token" },
  body: {
    id: "reward-record",
    action: "appeal",
    appealText: "Bu ödül kaydına itiraz denemesidir."
  }
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
  assert.equal(statusCode, 400);
  assert.match(payload.error, /Ödül puanı kayıtlarına itiraz edilemez/);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("Ödül puanı itiraz engeli doğrulandı.");
