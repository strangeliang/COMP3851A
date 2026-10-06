const { StudyError } = require('./studyContracts');
const { smtpOptions } = require('../config/smtp');
const nodemailer = require('nodemailer');

function createMailService({ apiKey = process.env.RESEND_API_KEY, from = process.env.MAIL_FROM,
  baseUrl = process.env.PUBLIC_APP_URL, fetchImpl = fetch,
  provider = process.env.MAIL_PROVIDER || 'resend', smtp = smtpOptions(),
  createTransport = nodemailer.createTransport } = {}) {
  let origin;
  try {
    const url = new URL(baseUrl);
    if (url.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))) origin = url.origin;
  } catch { /* Configuration is reported without exposing secret values. */ }
  const configured = Boolean(from && origin && (provider === 'smtp' ? smtp : provider === 'resend' && apiKey));
  const transport = configured && provider === 'smtp' ? createTransport(smtp) : null;
  async function send(email, subject, text, idempotencyKey) {
    if (!configured) throw new StudyError(503, 'MAIL_NOT_CONFIGURED', 'Email service is not configured yet. Contact support.');
    try {
      if (transport) {
        // One recipient object avoids treating commas in input as multiple recipients.
        // SMTP has no provider idempotency guarantee; persistent route limits still apply.
        const result = await transport.sendMail({ from, to: [{ address: email }], subject, text });
        if (!result.accepted?.length || result.rejected?.length) throw new Error('Recipient rejected');
      } else {
        const response = await fetchImpl('https://api.resend.com/emails', {
          method: 'POST', signal: AbortSignal.timeout(10000),
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify({ from, to: [email], subject, text }),
        });
        if (!response.ok) throw new Error('Mail provider rejected request');
      }
    } catch {
      // Never expose SMTP replies, credentials, tokens or message bodies to clients/logs.
      throw new StudyError(503, 'MAIL_UNAVAILABLE', 'Email service is temporarily unavailable. Try again later.');
    }
  }
  return {
    configured,
    async sendRegistrationCode(email, code, requestId) {
      await send(email, 'Your Study Companion registration code',
        `Your registration verification code is: ${code}\n\nEnter it on the registration page to create your account. It expires in 10 minutes and can be used once. Do not share this code. If you did not request it, ignore this email.\n\n你的注册验证码是：${code}\n请在注册页面输入，10 分钟内有效且只能使用一次。请勿向他人提供验证码。若非本人操作，请忽略。`, `registration-${requestId}`);
    },
    async sendLink(email, purpose, token, requestId) {
      if (!configured) throw new StudyError(503, 'MAIL_NOT_CONFIGURED', 'Email service is not configured yet. Contact support.');
      const link = `${origin}/${purpose === 'reset' ? 'reset-password' : 'verify-email'}#token=${encodeURIComponent(token)}`;
      await send(email, purpose === 'reset' ? 'Reset your Study Companion password' : 'Verify your Study Companion email',
        `Open this link to ${purpose === 'reset' ? 'set a new password' : 'verify your email'}:\n${link}\n\nThis link expires in 15 minutes and can be used once. If you did not request it, ignore this email.`, `email-${requestId}`);
    },
  };
}
module.exports = { createMailService };
