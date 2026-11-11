const test = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { maxFileBytes } = require('../../shared/studyLimits.json');
const { createSchema, migrateMaterialSizeLimit } = require('../src/config/schema');

const previousMaxFileBytes = 10 * 1024 * 1024;
const tableSql = "SELECT sql FROM sqlite_schema WHERE type='table' AND name='materials'";
const relatedObjects = "SELECT name,sql FROM sqlite_schema WHERE tbl_name='materials' AND type IN ('index','trigger') ORDER BY name";

async function openLegacySchema(t) {
  const db = new sqlite3.Database(':memory:');
  t.after(() => new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve())));
  const exec = sql => new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve()));
  const get = sql => new Promise((resolve, reject) => db.get(sql, (error, row) => error ? reject(error) : resolve(row)));
  const all = sql => new Promise((resolve, reject) => db.all(sql, (error, rows) => error ? reject(error) : resolve(rows)));
  await exec('PRAGMA foreign_keys = ON;');
  await createSchema({ exec: sql => exec(sql.replace(`size_bytes <= ${maxFileBytes}`, `size_bytes <= ${previousMaxFileBytes}`)) });
  await exec(`INSERT INTO users(id,name,email,password_hash,role) VALUES(1,'Student','test@example.test','${'x'.repeat(60)}','Student');
    INSERT INTO courses(id,owner_id,code,name) VALUES('course',1,'CS01','Example course');
    INSERT INTO materials(id,course_id,owner_id,name,type,size_bytes,content,reading_notes)
      VALUES(17,'course',1,'retained.pptx','PPTX',${previousMaxFileBytes},'Study text','Original reading notes');
    INSERT INTO materials(id,course_id,owner_id,name,type,size_bytes)
      VALUES(99,'course',1,'deleted.pdf','PDF',1);
    DELETE FROM materials WHERE id=99;
    INSERT INTO material_originals(material_id,storage_key,sha256) VALUES(17,'original.pptx','hash');
    INSERT INTO study_history(id,owner_id,kind,course_id,payload)
      VALUES('history',1,'summary','course','{"selectedMaterialIds":[17]}');`);
  return { exec, get, all };
}

test('material size migration preserves metadata, originals, history, indexes, and ID allocation', async t => {
  const db = await openLegacySchema(t);
  const { exec, get, all } = db;
  const material = await get('SELECT * FROM materials WHERE id=17');
  const original = await get('SELECT * FROM material_originals WHERE material_id=17');
  const history = await get("SELECT * FROM study_history WHERE id='history'");
  const objects = await all(relatedObjects);
  assert.equal((await get('SELECT last_id FROM material_id_sequence')).last_id, 99);
  await assert.rejects(exec(`UPDATE materials SET size_bytes=${maxFileBytes} WHERE id=17;`), /CHECK constraint failed/);

  await migrateMaterialSizeLimit(db);
  assert.equal((await get('PRAGMA foreign_keys')).foreign_keys, 1);
  assert.deepEqual(await all('PRAGMA foreign_key_check'), []);
  assert.deepEqual(await get('SELECT * FROM materials WHERE id=17'), material);
  assert.deepEqual(await get('SELECT * FROM material_originals WHERE material_id=17'), original);
  assert.deepEqual(await get("SELECT * FROM study_history WHERE id='history'"), history);
  assert.deepEqual(await all(relatedObjects), objects);
  assert.deepEqual(await all('SELECT * FROM original_cleanup_queue'), []);
  assert.equal((await get('SELECT last_id FROM material_id_sequence')).last_id, 99);

  await exec(`INSERT INTO materials(id,course_id,owner_id,name,type,size_bytes)
    SELECT last_id+1,'course',1,'large.pptx','PPTX',${maxFileBytes} FROM material_id_sequence;`);
  assert.equal((await get('SELECT last_id FROM material_id_sequence')).last_id, 100);
  await assert.rejects(exec(`UPDATE materials SET size_bytes=${maxFileBytes + 1} WHERE id=100;`), /CHECK constraint failed/);

  const upgradedSchema = await get(tableSql);
  await createSchema({ exec });
  await migrateMaterialSizeLimit(db);
  assert.deepEqual(await get(tableSql), upgradedSchema);
  assert.equal((await get('SELECT size_bytes FROM materials WHERE id=100')).size_bytes, maxFileBytes);

  await exec('DELETE FROM materials WHERE id=17;');
  assert.equal(await get('SELECT * FROM material_originals WHERE material_id=17'), undefined);
  assert.equal(await get("SELECT * FROM study_history WHERE id='history'"), undefined);
  assert.deepEqual(await all('SELECT storage_key FROM original_cleanup_queue'), [{ storage_key: 'original.pptx' }]);
});

test('material size migration rolls back a failed integrity check and restores foreign key enforcement', async t => {
  const db = await openLegacySchema(t);
  const { exec, get, all } = db;
  const oldSchema = await get(tableSql);
  const oldObjects = await all(relatedObjects);
  await exec(`PRAGMA foreign_keys = OFF;
    INSERT INTO material_originals(material_id,storage_key,sha256) VALUES(777,'orphan.pptx','hash');
    PRAGMA foreign_keys = ON;`);

  await assert.rejects(migrateMaterialSizeLimit(db), /Foreign key check failed/);
  assert.equal((await get('PRAGMA foreign_keys')).foreign_keys, 1);
  assert.deepEqual(await get(tableSql), oldSchema);
  assert.deepEqual(await all(relatedObjects), oldObjects);
  assert.equal(await get("SELECT name FROM sqlite_schema WHERE name='materials_size_upgrade'"), undefined);
  assert.deepEqual(await all('SELECT material_id FROM material_originals ORDER BY material_id'), [{ material_id: 17 }, { material_id: 777 }]);
  assert.equal((await get('SELECT last_id FROM material_id_sequence')).last_id, 99);
  await assert.rejects(exec(`UPDATE materials SET size_bytes=${maxFileBytes} WHERE id=17;`), /CHECK constraint failed/);
});
