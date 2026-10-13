const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { proxyTrust } = require('../src/config/proxy');
const { parseOutput } = require('../src/services/studyContracts');
const { secretPattern, buildSupportRequest } = require('../src/services/supportAiContracts');

test('proxy trust is explicit, bounded and defaults safely outside Render', () => {
  assert.equal(proxyTrust({}), false);
  assert.equal(proxyTrust({ RENDER: 'true' }), 1);
  assert.equal(proxyTrust({ RENDER: 'true', TRUST_PROXY: '0' }), false);
  assert.deepEqual(proxyTrust({ TRUST_PROXY: 'loopback,10.0.0.0/8' }), ['loopback', '10.0.0.0/8']);
  for (const value of ['true', '*', '::ffff:10.0.0.0/8', '::/96', '::ffff:10.0.0.0/96', '0.0.0.0/0', '127.0.0.1/bad']) assert.throws(() => proxyTrust({ TRUST_PROXY: value }));
  assert.deepEqual(proxyTrust({ TRUST_PROXY: '::1' }), ['::1']);
});

test('source labels refer only to selected materials and support facts match the current UI', () => {
  const response = cards => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ cards }) }] } }] });
  const cards = Array.from({ length: 6 }, (_, i) => ({ front: `Term ${i}`, back: 'Answer', source: '[S1]' }));
  const context = { materials: [{ id: 'one', name: 'one.txt', content: 'Source' }] };
  assert.equal(parseOutput('flashcards', response(cards), context).cards.length, 6);
  for (const source of ['[S0]', '[S2]', '[S3]', '[S999]']) assert.throws(() => parseOutput('flashcards', response(cards.map(card => ({ ...card, source }))), context), { code: 'INVALID_AI_OUTPUT' });
  const escaped = response(cards.map(card => ({ ...card, source: '[S2]' })));
  escaped.candidates[0].content.parts[0].text = escaped.candidates[0].content.parts[0].text.replaceAll('[S2]', '\\u005bS2\\u005d');
  assert.throws(() => parseOutput('flashcards', escaped, context), { code: 'INVALID_AI_OUTPUT' });
  assert.equal(secretPattern.test('My quiz from 2026 is missing; error 5001.'), false);
  assert.equal(secretPattern.test('password: private-value'), true);
  assert.equal(secretPattern.test('My verification code is 123456'), true);
  assert.equal(secretPattern.test('验证码 123456'), true);
  assert.equal(secretPattern.test('123456'), true);
  const prompt = buildSupportRequest({ question: 'Registration help', language: 'en', history: [] }).systemInstruction.parts[0].text;
  assert.match(prompt, /Settings → Website language/);
  assert.match(prompt, /\/reset-password/);
  assert.match(prompt, /six cards/);
  assert.doesNotMatch(prompt, /reset links are not enabled yet|中文 \/ EN control/);
});

