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

    const tableColumns = async (table) => new Promise((resolve, reject) => database.db.all(
      `PRAGMA table_info(${table});`,
      (error, rows) => error ? reject(error) : resolve(rows.map((row) => row.name)),
    ));
    assert.deepEqual(await tableColumns("users"), ["id", "name", "email", "password_hash", "role", "status", "created_at", "updated_at"]);
    assert.deepEqual(await tableColumns("courses"), ["id", "owner_id", "code", "name", "created_at", "updated_at"]);
    assert.deepEqual(await tableColumns("materials"), ["id", "course_id", "owner_id", "name", "type", "size_bytes", "status", "content", "created_at", "updated_at"]);

    await database.createCourse({ id: "user-2-course", ownerId: 2, code: "U2", name: "User 2 Course" });
    const material = await database.createMaterialForOwner({
      courseId: "user-2-course", ownerId: 2, name: "private.txt", type: "TXT", sizeBytes: 7, content: "private",
    });
    assert.deepEqual((await database.listCoursesByOwner(1)).map((course) => course.id).sort(), ["hci", "inft3050", "inft3851a"]);
    assert.deepEqual((await database.listCoursesByOwner(2)).map((course) => course.id), ["user-2-course"]);
    assert.deepEqual(await database.listMaterialsByCourseOwner("user-2-course", 1), []);
    assert.equal(await database.createMaterialForOwner({
      courseId: "user-2-course", ownerId: 1, name: "cross-user.txt", type: "TXT", sizeBytes: 1, content: "x",
    }), null);
    assert.equal((await database.deleteMaterialForOwner(material.id, 1)).changes, 0);

    const storedOwner = await new Promise((resolve, reject) => database.db.get(
      "SELECT owner_id FROM materials WHERE id = ?;", [material.id],
      (error, row) => error ? reject(error) : resolve(row?.owner_id),
    ));
    assert.equal(storedOwner, 2);

    await database.initializeDatabase();
    assert.deepEqual((await database.getDatabaseStatus()).counts, { users: 4, courses: 4, materials: 4 });
    assert.equal((await database.deleteMaterialForOwner(material.id, 2)).changes, 1);
  } finally {
    await new Promise((resolve, reject) => database.db.close((error) => error ? reject(error) : resolve()));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
