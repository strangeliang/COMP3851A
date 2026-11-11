# Original file storage

Uploads retain both extracted text and the original bytes. The upload page offers **Download original** and **Preview original** for PDF/images. Office originals download for opening in a local application. Supported Office types are PPTX and DOCX; legacy PPT is not supported.

## Storage and access

- SQLite `materials` contains the user/course association. `material_originals` links its material ID to a random private storage key and SHA-256 checksum.
- Originals default to `backend/data/originals/`, beside the default SQLite database. `STUDY_UPLOAD_PATH` can point to an absolute persistent directory. When `STUDY_DATABASE_PATH` is customized, the default originals directory follows that database directory.
- This directory is not served as static content. GET/PUT `/api/materials/:id/original` require a current session and material ownership. Other accounts receive 404; signed-out requests receive 401. Previews are sandboxed; responses use no-store and nosniff.
- Uploads check the 40 MiB per-original limit, recorded size, and basic format signature. This is separate from the Office text expansion and extracted-text limits. It is not antivirus scanning or full document validation.
- Material or course deletion removes its database records and queues the original storage keys atomically through SQLite triggers. The backend drains this durable queue after deletion and at startup. A failed filesystem removal is logged and stays queued for a later attempt; deletion success does not prove the bytes were removed immediately. Never delete the entire storage directory to resolve one failed cleanup.
- Material IDs advance through a persistent sequence and are not reused after deletion. This preserves source identity for study records and stale requests. Startup initializes or advances the sequence from existing material IDs without rebuilding the materials table.
- Existing records remain unchanged. An original cannot be reconstructed from extracted text. Older records show “Original not saved”; reupload with a different file name to preserve the old record, or deliberately delete the old record first. Existing extraction limits still apply to new uploads.
- The browser first saves metadata/text, then sends original bytes. It reports success only after both requests succeed and attempts rollback on failure. A crash/network loss between requests can leave a text-only record; it will show the missing-original notice, not a false download link.

## Startup and deployment

Run `npm run backend` from the repository root. Startup creates the required tables,
triggers and sequence automatically in the selected database, preserving existing
materials. Back up the database and originals before upgrading. If serving the built
frontend, run `npm run build` from the repository root before starting the backend.

Sessions are in memory: a backend restart requires login again. Back up **both** the
SQLite database and originals directory together. Production requires explicit
absolute `STUDY_DATABASE_PATH` and `STUDY_UPLOAD_PATH` values on persistent storage.
See [deployment and backup](DEPLOYMENT.md) for configuration, migration and recovery.
Do not commit uploaded files or the database to GitHub.

## Verification

`npm run check` includes isolated tests for preview/download, ownership, signed-out
requests, logout/login, byte preservation across a real backend process restart,
material/course deletion, concurrent attachment during deletion, cleanup retries,
and sequence initialization for existing databases. These checks use temporary data;
verify persistence separately on the hosted application's actual volume.
