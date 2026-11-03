const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcryptjs');

test('history source metadata uses the authenticated owner and returns only material IDs, courses and names', async (t) => {
  const tempRoot = fs.realpathSync(os.tmpdir());
  const folder = fs.mkdtempSync(path.join(tempRoot, 'study-history-sources-'));
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
    assert.ok(path.basename(folder).startsWith('study-history-sources-'));
    fs.rmSync(folder, { recursive: true, force: true });
  });
  await database.initializeDatabase();
  const password = 'history-source-test-password';
  const first = await database.registerStudent('First student', 'first@sources.invalid', bcrypt.hashSync(password, 4));
  const second = await database.registerStudent('Second student', 'second@sources.invalid', bcrypt.hashSync(password, 4));
  const ownedCourses = [
    { id: 'first-course-a', ownerId: first.id, code: 'A101', name: 'First course' },
    { id: 'first-course-b', ownerId: first.id, code: 'A102', name: 'Second course' },
    { id: 'other-course', ownerId: second.id, code: 'B101', name: 'Other account course' },
  ];
  for (const course of ownedCourses) await database.createCourse(course);
  const firstSources = [];
  for (const [courseId, name, content] of [
    ['first-course-a', 'Owned lecture notes.txt', 'PRIVATE_FIRST_BODY_SENTINEL'],
    ['first-course-b', 'Owned revision notes.txt', 'PRIVATE_SECOND_BODY_SENTINEL'],
  ]) {
    firstSources.push(await database.createMaterialForOwner({ courseId, ownerId: first.id, name, type: 'TXT', sizeBytes: content.length, content }));
  }
  const otherSource = await database.createMaterialForOwner({ courseId: 'other-course', ownerId: second.id,
    name: 'Other student private filename.txt', type: 'TXT', sizeBytes: 30, content: 'PRIVATE_OTHER_BODY_SENTINEL' });
  const metadata = source => ({ id: source.id, course_id: source.course_id, name: source.name });
  const expectedFirst = firstSources.map(metadata).sort((a, b) => a.id - b.id);
  const expectedSecond = [metadata(otherSource)];
  assert.deepEqual(await database.listHistorySources(first.id), expectedFirst);
  assert.deepEqual(await database.listHistorySources(second.id), expectedSecond);

  server = createApp({ database, gemini: { status: () => ({ configured: false }) }, mailer: { configured: false } }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function login(email) {
    const response = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    assert.equal(response.status, 200);
    return response.headers.get('set-cookie').split(';')[0];
  }
  async function history(cookie, suffix = '') {
    const response = await fetch(`${base}/history${suffix}`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200);
    return response.json();
  }
  const firstCookie = await login(first.email);
  const secondCookie = await login(second.email);
  const firstHistory = await history(firstCookie);
  const secondHistory = await history(secondCookie);
  assert.deepEqual(firstHistory.sourceMaterials, expectedFirst);
  assert.deepEqual(secondHistory.sourceMaterials, expectedSecond);
  for (const result of [firstHistory, secondHistory]) {
    for (const source of result.sourceMaterials) assert.deepEqual(Object.keys(source).sort(), ['course_id', 'id', 'name']);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_.*_BODY_SENTINEL/);
  }
  assert.doesNotMatch(JSON.stringify(firstHistory), /Other student private filename|other-course/);
  assert.doesNotMatch(JSON.stringify(secondHistory), /Owned lecture notes|Owned revision notes|first-course-/);
  assert.deepEqual((await history(firstCookie, `?ownerId=${second.id}`)).sourceMaterials, expectedFirst);
  assert.deepEqual((await history(secondCookie, `?owner_id=${first.id}`)).sourceMaterials, expectedSecond);

  const anonymous = await fetch(`${base}/history`);
  assert.equal(anonymous.status, 401);
  const denied = await anonymous.json();
  assert.equal(denied.sourceMaterials, undefined);
  assert.doesNotMatch(JSON.stringify(denied), /Owned lecture notes|Other student private filename|BODY_SENTINEL/);
});
