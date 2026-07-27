const bcrypt = require("bcryptjs");

const DEMO_ACCOUNTS = [
  {
    id: 1,
    name: "Alex Chen",
    email: "student@example.com",
    password: "student123",
    role: "Student",
    status: "Active",
  },
  {
    id: 2,
    name: "Admin Lee",
    email: "admin@example.com",
    password: "admin123",
    role: "Admin",
    status: "Active",
  },
  {
    id: 3,
    name: "Mia Tan",
    email: "mia@student.edu",
    password: "student123",
    role: "Student",
    status: "Active",
  },
  {
    id: 4,
    name: "John Lee",
    email: "john@student.edu",
    password: "student123",
    role: "Student",
    status: "Disabled",
  },
];

const DEMO_COURSES = [
  { id: "inft3050", code: "INFT3050", name: "Study Companion" },
  { id: "hci", code: "HCI", name: "Prototype Review" },
  { id: "inft3851a", code: "INFT3851A", name: "Study Project" },
];

const DEMO_MATERIALS = [
  {
    id: 1,
    courseId: "inft3050",
    name: "lecture_notes.txt",
    type: "TXT",
    sizeBytes: 1830,
    status: "Ready",
    content: "Machine learning is a method that allows computers to learn patterns from data.",
  },
  {
    id: 2,
    courseId: "inft3050",
    name: "tutorial_outline.md",
    type: "MD",
    sizeBytes: 940,
    status: "Ready",
    content: "# Tutorial Outline\n- AI learning workflow\n- Source file selection\n- Quiz revision",
  },
  {
    id: 3,
    courseId: "inft3851a",
    name: "project_scope.md",
    type: "MD",
    sizeBytes: 1500,
    status: "Ready",
    content: "# Project Scope\nThis file explains course requirements and prototype scope.",
  },
];

async function insertAccounts({ get, run }) {
  for (const account of DEMO_ACCOUNTS) {
    const existingAccount = await get(
      "SELECT id FROM users WHERE email = ? COLLATE NOCASE;",
      [account.email],
    );

    if (!existingAccount) {
      const passwordHash = await bcrypt.hash(account.password, 12);
      await run(
        `INSERT INTO users
          (id, name, email, password_hash, role, status)
         VALUES (?, ?, ?, ?, ?, ?);`,
        [
          account.id,
          account.name,
          account.email,
          passwordHash,
          account.role,
          account.status,
        ],
      );
    }
  }
}

async function insertCoursesAndMaterials({ get, run }) {
  const alex = await get(
    "SELECT id FROM users WHERE email = ? COLLATE NOCASE;",
    ["student@example.com"],
  );

  if (!alex) {
    throw new Error("The Alex Chen demo account is required before seeding courses.");
  }

  for (const course of DEMO_COURSES) {
    await run(
      `INSERT OR IGNORE INTO courses (id, owner_id, code, name)
       VALUES (?, ?, ?, ?);`,
      [course.id, alex.id, course.code, course.name],
    );
  }

  for (const material of DEMO_MATERIALS) {
    await run(
      `INSERT OR IGNORE INTO materials
        (id, course_id, owner_id, name, type, size_bytes, status, content)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        material.id,
        material.courseId,
        alex.id,
        material.name,
        material.type,
        material.sizeBytes,
        material.status,
        material.content,
      ],
    );
  }
}

async function seedDatabase({ exec, get, run }) {
  await exec("BEGIN IMMEDIATE TRANSACTION;");

  try {
    await insertAccounts({ get, run });
    await insertCoursesAndMaterials({ get, run });
    await exec("COMMIT;");
  } catch (error) {
    await exec("ROLLBACK;");
    throw error;
  }
}

module.exports = {
  seedDatabase,
};
