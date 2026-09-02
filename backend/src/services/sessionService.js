const { createHash, randomBytes } = require("crypto");
const { StudyError } = require("./studyContracts");

const COOKIE_NAME = "study_session";
const hash = (value) => createHash("sha256").update(value).digest("hex");

function readCookie(header = "") {
  const raw = header.split(";").find((part) => part.trim().startsWith(`${COOKIE_NAME}=`));
  if (!raw) return "";
  try { return decodeURIComponent(raw.trim().slice(COOKIE_NAME.length + 1)); } catch { return ""; }
}

function createSessionService({ secure = process.env.NODE_ENV === "production", now = Date.now } = {}) {
  const sessions = new Map();
  const cookie = (token, lifetime) => `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${lifetime}${secure ? "; Secure" : ""}`;
  return {
    create(userId, remember) {
      for (const [key, value] of sessions) if (value.expires <= now()) sessions.delete(key);
      const token = randomBytes(32).toString("hex");
      const lifetime = remember ? 7 * 24 * 60 * 60 : 8 * 60 * 60;
      sessions.set(hash(token), { userId, expires: now() + lifetime * 1000 });
      return cookie(token, lifetime);
    },
    get(header) {
      const token = readCookie(header);
      if (!token) return null;
      const key = hash(token);
      const session = sessions.get(key);
      if (!session || session.expires <= now()) { sessions.delete(key); return null; }
      return session;
    },
    clear(header) {
      const token = readCookie(header);
      if (token) sessions.delete(hash(token));
      return cookie("", 0);
    },
  };
}

function createRateLimiter(maximum, windowMs) {
  const requests = new Map();
  return (key) => {
    const now = Date.now();
    for (const [id, entry] of requests) if (entry.expires <= now) requests.delete(id);
    const entry = requests.get(key) || { count: 0, expires: now + windowMs };
    if (entry.count >= maximum) throw new StudyError(429, "TOO_MANY_REQUESTS", "Too many requests. Please wait a few minutes and try again.");
    entry.count += 1;
    requests.set(key, entry);
  };
}

module.exports = { createSessionService, createRateLimiter };
