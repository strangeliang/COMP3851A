const express = require("express");
const bcrypt = require("bcryptjs");
const { randomBytes } = require("node:crypto");
const { OAuth2Client } = require("google-auth-library");
const { StudyError } = require("../services/studyContracts");
const { createRateLimiter } = require("../services/sessionService");
const { startLogin } = require('../services/startLogin');

function createGoogleRoutes({ database, sessions, publicUser, client = new OAuth2Client(), clientId = process.env.GOOGLE_CLIENT_ID || "" }) {
  const router = express.Router();
  const attempts = createRateLimiter(20, 10 * 60 * 1000);
  const challenges = new Map();
  async function linkExistingStudent(identity) {
    const existing = await database.getUserByEmail(identity.email);
    if (!existing) throw new StudyError(409, 'ACCOUNT_CHANGED', 'Your account changed during sign-in. Refresh and try again.');
    if (existing.status !== 'Active') throw new StudyError(403, 'ACCOUNT_DISABLED', 'This account is disabled. Contact support.');
    // Google is authoritative for Gmail and verified Workspace accounts only.
    // A third-party Google email may no longer belong to its original owner.
    const authoritative = /@gmail\.com$/i.test(identity.email)
      || (typeof identity.hd === 'string' && identity.hd.trim().length > 0);
    if (existing.role !== 'Student' || !authoritative) throw new StudyError(409, 'GOOGLE_LINK_REQUIRES_CONFIRMATION',
      existing.role !== 'Student' ? 'This account requires its existing sign-in method. Administrator accounts are not linked automatically.'
        : 'This Google account uses a non-Google-hosted email. Automatic linking is not available; use your existing sign-in method or the email password-reset option to access your account.');
    await database.linkGoogleStudent({ subject: identity.sub, userId: existing.id, email: identity.email });
    const linked = await database.getGoogleUser(identity.sub);
    if (!linked || linked.id !== existing.id || linked.role !== 'Student') throw new StudyError(409, 'GOOGLE_LINK_CONFLICT',
      'This account is already linked to another Google identity, or has changed. Use its existing sign-in method or contact support.');
    return linked;
  }
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
    if (typeof identity?.sub !== 'string' || !identity.sub || identity.sub.length > 255 || identity.nonce !== nonce || identity.email_verified !== true
      || typeof identity.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email) || identity.email.length > 254) throw new StudyError(401, "INVALID_GOOGLE_TOKEN", "Google identity could not be verified.");
    let user = await database.getGoogleUser(identity.sub);
    if (!user) {
      if (await database.getUserByEmail(identity.email)) user = await linkExistingStudent(identity);
      else {
        try {
          user = await database.createGoogleUser({ subject: identity.sub, email: identity.email.toLowerCase(), name: (typeof identity.name === 'string' && identity.name.trim() ? identity.name : identity.email).slice(0, 80), passwordHash: await bcrypt.hash(randomBytes(48).toString("hex"), 12) });
        } catch (error) {
          if (error.code !== 'SQLITE_CONSTRAINT') throw error;
          // A parallel sign-in/registration may have created the account. Re-read
          // and apply the same ownership rules instead of replacing any binding.
          user = await database.getGoogleUser(identity.sub) || await linkExistingStudent(identity);
        }
      }
    }
    user = await database.getUserById(user.id);
    if (!user || user.status !== "Active") throw new StudyError(403, "ACCOUNT_DISABLED", "This account is disabled. Contact the administrator.");
    res.setHeader("Set-Cookie", [cookie("", 0), await startLogin(database, sessions, user, false, req.headers.cookie)]);
    res.json({ user: publicUser(user) });
  });
  return router;
}
module.exports = { createGoogleRoutes };
