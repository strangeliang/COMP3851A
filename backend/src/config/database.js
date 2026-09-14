const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

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
  registerStudent: async (name, email, passwordHash) => {
    const result = await run("INSERT INTO users(name,email,password_hash,role,status) VALUES(?,?,?,'Student','Active')", [name, email, passwordHash]);
    return get("SELECT id,name,email,role,status FROM users WHERE id=?", [result.id]);
  },
  getGoogleUser: (subject) => get("SELECT u.* FROM users u JOIN google_accounts g ON g.user_id=u.id WHERE g.subject=?", [subject]),
  createGoogleUser: async ({ subject, email, name, passwordHash }) => {
    const result = await run("INSERT INTO users(name,email,password_hash,role,status) VALUES(?,?,?,'Student','Active')", [name, email, passwordHash]);
    try { await run("INSERT INTO google_accounts(subject,user_id) VALUES(?,?)", [subject, result.id]); }
    catch (error) { await run("DELETE FROM users WHERE id=?", [result.id]); throw error; }
    return get("SELECT * FROM users WHERE id=?", [result.id]);
  },
  getMaterialForOwner: (id, owner) => get("SELECT m.*, o.storage_key FROM materials m LEFT JOIN material_originals o ON o.material_id=m.id WHERE m.id=? AND m.owner_id=?", [id, owner]),
  saveOriginal: (id, owner, key, hash) => run("INSERT INTO material_originals(material_id,storage_key,sha256) SELECT id,?,? FROM materials WHERE id=? AND owner_id=?", [key, hash, id, owner]),
  listOriginalsForCourse: (course, owner) => all("SELECT o.storage_key FROM material_originals o JOIN materials m ON m.id=o.material_id WHERE m.course_id=? AND m.owner_id=?", [course, owner]),
  saveHistory: (id, owner, kind, course, payload) => run("INSERT OR IGNORE INTO study_history(id,owner_id,kind,course_id,payload) VALUES(?,?,?,?,?)", [id, owner, kind, course, JSON.stringify(payload)]),
  listHistory: (owner) => all("SELECT * FROM study_history WHERE owner_id=? ORDER BY created_at DESC,rowid DESC", [owner]),
  getHistory: (id, owner) => get("SELECT * FROM study_history WHERE id=? AND owner_id=?", [id, owner]),
  saveReview: (id, owner, record, payload) => run("INSERT INTO review_attempts(id,owner_id,record_id,payload) VALUES(?,?,?,?)", [id, owner, record, JSON.stringify(payload)]),
  listReviews: (owner) => all("SELECT * FROM review_attempts WHERE owner_id=? ORDER BY created_at DESC,rowid DESC", [owner]),
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
  listMaterialsByCourseOwner: (courseId, ownerId) => all(
    `SELECT id, course_id, name, type, size_bytes, status, content, created_at, updated_at,
     EXISTS(SELECT 1 FROM material_originals o WHERE o.material_id=materials.id) AS has_original
     FROM materials WHERE course_id = ? AND owner_id = ? ORDER BY created_at DESC, id DESC;`,
    [courseId, ownerId],
  ),
  courseBelongsToOwner: (courseId, ownerId) => get(
    "SELECT id FROM courses WHERE id = ? AND owner_id = ?;",
    [courseId, ownerId],
  ),
  createMaterialForOwner: async ({ courseId, ownerId, name, type, sizeBytes, content }) => {
    const result = await run(
      `INSERT INTO materials (course_id, owner_id, name, type, size_bytes, status, content)
       SELECT id, owner_id, ?, ?, ?, 'Ready', ? FROM courses
       WHERE id = ? AND owner_id = ?;`,
      [name, type, sizeBytes, content, courseId, ownerId],
    );
    if (result.changes !== 1) return null;
    return get(
      `SELECT id, course_id, name, type, size_bytes, status, content, created_at, updated_at
       FROM materials WHERE id = ? AND owner_id = ?;`,
      [result.id, ownerId],
    );
  },
  deleteMaterialForOwner: (id, ownerId) => run(
    "DELETE FROM materials WHERE id = ? AND owner_id = ?;",
    [id, ownerId],
  ),
};
