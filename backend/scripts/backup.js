const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const sqlite3 = require('sqlite3');

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const all = (db, sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (e, rows) => e ? reject(e) : resolve(rows)));
const close = (db) => new Promise((resolve, reject) => db.close((e) => e ? reject(e) : resolve()));
async function open(filename) {
  return new Promise((resolve, reject) => { const db = new sqlite3.Database(filename, sqlite3.OPEN_READONLY, (e) => e ? reject(e) : resolve(db)); });
}
async function regularFile(filename) {
  const stat = await fs.lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Expected a regular file, not a link: ' + filename);
}
async function checkDatabase(db) {
  const integrity = await all(db, 'PRAGMA quick_check');
  if (integrity.length !== 1 || Object.values(integrity[0])[0] !== 'ok') throw new Error('Database integrity check failed.');
  if ((await all(db, 'PRAGMA foreign_key_check')).length) throw new Error('Database foreign-key check failed.');
}
async function originalList(db) {
  const rows = await all(db, 'SELECT storage_key,sha256 FROM material_originals ORDER BY storage_key');
  if (rows.some((r) => !/^[a-f0-9-]{36}\.bin$/.test(r.storage_key) || !/^[a-f0-9]{64}$/.test(r.sha256))) throw new Error('Invalid original-file metadata.');
  return rows;
}
async function copyVerified(source, destination, expected) {
  await regularFile(source);
  const bytes = await fs.readFile(source);
  if (hash(bytes) !== expected) throw new Error('Checksum mismatch: ' + path.basename(source));
  await fs.writeFile(destination, bytes, { flag: 'wx', mode: 0o600 });
}
async function freshDirectory(destination) {
  // Never overwrite an existing directory, database or backup. No recursive delete.
  await fs.mkdir(destination, { mode: 0o700 });
  await fs.mkdir(path.join(destination, 'originals'), { mode: 0o700 });
}
async function backup({ databasePath, uploadPath, destination, serverStopped }) {
  if (!serverStopped) throw new Error('Stop the backend first, then pass --server-stopped so files and database remain consistent.');
  await regularFile(databasePath);
  await freshDirectory(destination);
  const db = await open(databasePath);
  try {
    await checkDatabase(db);
    // SQLite produces a consistent standalone database, including committed WAL data.
    await all(db, 'VACUUM INTO ?', [path.join(destination, 'study_companion.db')]);
    const originals = await originalList(db);
    for (const file of originals) await copyVerified(path.join(uploadPath, file.storage_key), path.join(destination, 'originals', file.storage_key), file.sha256);
    const manifest = { version: 1, createdAt: new Date().toISOString(),
      databaseSha256: hash(await fs.readFile(path.join(destination, 'study_companion.db'))), originals };
    // Written last: an incomplete backup has no manifest and cannot be restored.
    await fs.writeFile(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
    return manifest;
  } finally { await close(db); }
}
async function verify(source) {
  await regularFile(path.join(source, 'manifest.json'));
  const manifest = JSON.parse(await fs.readFile(path.join(source, 'manifest.json'), 'utf8'));
  const filename = path.join(source, 'study_companion.db');
  await regularFile(filename);
  if (manifest.version !== 1 || hash(await fs.readFile(filename)) !== manifest.databaseSha256) throw new Error('Invalid backup manifest or database checksum.');
  const db = await open(filename);
  try {
    await checkDatabase(db);
    const originals = await originalList(db);
    if (JSON.stringify(originals) !== JSON.stringify(manifest.originals)) throw new Error('Original-file manifest does not match the database.');
    for (const file of originals) {
      const filename = path.join(source, 'originals', file.storage_key);
      await regularFile(filename);
      if (hash(await fs.readFile(filename)) !== file.sha256) throw new Error('Original-file checksum mismatch: ' + file.storage_key);
    }
    return manifest;
  } finally { await close(db); }
}
async function restore({ source, destination }) {
  const manifest = await verify(source);
  await freshDirectory(destination);
  await copyVerified(path.join(source, 'study_companion.db'), path.join(destination, 'study_companion.db'), manifest.databaseSha256);
  for (const file of manifest.originals) await copyVerified(path.join(source, 'originals', file.storage_key), path.join(destination, 'originals', file.storage_key), file.sha256);
  return manifest;
}

if (require.main === module) {
  require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
  const [command, ...args] = process.argv.slice(2);
  const option = (name) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? path.resolve(args[i + 1]) : null; };
  const source = option('--source'); const destination = option('--destination');
  const databasePath = path.resolve(process.env.STUDY_DATABASE_PATH || path.join(__dirname, '../data/study_companion.db'));
  const uploadPath = path.resolve(process.env.STUDY_UPLOAD_PATH || path.join(path.dirname(databasePath), 'originals'));
  const run = command === 'backup' && destination ? () => backup({ databasePath, uploadPath, destination, serverStopped: args.includes('--server-stopped') })
    : command === 'restore' && source && destination ? () => restore({ source, destination })
    : command === 'verify' && source ? () => verify(source) : null;
  if (!run) { console.error('Usage: backup --destination NEW_DIR --server-stopped | verify --source BACKUP_DIR | restore --source BACKUP_DIR --destination NEW_DIR'); process.exitCode = 1; }
  else run().then((m) => console.log(`Completed ${command}: database and ${m.originals.length} original file(s).`)).catch((e) => { console.error(e.message); process.exitCode = 1; });
}
module.exports = { backup, restore, verify };
