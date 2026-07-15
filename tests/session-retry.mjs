import assert from "node:assert/strict";

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) || null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key)
};
globalThis.sessionStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined
};

let serverAttempts = 0;
let refreshAttempts = 0;
globalThis.fetch = async (url, options = {}) => {
  const target = String(url);
  if (target === "/api/config") {
    return Response.json({
      configured: true,
      supabaseUrl: "https://example.supabase.co",
      supabaseAnonKey: "anon"
    });
  }
  if (target.endsWith("/auth/v1/token?grant_type=password")) {
    return Response.json({
      access_token: "old-token",
      refresh_token: "refresh-token",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "member-1", email: "member@example.test" }
    });
  }
  if (target.endsWith("/auth/v1/token?grant_type=refresh_token")) {
    refreshAttempts += 1;
    return Response.json({
      access_token: "new-token",
      refresh_token: "new-refresh-token",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "member-1", email: "member@example.test" }
    });
  }
  if (target === "/api/protected-test") {
    serverAttempts += 1;
    if (serverAttempts === 1) {
      assert.equal(options.headers.Authorization, "Bearer old-token");
      return Response.json({ error: "expired" }, { status: 401 });
    }
    assert.equal(options.headers.Authorization, "Bearer new-token");
    return Response.json({ ok: true });
  }
  throw new Error(`Beklenmeyen istek: ${target}`);
};

const { loadConfig, serverRequest, signIn } = await import("../dist/src/lib/supabase.js");
await loadConfig();
await signIn("member@example.test", "password");
const result = await serverRequest("/api/protected-test", {
  method: "POST",
  body: JSON.stringify({ test: true })
});

assert.deepEqual(result, { ok: true });
assert.equal(serverAttempts, 2);
assert.equal(refreshAttempts, 1);
console.log("401 sonrası oturum yenileme ve tekrar deneme doğrulandı.");
