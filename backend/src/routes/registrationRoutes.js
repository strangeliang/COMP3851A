const express = require('express');
const { randomBytes, randomInt } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { createMailService } = require('../services/mailService');
const { createRateLimiter } = require('../services/sessionService');
const { StudyError } = require('../services/studyContracts');

const CODE_LIFETIME = 10 * 60 * 1000;
const COOLDOWN = 60 * 1000;
const HOUR = 60 * 60 * 1000;
const invalidCode = () => new StudyError(400, 'INVALID_REGISTRATION_CODE', 'Invalid or expired code, or too many attempts. Request a new code.');

function createRegistrationRoutes({ database, mailer = createMailService(), now = Date.now }) {
  const router = express.Router();
  const requestLimit = createRateLimiter(10, 10 * 60 * 1000);
  const verifyLimit = createRateLimiter(30, 10 * 60 * 1000);
  const run = (sql, args = []) => new Promise((resolve, reject) => database.db.run(sql, args, function(error) {
    error ? reject(error) : resolve(this.changes);
  }));
  const get = (sql, args = []) => new Promise((resolve, reject) => database.db.get(sql, args, (error, row) => error ? reject(error) : resolve(row)));
  const validId = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  function fields(req, allowed) {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).some(key => !allowed.includes(key))) {
      throw new StudyError(400, 'INVALID_REGISTRATION', 'Unexpected registration fields.');
    }
    return req.body;
  }
  function requireMail() {
    if (!mailer.configured || typeof mailer.sendRegistrationCode !== 'function') {
      throw new StudyError(503, 'MAIL_NOT_CONFIGURED', 'Registration email is not configured yet. Please contact support.');
    }
  }
  async function issue({ name, email, password_hash }, res) {
    requireMail();
    if (await database.getUserByEmail(email)) {
      throw new StudyError(409, 'REGISTRATION_UNAVAILABLE', 'Cannot register this email. Try signing in or resetting your password.');
    }
    const timestamp = now();
    await run('DELETE FROM registration_codes WHERE created_at<?', [timestamp - 24 * HOUR]);
    const challengeId = randomBytes(32).toString('hex');
    const code = String(randomInt(0, 1000000)).padStart(6, '0');
    const codeHash = await bcrypt.hash(code, 10);
    // Persistent per-email limits, checked atomically even across simultaneous requests.
    const inserted = await run(`INSERT INTO registration_codes(id,email,name,password_hash,code_hash,created_at,expires_at)
      SELECT ?,?,?,?,?,?,?
      WHERE NOT EXISTS(SELECT 1 FROM registration_codes WHERE email=? AND created_at>?)
      AND (SELECT COUNT(*) FROM registration_codes WHERE email=? AND created_at>?)<3`,
    [challengeId, email, name, password_hash, codeHash, timestamp, timestamp + CODE_LIFETIME, email, timestamp - COOLDOWN, email, timestamp - HOUR]);
    if (!inserted) throw new StudyError(429, 'REGISTRATION_COOLDOWN', 'Wait at least 60 seconds before resending. At most 3 codes per email per hour.');
    await run('UPDATE registration_codes SET expires_at=0 WHERE email=? AND id<>?', [email, challengeId]);
    try {
      await mailer.sendRegistrationCode(email, code, challengeId);
    } catch {
      await run('UPDATE registration_codes SET expires_at=0 WHERE id=?', [challengeId]);
      throw new StudyError(503, 'MAIL_UNAVAILABLE', 'Could not send the verification email. Wait 60 seconds and try again, or contact support.');
    }
    res.status(202).json({ challengeId, expiresIn: CODE_LIFETIME / 1000, resendAfter: COOLDOWN / 1000 });
  }
  router.post('/auth/register', async(req, res) => {
    requestLimit(req.ip);
    const { name, email, password } = fields(req, ['name', 'email', 'password']);
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 80
      || typeof email !== 'string' || email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email.trim())
      || typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
      throw new StudyError(400, 'INVALID_REGISTRATION', 'Enter your name, a valid email and a password of at least 12 characters (maximum 72 UTF-8 bytes).');
    }
    requireMail();
    await issue({ name: name.trim(), email: email.trim().toLowerCase(), password_hash: await bcrypt.hash(password, 12) }, res);
  });
  router.post('/auth/register/resend', async(req, res) => {
    requestLimit(req.ip);
    const { challengeId } = fields(req, ['challengeId']);
    if (!validId(challengeId)) throw invalidCode();
    const pending = await get('SELECT * FROM registration_codes WHERE id=? AND used_at IS NULL AND created_at>?', [challengeId, now() - 24 * HOUR]);
    if (!pending || !pending.password_hash) throw invalidCode();
    await issue(pending, res);
  });
  router.post('/auth/register/verify', async(req, res) => {
    verifyLimit(req.ip);
    const { challengeId, code } = fields(req, ['challengeId', 'code']);
    if (!validId(challengeId) || typeof code !== 'string' || !/^\d{6}$/.test(code)) throw invalidCode();
    // Reserve an attempt before comparing. Restarts and parallel guesses cannot reset/bypass the budget.
    const pending = await get(`UPDATE registration_codes SET attempts=attempts+1
      WHERE id=? AND used_at IS NULL AND expires_at>? AND attempts<5 RETURNING *`, [challengeId, now()]);
    if (!pending || !await bcrypt.compare(code, pending.code_hash)) throw invalidCode();
    try {
      // The trigger creates the student and verification record in this same atomic statement.
      const changed = await run(`UPDATE registration_codes SET used_at=?
        WHERE id=? AND code_hash=? AND used_at IS NULL AND expires_at>? AND attempts<=5`,
      [now(), challengeId, pending.code_hash, now()]);
      if (!changed) throw invalidCode();
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT') throw invalidCode();
      throw error;
    }
    res.status(201).json({ ok: true, message: 'Email verified. Account created. You can now log in.' });
  });
  return router;
}
module.exports = { createRegistrationRoutes };
