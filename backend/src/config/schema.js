const REQUIRED_TABLES = ["users", "courses", "materials"];

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    email TEXT NOT NULL COLLATE NOCASE UNIQUE
      CHECK (length(trim(email)) > 3 AND instr(email, '@') > 1),
    password_hash TEXT NOT NULL CHECK (length(password_hash) >= 50),
    role TEXT NOT NULL CHECK (role IN ('Student', 'Admin')),
    status TEXT NOT NULL DEFAULT 'Active'
      CHECK (status IN ('Active', 'Disabled')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
    owner_id INTEGER NOT NULL,
    code TEXT NOT NULL COLLATE NOCASE CHECK (length(trim(code)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (owner_id, code),
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY,
    course_id TEXT NOT NULL,
    owner_id INTEGER NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    type TEXT NOT NULL
      CHECK (type IN ('TXT', 'MD', 'PDF', 'DOCX', 'PPTX', 'PNG', 'JPG', 'JPEG', 'WEBP', 'BMP')),
    size_bytes INTEGER NOT NULL
      CHECK (size_bytes >= 0 AND size_bytes <= 10485760),
    status TEXT NOT NULL DEFAULT 'Ready'
      CHECK (status IN ('Pending', 'Processing', 'Ready', 'Failed')),
    content TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (course_id, name),
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_courses_owner_id
    ON courses(owner_id);

  CREATE INDEX IF NOT EXISTS idx_materials_course_id
    ON materials(course_id);

  CREATE INDEX IF NOT EXISTS idx_materials_owner_id
    ON materials(owner_id);
`;

async function createSchema({ exec }) {
  await exec(SCHEMA_SQL);
}

module.exports = {
  createSchema,
  REQUIRED_TABLES,
};
