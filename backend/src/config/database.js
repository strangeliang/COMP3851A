const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const limits = require("../../../shared/studyLimits.json");

const { createSchema, REQUIRED_TABLES } = require("./schema");
const { seedDatabase } = require("./seed");

const databasePath = process.env.STUDY_DATABASE_PATH || path.join(__dirname, "../../data/study_companion.db");
const databaseDirectory = path.dirname(databasePath);

fs.mkdirSync(databaseDirectory, { recursive: true });

const db = new sqlite3.Database(databasePath);

function run(sql, parameters = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, parameters, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, parameters = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, parameters, (error, row) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(row);
    });
  });
}

function all(sql, parameters = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, parameters, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(rows);
    });
  });
}

function exec(sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function initializeDatabase() {
  await exec("PRAGMA foreign_keys = ON;");

  const foreignKeySetting = await get("PRAGMA foreign_keys;");
  if (foreignKeySetting?.foreign_keys !== 1) {
    throw new Error("SQLite foreign key enforcement could not be enabled.");
  }

  await createSchema({ exec });
  await seedDatabase({ exec, get, run });

  console.log("SQLite database initialized successfully.");
}

async function getDatabaseStatus() {
  await get("SELECT 1 AS connected;");

  const tableRows = await all(
    `SELECT name
     FROM sqlite_master
     WHERE type = 'table'
       AND name IN (${REQUIRED_TABLES.map(() => "?").join(", ")})`,
    REQUIRED_TABLES,
  );
  const createdTables = new Set(tableRows.map((row) => row.name));

  const counts = {};
  for (const tableName of REQUIRED_TABLES) {
    const row = await get(`SELECT COUNT(*) AS count FROM ${tableName};`);
    counts[tableName] = row.count;
  }

  return {
    status: "ok",
    database: "connected",
    tablesCreated: REQUIRED_TABLES.every((tableName) => createdTables.has(tableName)),
    counts,
  };
}

module.exports = {
  createLoginConversation: (id, owner) => {
    const now = new Date().toISOString();
    return run(`INSERT INTO support_tickets(id,client_id,owner_id,category,title,description,created_at,updated_at)
      VALUES(?,?,?,'other','Login support conversation','Automatic support conversation for this login.',?,?)`, [id,id,owner,now,now]);
  },
  registerStudent: async (name, email, passwordHash) => {
    const result = await run("INSERT INTO users(name,email,password_hash,role,status) VALUES(?,?,?,'Student','Active')", [name, email, passwordHash]);
    return get("SELECT id,name,email,role,status FROM users WHERE id=?", [result.id]);
  },
  getGoogleUser: (subject) => get("SELECT u.* FROM users u JOIN google_accounts g ON g.user_id=u.id WHERE g.subject=?", [subject]),
  linkGoogleStudent: ({ subject, userId, email }) => run(`INSERT OR IGNORE INTO google_accounts(subject,user_id)
    SELECT ?,id FROM users WHERE id=? AND email=? COLLATE NOCASE AND role='Student' AND status='Active'
      AND NOT EXISTS(SELECT 1 FROM google_accounts WHERE user_id=users.id)`, [subject, userId, email]),
  createGoogleUser: async ({ subject, email, name, passwordHash }) => {
    const result = await run("INSERT INTO users(name,email,password_hash,role,status) VALUES(?,?,?,'Student','Active')", [name, email, passwordHash]);
    try { await run("INSERT INTO google_accounts(subject,user_id) VALUES(?,?)", [subject, result.id]); }
    catch (error) { await run("DELETE FROM users WHERE id=?", [result.id]); throw error; }
    return get("SELECT * FROM users WHERE id=?", [result.id]);
  },
  getMaterialForOwner: (id, owner) => get("SELECT m.*, o.storage_key FROM materials m LEFT JOIN material_originals o ON o.material_id=m.id WHERE m.id=? AND m.owner_id=?", [id, owner]),
  saveOriginal: (id, owner, key, hash) => run("INSERT INTO material_originals(material_id,storage_key,sha256) SELECT id,?,? FROM materials WHERE id=? AND owner_id=?", [key, hash, id, owner]),
  listOriginalsForCourse: (course, owner) => all("SELECT o.storage_key FROM material_originals o JOIN materials m ON m.id=o.material_id WHERE m.course_id=? AND m.owner_id=?", [course, owner]),
  saveHistory: (id, owner, kind, course, payload) => run("INSERT OR IGNORE INTO study_history(id,owner_id,kind,course_id,payload) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM courses WHERE id=? AND owner_id=?)", [id, owner, kind, course, JSON.stringify(payload), course, owner]),
  saveQAMessage: (id, owner, course, payload) => run(`INSERT OR IGNORE INTO study_history(id,owner_id,kind,course_id,payload)
    SELECT ?,?,'qa',?,? WHERE EXISTS(SELECT 1 FROM courses WHERE id=? AND owner_id=?)
    AND NOT EXISTS(SELECT 1 FROM study_history h JOIN study_history_deletions d ON d.record_id=h.id
      WHERE h.owner_id=? AND h.course_id=? AND h.kind='qa' AND json_extract(h.payload,'$.conversationId')=? AND json_extract(h.payload,'$.scopeKey')=?)`,
  [id, owner, course, JSON.stringify(payload), course, owner, owner, course, payload.conversationId, payload.scopeKey]),
  hasDeletedQAConversation: (owner, course, payload) => get(`SELECT 1 FROM study_history h JOIN study_history_deletions d ON d.record_id=h.id
    WHERE h.owner_id=? AND h.course_id=? AND h.kind='qa' AND json_extract(h.payload,'$.conversationId')=? AND json_extract(h.payload,'$.scopeKey')=? LIMIT 1`,
  [owner, course, payload.conversationId, payload.scopeKey]),
  listHistory: (owner) => all("SELECT h.* FROM study_history h WHERE h.owner_id=? AND NOT EXISTS(SELECT 1 FROM study_history_deletions d WHERE d.record_id=h.id) ORDER BY h.created_at DESC,h.rowid DESC", [owner]),
  listHistorySources: (owner) => all("SELECT id,course_id,name FROM materials WHERE owner_id=? ORDER BY id", [owner]),
  getLatestFlashcards: (owner, materialIds) => get(`SELECT h.payload FROM study_history h
    WHERE h.owner_id=? AND h.kind='flashcards'
      AND json_array_length(h.payload,'$.selectedMaterialIds')=?
      AND (SELECT COUNT(DISTINCT CAST(value AS TEXT)) FROM json_each(h.payload,'$.selectedMaterialIds'))=?
      AND NOT EXISTS(SELECT 1 FROM json_each(h.payload,'$.selectedMaterialIds') selected
        WHERE CAST(selected.value AS TEXT) NOT IN (SELECT value FROM json_each(?)))
      AND NOT EXISTS(SELECT 1 FROM study_history_deletions d WHERE d.record_id=h.id)
    ORDER BY h.created_at DESC,h.rowid DESC LIMIT 1`, [owner, materialIds.length, materialIds.length, JSON.stringify(materialIds.map(String))]),
  getHistory: (id, owner) => get("SELECT h.* FROM study_history h WHERE h.id=? AND h.owner_id=? AND NOT EXISTS(SELECT 1 FROM study_history_deletions d WHERE d.record_id=h.id)", [id, owner]),
  getHistoryIncludingDeleted: (id, owner) => get("SELECT * FROM study_history WHERE id=? AND owner_id=?", [id, owner]),
  listDeletedHistory: (owner) => all("SELECT h.*,d.deleted_at FROM study_history h JOIN study_history_deletions d ON d.record_id=h.id WHERE h.owner_id=? ORDER BY d.deleted_at DESC,d.rowid DESC", [owner]),
  deleteHistory: (id, owner) => run("INSERT INTO study_history_deletions(record_id,owner_id) SELECT id,owner_id FROM study_history WHERE id=? AND owner_id=? ON CONFLICT(record_id) DO NOTHING", [id, owner]),
  restoreHistory: (id, owner) => run("DELETE FROM study_history_deletions WHERE record_id=? AND owner_id=?", [id, owner]),
  deleteQAConversation: (record, owner, payload) => run(`INSERT OR IGNORE INTO study_history_deletions(record_id,owner_id)
    SELECT id,owner_id FROM study_history WHERE owner_id=? AND course_id=? AND kind='qa'
      AND json_extract(payload,'$.conversationId')=? AND json_extract(payload,'$.scopeKey')=?`,
  [owner, record.course_id, payload.conversationId, payload.scopeKey]),
  restoreQAConversation: (record, owner, payload) => run(`DELETE FROM study_history_deletions WHERE owner_id=? AND record_id IN (
    SELECT id FROM study_history WHERE owner_id=? AND course_id=? AND kind='qa'
      AND json_extract(payload,'$.conversationId')=? AND json_extract(payload,'$.scopeKey')=?)`,
  [owner, owner, record.course_id, payload.conversationId, payload.scopeKey]),
  deleteAllHistory: (owner) => run("INSERT OR IGNORE INTO study_history_deletions(record_id,owner_id) SELECT id,owner_id FROM study_history WHERE owner_id=?", [owner]),
  restoreAllHistory: (owner) => run("DELETE FROM study_history_deletions WHERE owner_id=? AND EXISTS(SELECT 1 FROM study_history h JOIN courses c ON c.id=h.course_id WHERE h.id=study_history_deletions.record_id AND c.owner_id=?)", [owner, owner]),
  saveReview: (id, owner, record, payload) => run(`INSERT OR IGNORE INTO review_attempts(id,owner_id,record_id,payload)
    SELECT ?,h.owner_id,h.id,? FROM study_history h WHERE h.id=? AND h.owner_id=? AND h.kind='quiz'
      AND NOT EXISTS(SELECT 1 FROM study_history_deletions d WHERE d.record_id=h.id)`, [id, JSON.stringify(payload), record, owner]),
  getReview: (id, owner) => get("SELECT * FROM review_attempts WHERE id=? AND owner_id=?", [id, owner]),
  listReviews: (owner) => all("SELECT r.* FROM review_attempts r WHERE r.owner_id=? AND NOT EXISTS(SELECT 1 FROM study_history_deletions d WHERE d.record_id=r.record_id) ORDER BY r.created_at DESC,r.rowid DESC", [owner]),
  db,
  databasePath,
  getDatabaseStatus,
  initializeDatabase,
  getUserByEmail: (email) => get("SELECT u.*, COALESCE(p.display_name,u.name) AS name, p.bio, p.learning_goal, p.avatar FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id WHERE u.email = ? COLLATE NOCASE;", [email]),
  getUserById: (id) => get("SELECT u.*, COALESCE(p.display_name,u.name) AS name, p.bio, p.learning_goal, p.avatar FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id WHERE u.id = ?;", [id]),
  saveProfile: (id, profile) => run("INSERT INTO user_profiles (user_id,display_name,bio,learning_goal,avatar) VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name,bio=excluded.bio,learning_goal=excluded.learning_goal,avatar=excluded.avatar;", [id, profile.name, profile.bio, profile.learningGoal, profile.avatar]),
  listCoursesByOwner: (ownerId) => all(
    `SELECT id, code, name, created_at, updated_at
     FROM courses WHERE owner_id = ? ORDER BY created_at DESC, code ASC;`,
    [ownerId],
  ),
  createCourse: async ({ id, ownerId, code, name }) => {
    await run(
      `INSERT INTO courses (id, owner_id, code, name) VALUES (?, ?, ?, ?);`,
      [id, ownerId, code, name],
    );
    return get(
      `SELECT id, code, name, created_at, updated_at FROM courses WHERE id = ? AND owner_id = ?;`,
      [id, ownerId],
    );
  },
  deleteCourse: (id, ownerId) => run("DELETE FROM courses WHERE id = ? AND owner_id = ?;", [id, ownerId]),
  updateCourseForOwner: async ({ id, ownerId, code, name }) => {
    const result = await run("UPDATE courses SET code = ?, name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?;", [code, name, id, ownerId]);
    if (result.changes !== 1) return null;
    return get("SELECT id, code, name, created_at, updated_at FROM courses WHERE id = ? AND owner_id = ?;", [id, ownerId]);
  },
  listMaterialsByCourseOwner: (courseId, ownerId) => all(
    `SELECT id, course_id, name, type, size_bytes, status, content, reading_notes, created_at, updated_at,
     EXISTS(SELECT 1 FROM material_originals o WHERE o.material_id=materials.id) AS has_original
     FROM materials WHERE course_id = ? AND owner_id = ? ORDER BY created_at DESC, id DESC;`,
    [courseId, ownerId],
  ),
  courseBelongsToOwner: (courseId, ownerId) => get(
    "SELECT id FROM courses WHERE id = ? AND owner_id = ?;",
    [courseId, ownerId],
  ),
  createMaterialForOwner: async ({ courseId, ownerId, name, type, sizeBytes, content, readingNotes = "" }) => {
    const result = await run(
      `INSERT INTO materials (course_id, owner_id, name, type, size_bytes, status, content, reading_notes)
       SELECT id, owner_id, ?, ?, ?, 'Ready', ?, ? FROM courses
       WHERE id = ? AND owner_id = ?
       AND (SELECT COUNT(*) FROM materials WHERE course_id=? AND owner_id=?) < ?
       AND (SELECT COUNT(*) FROM materials WHERE owner_id=?) < ?;`,
      [name, type, sizeBytes, content, readingNotes, courseId, ownerId, courseId, ownerId, limits.maxFilesPerCourse, ownerId, limits.maxTotalFilesPerUser],
    );
    if (result.changes !== 1) return null;
    return get(
      `SELECT id, course_id, name, type, size_bytes, status, content, reading_notes, created_at, updated_at
       FROM materials WHERE id = ? AND owner_id = ?;`,
      [result.id, ownerId],
    );
  },
  deleteMaterialForOwner: (id, ownerId) => run(
    "DELETE FROM materials WHERE id = ? AND owner_id = ?;",
    [id, ownerId],
  ),
};
