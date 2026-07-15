import assert from "node:assert/strict";
import handler from "../server/game-center.js";

process.env.SUPABASE_URL = "https://mock.supabase.test";
process.env.SUPABASE_ANON_KEY = "anon-test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const originalFetch = globalThis.fetch;
let requestedQuantity = null;
let batchRolls = null;

globalThis.fetch = async (url, options = {}) => {
  const target = String(url);
  if (target.includes("/auth/v1/user")) return jsonResponse({ id: "member-1", email: "member@example.test" });
  if (target.includes("/rest/v1/profiles?id=")) {
    return jsonResponse([{ id: "member-1", role: "member", roles: ["member"], status: "active", is_system_account: false }]);
  }
  if (target.includes("/rest/v1/rpc/request_scratch_credit_authorization")) {
    const body = JSON.parse(options.body || "{}");
    requestedQuantity = body.p_quantity;
    return jsonResponse([{ id: "request-1", profile_id: "member-1", game_key: "scratch", credit_amount: 100, status: "pending" }]);
  }
  if (target.includes("/rest/v1/rpc/play_scratch_batch")) {
    const body = JSON.parse(options.body || "{}");
    batchRolls = body.p_random_rolls;
    return jsonResponse(batchRolls.map((roll, index) => ({
      id: `attempt-${index + 1}`,
      profile_id: "member-1",
      game_key: "scratch",
      status: index < 2 ? "won" : "lost",
      reward_points: index < 2 ? 20 : 0,
      random_roll: roll
    })));
  }
  if (target.includes("/rest/v1/game_settings")) {
    return jsonResponse([{ game_key: "scratch", enabled: true, entry_cost: 10, reward_points: 20, win_probability_basis_points: 500 }]);
  }
  if (target.includes("/rest/v1/game_attempts")) return jsonResponse([]);
  if (target.includes("/rest/v1/credit_accounts")) return jsonResponse([{ id: "credit-1", account_code: "IHP123", balance: 1000, status: "active" }]);
  if (target.includes("/rest/v1/game_credit_requests")) return jsonResponse([]);
  throw new Error(`Unexpected request: ${target}`);
};

function invoke(body) {
  let statusCode = 200;
  let payload;
  const response = {
    setHeader() { return this; },
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return value; }
  };
  return handler({ method: "POST", headers: { authorization: "Bearer valid" }, body }, response)
    .then(() => ({ statusCode, payload }));
}

try {
  const requestResult = await invoke({ action: "request_credit", gameKey: "scratch", quantity: 10 });
  assert.equal(requestResult.statusCode, 200);
  assert.equal(requestedQuantity, 10);
  assert.equal(requestResult.payload.request.id, "request-1");

  const playResult = await invoke({ action: "play_scratch_batch", quantity: 10, acceptedTerms: true });
  assert.equal(playResult.statusCode, 200);
  assert.equal(batchRolls.length, 10);
  assert.equal(batchRolls.every((roll) => Number.isInteger(roll) && roll >= 0 && roll < 10000), true);
  assert.equal(playResult.payload.batchAttempts.length, 10);
  assert.equal(playResult.payload.wonCount, 2);
  assert.equal(playResult.payload.rewardPoints, 40);

  const invalidResult = await invoke({ action: "request_credit", gameKey: "scratch", quantity: 11 });
  assert.equal(invalidResult.statusCode, 400);
  assert.match(invalidResult.payload.error, /1 ile 10/i);

  const noConsent = await invoke({ action: "play_scratch_batch", quantity: 3, acceptedTerms: false });
  assert.equal(noConsent.statusCode, 400);
  assert.match(noConsent.payload.error, /onay/i);

  console.log("Kazı Kazan 1-10 kart paketi, sunucu şansı ve onay kuralları doğrulandı.");
} finally {
  globalThis.fetch = originalFetch;
}