test('server upload quotas are atomic, owner-scoped and release capacity after deletion; trusted proxies isolate login limits', async (t) => {
  process.env.STUDY_DATABASE_PATH = ':memory:';
  process.env.STUDY_SEED_DEMO = '0'; process.env.NODE_ENV = 'test'; process.env.TRUST_PROXY = '0';
  const database = require('../src/config/database');
  const { createApp } = require('../src/app');
  await database.initializeDatabase();
  const password = 'regression-test-password';
  const user = await database.registerStudent('Owner', 'owner@regression.invalid', bcrypt.hashSync(password, 4));
  const other = await database.registerStudent('Other', 'other@regression.invalid', bcrypt.hashSync(password, 4));
  for (const id of ['first', 'second', 'third']) await database.createCourse({ id, ownerId: user.id, code: id, name: id });
  await database.createCourse({ id: 'other', ownerId: other.id, code: 'OTHER', name: 'Other' });
  const servers = [];
  async function start() { const server = createApp({ database }).listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); servers.push(server); return `http://127.0.0.1:${server.address().port}/api`; }
  t.after(async () => { for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } await new Promise(resolve => database.db.close(resolve)); });
  const base = await start();
  const request = (url, body, cookie, forwarded) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(forwarded ? { 'X-Forwarded-For': forwarded } : {}) }, body: JSON.stringify(body) });
  async function login(email) { const response = await request(base + '/auth/login', { email, password }); assert.equal(response.status, 200); return response.headers.get('set-cookie').split(';')[0]; }
  const cookie = await login(user.email); const otherCookie = await login(other.email);
  const material = i => ({ name: `file-${i}.txt`, type: 'TXT', sizeBytes: 1, content: 'Text' });
  assert.equal((await request(base + '/courses/first/materials', { ...material('long'), content: 'a'.repeat(100001) }, cookie)).status, 400);
  const parallel = await Promise.all(Array.from({ length: 6 }, (_, i) => request(base + '/courses/first/materials', material(i), cookie)));
  assert.equal(parallel.filter(response => response.status === 201).length, 5);
  assert.equal(parallel.filter(response => response.status === 409).length, 1);
  for (let i = 0; i < 5; i++) assert.equal((await request(base + '/courses/second/materials', material(i), cookie)).status, 201);
  assert.equal((await request(base + '/courses/third/materials', material(0), cookie)).status, 409);
  assert.equal((await request(base + '/courses/other/materials', material(0), otherCookie)).status, 201);
  const first = (await database.listMaterialsByCourseOwner('first', user.id))[0];
  await database.deleteMaterialForOwner(first.id, user.id);
  assert.equal((await request(base + '/courses/third/materials', material(0), cookie)).status, 201);
  process.env.TRUST_PROXY = 'loopback';
  const proxied = await start();
  for (let i = 0; i < 21; i++) assert.equal((await request(proxied + '/auth/login', { email: 'none@invalid.test', password: 'wrong' }, null, `192.0.2.${i + 1}`)).status, 401);
  for (let i = 0; i < 19; i++) assert.equal((await request(proxied + '/auth/login', { email: 'none@invalid.test', password: 'wrong' }, null, '192.0.2.1')).status, 401);
  assert.equal((await request(proxied + '/auth/login', { email: 'none@invalid.test', password: 'wrong' }, null, '192.0.2.1')).status, 429);
  process.env.TRUST_PROXY = '0';
  const direct = await start();
  for (let i = 0; i < 20; i++) assert.equal((await request(direct + '/auth/login', { email: 'none@invalid.test', password: 'wrong' }, null, `192.0.2.${i + 1}`)).status, 401);
  assert.equal((await request(direct + '/auth/login', { email: 'none@invalid.test', password: 'wrong' }, null, '192.0.2.99')).status, 429, 'Untrusted clients cannot bypass limits by spoofing forwarded IPs');

  const run = (sql, args = []) => new Promise((resolve, reject) => database.db.run(sql, args, error => error ? reject(error) : resolve()));
  for (let i = 0; i < 205; i++) await database.createLoginConversation(`SESSION-page-${String(i).padStart(3, '0')}`, user.id);
  for (let i = 0; i < 15; i++) await run('INSERT INTO account_recovery_requests(id,client_id,account_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)', [`RECOVERY-page-${i}`, `recovery-${i}`, 'Applicant', 'claim@invalid.test', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z']);
  await run('UPDATE support_tickets SET updated_at=?', ['2026-01-01T00:00:00.000Z']);
  await run("UPDATE users SET role='Admin' WHERE id=?", [other.id]);
  const firstPage = await (await fetch(base + '/tickets', { headers: { Cookie: otherCookie } })).json();
  assert.equal(firstPage.tickets.length, 200); assert.equal(firstPage.hasMore, true); assert.ok(firstPage.nextCursor);
  const lastPage = await (await fetch(base + '/tickets?cursor=' + encodeURIComponent(firstPage.nextCursor), { headers: { Cookie: otherCookie } })).json();
  assert.equal(lastPage.hasMore, false); assert.equal(lastPage.nextCursor, null);
  const combined = [...firstPage.tickets, ...lastPage.tickets];
  assert.equal(combined.length, 222); assert.equal(new Set(combined.map(ticket => ticket.id)).size, 222, 'Mixed recovery/support pages have no gaps or duplicates even with equal timestamps');
  const ownedPage = await (await fetch(base + '/tickets', { headers: { Cookie: cookie } })).json();
  assert.ok(ownedPage.tickets.every(ticket => ticket.userId === user.id && !ticket.isRecoveryRequest));
  assert.equal((await fetch(base + '/tickets?cursor=invalid', { headers: { Cookie: cookie } })).status, 400);
  assert.equal((await fetch(base + '/tickets?cursor=' + firstPage.nextCursor)).status, 401);
});
