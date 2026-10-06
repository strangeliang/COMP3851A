const { StudyError } = require('./studyContracts');

function createMailService({ apiKey = process.env.RESEND_API_KEY, from = process.env.MAIL_FROM,
  baseUrl = process.env.PUBLIC_APP_URL, fetchImpl = fetch } = {}) {
  let origin;
  try {
    const url = new URL(baseUrl);
    if (url.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))) origin = url.origin;
  } catch { /* Configuration is reported without exposing secret values. */ }
  const configured = Boolean(apiKey && from && origin);
  return {
    configured,
    async sendRegistrationCode(email, code, requestId) {
      if (!configured) throw new StudyError(503, 'MAIL_NOT_CONFIGURED', 'Email service is not configured yet. Contact support.');
      const response = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `registration-${requestId}` },
        body: JSON.stringify({ from, to: [email], subject: 'Your Study Companion registration code',
          text: `Your registration verification code is: ${code}\n\nEnter it on the registration page to create your account. It expires in 10 minutes and can be used once. Do not share this code. If you did not request it, ignore this email.\n\n你的注册验证码是：${code}\n请在注册页面输入，10 分钟内有效且只能使用一次。请勿向他人提供验证码。若非本人操作，请忽略。` }),
      });
      if (!response.ok) throw new StudyError(503, 'MAIL_UNAVAILABLE', 'Email service is temporarily unavailable. Try again later.');
    },
    async sendLink(email, purpose, token, requestId) {
      if (!configured) throw new StudyError(503, 'MAIL_NOT_CONFIGURED', 'Email service is not configured yet. Contact support.');
      const link = `${origin}/${purpose === 'reset' ? 'reset-password' : 'verify-email'}#token=${encodeURIComponent(token)}`;
      const response = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `email-${requestId}` },
        body: JSON.stringify({ from, to: [email], subject: purpose === 'reset' ? 'Reset your Study Companion password' : 'Verify your Study Companion email',
          text: `Open this link to ${purpose === 'reset' ? 'set a new password' : 'verify your email'}:\n${link}\n\nThis link expires in 15 minutes and can be used once. If you did not request it, ignore this email.` }),
      });
      if (!response.ok) throw new StudyError(503, 'MAIL_UNAVAILABLE', 'Email service is temporarily unavailable. Try again later.');
    },
  };
}
module.exports = { createMailService };
