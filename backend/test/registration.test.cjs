const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const express = require('express');
const { createRegistrationRoutes } = require('../src/routes/registrationRoutes');
const { createApp } = require('../src/app');
const { createMailService } = require('../src/services/mailService');

test('registration requires a real code, limits guesses/resends and creates a verified student atomically', async t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'study-registration-'));
  process.env.STUDY_DATABASE_PATH = path.join(folder, 'test.db');
  process.env.STUDY_SEED_DEMO = '0';
  const database = require('../src/config/database');
  await database.initializeDatabase();
  const get = (sql, args = []) => new Promise((resolve, reject) => database.db.get(sql, args, (e, row) => e ? reject(e) : resolve(row)));
  const sent = [];
  const mailer = { configured: true, sendRegistrationCode: async(...args) => sent.push(args) };
  let time = Date.now();
  let server;
  let base;
  async function restart() {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    const app = express();
    app.use(express.json());
    app.use('/api', createRegistrationRoutes({ database, mailer, now: () => time }));
    app.use(createApp({ database, mailer }));
    app.use((error, req, res, next) => {
      if (res.headersSent) return next(error);
      res.status(error.status || 500).json({ code: error.code, message: error.message });
    });
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}/api`;
  }
  t.after(async() => {
    server?.closeAllConnections();
    if (server) await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => database.db.close(resolve));
    fs.rmSync(folder, { recursive: true, force: true });
  });
  const post = (url, body) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const signup = { name: 'New Student', email: 'NEW@test.invalid', password: 'registration-test-password' };
  const register = async(email) => {
    const response = await post('/auth/register', { ...signup, email });
    assert.equal(response.status, 202, await response.clone().text());
    const challenge = await response.json();
    assert.equal(challenge.code, undefined);
    assert.equal(challenge.password, undefined);
    return { challengeId: challenge.challengeId, code: sent.at(-1)[1] };
  };
  await restart();
  assert.equal((await post('/auth/register', { ...signup, role: 'Admin' })).status, 400);
  assert.equal((await post('/auth/register', { ...signup, password: 'short' })).status, 400);
  const first = await register(signup.email);
  assert.match(first.code, /^\d{6}$/);
  assert.equal(await database.getUserByEmail('new@test.invalid'), undefined);
  assert.equal((await post('/auth/login', signup)).status, 401);
  const stored = await get('SELECT * FROM registration_codes WHERE id=?', [first.challengeId]);
  assert.notEqual(stored.code_hash, first.code);
  assert.notEqual(stored.password_hash, signup.password);
  assert.ok(await bcrypt.compare(first.code, stored.code_hash));
  assert.equal((await post('/auth/register/verify', { ...first, role: 'Admin' })).status, 400);
  assert.equal((await post('/auth/register/resend', { challengeId: first.challengeId })).status, 429);
  const wrong = first.code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) assert.equal((await post('/auth/register/verify', { ...first, code: wrong })).status, 400);
  await restart();
  assert.equal((await post('/auth/register/verify', first)).status, 400, 'new router cannot reset persistent guess count');
  time += 61000;
  const resent = await post('/auth/register/resend', { challengeId: first.challengeId });
  assert.equal(resent.status, 202);
  const second = { challengeId: (await resent.json()).challengeId, code: sent.at(-1)[1] };
  assert.equal((await post('/auth/register/verify', first)).status, 400, 'old code no longer works');
  const outcomes = await Promise.all([post('/auth/register/verify', second), post('/auth/register/verify', second)]);
  assert.deepEqual(outcomes.map(r => r.status).sort(), [201, 400]);
  const user = await database.getUserByEmail('new@test.invalid');
  assert.equal(user.role, 'Student');
  assert.equal(user.status, 'Active');
  assert.ok(await get('SELECT * FROM verified_emails WHERE user_id=?', [user.id]));
  assert.equal((await get('SELECT COUNT(*) AS count FROM users WHERE email=?', [user.email])).count, 1);
  assert.equal((await get('SELECT password_hash FROM registration_codes WHERE id=?', [second.challengeId])).password_hash, '');
  assert.equal((await post('/auth/login', signup)).status, 200);
  assert.equal((await post('/auth/register', signup)).status, 409, 'cannot replace existing credentials');
  assert.ok(await bcrypt.compare(signup.password, (await database.getUserByEmail(user.email)).password_hash));

  await restart();
  const expired = await register('expired@test.invalid');
  time += 600001;
  assert.equal((await post('/auth/register/verify', expired)).status, 400);
  assert.equal(await database.getUserByEmail('expired@test.invalid'), undefined);
  let limited = await register('limited@test.invalid');
  for (let i = 0; i < 2; i++) {
    time += 61000;
    const response = await post('/auth/register/resend', { challengeId: limited.challengeId });
    assert.equal(response.status, 202);
    limited = await response.json();
  }
  time += 61000;
  await restart();
  assert.equal((await post('/auth/register/resend', { challengeId: limited.challengeId })).status, 429, 'hourly limit survives router restart');
  const race = await Promise.all([post('/auth/register', { ...signup, email: 'race@test.invalid' }), post('/auth/register', { ...signup, email: 'race@test.invalid' })]);
  assert.deepEqual(race.map(r => r.status).sort(), [202, 429]);

  mailer.sendRegistrationCode = async() => { throw new Error('private provider error'); };
  const failed = await post('/auth/register', { ...signup, email: 'failure@test.invalid' });
  assert.equal(failed.status, 503);
  assert.doesNotMatch(await failed.text(), /private provider/);
  assert.equal(await database.getUserByEmail('failure@test.invalid'), undefined);
  assert.equal((await get('SELECT expires_at FROM registration_codes WHERE email=?', ['failure@test.invalid'])).expires_at, 0);
  mailer.configured = false;
  assert.equal((await post('/auth/register', { ...signup, email: 'no-mail@test.invalid' })).status, 503);
  assert.equal(await get('SELECT * FROM registration_codes WHERE email=?', ['no-mail@test.invalid']), undefined);
  assert.equal((await post('/auth/login', signup)).status, 200, 'existing users still log in without mail');
});

test('registration email adapter sends digits privately and uses provider idempotency', async() => {
  let options;
  const mailer = createMailService({ apiKey: 'fake-key', from: 'Study <study@example.test>', baseUrl: 'https://study.example.test', fetchImpl: async(url, value) => { options = value; return { ok: true }; } });
  await mailer.sendRegistrationCode('user@example.test', '012345', 'opaque-request');
  const body = JSON.parse(options.body);
  assert.deepEqual(body.to, ['user@example.test']);
  assert.match(body.text, /012345/);
  assert.match(body.text, /10 minutes/);
  assert.doesNotMatch(body.text, /password|opaque-request/);
  assert.equal(options.headers['Idempotency-Key'], 'registration-opaque-request');
});
