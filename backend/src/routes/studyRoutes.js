const express = require("express");
const bcrypt = require("bcryptjs");
const { randomUUID } = require("crypto");
const { createSessionService, createRateLimiter } = require("../services/sessionService");
const { StudyError } = require("../services/studyContracts");
const { createTestCurrentUser } = require("../middleware/testCurrentUser");

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status };
}

function requiredText(value, field, maximum = 160) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maximum) {
    throw new StudyError(400, "INVALID_INPUT", `${field} is required and must be ${maximum} characters or fewer.`);
  }
  return value.trim();
}

function mapDatabaseError(error) {
  if (error?.code === "SQLITE_CONSTRAINT") {
    throw new StudyError(409, "DUPLICATE_RECORD", "A record with the same course code or file name already exists.");
  }
  throw error;
}

function courseIdFromPath(value) {
  const hasControlCharacter = typeof value === "string" && [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
  if (typeof value !== "string" || !value || value.length > 160 || value.trim() !== value || hasControlCharacter) {
    throw new StudyError(404, "COURSE_NOT_FOUND", "This course does not exist or does not belong to you.");
  }
  return value;
}

function rejectClientOwner(req) {
  if (Object.hasOwn(req.body || {}, "owner_id") || Object.hasOwn(req.body || {}, "ownerId")
    || Object.hasOwn(req.query || {}, "owner_id") || Object.hasOwn(req.query || {}, "ownerId")) {
    throw new StudyError(400, "OWNER_NOT_ALLOWED", "Material ownership is assigned by the server.");
  }
}

function createStudyRoutes({ database, gemini, sessions = createSessionService() }) {
  const router = express.Router();
  const loginLimit = createRateLimiter(20, 10 * 60 * 1000);
  const aiLimit = createRateLimiter(30, 5 * 60 * 1000);
  const inFlight = new Set();
  const identifyTestUser = createTestCurrentUser({ database });

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
  router.get("/courses", identifyTestUser, async (req, res) => {
    res.json({ courses: await database.listCoursesByOwner(req.currentUser.id) });
  });
  router.post("/courses", authenticate, async (req, res) => {
    const code = requiredText(req.body?.code, "Course code", 32).toUpperCase();
    const name = requiredText(req.body?.name, "Course name");
    try {
      const course = await database.createCourse({ id: randomUUID(), ownerId: req.user.id, code, name });
      res.status(201).json({ course });
    } catch (error) { mapDatabaseError(error); }
  });
  router.delete("/courses/:courseId", authenticate, async (req, res) => {
    const result = await database.deleteCourse(req.params.courseId, req.user.id);
    if (result.changes !== 1) throw new StudyError(404, "COURSE_NOT_FOUND", "This course does not exist or does not belong to you.");
    res.json({ ok: true });
  });
  router.get("/courses/:courseId/materials", identifyTestUser, async (req, res) => {
    const courseId = courseIdFromPath(req.params.courseId);
    if (!await database.courseBelongsToOwner(courseId, req.currentUser.id)) {
      throw new StudyError(404, "COURSE_NOT_FOUND", "This course does not exist or does not belong to you.");
    }
    res.json({ materials: await database.listMaterialsByCourseOwner(courseId, req.currentUser.id) });
  });
  router.post("/courses/:courseId/materials", identifyTestUser, async (req, res) => {
    const courseId = courseIdFromPath(req.params.courseId);
    if (!await database.courseBelongsToOwner(courseId, req.currentUser.id)) {
      throw new StudyError(404, "COURSE_NOT_FOUND", "This course does not exist or does not belong to you.");
    }
    rejectClientOwner(req);
    const name = requiredText(req.body?.name, "File name", 255);
    const type = requiredText(req.body?.type, "File type", 8).toUpperCase();
    const sizeBytes = req.body?.sizeBytes;
    const content = req.body?.content;
    if (!Number.isInteger(sizeBytes) || sizeBytes < 0 || sizeBytes > 10 * 1024 * 1024 || (content !== null && typeof content !== "string")) {
      throw new StudyError(400, "INVALID_MATERIAL", "Material size or content is invalid.");
    }
    try {
      const material = await database.createMaterialForOwner({ courseId, ownerId: req.currentUser.id, name, type, sizeBytes, content });
      if (!material) throw new StudyError(404, "COURSE_NOT_FOUND", "This course does not exist or does not belong to you.");
      res.status(201).json({ material });
    } catch (error) { if (error instanceof StudyError) throw error; mapDatabaseError(error); }
  });
  router.delete("/materials/:materialId", identifyTestUser, async (req, res) => {
    const id = Number(req.params.materialId);
    if (!Number.isSafeInteger(id) || id < 1) throw new StudyError(404, "MATERIAL_NOT_FOUND", "This material does not exist or does not belong to you.");
    const result = await database.deleteMaterialForOwner(id, req.currentUser.id);
    if (result.changes !== 1) throw new StudyError(404, "MATERIAL_NOT_FOUND", "This material does not exist or does not belong to you.");
    res.json({ ok: true });
  });
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
