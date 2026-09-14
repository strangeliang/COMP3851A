const express = require("express");
const bcrypt = require("bcryptjs");
const { randomUUID } = require("crypto");
const { createSessionService, createRateLimiter } = require("../services/sessionService");
const { StudyError } = require("../services/studyContracts");
const { createOriginalStorage, validateOriginal } = require("../services/originalStorage");
const path = require("node:path");

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status,
    bio: user.bio || "", learningGoal: user.learning_goal || "", avatar: user.avatar || "" };
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
  const originals = createOriginalStorage(database.databasePath || path.join(__dirname, "../../data/study_companion.db"));
  router.use(require("./googleRoutes").createGoogleRoutes({ database, sessions, publicUser }));

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

  router.post("/auth/register", async (req, res) => {
    loginLimit(req.ip);
    const { name, email, password } = req.body || {};
    if (Object.keys(req.body || {}).some((key) => !["name", "email", "password"].includes(key))) throw new StudyError(400, "INVALID_REGISTRATION", "Only name, email and password are accepted.");
    const displayName = requiredText(name, "Name", 80);
    if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || typeof password !== "string" || password.length < 12 || Buffer.byteLength(password, "utf8") > 72) throw new StudyError(400, "INVALID_REGISTRATION", "Enter a valid email and a password of at least 12 characters (maximum 72 UTF-8 bytes).");
    try {
      await database.registerStudent(displayName, email.trim().toLowerCase(), await bcrypt.hash(password, 12));
    } catch (error) {
      if (error.code === "SQLITE_CONSTRAINT") throw new StudyError(409, "REGISTRATION_UNAVAILABLE", "Cannot register this email. Try signing in or contact the administrator.");
      throw error;
    }
    res.status(201).json({ ok: true });
  });

  router.post("/auth/logout", (req, res) => {
    res.setHeader("Set-Cookie", sessions.clear(req.headers.cookie));
    res.json({ ok: true });
  });
  router.get("/auth/me", authenticate, (req, res) => res.json({ user: req.user }));
  router.get("/history", authenticate, async (req, res) => res.json({
    records: (await database.listHistory(req.user.id)).map((r) => ({ ...r, payload: JSON.parse(r.payload) })),
    reviews: (await database.listReviews(req.user.id)).map((r) => ({ ...r, payload: JSON.parse(r.payload) })),
  }));
  router.post("/history", authenticate, async (req, res) => {
    const { id, kind, courseId, payload } = req.body || {};
    if (typeof id !== "string" || id.length > 100 || !id || !["summary", "qa", "quiz", "flashcards"].includes(kind) || !payload || typeof payload !== "object" || JSON.stringify(payload).length > 200000) throw new StudyError(400, "INVALID_HISTORY", "Invalid study record.");
    if (!await database.courseBelongsToOwner(courseId, req.user.id)) throw new StudyError(403, "COURSE_NOT_FOUND", "Course unavailable.");
    if (kind === "quiz") {
      const qs = payload.questions;
      if (!Array.isArray(qs) || !qs.length || qs.length > 50 || new Set(qs.map((q) => q.id)).size !== qs.length || qs.some((q) => !q.id || typeof q.question !== "string" || !Array.isArray(q.options) || q.options.length < 2 || q.options.some((o) => typeof o !== "string") || !Number.isInteger(q.answerIndex) || q.answerIndex < 0 || q.answerIndex >= q.options.length || !Number.isInteger(payload.answers?.[q.id]) || payload.answers[q.id] < 0 || payload.answers[q.id] >= q.options.length)) throw new StudyError(400, "INVALID_QUIZ", "Quiz questions and answers are required.");
      payload.correct = qs.filter((q) => payload.answers[q.id] === q.answerIndex).length;
      payload.score = Math.round(payload.correct / qs.length * 100);
    }
    await database.saveHistory(`${req.user.id}:${id}`, req.user.id, kind, courseId, payload);
    res.json({ ok: true });
  });
  router.post("/history/:id/review", authenticate, async (req, res) => {
    const record = await database.getHistory(req.params.id, req.user.id);
    if (!record || record.kind !== "quiz") throw new StudyError(404, "NOT_FOUND", "Quiz unavailable.");
    const original = JSON.parse(record.payload);
    const questions = original.questions.filter((q) => original.answers[q.id] !== q.answerIndex);
    const answers = req.body?.answers;
    if (!questions.length || !answers || questions.some((q) => !Number.isInteger(answers[q.id]) || answers[q.id] < 0 || answers[q.id] >= q.options.length)) throw new StudyError(400, "INCOMPLETE_REVIEW", "Answer every wrong question before submitting.");
    const correct = questions.filter((q) => answers[q.id] === q.answerIndex).length;
    const result = { answers, correct, total: questions.length, score: Math.round(correct / questions.length * 100) };
    await database.saveReview(randomUUID(), req.user.id, record.id, result);
    res.json(result);
  });
  router.patch("/auth/profile", authenticate, async (req, res) => {
    const body = req.body || {};
    if (Object.keys(body).some((key) => !["name", "bio", "learningGoal", "avatar"].includes(key))) {
      throw new StudyError(400, "INVALID_PROFILE", "Only profile fields can be edited.");
    }
    const name = requiredText(body.name, "Display name", 80);
    for (const [key, max] of [["bio", 500], ["learningGoal", 1000], ["avatar", 350000]]) {
      if (typeof body[key] !== "string" || body[key].length > max) throw new StudyError(400, "INVALID_PROFILE", `${key} is invalid or too long.`);
    }
    if (body.avatar && !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(body.avatar)) {
      throw new StudyError(400, "INVALID_AVATAR", "Use a PNG avatar generated by the profile editor.");
    }
    await database.saveProfile(req.user.id, { name, bio: body.bio.trim(), learningGoal: body.learningGoal.trim(), avatar: body.avatar });
    res.json({ user: publicUser(await database.getUserById(req.user.id)) });
  });
  router.get("/courses", authenticate, async (req, res) => {
    res.json({ courses: await database.listCoursesByOwner(req.user.id) });
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
    const files = database.listOriginalsForCourse ? await database.listOriginalsForCourse(req.params.courseId, req.user.id) : [];
    const result = await database.deleteCourse(req.params.courseId, req.user.id);
    if (result.changes !== 1) throw new StudyError(404, "COURSE_NOT_FOUND", "This course does not exist or does not belong to you.");
    await Promise.all(files.map((file) => originals.remove(file.storage_key)));
    res.json({ ok: true });
  });
  router.get("/courses/:courseId/materials", authenticate, async (req, res) => {
    const courseId = courseIdFromPath(req.params.courseId);
    if (!await database.courseBelongsToOwner(courseId, req.user.id)) {
      throw new StudyError(404, "COURSE_NOT_FOUND", "This course does not exist or does not belong to you.");
    }
    res.json({ materials: await database.listMaterialsByCourseOwner(courseId, req.user.id) });
  });
  router.post("/courses/:courseId/materials", authenticate, async (req, res) => {
    const courseId = courseIdFromPath(req.params.courseId);
    if (!await database.courseBelongsToOwner(courseId, req.user.id)) {
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
      const material = await database.createMaterialForOwner({ courseId, ownerId: req.user.id, name, type, sizeBytes, content });
      if (!material) throw new StudyError(404, "COURSE_NOT_FOUND", "This course does not exist or does not belong to you.");
      res.status(201).json({ material });
    } catch (error) { if (error instanceof StudyError) throw error; mapDatabaseError(error); }
  });
  async function ownedMaterial(req, res, next) {
    const id = Number(req.params.materialId);
    const material = Number.isSafeInteger(id) && id > 0 ? await database.getMaterialForOwner(id, req.user.id) : null;
    if (!material) throw new StudyError(404, "MATERIAL_NOT_FOUND", "This material does not exist or does not belong to you.");
    req.material = material;
    next();
  }
  router.put("/materials/:materialId/original", authenticate, ownedMaterial,
    express.raw({ type: "application/octet-stream", limit: "10mb" }), async (req, res) => {
      if (req.material.storage_key) throw new StudyError(409, "ORIGINAL_EXISTS", "This original is already saved.");
      validateOriginal(req.body, req.material);
      const file = await originals.write(req.body);
      try {
        const result = await database.saveOriginal(req.material.id, req.user.id, file.key, file.hash);
        if (result.changes !== 1) throw new StudyError(404, "MATERIAL_NOT_FOUND", "Material unavailable.");
      } catch (error) {
        await originals.remove(file.key);
        if (error instanceof StudyError) throw error;
        mapDatabaseError(error);
      }
      res.status(201).json({ ok: true });
    });
  router.get("/materials/:materialId/original", authenticate, ownedMaterial, (req, res, next) => {
    const material = req.material;
    if (!material.storage_key) throw new StudyError(404, "ORIGINAL_NOT_AVAILABLE", "No original was saved for this older material. Please upload it again.");
    const types = { PDF: "application/pdf", PNG: "image/png", JPG: "image/jpeg", JPEG: "image/jpeg", WEBP: "image/webp", BMP: "image/bmp" };
    const inline = req.query.preview === "1" && types[material.type];
    res.setHeader("Content-Type", inline || "application/octet-stream");
    res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'; frame-ancestors 'self'");
    res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="original.${material.type.toLowerCase()}"; filename*=UTF-8''${encodeURIComponent(material.name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)}`);
    res.sendFile(originals.location(material.storage_key), { cacheControl: false }, (error) => {
      if (error && !res.headersSent) next(new StudyError(error.code === "ENOENT" ? 404 : 500, "ORIGINAL_UNAVAILABLE", "The original file is unavailable. Please contact support."));
    });
  });
  router.delete("/materials/:materialId", authenticate, async (req, res) => {
    const id = Number(req.params.materialId);
    if (!Number.isSafeInteger(id) || id < 1) throw new StudyError(404, "MATERIAL_NOT_FOUND", "This material does not exist or does not belong to you.");
    const material = database.getMaterialForOwner ? await database.getMaterialForOwner(id, req.user.id) : null;
    const result = await database.deleteMaterialForOwner(id, req.user.id);
    if (result.changes !== 1) throw new StudyError(404, "MATERIAL_NOT_FOUND", "This material does not exist or does not belong to you.");
    await originals.remove(material?.storage_key);
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
