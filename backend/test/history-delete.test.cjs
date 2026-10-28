const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const bcrypt = require('bcryptjs');

test('history deletion is owner-scoped, persistent, reversible and preserves practice records', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'study-history-delete-'));
  process.env.STUDY_DATABASE_PATH = path.join(directory, 'history.db');
  process.env.STUDY_UPLOAD_PATH = path.join(directory, 'originals');
  process.env.STUDY_SEED_DEMO = '0';
  process.env.NODE_ENV = 'test';
  const database = require('../src/config/database');
  const { createApp } = require('../src/app');
  await database.initializeDatabase();
  const password = 'test-password-for-history';
  const user = await database.registerStudent('Owner', 'owner@history.invalid', bcrypt.hashSync(password, 4));
  const otherUser = await database.registerStudent('Other', 'other@history.invalid', bcrypt.hashSync(password, 4));
  await database.createCourse({ id: 'history-course', ownerId: user.id, code: 'H101', name: 'History' });
  await database.createCourse({ id: 'other-course', ownerId: otherUser.id, code: 'H102', name: 'Other History' });
  const server = createApp({ database }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
    await new Promise((resolve, reject) => database.db.close(error => error ? reject(error) : resolve()));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (url, cookie, method = 'GET', body) => fetch(base + url, {
    method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  async function login(email) {
    const response = await request('/auth/login', null, 'POST', { email, password });
    assert.equal(response.status, 200);
    return response.headers.get('set-cookie').split(';')[0];
  }
  const cookie = await login('owner@history.invalid');
  const other = await login('other@history.invalid');
  const body = { id: 'quiz', kind: 'quiz', courseId: 'history-course', payload: {
    questions: [{ id: 1, question: 'Correct answer?', options: ['A', 'B'], answerIndex: 0, explanation: 'A is correct.' }],
    answers: { 1: 1 },
  } };
  assert.equal((await request('/history', cookie, 'POST', body)).status, 200);
  const id = `${user.id}:quiz`;
  const url = `/history/${encodeURIComponent(id)}`;
  assert.equal((await request(`${url}/review`, cookie, 'POST', { answers: { 1: 0 } })).status, 200);
  assert.equal((await request(url, null, 'DELETE')).status, 401);
  assert.equal((await request(url, other, 'DELETE')).status, 404);
  assert.equal((await request(url, cookie, 'DELETE')).status, 200);
  assert.equal((await request(url, cookie, 'DELETE')).status, 200);
  const deleted = await (await request('/history', cookie)).json();
  assert.equal(deleted.records.length, 0);
  assert.equal(deleted.reviews.length, 0);
  assert.equal(deleted.deletedRecords[0].id, id);
  assert.equal((await request('/history', cookie, 'POST', body)).status, 409);
  assert.equal((await request(`${url}/review`, cookie, 'POST', { answers: { 1: 0 } })).status, 404);
  assert.equal((await request(`${url}/restore`, other, 'POST')).status, 404);
  const restarted = execFileSync(process.execPath, ['-e', `
    const database = require('./src/config/database');
    database.initializeDatabase().then(async () => {
      console.log(JSON.stringify({ active: (await database.listHistory(${user.id})).length,
        deleted: (await database.listDeletedHistory(${user.id})).length }));
      database.db.close();
    }).catch(error => { console.error(error); process.exitCode = 1; });
  `], { cwd: path.join(__dirname, '..'), env: process.env, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(restarted.slice(restarted.indexOf('{'))), { active: 0, deleted: 1 });
  const response = await request(`${url}/restore`, cookie, 'POST');
  assert.equal(response.status, 200);
  const restored = await response.json();
  assert.equal(restored.record.id, id);
  assert.deepEqual(restored.record.payload.answers, { 1: 1 });
  assert.equal(restored.reviews.length, 1);
  assert.equal(restored.reviews[0].payload.score, 100);
  assert.equal((await request(`${url}/restore`, cookie, 'POST')).status, 200);
  assert.equal((await (await request('/history', cookie)).json()).records.length, 1);
  assert.equal((await request('/history', cookie, 'POST', { ...body, id: 'second-quiz' })).status, 200);
  assert.equal((await request('/history', other, 'POST', { ...body, courseId: 'other-course' })).status, 200);
  for (const action of ['delete-all', 'restore-all']) assert.equal((await request(`/history/${action}`, null, 'POST')).status, 401);
  const bulkDelete = await request('/history/delete-all', cookie, 'POST', { ownerId: otherUser.id });
  assert.equal(bulkDelete.status, 200);
  assert.equal((await bulkDelete.json()).count, 2, 'Client-supplied owner cannot target a different account');
  const bulkDeleted = await (await request('/history', cookie)).json();
  assert.equal(bulkDeleted.records.length, 0);
  assert.equal(bulkDeleted.reviews.length, 0);
  assert.equal(bulkDeleted.deletedRecords.length, 2);
  assert.equal((await (await request('/history', other)).json()).records.length, 1);
  assert.equal((await (await request('/history/delete-all', cookie, 'POST')).json()).count, 0);
  assert.equal((await (await request('/history/restore-all', other, 'POST')).json()).count, 0, 'Another user cannot restore the owner records');
  assert.equal((await (await request('/history', cookie)).json()).records.length, 0);
  assert.equal((await (await request('/history/restore-all', cookie, 'POST')).json()).count, 2);
  const bulkRestored = await (await request('/history', cookie)).json();
  assert.equal(bulkRestored.records.length, 2);
  assert.equal(bulkRestored.reviews.length, 1, 'Bulk Undo preserves practice attempts');
  assert.deepEqual(bulkRestored.records.find(record => record.id === id).payload.answers, { 1: 1 });
  assert.equal((await (await request('/history/restore-all', cookie, 'POST')).json()).count, 0);
  // New Q&A messages remain immutable/idempotent but delete/undo as one conversation.
  const conversationId = 'a'.repeat(36);
  const qa = (id, role, messageOrder, scopeKey = 'qa-scope') => ({ id, kind:'qa', courseId:'history-course', payload:{ role, text:role==='User'?'Question':'Answer', conversationId, messageOrder, scopeKey } });
  const question = qa('qa-question','User',0), answer = qa('qa-answer','AI',1);
  for (const entry of [question, answer, qa('separate-scope','User',0,'different')]) assert.equal((await request('/history',cookie,'POST',entry)).status,200);
  assert.equal((await request('/history',cookie,'POST',answer)).status,200,'Retrying a saved message must not duplicate it');
  assert.equal((await request('/history',other,'POST',{...question,courseId:'other-course'})).status,200);
  const qaUrl=`/history/${encodeURIComponent(`${user.id}:qa-question`)}`;
  assert.equal((await request(qaUrl,other,'DELETE')).status,404);
  assert.equal((await request(qaUrl,cookie,'DELETE')).status,200);
  let qaHistory=await (await request('/history',cookie)).json();
  assert.equal(qaHistory.records.filter(r=>r.payload.conversationId===conversationId&&r.payload.scopeKey==='qa-scope').length,0);
  assert.equal(qaHistory.records.some(r=>r.id===`${user.id}:separate-scope`),true);
  assert.equal(qaHistory.deletedRecords.filter(r=>r.payload.conversationId===conversationId).length,2);
  assert.equal((await request('/history',cookie,'POST',qa('late-answer','AI',2))).status,409,'A late reply cannot resurrect a deleted conversation');
  assert.equal((await (await request('/history',other)).json()).records.some(r=>r.id===`${otherUser.id}:qa-question`),true);
  assert.equal((await request(`${qaUrl}/restore`,cookie,'POST')).status,200);
  qaHistory=await (await request('/history',cookie)).json();
  assert.equal(qaHistory.records.filter(r=>r.payload.conversationId===conversationId&&r.payload.scopeKey==='qa-scope').length,2);
  assert.equal((await request('/history',cookie,'POST',qa('follow-up','User',2))).status,200);
  assert.equal((await request('/history',cookie,'POST',{...question,id:'bad',payload:{...question.payload,messageOrder:-1}})).status,400);
  assert.equal((await request('/history',cookie,'POST',{...question,id:'bad-scope',payload:{...question.payload,scopeKey:undefined}})).status,400);
  await request(url, cookie, 'DELETE');
  await database.deleteCourse('history-course', user.id);
  assert.equal((await request(`${url}/restore`, cookie, 'POST')).status, 404);
});
