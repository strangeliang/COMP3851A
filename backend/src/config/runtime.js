const path = require('node:path');

function validateRuntime(env = process.env) {
  if (env.NODE_ENV !== 'production') return;
  for (const key of ['STUDY_DATABASE_PATH', 'STUDY_UPLOAD_PATH']) {
    if (!env[key] || !path.isAbsolute(env[key])) throw new Error(`${key} must be an absolute path on persistent storage in production. Refusing to use a temporary default.`);
  }
  let origin;
  try { origin = new URL(env.FRONTEND_URL); } catch { throw new Error('FRONTEND_URL must be the public HTTPS origin in production.'); }
  if (origin.protocol !== 'https:' || origin.origin !== env.FRONTEND_URL || origin.username || origin.password) {
    throw new Error('FRONTEND_URL must be the exact HTTPS origin without a path or trailing slash.');
  }
  if (env.RESEND_API_KEY && (!env.MAIL_FROM || env.PUBLIC_APP_URL !== origin.origin)) {
    throw new Error('Email requires MAIL_FROM and PUBLIC_APP_URL matching FRONTEND_URL.');
  }
}

module.exports = { validateRuntime };
