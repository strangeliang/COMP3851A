const { randomUUID } = require('node:crypto');
const { createMailService } = require('./mailService');

// The reply and outbox row are committed by one SQLite trigger. Sending cannot
// roll back a saved reply. Leases also protect against overlapping worker/routes.
function createSupportNotifications(db, mailer = createMailService(), now = Date.now) {
  const all = (sql, args = []) => new Promise((resolve, reject) => db.all(sql, args, (e, rows) => e ? reject(e) : resolve(rows)));
  const run = (sql, args = []) => new Promise((resolve, reject) => db.run(sql, args, function(e) { e ? reject(e) : resolve(this.changes); }));
  async function deliver(eventId) {
    const lease = randomUUID();
    const claimed = await run(`UPDATE support_email_outbox SET state='sending',lease_token=?,lease_until=?,attempts=attempts+1
      WHERE event_id=? AND ((state='pending' AND next_attempt_at<=?) OR (state='sending' AND lease_until<=?))`,
    [lease, now() + 120000, eventId, now(), now()]);
    if (!claimed) return;
    const [row] = await all(`SELECT o.attempts,t.id AS ticket_id,u.email,u.status,
      EXISTS(SELECT 1 FROM verified_emails v WHERE v.user_id=u.id) OR
      EXISTS(SELECT 1 FROM google_accounts g WHERE g.user_id=u.id) AS verified
      FROM support_email_outbox o JOIN support_events e ON e.id=o.event_id
      JOIN support_tickets t ON t.id=e.ticket_id JOIN users u ON u.id=t.owner_id WHERE o.event_id=?`, [eventId]);
    if (!row) return;
    const finish = (state, error, next = 0, sent = null) => run(`UPDATE support_email_outbox
      SET state=?,last_error=?,next_attempt_at=?,sent_at=?,lease_until=0,lease_token=NULL
      WHERE event_id=? AND lease_token=?`, [state, error, next, sent, eventId, lease]);
    if (row.status !== 'Active' || !row.verified) {
      await finish('skipped', row.status !== 'Active' ? 'ACCOUNT_DISABLED' : 'EMAIL_NOT_VERIFIED');
      return;
    }
    try {
      if (!mailer.configured || typeof mailer.sendSupportReply !== 'function') throw Error('not configured');
      await mailer.sendSupportReply(row.email, row.ticket_id, eventId);
      await finish('sent', null, 0, new Date(now()).toISOString());
    } catch {
      // Persist only a generic code, never SMTP replies or recipient/message data.
      await finish(row.attempts >= 5 ? 'failed' : 'pending', 'MAIL_UNAVAILABLE', now() + Math.min(3600000, 60000 * 2 ** (row.attempts - 1)));
    }
  }
  async function drain() {
    const due = await all(`SELECT event_id FROM support_email_outbox
      WHERE (state='pending' AND next_attempt_at<=?) OR (state='sending' AND lease_until<=?)
      ORDER BY next_attempt_at,event_id LIMIT 20`, [now(), now()]);
    for (const row of due) await deliver(row.event_id);
  }
  async function retry(ticketId) {
    // Admin-only route scopes the ticket before reaching this method.
    await run(`UPDATE support_email_outbox SET state='pending',attempts=0,next_attempt_at=0,last_error=NULL
      WHERE state IN ('failed','skipped') AND event_id IN (SELECT id FROM support_events WHERE ticket_id=?)`, [ticketId]);
  }
  return { deliver, drain, retry };
}
function startSupportNotificationWorker(db, mailer) {
  const service = createSupportNotifications(db, mailer);
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await service.drain(); }
    catch { console.error('Support email queue could not be processed; it will retry.'); }
    finally { running = false; }
  };
  const timer = setInterval(tick, 30000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
module.exports = { createSupportNotifications, startSupportNotificationWorker };
