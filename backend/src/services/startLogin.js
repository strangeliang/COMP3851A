const { randomUUID } = require('node:crypto');

// Persist a separate public conversation ID, never the authentication cookie/token.
async function startLogin(database, sessions, user, remember, previousCookie) {
  const conversationId = user.role === 'Student' ? `SESSION-${randomUUID()}` : null;
  if (conversationId) await database.createLoginConversation(conversationId, user.id);
  sessions.clear(previousCookie);
  return sessions.create(user.id, remember, conversationId, user.password_hash);
}
module.exports = { startLogin };
