const express = require("express");
const bcrypt = require("bcryptjs");
const { createSessionService, createRateLimiter } = require("../services/sessionService");
const { StudyError } = require("../services/studyContracts");

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status };
}

function createStudyRoutes({ database, gemini, sessions = createSessionService() }) {
  const router = express.Router();
  const loginLimit = createRateLimiter(20, 10 * 60 * 1000);
  const aiLimit = createRateLimiter(30, 5 * 60 * 1000);
  const inFlight = new Set();

  async function authenticate(req, res, next) {
    const session = sessions.get(req.headers.cookie);
    const user = session ? await database.getUserById(session.userId) : null;
    if (!user || user.status !== "Active") throw new StudyError(401, "AUTH_REQUIRED", "Please log in again.");
    req.user = publicUser(user);
    next();
  }

  router.post("/auth/login", async (req, res) => {
    loginLimit(req.ip);
    const { email, password, remember = false } = req.body || {};
    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || email.length > 254 || !password || password.length > 128 || typeof remember !== "boolean") {
      throw new StudyError(400, "INVALID_LOGIN", "Enter a valid email and password.");
    }
    const user = await database.getUserByEmail(email.trim().toLowerCase());
    if (!user || user.status !== "Active" || !(await bcrypt.compare(password, user.password_hash))) throw new StudyError(401, "INVALID_LOGIN", "Invalid email or password, or the account is disabled.");
    sessions.clear(req.headers.cookie);
    res.setHeader("Set-Cookie", sessions.create(user.id, remember));
    res.json({ user: publicUser(user) });
  });

  router.post("/auth/logout", (req, res) => {
    res.setHeader("Set-Cookie", sessions.clear(req.headers.cookie));
    res.json({ ok: true });
  });
  router.get("/auth/me", authenticate, (req, res) => res.json({ user: req.user }));
  router.get("/ai/status", authenticate, (req, res) => res.json(gemini.status()));
  router.post("/ai/:mode", authenticate, async (req, res) => {
    if (req.user.role !== "Student") throw new StudyError(403, "STUDENT_REQUIRED", "This study action is available to student accounts.");
    if (inFlight.has(req.user.id)) throw new StudyError(409, "AI_REQUEST_PENDING", "Another AI request is still running. Please wait or cancel it first.");
    aiLimit(req.user.id);
    inFlight.add(req.user.id);
    const controller = new AbortController();
    const abort = () => controller.abort();
    req.once("aborted", abort);
    res.once("close", abort);
    try {
      const result = await gemini.generate(req.params.mode, req.body, { signal: controller.signal });
      if (!controller.signal.aborted) res.json(result);
    } finally {
      inFlight.delete(req.user.id);
      req.removeListener("aborted", abort);
      res.removeListener("close", abort);
    }
  });
  return router;
}

module.exports = { createStudyRoutes };
