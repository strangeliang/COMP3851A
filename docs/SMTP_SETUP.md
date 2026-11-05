# SMTP delivery

The backend defaults to Resend. Select SMTP explicitly with `MAIL_PROVIDER=smtp`;
adding SMTP settings alone does not change the provider. Configuration belongs in
the host's private backend environment or a local, untracked `backend/.env` file.

## Configuration

Use the SMTP host, account and credentials supplied by your mail provider. This
example contains placeholders; replace the host and public origin, and fill the
blank values privately:

```dotenv
MAIL_PROVIDER=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_USER=
SMTP_PASS=
MAIL_FROM=
FRONTEND_URL=https://study.example.com
PUBLIC_APP_URL=https://study.example.com
```

- `SMTP_USER`: the provider's SMTP account name, often the full mailbox address.
- `SMTP_PASS`: the provider-issued SMTP password or mailbox authorization code.
  If the provider requires an authorization code, use it instead of the mailbox
  login password.
- `MAIL_FROM`: a sender address approved by the provider, optionally including a
  display name such as `Study Companion <support@example.com>`. The sender must
  satisfy the provider's mailbox or verified-domain requirements.
- `FRONTEND_URL` and `PUBLIC_APP_URL`: the same exact public HTTPS origin, without
  a path or trailing slash. See [deployment](DEPLOYMENT.md).

Edit existing environment entries instead of creating duplicate keys. An existing
`RESEND_API_KEY` is ignored while `MAIL_PROVIDER=smtp` and may be retained privately
for rollback. Never commit credentials. Revoke and replace any exposed credential.

## Transport and delivery

Port 465 uses certificate-verified TLS. Port 587 requires STARTTLS. Other ports
are rejected; certificate verification remains enabled, with TLS 1.2 or newer.
Protocol and message logging are disabled. The application only sends through SMTP;
it does not read a mailbox through POP3 or IMAP. Protect authorization codes according
to all permissions the mail provider grants them.

Registration codes, verification links, password-reset links and queued support
reply notifications use the selected provider. Failed code/link sends invalidate
the pending code or link; SMTP does not bypass registration verification. Persistent
resend and attempt limits remain in force. SMTP does not guarantee provider
idempotency or inbox placement. Support notification retries are described in
[asynchronous support follow-up](SUPPORT_FOLLOWUP.md).

## Verify a deployment

Restart or redeploy after changing environment values. With an authorized recipient,
verify actual receipt, incorrect-code rejection, successful registration with the
correct code, and subsequent login. Also check verification/password-reset links
and a staff-reply notification. Use another recipient provider before inviting users.
Do not delete an existing account to make its address available for tests.

Check the recipient's inbox/spam folder and provider delivery logs. Mailbox quotas
or anti-abuse checks can block or delay delivery; a successful build or SMTP
acceptance does not prove inbox delivery.
