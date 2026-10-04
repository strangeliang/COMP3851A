const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { createHash, randomUUID } = require('node:crypto');
const { backup, restore, verify } = require('../scripts/backup');

test('backup restores database and original bytes; refuses overwrite, missing files and corrupted backups', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'study-backup-test-'));
  const databasePath = path.join(root, 'live.db');
  const uploadPath = path.join(root, 'originals');
  const destination = path.join(root, 'backup');
  const restored = path.join(root, 'restored');
  const bytes = Buffer.from('Private original lesson.');
  const key = `${randomUUID()}.bin`;
  let db;
  try {
    await fs.mkdir(uploadPath);
    await fs.writeFile(path.join(uploadPath, key), bytes);
    db = new sqlite3.Database(databasePath);
    await new Promise((resolve, reject) => db.exec(`CREATE TABLE material_originals(storage_key TEXT,sha256 TEXT);
      CREATE TABLE support_tickets(id TEXT,body TEXT); INSERT INTO support_tickets VALUES('ticket','Saved reply');`, (e) => e ? reject(e) : resolve()));
    await new Promise((resolve, reject) => db.run('INSERT INTO material_originals VALUES(?,?)', [key, createHash('sha256').update(bytes).digest('hex')], (e) => e ? reject(e) : resolve()));
    await new Promise((resolve) => db.close(resolve)); db = null;
    await assert.rejects(backup({ databasePath, uploadPath, destination }), /Stop the backend/);
    await backup({ databasePath, uploadPath, destination, serverStopped: true });
    assert.equal((await verify(destination)).originals.length, 1);
    await assert.rejects(backup({ databasePath, uploadPath, destination, serverStopped: true }), /EEXIST/);
    await restore({ source: destination, destination: restored });
    assert.deepEqual(await fs.readFile(path.join(restored, 'originals', key)), bytes);
    db = new sqlite3.Database(path.join(restored, 'study_companion.db'));
    const row = await new Promise((resolve, reject) => db.get('SELECT body FROM support_tickets', (e, row) => e ? reject(e) : resolve(row)));
    assert.equal(row.body, 'Saved reply');
    await assert.rejects(restore({ source: destination, destination: restored }), /EEXIST/);
    await fs.writeFile(path.join(destination, 'originals', key), 'tampered');
    await assert.rejects(restore({ source: destination, destination: path.join(root, 'bad-restore') }), /checksum mismatch/);
    await assert.rejects(fs.stat(path.join(root, 'bad-restore')), /ENOENT/);
    await fs.rename(path.join(uploadPath, key), path.join(uploadPath, 'missing.bin'));
    const incomplete = path.join(root, 'incomplete');
    await assert.rejects(backup({ databasePath, uploadPath, destination: incomplete, serverStopped: true }), /ENOENT/);
    await assert.rejects(verify(incomplete), /ENOENT/);
  } finally {
    if (db) await new Promise((resolve) => db.close(resolve));
    // root is the explicit directory returned by mkdtemp above, never user data.
    await fs.rm(root, { recursive: true, force: true });
  }
});
