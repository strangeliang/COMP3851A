const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const bcrypt = require('bcryptjs');

test('learning viewed flags and flashcard mastery persist by authenticated owner and saved record', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'study-learning-state-'));
  process.env.STUDY_DATABASE_PATH = path.join(directory, 'learning.db');
  process.env.STUDY_UPLOAD_PATH = path.join(directory, 'originals');
  process.env.STUDY_SEED_DEMO = '0';
  process.env.NODE_ENV = 'test';
  const database = require('../src/config/database');
  const { createApp } = require('../src/app');
  await database.initializeDatabase();
  const password = 'test-only-learning-state';
  const owner = await database.registerStudent('Owner', 'owner@learning.invalid', bcrypt.hashSync(password, 4));
  const other = await database.registerStudent('Other', 'other@learning.invalid', bcrypt.hashSync(password, 4));
  await database.createCourse({ id: 'course', ownerId: owner.id, code: 'L101', name: 'Learning' });
  await database.createCourse({ id: 'other-course', ownerId: other.id, code: 'L102', name: 'Other' });
  const exec = sql => new Promise((resolve, reject) => database.db.exec(sql, error => error ? reject(error) : resolve()));
  const get = (sql, args = []) => new Promise((resolve, reject) => database.db.get(sql, args, (error, row) => error ? reject(error) : resolve(row)));
  const summary = { summary: { paragraph: 'Existing learning summary.', concepts: ['Concept'] } };
  const quiz = { questions: [{ id: 1, question: 'Choose one', options: ['Correct', 'Wrong'], answerIndex: 0 }], answers: { 1: 1 } };
  const cards = { cards: [{ id: 1, front: 'First question', back: 'First answer' }, { id: 2, front: 'Second question', back: 'Second answer' }] };
  await database.saveHistory('old-summary', owner.id, 'summary', 'course', summary);
  await database.saveHistory('old-quiz', owner.id, 'quiz', 'course', quiz);
  await database.saveHistory('old-cards', owner.id, 'flashcards', 'course', cards);
  await exec('DROP TABLE study_history_views; DROP TABLE flashcard_progress; DROP TABLE study_feature_migrations;');
  await database.initializeDatabase();
  const server = createApp({ database }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
    await new Promise((resolve, reject) => database.db.close(error => error ? reject(error) : resolve()));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (url, cookie, method = 'GET', body) => fetch(base + url, {
    method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  async function login(email) {
    const response = await request('/auth/login', null, 'POST', { email, password });
    assert.equal(response.status, 200);
    return response.headers.get('set-cookie').split(';')[0];
  }
  const cookie = await login('owner@learning.invalid'), otherCookie = await login('other@learning.invalid');
  const history = async auth => (await request('/history', auth)).json();
  const url = id => `/history/${encodeURIComponent(id)}`;
  async function save(id, kind, payload, auth = cookie, courseId = 'course') {
    const response = await request('/history', auth, 'POST', { id, kind, courseId, payload });
    assert.equal(response.status, 200);
    return (await response.json()).id;
  }

  await t.test('upgrade marks old content read once and later restarts leave new records unread', async () => {
    const initial = await history(cookie);
    assert.deepEqual(initial.viewed.history.sort(), ['old-cards', 'old-quiz', 'old-summary']);
    assert.deepEqual(initial.viewed.review, ['old-quiz']);
    const newId = await save('new-summary', 'summary', summary);
    assert.equal(newId, `${owner.id}:new-summary`);
    await database.initializeDatabase();
    assert.equal((await history(cookie)).viewed.history.includes(newId), false);
    assert.deepEqual((await history(otherCookie)).viewed, { history: [], review: [] });
    assert.equal((await request(`${url(newId)}/view`, null, 'POST', { page: 'history' })).status, 401);
    assert.equal((await request(`${url(newId)}/view`, otherCookie, 'POST', { page: 'history' })).status, 404);
    assert.equal((await request(`${url(newId)}/view`, cookie, 'POST', { page: 'review' })).status, 404);
    for (const body of [{}, { page: 'other' }, { page: 'history', ownerId: other.id }, []]) {
      assert.equal((await request(`${url(newId)}/view`, cookie, 'POST', body)).status, 400);
    }
    for (let i = 0; i < 2; i++) assert.equal((await request(`${url(newId)}/view`, cookie, 'POST', { page: 'history' })).status, 200);
    assert.equal((await history(cookie)).viewed.history.filter(id => id === newId).length, 1);
  });

  await t.test('history and review acknowledgements stay independent and new Q&A messages stay new', async () => {
    const id = await save('new-quiz', 'quiz', quiz);
    assert.equal((await request(`${url(id)}/view`, cookie, 'POST', { page: 'history' })).status, 200);
    let viewed = (await history(cookie)).viewed;
    assert.equal(viewed.history.includes(id), true);
    assert.equal(viewed.review.includes(id), false);
    assert.equal((await request(`${url(id)}/view`, cookie, 'POST', { page: 'review' })).status, 200);
    assert.equal((await history(cookie)).viewed.review.includes(id), true);
    const qa = (role, messageOrder) => ({ role, text: `${role} message`, conversationId: 'a'.repeat(36), scopeKey: 'scope', messageOrder });
    const question = await save('question', 'qa', qa('User', 0));
    await request(`${url(question)}/view`, cookie, 'POST', { page: 'history' });
    const answer = await save('answer', 'qa', qa('AI', 1));
    viewed = (await history(cookie)).viewed;
    assert.equal(viewed.history.includes(question), true);
    assert.equal(viewed.history.includes(answer), false);
    await request(`${url(id)}`, cookie, 'DELETE');
    assert.equal((await history(cookie)).viewed.history.includes(id), false);
    await request(`${url(id)}/restore`, cookie, 'POST');
    viewed = (await history(cookie)).viewed;
    assert.equal(viewed.history.includes(id), true);
    assert.equal(viewed.review.includes(id), true);
  });

  await t.test('mastery patches are card-scoped, validated, isolated and kept across reopen and delete undo', async () => {
    const id = await save('cards', 'flashcards', cards), progressUrl = `${url(id)}/flashcards-progress`;
    assert.deepEqual(await (await request(progressUrl, cookie)).json(), { mastered: [] });
    assert.equal((await request(progressUrl, null)).status, 401);
    assert.equal((await request(progressUrl, otherCookie)).status, 404);
    assert.equal((await request(progressUrl, otherCookie, 'PATCH', { cardId: 1, mastered: true })).status, 404);
    for (const body of [{}, { cardId: 1, mastered: 'true' }, { cardId: 3, mastered: true },
      { cardId: '__proto__', mastered: true }, { cardId: 1, mastered: true, ownerId: other.id }, []]) {
      assert.equal((await request(progressUrl, cookie, 'PATCH', body)).status, 400);
    }
    const results = await Promise.all([1, 2].map(cardId => request(progressUrl, cookie, 'PATCH', { cardId, mastered: true })));
    assert.ok(results.every(response => response.status === 200));
    assert.deepEqual(await (await request(progressUrl, cookie)).json(), { mastered: ['1', '2'] });
    const secondCookie = await login('owner@learning.invalid');
    assert.deepEqual(await (await request(progressUrl, secondCookie)).json(), { mastered: ['1', '2'] });
    const reopened = execFileSync(process.execPath, ['-e', `
      const database=require('./src/config/database');
      database.initializeDatabase().then(async()=>{
        console.log(JSON.stringify({progress:await database.listFlashcardProgress(${JSON.stringify(id)},${owner.id}),viewed:await database.listHistoryViews(${owner.id})}));
        database.db.close();
      }).catch(error=>{console.error(error.message);process.exitCode=1;});
    `], { cwd: path.join(__dirname, '..'), env: process.env, encoding: 'utf8' });
    const persisted = JSON.parse(reopened.slice(reopened.indexOf('{')));
    assert.deepEqual(persisted.progress.map(row => row.card_id), ['1', '2']);
    assert.ok(persisted.viewed.some(row => row.record_id === `${owner.id}:new-quiz` && row.page === 'review'));
    await request(progressUrl, cookie, 'PATCH', { cardId: '1', mastered: false });
    assert.deepEqual(await (await request(progressUrl, cookie)).json(), { mastered: ['2'] });
    await request(url(id), cookie, 'DELETE');
    assert.equal((await request(progressUrl, cookie)).status, 404);
    assert.equal((await request(progressUrl, cookie, 'PATCH', { cardId: 1, mastered: true })).status, 404);
    await request(`${url(id)}/restore`, cookie, 'POST');
    assert.deepEqual(await (await request(progressUrl, cookie)).json(), { mastered: ['2'] });
    const fresh = await save('fresh-cards', 'flashcards', cards);
    assert.deepEqual(await (await request(`${url(fresh)}/flashcards-progress`, cookie)).json(), { mastered: [] });
    const legacy = await save('legacy-cards', 'flashcards', { cards: [{ front: 'No old ID', back: 'Legacy answer' }] });
    assert.equal((await request(`${url(legacy)}/flashcards-progress`, cookie, 'PATCH', { cardId: 1, mastered: true })).status, 200);
  });

  await t.test('a deletion during a write cannot recreate progress or viewed flags and course removal cleans up', async () => {
    const id = await save('race-cards', 'flashcards', cards);
    const original = database.setFlashcardMastered;
    database.setFlashcardMastered = async (...args) => { await database.deleteHistory(id, owner.id); return original(...args); };
    try {
      assert.equal((await request(`${url(id)}/flashcards-progress`, cookie, 'PATCH', { cardId: 1, mastered: true })).status, 404);
    } finally { database.setFlashcardMastered = original; }
    assert.equal((await get('SELECT COUNT(*) AS count FROM flashcard_progress WHERE record_id=?', [id])).count, 0);
    await database.restoreHistory(id, owner.id);
    const mark = database.markHistoryViewed;
    database.markHistoryViewed = async (...args) => { await database.deleteHistory(id, owner.id); return mark(...args); };
    try {
      assert.equal((await request(`${url(id)}/view`, cookie, 'POST', { page: 'history' })).status, 404);
    } finally { database.markHistoryViewed = mark; }
    assert.equal((await get('SELECT COUNT(*) AS count FROM study_history_views WHERE record_id=?', [id])).count, 0);
    await database.deleteCourse('course', owner.id);
    assert.equal((await get('SELECT COUNT(*) AS count FROM flashcard_progress WHERE owner_id=?', [owner.id])).count, 0);
    assert.equal((await get('SELECT COUNT(*) AS count FROM study_history_views WHERE owner_id=?', [owner.id])).count, 0);
  });
});
