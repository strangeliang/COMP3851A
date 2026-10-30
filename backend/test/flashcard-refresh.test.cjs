const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

const cardsFor = (topic) => Array.from({ length: 6 }, (_, index) => ({
  id: index + 1,
  front: `${topic} question ${index + 1}`,
  back: `${topic} explanation ${index + 1}`,
  source: '[S1]',
}));
const previous = (cards) => cards.map(({ front, back }) => ({ front, back }));

test('flashcard regeneration remembers the latest matching server record without sharing user history', async (t) => {
  process.env.STUDY_DATABASE_PATH = ':memory:';
  process.env.STUDY_SEED_DEMO = '0';
  process.env.NODE_ENV = 'test';
  const database = require('../src/config/database');
  const { createApp } = require('../src/app');
  await database.initializeDatabase();
  const password = 'flashcard-refresh-test-password';
  const student = await database.registerStudent('Student', 'refresh@example.invalid', bcrypt.hashSync(password, 4));
  const other = await database.registerStudent('Other', 'other-refresh@example.invalid', bcrypt.hashSync(password, 4));
  await database.createCourse({ id: 'refresh-course', ownerId: student.id, code: 'FC1', name: 'Learning concepts' });
  await database.createCourse({ id: 'other-refresh-course', ownerId: other.id, code: 'FC2', name: 'Other learning concepts' });
  const addMaterial = (owner, courseId, name) => database.createMaterialForOwner({
    ownerId: owner.id, courseId, name, type: 'TXT', sizeBytes: 20,
    content: 'Several facts for source-grounded revision.',
  });
  const first = await addMaterial(student, 'refresh-course', 'first.txt');
  const second = await addMaterial(student, 'refresh-course', 'second.txt');
  const third = await addMaterial(student, 'refresh-course', 'third.txt');
  const otherMaterial = await addMaterial(other, 'other-refresh-course', 'other.txt');
  const selected = [first, second].map(({ id, name, content }) => ({ id, name, content }));
  const ids = selected.map((material) => material.id);
  const calls = [];
  const gemini = {
    status: () => ({ configured: true, provider: 'Gemini', model: 'test-model' }),
    generate: async (mode, input) => {
      assert.equal(mode, 'flashcards');
      calls.push(structuredClone(input));
      return { cards: cardsFor(`Fresh batch ${calls.length}`), mode: 'api' };
    },
  };
  // Refresh must use the narrow latest-record query, not load the entire account history.
  database.listHistory = async () => { assert.fail('Flashcard generation must not load all history'); };
  const server = createApp({ database, gemini }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve, reject) => database.db.close((error) => error ? reject(error) : resolve()));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (url, cookie, method = 'POST', body) => fetch(base + url, {
    method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  async function json(url, cookie, body, status = 200, method = 'POST') {
    const response = await request(url, cookie, method, body);
    const result = await response.json();
    assert.equal(response.status, status, JSON.stringify(result));
    return result;
  }
  async function login(user) {
    const response = await request('/auth/login', null, 'POST', { email: user.email, password });
    assert.equal(response.status, 200);
    return response.headers.get('set-cookie').split(';')[0];
  }
  let cookie = await login(student);
  const otherCookie = await login(other);
  const generate = (body = {}, ownerCookie = cookie) => json('/ai/flashcards', ownerCookie, { materials: selected, ...body });
  const save = (id, cards, materialIds = ids) => json('/history', cookie, {
    id, kind: 'flashcards', courseId: 'refresh-course', payload: { cards, selectedMaterialIds: materialIds },
  });
  const original = cardsFor('Original');
  const latest = cardsFor('Latest');

  await t.test('fresh users can generate with no browser or server card history', async () => {
    const response = await generate();
    assert.equal(response.cards.length, 6);
    assert.deepEqual(calls.at(-1).previousCards, []);
    assert.equal(await database.getLatestFlashcards(student.id, ids), undefined);
    assert.equal((await request('/ai/flashcards', null, 'POST', { materials: selected })).status, 401);
  });

  await t.test('saved cards survive a new session and selection order changes', async () => {
    await save('original', original);
    cookie = await login(student);
    await generate({ materials: [...selected].reverse() });
    assert.deepEqual(calls.at(-1).previousCards, previous(original));
  });

  await t.test('latest matching record wins, with string IDs and tied timestamps', async () => {
    await save('latest', latest, [...ids].reverse().map(String));
    await database.saveHistory('foreign-history', other.id, 'flashcards', 'other-refresh-course', {
      cards: cardsFor('Private other student'), selectedMaterialIds: ids,
    });
    await database.saveHistory('different-combination', student.id, 'flashcards', 'refresh-course', {
      cards: cardsFor('Different sources'), selectedMaterialIds: [first.id, third.id],
    });
    await database.saveHistory('duplicate-material-ids', student.id, 'flashcards', 'refresh-course', {
      cards: cardsFor('Invalid combination'), selectedMaterialIds: [first.id, first.id],
    });
    const saved = await database.getLatestFlashcards(student.id, ids);
    assert.deepEqual(JSON.parse(saved.payload).cards, latest);
    await generate();
    assert.deepEqual(calls.at(-1).previousCards, previous(latest));
  });

  await t.test('different material combinations and other accounts do not inherit the cards', async () => {
    await generate({ materials: [selected[0]] });
    assert.deepEqual(calls.at(-1).previousCards, []);
    await generate({ materials: [{ id: otherMaterial.id, name: otherMaterial.name, content: otherMaterial.content }] }, otherCookie);
    assert.deepEqual(calls.at(-1).previousCards, []);
  });

  await t.test('current unsaved cards combine with server cards and equivalent cards are deduplicated', async () => {
    const current = previous(cardsFor('Unsaved current'));
    await generate({ previousCards: current });
    assert.equal(calls.at(-1).previousCards.length, 12);
    assert.deepEqual(new Set(calls.at(-1).previousCards.map((card) => card.front)), new Set([...current, ...previous(latest)].map((card) => card.front)));
    await generate({ previousCards: previous(latest).map((card) => ({
      front: `  ${card.front.toUpperCase()} ???`, back: `${card.back.toUpperCase()}.  `,
    })) });
    assert.equal(calls.at(-1).previousCards.length, 6);
  });

  await t.test('deleted records are excluded, falling back to the earlier matching set', async () => {
    await json(`/history/${student.id}:latest`, cookie, undefined, 200, 'DELETE');
    const saved = await database.getLatestFlashcards(student.id, ids);
    assert.deepEqual(JSON.parse(saved.payload).cards, original);
    await json(`/history/${student.id}:original`, cookie, undefined, 200, 'DELETE');
    assert.equal(await database.getLatestFlashcards(student.id, ids), undefined);
    await generate();
    assert.deepEqual(calls.at(-1).previousCards, []);
  });

  await t.test('invalid previous cards are rejected before invoking the AI', async () => {
    for (const previousCards of [
      null, 'not an array', Array(13).fill({ front: 'Term', back: 'Meaning' }),
      [null], [{ front: '', back: 'Meaning' }], [{ front: 42, back: 'Meaning' }],
      [{ front: 'x'.repeat(1001), back: 'Meaning' }], [{ front: 'Term', back: 'x'.repeat(3001) }],
    ]) {
      const count = calls.length;
      const response = await json('/ai/flashcards', cookie, { materials: selected, previousCards }, 400);
      assert.equal(response.code, 'INVALID_INPUT');
      assert.equal(calls.length, count);
    }
    await generate({ previousCards: [...previous(original), ...previous(latest)] });
    assert.equal(calls.at(-1).previousCards.length, 12);
  });

  await t.test('older five-card records and longer historical fields do not break refresh', async () => {
    const old = cardsFor('Legacy').slice(0, 5);
    await save('legacy-five', old);
    await generate();
    assert.deepEqual(calls.at(-1).previousCards, previous(old));
    const oversized = cardsFor('Long legacy');
    oversized[0].front = 'x'.repeat(5000);
    oversized[1].back = 'x'.repeat(10000);
    await save('legacy-long', oversized);
    await generate();
    assert.deepEqual(calls.at(-1).previousCards, previous(oversized.slice(2)));
    await database.saveHistory('legacy-invalid-payload', student.id, 'flashcards', 'refresh-course', {
      cards: 'not-an-array', selectedMaterialIds: ids,
    });
    await generate();
    assert.deepEqual(calls.at(-1).previousCards, []);
  });
});
