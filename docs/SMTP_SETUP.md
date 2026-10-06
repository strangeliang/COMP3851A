# SMTP delivery for registration and account recovery

Deploy the SMTP-support code before changing the live provider. Existing deployments
default to Resend, so adding support does not silently switch the mail provider.

For the project 163 mailbox, configure these backend-only Render environment variables:

| Key | Value |
| --- | --- |
| MAIL_PROVIDER | smtp |
| SMTP_HOST | smtp.163.com |
| SMTP_PORT | 465 |
| SMTP_USER | studycompanion26@163.com |
| SMTP_PASS | A fresh mailbox authorization code, entered privately by the owner |
| MAIL_FROM | Study Companion <studycompanion26@163.com> |

Keep FRONTEND_URL and PUBLIC_APP_URL equal to
`https://study-companion-s9rz.onrender.com`. Edit the existing MAIL_FROM row rather
than creating duplicate keys. The old RESEND_API_KEY is ignored when MAIL_PROVIDER
is smtp; it can be retained privately for rollback. Never commit credentials or use
the mailbox login password. Revoke any authorization code exposed in screenshots.

SMTP uses certificate-verified TLS (465), or required STARTTLS (587). Other ports
are rejected. Protocol/message logging is disabled. The app uses SMTP sending only,
not POP3/IMAP mailbox reading. Enabling a combined mailbox service may grant broader
access to whoever holds its authorization code, so protect the code accordingly.

Both registration codes and password-reset links use the selected provider.
Provider failures invalidate pending codes/links through the existing routes;
they do not bypass registration verification. SMTP does not guarantee provider-level
idempotency or inbox placement. Persistent resend/attempt limits remain in force.

After saving configuration and redeploying, test with an authorized recipient:
receipt, incorrect code rejection, correct code registration and subsequent login.
Test another recipient/provider before inviting classmates. Do not delete an existing
account to make its address available for tests. Mailbox quotas and anti-abuse checks
can block or delay delivery; a successful build or SMTP acceptance is not inbox proof.
