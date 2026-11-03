const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcryptjs');

test('course edits are owner scoped, validate names and codes, and preserve every dependent record and original file', async t => {
  const tempRoot = fs.realpathSync(os.tmpdir());
  const folder = fs.mkdtempSync(path.join(tempRoot, 'study-course-edit-'));
  process.env.STUDY_DATABASE_PATH = ':memory:';
  process.env.STUDY_UPLOAD_PATH = path.join(folder, 'originals');
  process.env.STUDY_SEED_DEMO = '0';
  process.env.NODE_ENV = 'test';
  const database = require('../src/config/database');
  const { createApp } = require('../src/app');
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
    await new Promise((resolve, reject) => database.db.close(error => error ? reject(error) : resolve()));
    assert.equal(path.dirname(path.resolve(folder)), tempRoot);
    assert.ok(path.basename(folder).startsWith('study-course-edit-'));
    fs.rmSync(folder, { recursive: true, force: true });
  });
  await database.initializeDatabase();
  const password = 'course-edit-test-password';
  const first = await database.registerStudent('First', 'first@course-edit.invalid', bcrypt.hashSync(password, 4));
  const other = await database.registerStudent('Other', 'other@course-edit.invalid', bcrypt.hashSync(password, 4));
  await database.createCourse({ id: 'target', ownerId: first.id, code: 'OLD', name: 'Original course' });
  await database.createCourse({ id: 'duplicate', ownerId: first.id, code: 'TAKEN', name: 'Other owned course' });
  await database.createCourse({ id: 'foreign', ownerId: other.id, code: 'NEW', name: 'Private course' });
  const originalText = 'Exact original source text\n第二行';
  const originalBytes = Buffer.from(originalText);
  const material = await database.createMaterialForOwner({ courseId: 'target', ownerId: first.id,
    name: 'notes.txt', type: 'TXT', sizeBytes: originalBytes.length, content: originalText, readingNotes: 'Keep this reading note.' });
  await database.saveHistory('history', first.id, 'summary', 'target', { selectedMaterialIds: [material.id], summary: { paragraph: 'Saved summary', concepts: ['A'] } });
  await database.saveReview('review', first.id, 'history', { score: 75, answers: { 1: 0 } });
  const historyBefore = await database.getHistory('history', first.id);
  const reviewBefore = await database.getReview('review', first.id);
  const courseBefore = (await database.listCoursesByOwner(first.id)).find(course => course.id === 'target');
  server = createApp({ database, gemini: { status: () => ({ configured: false }) } }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (url, cookie, method = 'GET', body, raw = false) => fetch(base + url, {
    method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': raw ? 'application/octet-stream' : 'application/json' }) },
    ...(body === undefined ? {} : { body: raw ? body : JSON.stringify(body) }),
  });
  async function json(url, cookie, method, body, status = 200) {
    const response = await request(url, cookie, method, body);
    const result = await response.json(); assert.equal(response.status, status, JSON.stringify(result)); return result;
  }
  async function login(user) {
    const response = await request('/auth/login', null, 'POST', { email: user.email, password });
    assert.equal(response.status, 200); return response.headers.get('set-cookie').split(';')[0];
  }
  const cookie = await login(first), otherCookie = await login(other);
  assert.equal((await request(`/materials/${material.id}/original`, cookie, 'PUT', originalBytes, true)).status, 201);
  const materialBefore = await database.getMaterialForOwner(material.id, first.id);
  await json('/courses/target', null, 'PATCH', { code: 'NEW', name: 'New name' }, 401);
  await json('/courses/target', otherCookie, 'PATCH', { code: 'NEW', name: 'Stolen name' }, 404);
  await json('/courses/target', cookie, 'PATCH', { code: 'NEW', name: 'New name', ownerId: other.id }, 400);
  await json('/courses/target', cookie, 'PATCH', { code: 'NEW', name: 'New name', id: 'foreign' }, 400);
  await json('/courses/target?ownerId=2', cookie, 'PATCH', { code: 'NEW', name: 'New name' }, 400);
  await json('/courses/missing', cookie, 'PATCH', { code: 'NEW', name: 'New name' }, 404);
  for (const fields of [{ code: '' }, { name: ' ' }, { code: 5 }, { name: {} }, { code: 'x'.repeat(33) }, { code: 'ß'.repeat(17) }, { name: 'x'.repeat(121) }]) {
    await json('/courses/target', cookie, 'PATCH', { code: 'NEW', name: 'New name', ...fields }, 400);
  }
  await json('/courses/target', cookie, 'PATCH', { code: 'taken', name: 'New name' }, 409);
  assert.deepEqual((await database.listCoursesByOwner(first.id)).find(course => course.id === 'target'), courseBefore);
  const updated = await json('/courses/target', cookie, 'PATCH', { code: ' new ', name: '  Renamed course  ' });
  assert.equal(updated.course.id, 'target'); assert.equal(updated.course.code, 'NEW'); assert.equal(updated.course.name, 'Renamed course');
  assert.equal(updated.course.created_at, courseBefore.created_at);
  await json('/courses/target', cookie, 'PATCH', { code: 'NEW', name: 'Renamed course' });
  assert.deepEqual(await database.getMaterialForOwner(material.id, first.id), materialBefore);
  assert.deepEqual(await database.getHistory('history', first.id), historyBefore);
  assert.deepEqual(await database.getReview('review', first.id), reviewBefore);
  assert.deepEqual(Buffer.from(await (await request(`/materials/${material.id}/original`, cookie)).arrayBuffer()), originalBytes);
  assert.equal((await database.listCoursesByOwner(other.id))[0].name, 'Private course');
  assert.equal((await database.listCoursesByOwner(first.id)).length, 2);
  await json('/courses/target', cookie, 'PATCH', { code: 'x'.repeat(32), name: 'n'.repeat(120) });
  await json('/courses', cookie, 'POST', { code: 'CREATE', name: 'n'.repeat(121) }, 400);
  await json('/courses', cookie, 'POST', { code: 'ß'.repeat(17), name: 'Name' }, 400);
});
