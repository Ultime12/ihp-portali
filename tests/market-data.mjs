import assert from "node:assert/strict";
import handler from "../server/market-data.js";

process.env.SUPABASE_URL = "https://mock.supabase.test";
process.env.SUPABASE_ANON_KEY = "anon-test";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const target = String(url);
  if (target.includes("/auth/v1/user")) {
    return jsonResponse({ id: "member-1", email: "member@example.test" });
  }
  if (target.includes("query1.finance.yahoo.com")) {
    const symbol = decodeURIComponent(target.match(/chart\/([^?]+)/)?.[1] || "THYAO.IS");
    const seed = symbol.split("").reduce((sum, character) => sum + character.charCodeAt(0), 0);
    return jsonResponse({
      chart: {
        result: [{
          meta: {
            regularMarketPrice: seed,
            chartPreviousClose: seed - 5,
            regularMarketTime: 1_788_000_000,
            marketState: "REGULAR"
          },
          timestamp: [1_787_999_100, 1_787_999_400, 1_787_999_700],
          indicators: {
            quote: [{ close: [seed - 4, seed - 2, seed] }]
          }
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
  status(code) {
    statusCode = code;
    return this;
  },
  json(value) {
    payload = value;
    return value;
  },
  setHeader() {
    return this;
  }
};

try {
  await handler({
    method: "POST",
    headers: { authorization: "Bearer test-token" },
    body: { symbol: "THYAO.IS" }
  }, response);
} finally {
  globalThis.fetch = originalFetch;
}

assert.equal(statusCode, 200);
assert.equal(payload.unit, "İHP kredi");
assert.equal(payload.selectedSymbol, "THYAO.IS");
assert.equal(payload.instruments.length, 6);
assert.equal(payload.series.length, 3);
assert.equal(JSON.stringify(payload).includes("TL"), false);

console.log("Canlı piyasa veri sözleşmesi doğrulandı.");
