const express = require('express');
const { randomBytes, createHash } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { createMailService } = require('../services/mailService');
const { createRateLimiter } = require('../services/sessionService');
const { StudyError } = require('../services/studyContracts');

function createEmailRoutes({ database, mailer = createMailService(), now = Date.now }) {
  const router = express.Router();
  const requestLimit = createRateLimiter(10, 10 * 60 * 1000);
  const consumeLimit = createRateLimiter(20, 10 * 60 * 1000);
  const run = (sql, args) => new Promise((resolve,reject) => database.db.run(sql,args,function(e) { e ? reject(e) : resolve(this.changes); }));
  const get = (sql,args) => new Promise((resolve,reject) => database.db.get(sql,args,(e,row) => e ? reject(e) : resolve(row)));
  const hash = token => createHash('sha256').update(token).digest('hex');
  router.get('/auth/email/status', (req,res) => res.json({ configured: mailer.configured }));
  router.post('/auth/email/request', async(req,res) => {
    requestLimit(req.ip);
    if (!mailer.configured) throw new StudyError(503,'MAIL_NOT_CONFIGURED','Email service is not configured yet. Contact support.');
    const { email, purpose, clientId } = req.body || {};
    if (typeof email !== 'string' || email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email.trim()) || !['verify','reset'].includes(purpose) || typeof clientId !== 'string' || !/^[a-f0-9-]{36}$/i.test(clientId)) throw new StudyError(400,'INVALID_INPUT','Enter a valid email.');
    const message = 'If an eligible account exists, a one-time link will be sent. Check your inbox and spam folder.';
    const user = await database.getUserByEmail(email.trim().toLowerCase());
    if (user?.status === 'Active' && !await get('SELECT subject FROM google_accounts WHERE user_id=?',[user.id])) {
      const token = randomBytes(32).toString('hex');
      const timestamp = now();
      const inserted = await run(`INSERT INTO email_tokens(token_hash,request_id,user_id,purpose,credential_hash,expires_at,created_at)
        SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM email_tokens WHERE user_id=? AND created_at>?)<3
        ON CONFLICT(request_id) DO NOTHING`,[hash(token),clientId,user.id,purpose,user.password_hash,timestamp+900000,timestamp,user.id,timestamp-3600000]);
      if (inserted) {
        try { await mailer.sendLink(user.email,purpose,token,clientId); }
        catch {
          await run('UPDATE email_tokens SET expires_at=0 WHERE token_hash=?',[hash(token)]);
          console.warn('Transactional email send failed; check mail provider configuration and delivery logs.');
        }
      }
    }
    res.status(202).json({ ok:true,message });
  });
  router.post('/auth/email/consume', async(req,res) => {
    consumeLimit(req.ip);
    const { token, purpose, password } = req.body || {};
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) || !['reset','verify'].includes(purpose)) throw new StudyError(400,'INVALID_LINK','This link is invalid, expired or already used. Request a new link.');
    if (purpose === 'reset' && (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password,'utf8') > 72)) throw new StudyError(400,'INVALID_PASSWORD','Use at least 12 characters and at most 72 UTF-8 bytes.');
    const replacement = purpose === 'reset' ? await bcrypt.hash(password,12) : null;
    const changed = await run(`UPDATE email_tokens SET used_at=?,replacement_hash=? WHERE token_hash=? AND purpose=? AND used_at IS NULL AND expires_at>?
      AND EXISTS(SELECT 1 FROM users u WHERE u.id=email_tokens.user_id AND u.status='Active' AND u.password_hash=email_tokens.credential_hash)`,[now(),replacement,hash(token),purpose,now()]);
    if (!changed) throw new StudyError(400,'INVALID_LINK','This link is invalid, expired or already used. Request a new link.');
    res.json({ ok:true,message: purpose === 'reset' ? 'Password updated. Sign in with your new password.' : 'Email verified.' });
  });
  return router;
}
module.exports = { createEmailRoutes };
