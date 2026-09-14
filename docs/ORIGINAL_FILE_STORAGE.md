# Original file storage

New uploads retain both extracted text and the original bytes. The upload page offers **Download original** and **Preview original** (PDF/images). Office originals download for opening in a local application. Supported Office types remain PPTX/DOCX; legacy PPT is not newly supported.

## Storage and access

- SQLite `materials` contains the user/course association. `material_originals` links its material ID to a random private storage key and SHA-256 checksum.
- Originals default to `backend/data/originals/`, beside the default SQLite database. `STUDY_UPLOAD_PATH` can point to an absolute persistent directory. When `STUDY_DATABASE_PATH` is customized, the default originals directory follows that database directory.
- This directory is not served as static content. GET/PUT `/api/materials/:id/original` require a current session and material ownership. Other accounts receive 404; signed-out requests receive 401. Previews are sandboxed; responses use no-store and nosniff.
- Uploads check the 10 MB limit, recorded size, and basic format signature. This is not antivirus scanning or full document validation.
- File and course deletion remove the corresponding original files after deleting their database records. Filesystem cleanup failures are logged; inaccessible orphan files may need administrative cleanup. Never delete the entire storage directory to resolve one failed upload.
- Existing records remain unchanged. An original cannot be reconstructed from extracted text. Older records show “Original not saved”; reupload with a different file name to preserve the old record, or deliberately delete the old record first. Existing extraction limits still apply to new uploads.
- The browser first saves metadata/text, then sends original bytes. It reports success only after both requests succeed and attempts rollback on failure. A crash/network loss between requests can leave a text-only record; it will show the missing-original notice, not a false download link.

## Run / deployment

Restart the backend from `D:\COMP3851A\backend` with `npm start` (stop the existing backend in its terminal first). The new table is created automatically without removing existing materials. Refresh the frontend; if serving production files, run `npm run build` from the project root first.

Sessions are currently in memory: a backend restart requires login again, but files remain. Back up **both** the SQLite database and originals directory together. A cloud host needs a persistent volume for both; an ephemeral deployment filesystem is not sufficient. Do not commit uploaded files or the database to GitHub.

## Verification

`npm run check` includes a real temporary-backend test that uploads bytes, verifies preview/download, rejects another student and signed-out requests, logs out/in, kills and restarts the backend process with the same database/storage, compares downloaded bytes, and verifies material/course deletion removes originals. Test data is isolated from the running project's data.
