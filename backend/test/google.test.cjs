const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createGoogleRoutes } = require("../src/routes/googleRoutes");
const { createSessionService } = require("../src/services/sessionService");

test("Google login requires a verified nonce-bound token, isolates existing accounts and denies disabled users", async (t) => {
  let claims;
  let existing = false;
  let user;
  let created = 0;
  const sessions = createSessionService({ secure: false });
  const database = {
    getGoogleUser: async () => user,
    getUserByEmail: async () => existing ? { id: 99 } : null,
    createGoogleUser: async (data) => { created++; assert.ok(data.passwordHash.startsWith("$2")); user = { id: 10, status: "Active", role: "Student" }; return user; },
    getUserById: async () => user,
  };
  const app = express();
  app.use(express.json());
  app.use(createGoogleRoutes({ database, sessions, publicUser: (u) => u, clientId: "test-client", client: { verifyIdToken: async ({ audience }) => { assert.equal(audience, "test-client"); if (!claims) throw new Error("Bad signature"); return { getPayload: () => claims }; } } }));
  app.use((error, req, res, next) => { void next; res.status(error.status || 500).json({ code: error.code }); });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function challenge() {
    const r = await fetch(base + "/auth/google/config");
    const body = await r.json();
    claims = { sub: "google-subject", nonce: body.nonce, email: "user@gmail.com", email_verified: true };
    return r.headers.get("set-cookie").split(";")[0];
  }
  const login = (cookie = "") => fetch(base + "/auth/google", { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ credential: "test-credential" }) });
  assert.equal((await login()).status, 401);
  let cookie = await challenge(); claims = null;
  assert.equal((await login(cookie)).status, 401);
  cookie = await challenge(); claims.nonce = "wrong";
  assert.equal((await login(cookie)).status, 401);
  cookie = await challenge(); claims.email_verified = false;
  assert.equal((await login(cookie)).status, 401);
  cookie = await challenge(); existing = true;
  assert.equal((await login(cookie)).status, 409);
  assert.equal(created, 0);
  existing = false; cookie = await challenge();
  const success = await login(cookie);
  assert.equal(success.status, 200);
  assert.equal(created, 1);
  assert.match(success.headers.get("set-cookie"), /study_session=/);
  assert.equal((await login(cookie)).status, 401);
  cookie = await challenge(); user.status = "Disabled";
  assert.equal((await login(cookie)).status, 403);
});
