const REQUIRED_TABLES = ["users", "courses", "materials"];

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS email_tokens (
    token_hash TEXT PRIMARY KEY,
    request_id TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL CHECK(purpose IN ('verify','reset')),
    credential_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    used_at INTEGER,
    replacement_hash TEXT
  );
  CREATE TABLE IF NOT EXISTS verified_emails (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    verified_at INTEGER NOT NULL
  );
  CREATE TRIGGER IF NOT EXISTS consume_email_token AFTER UPDATE OF used_at ON email_tokens
  WHEN OLD.used_at IS NULL AND NEW.used_at IS NOT NULL
  BEGIN
    UPDATE users SET password_hash=NEW.replacement_hash,updated_at=CURRENT_TIMESTAMP
      WHERE id=NEW.user_id AND NEW.purpose='reset';
    INSERT INTO verified_emails(user_id,verified_at) VALUES(NEW.user_id,NEW.used_at)
      ON CONFLICT(user_id) DO UPDATE SET verified_at=excluded.verified_at;
    UPDATE email_tokens SET expires_at=0 WHERE user_id=NEW.user_id AND used_at IS NULL;
  END;
  CREATE TABLE IF NOT EXISTS account_recovery_requests (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL UNIQUE,
    account_name TEXT NOT NULL,
    email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Open' CHECK(status IN ('Open','In progress','Resolved')),
    version INTEGER NOT NULL DEFAULT 1,
    updated_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    resolved_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_recovery_email_time ON account_recovery_requests(email,created_at);
  CREATE TABLE IF NOT EXISTS account_recovery_events (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL REFERENCES account_recovery_requests(id) ON DELETE CASCADE,
    author_id INTEGER NOT NULL REFERENCES users(id),
    client_id TEXT,
    kind TEXT NOT NULL CHECK(kind IN ('reply','status')),
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(ticket_id,author_id,client_id)
  );
  CREATE TRIGGER IF NOT EXISTS recovery_note_update AFTER INSERT ON account_recovery_events
  WHEN NEW.kind='reply'
  BEGIN
    UPDATE account_recovery_requests SET updated_at=NEW.created_at,version=version+1 WHERE id=NEW.ticket_id;
  END;
  CREATE TRIGGER IF NOT EXISTS recovery_status_event AFTER UPDATE OF status ON account_recovery_requests
  WHEN NEW.status<>OLD.status
  BEGIN
    INSERT INTO account_recovery_events(id,ticket_id,author_id,kind,body,created_at)
      VALUES(lower(hex(randomblob(16))),NEW.id,NEW.updated_by,'status',NEW.status,NEW.updated_at);
  END;
  CREATE TABLE IF NOT EXISTS support_tickets (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK(category IN ('account','upload','quiz','review','other')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Open' CHECK(status IN ('Open','In progress','Resolved')),
    version INTEGER NOT NULL DEFAULT 1,
    updated_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    resolved_at TEXT,
    UNIQUE(owner_id,client_id)
  );
  CREATE TABLE IF NOT EXISTS support_events (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    author_id INTEGER NOT NULL REFERENCES users(id),
    client_id TEXT,
    kind TEXT NOT NULL CHECK(kind IN ('reply','status')),
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(ticket_id,author_id,client_id)
  );
  CREATE INDEX IF NOT EXISTS idx_support_owner ON support_tickets(owner_id,updated_at);
  CREATE TABLE IF NOT EXISTS support_faq_replies (
    event_id TEXT PRIMARY KEY REFERENCES support_events(id) ON DELETE CASCADE,
    body TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS support_ai_replies (
    event_id TEXT PRIMARY KEY REFERENCES support_events(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    model TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TRIGGER IF NOT EXISTS support_ai_update AFTER INSERT ON support_ai_replies
  BEGIN
    UPDATE support_tickets SET updated_at=NEW.created_at,version=version+1
      WHERE id=(SELECT ticket_id FROM support_events WHERE id=NEW.event_id);
  END;
  CREATE INDEX IF NOT EXISTS idx_support_events ON support_events(ticket_id,created_at);
  CREATE TRIGGER IF NOT EXISTS support_reply_update AFTER INSERT ON support_events
  WHEN NEW.kind='reply'
  BEGIN
    UPDATE support_tickets SET updated_at=NEW.created_at,version=version+1 WHERE id=NEW.ticket_id;
  END;
  CREATE TRIGGER IF NOT EXISTS support_status_event AFTER UPDATE OF status ON support_tickets
  WHEN NEW.status<>OLD.status
  BEGIN
    INSERT INTO support_events(id,ticket_id,author_id,kind,body,created_at)
      VALUES(lower(hex(randomblob(16))),NEW.id,NEW.updated_by,'status',NEW.status,NEW.updated_at);
  END;
  CREATE TABLE IF NOT EXISTS study_history (
    id TEXT PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL, course_id TEXT NOT NULL, payload TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS review_attempts (
    id TEXT PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    record_id TEXT NOT NULL REFERENCES study_history(id) ON DELETE CASCADE,
    payload TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS user_profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    bio TEXT NOT NULL DEFAULT '',
    learning_goal TEXT NOT NULL DEFAULT '',
    avatar TEXT NOT NULL DEFAULT ''
  );
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

  CREATE TABLE IF NOT EXISTS material_originals (
    material_id INTEGER PRIMARY KEY REFERENCES materials(id) ON DELETE CASCADE,
    storage_key TEXT NOT NULL UNIQUE,
    sha256 TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS google_accounts (
    subject TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_materials_course_id
    ON materials(course_id);

  CREATE INDEX IF NOT EXISTS idx_materials_owner_id
    ON materials(owner_id);

  CREATE TRIGGER IF NOT EXISTS delete_course_history AFTER DELETE ON courses
  BEGIN
    DELETE FROM study_history WHERE course_id=OLD.id AND owner_id=OLD.owner_id;
  END;
  CREATE TRIGGER IF NOT EXISTS delete_material_history AFTER DELETE ON materials
  BEGIN
    DELETE FROM study_history WHERE owner_id=OLD.owner_id AND course_id=OLD.course_id
      AND (CAST(json_extract(payload,'$.sourceFileId') AS TEXT)=CAST(OLD.id AS TEXT)
        OR EXISTS(SELECT 1 FROM json_each(payload,'$.selectedMaterialIds') WHERE CAST(value AS TEXT)=CAST(OLD.id AS TEXT)));
  END;
`;

async function createSchema({ exec }) {
  await exec(SCHEMA_SQL);
}

module.exports = {
  createSchema,
  REQUIRED_TABLES,
};
