const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const bcrypt = require("bcryptjs");

test("a fresh SQLite database initializes twice safely and stores usable password hashes", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "study-database-test-"));
  process.env.STUDY_DATABASE_PATH = path.join(directory, "test.db");
  const database = require("../src/config/database");
  try {
    await database.initializeDatabase();
    await database.initializeDatabase();
    const status = await database.getDatabaseStatus();
    assert.equal(status.tablesCreated, true);
    assert.deepEqual(status.counts, { users: 4, courses: 3, materials: 3 });
    const student = await database.getUserByEmail("STUDENT@EXAMPLE.COM");
    assert.equal(student.role, "Student");
    assert.notEqual(student.password_hash, "student123");
    assert.equal(await bcrypt.compare("student123", student.password_hash), true);
    assert.equal((await database.getUserById(4)).status, "Disabled");
  } finally {
    await new Promise((resolve, reject) => database.db.close((error) => error ? reject(error) : resolve()));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
