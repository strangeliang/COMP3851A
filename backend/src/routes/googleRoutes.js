const express = require("express");
const bcrypt = require("bcryptjs");
const { randomBytes } = require("node:crypto");
const { OAuth2Client } = require("google-auth-library");
const { StudyError } = require("../services/studyContracts");
const { createRateLimiter } = require("../services/sessionService");

function createGoogleRoutes({ database, sessions, publicUser, client = new OAuth2Client(), clientId = process.env.GOOGLE_CLIENT_ID || "" }) {
  const router = express.Router();
  const attempts = createRateLimiter(20, 10 * 60 * 1000);
  const challenges = new Map();
  const cookie = (value, age) => `google_login_nonce=${value}; HttpOnly; SameSite=Strict; Path=/api/auth/google; Max-Age=${age}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
  router.get("/auth/google/config", (req, res) => {
    if (!clientId) return res.json({ enabled: false });
    attempts(req.ip);
    for (const [key, expiry] of challenges) if (expiry < Date.now()) challenges.delete(key);
    const nonce = randomBytes(32).toString("hex");
    challenges.set(nonce, Date.now() + 5 * 60 * 1000);
    res.setHeader("Set-Cookie", cookie(nonce, 300));
    res.json({ enabled: true, clientId, nonce });
  });
  router.post("/auth/google", async (req, res) => {
    if (!clientId) throw new StudyError(503, "GOOGLE_NOT_CONFIGURED", "Google sign-in is not configured yet.");
    attempts(req.ip);
    const nonce = (req.headers.cookie || "").split(";").map((v) => v.trim()).find((v) => v.startsWith("google_login_nonce="))?.split("=")[1];
    const expiry = challenges.get(nonce);
    challenges.delete(nonce);
    res.setHeader("Set-Cookie", cookie("", 0));
    if (!expiry || expiry < Date.now()) throw new StudyError(401, "GOOGLE_EXPIRED", "Refresh the page and try Google sign-in again.");
    const credential = req.body?.credential;
    if (typeof credential !== "string" || credential.length > 10000) throw new StudyError(400, "INVALID_GOOGLE_TOKEN", "Invalid Google credential.");
    let identity;
    try { identity = (await client.verifyIdToken({ idToken: credential, audience: clientId })).getPayload(); }
    catch { throw new StudyError(401, "INVALID_GOOGLE_TOKEN", "Google sign-in could not be verified. Refresh and try again."); }
    if (!identity?.sub || identity.nonce !== nonce || identity.email_verified !== true || typeof identity.email !== "string" || identity.email.length > 254) throw new StudyError(401, "INVALID_GOOGLE_TOKEN", "Google identity could not be verified.");
    let user = await database.getGoogleUser(identity.sub);
    if (!user) {
      // Never silently link a Google identity to an existing password/admin account.
      if (await database.getUserByEmail(identity.email)) throw new StudyError(409, "ACCOUNT_EXISTS", "This email already has an account. Use your existing password; contact the administrator about linking Google.");
      try {
        user = await database.createGoogleUser({ subject: identity.sub, email: identity.email.toLowerCase(), name: (identity.name || identity.email).slice(0, 80), passwordHash: await bcrypt.hash(randomBytes(48).toString("hex"), 12) });
      } catch (error) {
        if (error.code === "SQLITE_CONSTRAINT") throw new StudyError(409, "ACCOUNT_EXISTS", "Account already exists. Please try signing in again.");
        throw error;
      }
    }
    if (user.status !== "Active") throw new StudyError(403, "ACCOUNT_DISABLED", "This account is disabled. Contact the administrator.");
    sessions.clear(req.headers.cookie);
    res.setHeader("Set-Cookie", [cookie("", 0), sessions.create(user.id, false)]);
    res.json({ user: publicUser(await database.getUserById(user.id)) });
  });
  return router;
}
module.exports = { createGoogleRoutes };
