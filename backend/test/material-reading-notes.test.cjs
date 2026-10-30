const test = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const bcrypt = require('bcryptjs');
const { createSchema } = require('../src/config/schema');

test('reading-note migration preserves legacy source text and is safe to run repeatedly', async (t) => {
  const db = new sqlite3.Database(':memory:');
  const exec = sql => new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve()));
  const get = sql => new Promise((resolve, reject) => db.get(sql, (error, row) => error ? reject(error) : resolve(row)));
  t.after(() => new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve())));
  await exec(`CREATE TABLE materials (
    id INTEGER PRIMARY KEY, course_id TEXT, owner_id INTEGER, name TEXT, type TEXT, size_bytes INTEGER,
    status TEXT, content TEXT, created_at TEXT, updated_at TEXT
  ); INSERT INTO materials VALUES (1,'old-course',1,'old.pdf','PDF',120,'Ready','Original text: x != y.\n第二页','old-date','old-date');`);
  const original = await get('SELECT * FROM materials WHERE id=1');
  await createSchema({ exec });
  assert.deepEqual(await get('SELECT * FROM materials WHERE id=1'), { ...original, reading_notes: '' });
  await exec("UPDATE materials SET reading_notes='OCR was used; check page 2.' WHERE id=1");
  await createSchema({ exec });
  assert.deepEqual(await get('SELECT * FROM materials WHERE id=1'), { ...original, reading_notes: 'OCR was used; check page 2.' });
  await assert.rejects(exec("UPDATE materials SET reading_notes=NULL WHERE id=1"), /constraint/i);
  await assert.rejects(exec(`UPDATE materials SET reading_notes='${'x'.repeat(2001)}' WHERE id=1`), /constraint/i);
});

test('material reading notes persist across logins, stay owner scoped, and retain their AI request path', async (t) => {
  process.env.STUDY_DATABASE_PATH = ':memory:';
  process.env.STUDY_SEED_DEMO = '0';
  process.env.NODE_ENV = 'test';
  const database = require('../src/config/database');
  const { createApp } = require('../src/app');
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
    await new Promise((resolve, reject) => database.db.close(error => error ? reject(error) : resolve()));
  });
  await database.initializeDatabase();
  const password = 'reading-notes-test-password';
  const student = await database.registerStudent('Reader', 'reader@notes.invalid', bcrypt.hashSync(password, 4));
  const other = await database.registerStudent('Other', 'other@notes.invalid', bcrypt.hashSync(password, 4));
  await database.createCourse({ id: 'reading-course', ownerId: student.id, code: 'READ', name: 'Reading course' });
  await database.createCourse({ id: 'other-course', ownerId: other.id, code: 'OTHER', name: 'Other course' });
  const aiCalls = [];
  server = createApp({ database, gemini: {
    status: () => ({ configured: true }),
    generate: async (mode, input) => { aiCalls.push({ mode, input }); return { paragraph: 'Stub summary', concepts: ['Checking sources'], mode: 'api' }; },
  } }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function request(url, cookie, method = 'GET', body, expected = 200) {
    const response = await fetch(base + url, { method,
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json();
    assert.equal(response.status, expected, JSON.stringify(result));
    return { result, response };
  }
  async function login(user) {
    const { response } = await request('/auth/login', null, 'POST', { email: user.email, password });
    return response.headers.get('set-cookie').split(';')[0];
  }
  const cookie = await login(student);
  const otherCookie = await login(other);
  const content = '[Page 1]\n  Exact extracted text: x != y.\n第二页';
  const readingNotes = 'OCR was used on 1 page(s). No text was detected on page(s) 3; verify that these pages are blank.';
  const body = { name: 'scan.pdf', type: 'PDF', sizeBytes: 100, content, readingNotes };
  const { result: created } = await request('/courses/reading-course/materials', cookie, 'POST', body, 201);
  assert.equal(created.material.reading_notes, readingNotes);
  assert.equal(created.material.content, content);
  await request('/auth/logout', cookie, 'POST');
  const freshCookie = await login(student);
  const { result: loaded } = await request('/courses/reading-course/materials', freshCookie);
  assert.equal(loaded.materials[0].reading_notes, readingNotes);
  assert.equal(loaded.materials[0].content, content);
  await request('/ai/summary', freshCookie, 'POST', { materials: loaded.materials.map(item => ({
    id: item.id, name: item.name, content: item.content, readingNotes: item.reading_notes,
  })) });
  assert.equal(aiCalls[0].input.materials[0].readingNotes, readingNotes);
  assert.equal(aiCalls[0].input.materials[0].content, content);
  await request('/courses/reading-course/materials', null, 'GET', undefined, 401);
  await request('/courses/reading-course/materials', otherCookie, 'GET', undefined, 404);
  await request('/courses/reading-course/materials', otherCookie, 'POST', body, 404);
  await request('/courses/reading-course/materials', freshCookie, 'POST', { ...body, ownerId: other.id }, 400);
  assert.deepEqual((await request('/courses/other-course/materials', otherCookie)).result.materials, []);
  assert.equal(await database.getMaterialForOwner(created.material.id, other.id), undefined);

  for (const readingNotes of [null, 1, false, [], {}, 'x'.repeat(2001)]) {
    const { result } = await request('/courses/reading-course/materials', freshCookie, 'POST', { ...body, name: 'invalid.pdf', readingNotes }, 400);
    assert.equal(result.code, 'INVALID_READING_NOTES');
  }
  assert.equal((await database.listMaterialsByCourseOwner('reading-course', student.id)).length, 1);
  const boundary = await request('/courses/reading-course/materials', freshCookie, 'POST', { ...body, name: 'boundary.pdf', readingNotes: 'x'.repeat(2000) }, 201);
  assert.equal(boundary.result.material.reading_notes.length, 2000);
  const legacy = { ...body, name: 'legacy.pdf' };
  delete legacy.readingNotes;
  const empty = await request('/courses/reading-course/materials', freshCookie, 'POST', legacy, 201);
  assert.equal(empty.result.material.reading_notes, '');
  assert.equal(empty.result.material.content, content);
});
