import assert from "node:assert/strict";
import handler from "../server/finance-system.js";

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
let capturedTrade = null;

globalThis.fetch = async (url, options = {}) => {
  const target = String(url);
  if (target.includes("/auth/v1/user")) {
    return jsonResponse({ id: "profile-1", email: "member@example.test" });
  }
  if (target.includes("/rest/v1/profiles")) {
    return jsonResponse([{ id: "profile-1", status: "active", is_system_account: false }]);
  }
  if (target.includes("/rest/v1/credit_accounts")) {
    return jsonResponse([{ id: "credit-1", account_code: "IHP123456789", balance: 8000, status: "active" }]);
  }
  if (target.includes("/rest/v1/finance_accounts")) {
    return jsonResponse([{
      id: "finance-1",
      profile_id: "profile-1",
      credit_account_id: "credit-1",
      cash_balance: 2500,
      portfolio_fee_consent_at: "2026-07-01T09:00:00.000Z",
      portfolio_fee_last_charged_at: "2026-07-01T09:00:00.000Z",
      portfolio_fee_debt: 0
    }]);
  }
  if (target.includes("/rest/v1/finance_positions")) {
    return jsonResponse([{
      id: "position-1",
      finance_account_id: "finance-1",
      symbol: "THYAO.IS",
      quantity: "2.000000",
      average_cost: "300.000000"
    }]);
  }
  if (target.includes("/rest/v1/finance_transactions")) {
    return jsonResponse([]);
  }
  if (target.includes("/rest/v1/rpc/execute_finance_trade")) {
    capturedTrade = JSON.parse(options.body);
    return jsonResponse({ ok: true });
  }
  if (target.includes("/rest/v1/rpc/apply_finance_portfolio_fee")) {
    return jsonResponse({ applied: false, reason: "not_due", debt: 0 });
  }
  if (target.includes("query1.finance.yahoo.com")) {
    const symbol = decodeURIComponent(target.match(/chart\/([^?]+)/)?.[1] || "THYAO.IS");
    const price = symbol === "THYAO.IS" ? 318.5 : 150;
    return jsonResponse({
      chart: {
        result: [{
          meta: {
            regularMarketPrice: price,
            chartPreviousClose: price - 3,
            regularMarketTime: 1_788_000_000,
            marketState: "REGULAR"
          },
          timestamp: [1_787_999_100, 1_787_999_400, 1_787_999_700],
          indicators: { quote: [{ close: [price - 2, price - 1, price] }] }
        }],
        error: null
      }
    });
  }
  throw new Error(`Unexpected request: ${target}`);
};

let statusCode = 200;
let payload = null;
const response = {
  setHeader() {
    return this;
  },
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
  await handler({
    method: "POST",
    headers: { authorization: "Bearer valid-token" },
    body: {
      action: "trade",
      side: "buy",
      symbol: "THYAO.IS",
      quantity: 1,
      unitPrice: 1
    }
  }, response);
} finally {
  globalThis.fetch = originalFetch;
}

assert.equal(statusCode, 200);
assert.equal(capturedTrade.p_symbol, "THYAO.IS");
assert.equal(capturedTrade.p_quantity, 1);
assert.equal(capturedTrade.p_unit_price, 318.5);
assert.equal(payload.market.unit, "İHP kredi");
assert.equal(payload.positions[0].market_value, 637);
assert.equal(JSON.stringify(payload).includes("\"unitPrice\":1"), false);

console.log("İHP Finans canlı fiyat, portföy ve sunucu fiyat doğrulaması geçti.");
