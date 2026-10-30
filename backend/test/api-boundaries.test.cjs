const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { createGeminiService } = require('../src/services/geminiService');

test('inherited object properties are not study style or difficulty options', async () => {
  let calls = 0;
  const service = createGeminiService({ apiKey: 'synthetic-boundary-test-key', fetchImpl: async () => {
    calls += 1;
    throw new Error('Invalid requests must not reach the provider');
  } });
  const materials = [{ id: 1, name: 'notes.txt', content: 'Source text.' }];
  for (const value of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    await assert.rejects(service.generate('qa', { materials, question: 'Explain.', answerStyle: value }),
      error => error.status === 400 && error.code === 'INVALID_INPUT');
    await assert.rejects(service.generate('quiz', { materials, difficulty: value }),
      error => error.status === 400 && error.code === 'INVALID_INPUT');
  }
  assert.equal(calls, 0);
});

test('API boundary checks reject invalid material types and concurrent deletion during review', async t => {
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
  const password = 'api-boundary-test-password';
  const user = await database.registerStudent('Reader', 'boundary@tests.invalid', bcrypt.hashSync(password, 4));
  const other = await database.registerStudent('Other', 'other-boundary@tests.invalid', bcrypt.hashSync(password, 4));
  await database.createCourse({ id: 'boundary-course', ownerId: user.id, code: 'BOUND', name: 'Boundary course' });
  let beforeSaveReview;
  const isolated = { ...database, saveReview: async (...args) => {
    if (beforeSaveReview) await beforeSaveReview(args[2]);
    return database.saveReview(...args);
  } };
  server = createApp({ database: isolated, gemini: createGeminiService({ apiKey: '' }), mailer: { configured: false } }).listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let cookie;
  const request = async (url, body, method = 'POST') => {
    const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { response, body: await response.json() };
  };
  const login = await request('/auth/login', { email: user.email, password });
  assert.equal(login.response.status, 200);
  cookie = login.response.headers.get('set-cookie').split(';')[0];
  const quiz = { questions: [{ id: 1, question: 'Which answer?', options: ['Correct', 'Wrong'], answerIndex: 0 }], answers: { 1: 1 }, score: 0 };
  const saveQuiz = id => database.saveHistory(id, user.id, 'quiz', 'boundary-course', quiz);
  const review = { answers: { 1: 0 }, clientId: 'boundary-review-request-01' };

  await t.test('unsupported types fail before database constraints, while normalised supported types work', async () => {
    for (const type of ['SVG', 'HTML', 'DOC', 'EXE']) {
      const result = await request('/courses/boundary-course/materials', { name: 'invalid.file', type, sizeBytes: 1, content: 'Text' });
      assert.equal(result.response.status, 400);
      assert.equal(result.body.code, 'INVALID_MATERIAL');
    }
    assert.deepEqual(await database.listMaterialsByCourseOwner('boundary-course', user.id), []);
    const result = await request('/courses/boundary-course/materials', { name: 'valid.txt', type: ' txt ', sizeBytes: 1, content: 'Text' });
    assert.equal(result.response.status, 201);
    assert.equal(result.body.material.type, 'TXT');
  });

  await t.test('soft deletion between read and save rejects the attempt and undo has no extra score', async () => {
    await saveQuiz('soft-delete-race');
    beforeSaveReview = id => database.deleteHistory(id, user.id);
    const result = await request('/history/soft-delete-race/review', review);
    beforeSaveReview = null;
    assert.equal(result.response.status, 404);
    assert.equal(result.body.code, 'NOT_FOUND');
    assert.equal(await database.getReview(`${user.id}:${review.clientId}`, user.id), undefined);
    await database.restoreHistory('soft-delete-race', user.id);
    assert.deepEqual(await database.listReviews(user.id), []);
    assert.deepEqual(JSON.parse((await database.getHistory('soft-delete-race', user.id)).payload), quiz);
  });

  await t.test('permanent deletion between read and save returns unavailable instead of an internal error', async () => {
    await saveQuiz('hard-delete-race');
    beforeSaveReview = id => new Promise((resolve, reject) => database.db.run('DELETE FROM study_history WHERE id=? AND owner_id=?', [id, user.id], error => error ? reject(error) : resolve()));
    const result = await request('/history/hard-delete-race/review', { answers: { 1: 0 } });
    beforeSaveReview = null;
    assert.equal(result.response.status, 404);
    assert.equal(result.body.code, 'NOT_FOUND');
    assert.deepEqual(await database.listReviews(user.id), []);
  });

  await t.test('active attempts stay idempotent and cannot be stored under another owner', async () => {
    await saveQuiz('active-quiz');
    assert.equal((await database.saveReview('foreign-review', other.id, 'active-quiz', {})).changes, 0);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await request('/history/active-quiz/review', review);
      assert.equal(result.response.status, 200);
      assert.equal(result.body.score, 100);
    }
    assert.equal((await database.listReviews(user.id)).length, 1);
    const conflicting = await request('/history/active-quiz/review', { ...review, answers: { 1: 1 } });
    assert.equal(conflicting.response.status, 409);
    assert.equal(conflicting.body.code, 'REVIEW_CONFLICT');
    assert.deepEqual(JSON.parse((await database.getHistory('active-quiz', user.id)).payload), quiz);
  });

  await t.test('every history source uses a canonical ID and belongs to the authenticated course', async () => {
    const [material] = await database.listMaterialsByCourseOwner('boundary-course', user.id);
    await database.createCourse({ id: 'other-course', ownerId: other.id, code: 'OTHER', name: 'Other course' });
    await database.createCourse({ id: 'second-course', ownerId: user.id, code: 'SECOND', name: 'Second course' });
    const foreign = await database.createMaterialForOwner({ courseId: 'other-course', ownerId: other.id, name: 'other.txt', type: 'TXT', sizeBytes: 1, content: 'Other source' });
    const differentCourse = await database.createMaterialForOwner({ courseId: 'second-course', ownerId: user.id, name: 'second.txt', type: 'TXT', sizeBytes: 1, content: 'Second source' });
    const history = { kind: 'qa', courseId: 'boundary-course', payload: { role: 'User', text: 'A saved source question.' } };
    let number = 0;
    const save = source => request('/history', { ...history, id: `source-${number++}`, payload: { ...history.payload, ...source } });
    for (const id of [foreign.id, differentCourse.id]) {
      for (const source of [{ sourceFileId: id }, { selectedMaterialIds: [id] }]) {
        const result = await save(source);
        assert.equal(result.response.status, 403);
        assert.equal(result.body.code, 'MATERIAL_NOT_FOUND');
      }
    }
    for (const id of [true, [material.id], `0${material.id}`, `${material.id}.0`, 0, -1, null]) {
      for (const source of [{ sourceFileId: id }, { selectedMaterialIds: [id] }]) {
        const result = await save(source);
        assert.equal(result.response.status, 400);
        assert.equal(result.body.code, 'INVALID_HISTORY');
      }
    }
    for (const source of [{ sourceFileId: String(material.id) }, { selectedMaterialIds: [String(material.id)] }]) {
      const body = { ...history, id: `canonical-${number++}`, payload: { ...history.payload, ...source } };
      for (let attempt = 0; attempt < 2; attempt += 1) assert.equal((await request('/history', body)).response.status, 200);
      assert.deepEqual(JSON.parse((await database.getHistory(`${user.id}:${body.id}`, user.id)).payload), body.payload);
    }
    assert.equal((await save({ sourceFileId: '' })).response.status, 200, 'Legacy empty source placeholders remain valid');
    assert.equal((await request(`/materials/${material.id}`, undefined, 'DELETE')).response.status, 200);
    const remaining = await database.listHistory(user.id);
    assert.ok(remaining.every(record => !record.id.includes('canonical-')), 'Deleting a source also removes history saved with string IDs');
  });
});
