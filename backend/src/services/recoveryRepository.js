// Public recovery requests are unverified claims, never linked to an account by email alone.
// Only administrators can read these records. Notes are internal, not emails or chat replies.
function createRecoveryRepository(db) {
  const all = (sql, args = []) => new Promise((resolve, reject) => db.all(sql, args, (e, rows) => e ? reject(e) : resolve(rows)));
  const get = async (sql, args) => (await all(sql, args))[0];
  const run = (sql, args) => new Promise((resolve, reject) => db.run(sql, args, function (e) { e ? reject(e) : resolve(this.changes); }));
  function map(row) {
    return { id: row.id, name: row.account_name, contactEmail: row.email, category: 'account',
      title: 'Password reset request', description: 'Account recovery requested. Identity is not verified; no password has been changed.',
      status: row.status, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at,
      resolvedAt: row.resolved_at, isRecoveryRequest: true, isLoginConversation: false };
  }
  async function find(id, user) {
    if (user.role !== 'Admin') return null;
    const row = await get('SELECT * FROM account_recovery_requests WHERE id=?', [id]);
    if (!row) return null;
    const replies = await all(`SELECT e.id,e.kind,e.body AS text,e.created_at AS createdAt,u.name,u.role
      FROM account_recovery_events e JOIN users u ON u.id=e.author_id WHERE e.ticket_id=? ORDER BY e.created_at,e.rowid`, [id]);
    return { ...map(row), replies };
  }
  return {
    find,
    async submit({ id, clientId, accountName, email }) {
      const now = new Date().toISOString();
      // Persistent per-address throttling; identical public response even when suppressed.
      await run(`INSERT INTO account_recovery_requests(id,client_id,account_name,email,created_at,updated_at)
        SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM account_recovery_requests WHERE email=? AND created_at>?)<3
        ON CONFLICT(client_id) DO NOTHING`, [id, clientId, accountName, email, now, now, email, new Date(Date.now() - 3600000).toISOString()]);
    },
    async list(user) {
      if (user.role !== 'Admin') return { tickets: [], hasMore: false };
      const rows = await all('SELECT * FROM account_recovery_requests ORDER BY updated_at DESC,rowid DESC LIMIT 201');
      return { tickets: rows.slice(0, 200).map(map), hasMore: rows.length > 200 };
    },
    async reply(id, { eventId, clientId, text }, user) {
      if (user.role !== 'Admin') return null;
      await run(`INSERT INTO account_recovery_events(id,ticket_id,author_id,client_id,kind,body,created_at)
        SELECT ?,id,?,?,'reply',?,? FROM account_recovery_requests WHERE id=?
        ON CONFLICT(ticket_id,author_id,client_id) DO NOTHING`, [eventId, user.id, clientId, text, new Date().toISOString(), id]);
      const event = await get('SELECT body FROM account_recovery_events WHERE ticket_id=? AND author_id=? AND client_id=?', [id, user.id, clientId]);
      return event?.body === text ? find(id, user) : null;
    },
    async status(id, status, version, user) {
      if (user.role !== 'Admin') return null;
      const now = new Date().toISOString();
      const changed = await run(`UPDATE account_recovery_requests SET status=?,version=version+1,updated_by=?,updated_at=?,resolved_at=?
        WHERE id=? AND version=?`, [status, user.id, now, status === 'Resolved' ? now : null, id, version]);
      return changed ? find(id, user) : null;
    },
  };
}
module.exports = { createRecoveryRepository };
