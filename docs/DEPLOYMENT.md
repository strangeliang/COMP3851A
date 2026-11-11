# Deploy Study Companion

Use Node.js 22.13 or newer. Run commands from the repository root:

```sh
npm ci
npm --prefix backend ci
npm run build
npm run backend
```

The entry point is `backend/src/server.js`. It serves the API and the built
frontend in `dist/`. Use `/api/health` for the health check.

## Server configuration

Configure the backend environment using [backend/.env.example](../backend/.env.example).
Set `NODE_ENV=production` and `HOST=0.0.0.0`. `FRONTEND_URL` and `PUBLIC_APP_URL`
must match the exact public HTTPS origin, such as `https://study.example.com`,
without a path or trailing slash. Set `GEMINI_API_KEY`, `GEMINI_MODEL` and
`GOOGLE_CLIENT_ID` in the host's environment settings. Keep `STUDY_SEED_DEMO`
disabled. Never expose backend credentials through frontend `VITE_*` variables.

STUDY_DATABASE_PATH and STUDY_UPLOAD_PATH must BOTH point to a persistent disk,
for example /var/data/study_companion.db and /var/data/originals.
Startup applies the application's schema upgrades to the selected SQLite database;
there is no separate migration command. Back up before upgrading. Schema upgrades
do not transfer data when storage paths change: stop the backend and copy the
database and originals together, retaining the old data and a backup.
The upload size upgrade migrates the existing `materials` table in place; no reset
or manual copy is needed if the storage paths stay the same. Check that the host
and any reverse proxy accept 40 MiB request bodies for original uploads.

Sessions are in memory; restarting requires login again. Production startup rejects
missing or relative storage paths and an invalid `FRONTEND_URL`. These checks
validate configuration only: attach the host's persistent disk and verify that
records and files survive a redeploy. A path by itself does not provide persistence.

## Trusted proxy and login limits

The app detects Render (`RENDER=true`) and trusts one ingress hop by default.
Direct/local servers default to no trusted forwarded headers. Other deployments
must set TRUST_PROXY to their actual trusted hop count (1–5), proxy IP/IPv4 subnet, or
loopback for a local HTTPS proxy. Docker Compose forwards this variable and defaults
to 0. Never set it to true or trust all clients. A hop count is safe only when all
public requests go through that many proxy hops; use explicit proxy addresses when
the backend can also be reached directly. TRUST_PROXY=0 disables the Render default.

## Docker

Run from the repository root after setting the backend environment:

```sh
docker compose --env-file backend/.env up -d --build
```

The image runs the current backend and stores both database and originals in the
study-data volume at /app/data. Port 3000 is loopback-only; use an HTTPS reverse proxy
for remote access. Do not remove the volume when redeploying.

## Administrator setup

Registration creates students only. Set private `ADMIN_EMAIL`, `ADMIN_NAME` and
`ADMIN_PASSWORD` environment variables, then run:

```sh
node backend/scripts/createAdmin.js
```

Use the same `STUDY_DATABASE_PATH` as the deployed backend. The password must contain
at least 12 characters and at most 72 UTF-8 bytes. The command refuses to change an
existing account. Remove `ADMIN_PASSWORD` afterwards. No default public
administrator is created.

## Registration email, verification links and password reset

Configure the backend mail provider, MAIL_FROM and PUBLIC_APP_URL. The default
Resend adapter requires RESEND_API_KEY and an approved sender domain for public
recipients. SMTP is also supported with MAIL_PROVIDER=smtp; see [SMTP setup](SMTP_SETUP.md).
No credentials are shipped.

New email/password registration requires a six-digit code before the Student
account is created. Codes expire in 10 minutes, allow five attempts, and can be
resent after 60 seconds, at most three per email per hour. Only the newest code
works. Registration is unavailable when mail is unconfigured or cannot send the code.

/verify-email requests an email ownership link. /reset-password requests a reset
link. Each link expires in 15 minutes and is consumed only on an explicit form submit.
The token is sent in a URL fragment, removed from the address bar by the page,
and stored only as a hash in SQLite. Reset invalidates old sessions and pending links.
The separate verification-link flow is optional for existing password accounts;
legacy unverified status does not block their login. This does not bypass the code
required for new email/password registration. Google-linked accounts use Google
login and Google's recovery service.

Verification/reset link requests return the same response for existing and unknown accounts.
Repeated link requests with the same client request ID do not send another message.
Resend also receives a provider idempotency key; SMTP has no equivalent guarantee.
An accepted request does not prove inbox delivery. Failed sending invalidates the
link; request a new link later. Check provider delivery logs when investigating.
Support recovery tickets are separate: closing a ticket never changes a password.

## Release checks and backup

Run `npm run check`. On the hosted app:

1. Register with a real email code, reset the password, and check old sessions are
   rejected. Check the separate verification-link flow with an eligible existing account.
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
node backend/scripts/backup.js backup --destination /safe-backups/study-release --server-stopped
node backend/scripts/backup.js verify --source /safe-backups/study-release
node backend/scripts/backup.js restore --source /safe-backups/study-release --destination /recovery/study-restored
```

Windows absolute directories are also accepted. The backup command uses the
STUDY_DATABASE_PATH / STUDY_UPLOAD_PATH configuration. It includes committed SQLite
WAL data, checks database integrity and checks each original's SHA-256. The manifest
is written last; interrupted/incomplete backups are rejected. Existing destinations
are never overwritten. Failed partial directories are retained for inspection.

Replace the example paths with private absolute directories. After restore, point
the backend to `RESTORE_DIR/study_companion.db` and `RESTORE_DIR/originals`.
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
