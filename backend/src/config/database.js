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
  db,
  databasePath,
  getDatabaseStatus,
  initializeDatabase,
  getUserByEmail: (email) => get("SELECT * FROM users WHERE email = ? COLLATE NOCASE;", [email]),
  getUserById: (id) => get("SELECT * FROM users WHERE id = ?;", [id]),
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
    `SELECT id, course_id, name, type, size_bytes, status, content, created_at, updated_at
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
