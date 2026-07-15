import assert from "node:assert/strict";
import handler from "../api/dk-proxy.js";

const originalFetch = globalThis.fetch;
const originalOrigin = process.env.IHP_CORE_API_ORIGIN;
let upstreamRequest = null;

globalThis.fetch = async (url, options) => {
  upstreamRequest = { url: String(url), options };
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};
process.env.IHP_CORE_API_ORIGIN = "https://ihp-portali.vercel.app";

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
  },
  send(value) {
    payload = JSON.parse(value);
    return payload;
  }
};

try {
  await handler({
    method: "POST",
    query: { target: "/api/review-complaint" },
    headers: { authorization: "Bearer current-member-token" },
    body: { id: "complaint-1", action: "claim" }
  }, response);
} finally {
  globalThis.fetch = originalFetch;
  if (originalOrigin === undefined) delete process.env.IHP_CORE_API_ORIGIN;
  else process.env.IHP_CORE_API_ORIGIN = originalOrigin;
}

assert.equal(statusCode, 200);
assert.deepEqual(payload, { ok: true });
assert.equal(upstreamRequest.url, "https://ihp26.vercel.app/api/review-complaint");
assert.equal(upstreamRequest.options.headers.Authorization, "Bearer current-member-token");

console.log("DK proxy canonical origin ve Authorization aktarımı doğrulandı.");
