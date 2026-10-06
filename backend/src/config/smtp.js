function smtpOptions(env = process.env) {
  const port = Number(env.SMTP_PORT || 465);
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || ![465, 587].includes(port)) return null;
  return {
    host: env.SMTP_HOST, port, secure: port === 465, requireTLS: true,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    dnsTimeout: 10000, logger: false, debug: false,
    disableFileAccess: true, disableUrlAccess: true,
  };
}

module.exports = { smtpOptions };
