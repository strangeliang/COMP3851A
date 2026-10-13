# Deploy Study Companion

The active server is backend/src/server.js. Build from the repository root.
Use Node 22.13 or newer. Build command:
npm ci && npm --prefix backend ci && npm run build
Start command: npm run backend. Health check: /api/health.

## Server configuration

Set NODE_ENV=production and HOST=0.0.0.0. FRONTEND_URL and PUBLIC_APP_URL
must match the exact public HTTPS origin. Set GEMINI_API_KEY, GEMINI_MODEL
and GOOGLE_CLIENT_ID in the host's secret settings. Keep STUDY_SEED_DEMO disabled.

STUDY_DATABASE_PATH and STUDY_UPLOAD_PATH must BOTH point to a persistent disk,
for example /var/data/study_companion.db and /var/data/originals.
A persistent disk does not automatically migrate existing records. Stop the backend
and copy the database and originals together, retaining a backup before migration.
Sessions are in memory; restarting requires login again.
Production startup now refuses missing/relative storage paths or an invalid
FRONTEND_URL, rather than silently creating a new database in a temporary default.
This checks configuration only: you must still attach the host's persistent disk
and verify it survives a redeploy. A path by itself does not provide persistence.

## Trusted proxy and login limits

The app detects Render (`RENDER=true`) and trusts one ingress hop by default.
Direct/local servers default to no trusted forwarded headers. Other deployments
must set TRUST_PROXY to their actual trusted hop count (1–5), proxy IP/IPv4 subnet, or
loopback for a local HTTPS proxy. Docker Compose forwards this variable and defaults
to 0. Never set it to true or trust all clients. A hop count is safe only when all
public requests go through that many proxy hops; use explicit proxy addresses when
the backend can also be reached directly. TRUST_PROXY=0 disables the Render default.

## Docker

Run docker compose --env-file backend/.env up -d --build.
The image runs the current backend and stores both database and originals in the
study-data volume at /app/data. Port 3000 is loopback-only; use an HTTPS reverse proxy
for remote access. Do not remove the volume when redeploying.
The older server/ demo proxy is not used.

## Administrator setup

Registration creates students only. Run node backend/scripts/createAdmin.js
with private ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD environment variables.
The command refuses to change an existing account. Remove ADMIN_PASSWORD afterwards.
No default public administrator is created.

## One-time email verification and password reset

Set RESEND_API_KEY, MAIL_FROM and PUBLIC_APP_URL on the backend.
MAIL_FROM must be an approved sender for the provider; verify your sender domain
for public recipients. No credentials are shipped.
Official API: https://resend.com/docs/api-reference/emails/send-email

/verify-email requests an email ownership link. /reset-password requests a reset
link. Each link expires in 15 minutes and is consumed only on an explicit form submit.
The token is sent in a URL fragment, removed from the address bar by the page,
and stored only as a hash in SQLite. Reset invalidates old sessions and pending links.
Verification is optional and does not block login. Google-only accounts use Google
login and Google's recovery service.

Public requests return the same response for existing and unknown accounts.
A client request ID is sent at most once, with provider idempotency too.
An accepted request does not prove inbox delivery. Failed sending invalidates the
link; request a new link later. Check provider delivery logs when investigating.
Support recovery tickets are separate: closing a ticket never changes a password.

## Release checks and backup

Run npm run check. On the hosted app:
1. Register, verify email, reset password, and check old sessions are rejected.
2. Test two student accounts and Admin for data isolation and permitted actions.
3. Upload an original, save Quiz/History/Review records, and exchange support replies.
4. Restart and redeploy, sign in again, and verify all records and files remain.
5. Test Google sign-in, live Gemini generation and actual email inbox delivery.

Back up the database and originals together while the backend is stopped.
Restore into a separate directory and verify accounts, records and original files.
Automated tests do not confirm cloud disk configuration, live delivery or AI quota.

### Backup / recovery commands

Stop the backend first. Use a new destination directory (the parent must exist):

```sh
node backend/scripts/backup.js backup --destination /safe-backups/study-2026-10-01 --server-stopped
node backend/scripts/backup.js verify --source /safe-backups/study-2026-10-01
node backend/scripts/backup.js restore --source /safe-backups/study-2026-10-01 --destination /recovery/study-restored
```

Windows absolute directories are also accepted. The backup command uses the
STUDY_DATABASE_PATH / STUDY_UPLOAD_PATH configuration. It includes committed SQLite
WAL data, checks database integrity and checks each original's SHA-256. The manifest
is written last; interrupted/incomplete backups are rejected. Existing destinations
are never overwritten. Failed partial directories are retained for inspection.

After restore, point the backend to NEW_DIR/study_companion.db and NEW_DIR/originals.
Test on an isolated instance before switching production over. Keep the old data
and backup until the restored instance is accepted. Backup folders contain private
student data: restrict access and keep an encrypted/off-host copy. Do not place
backups in dist/ or a public web folder. The script does not copy .env secrets.

### AI release readiness

GEMINI_API_KEY is server-only. Check the actual project's paid/free status and live
model quotas in Google AI Studio, then perform one authorised small generation on
the hosted app. Buying credits does not remove per-model request/token limits.
The application reports quota/time-out/configuration failures and does not invent
successful results. Its local AI request limit is an abuse guard, not your Google
quota. The configuration status only confirms a key is present, not usable balance.
