# 23 September meeting — implementation and acceptance record

Updated: 1 October 2026. This describes the local working tree, not a deployed release.
The meeting minutes are requirements/evidence; this file does not change the agreed
team ownership, deadlines or 7 October meeting agenda.

## Delivered locally

| Meeting item / module owner | Implementation | Verification |
| --- | --- | --- |
| Quiz — Zhang Lei | Student chooses 1–20 questions. Single- and multiple-answer questions; multiple questions use mixed types. Options are shuffled with their correct-answer mapping. Exact-set scoring (no partial credit) is shared by Quiz, History and Review. | AI schema/parser tests; count boundaries; shuffled answer mapping; component answer selection and scoring. Browser confirms count field and invalid 21 warning. |
| Review Centre + Wrong Question — Chen Tingshu | Original question order, submitted choices, correct answers and result remain visible. Original quiz is unchanged by practice. Wrong questions can be retried repeatedly; each attempt stores its answers and score. Saved practice details can be expanded. Retry IDs prevent duplicate saves. | Account-isolated HTTP tests, concurrent identical request tests, original-result preservation, real SQLite restart, browser multiple-answer practice and saved details. |
| Database security — Wang Junkai | Cookie-session identity, owner-scoped courses/materials/originals/history/reviews/tickets; student-to-admin access blocked. Admin has support scope, not unrestricted student file access. Input schema validation, parameterized queries, role-field rejection, diagnostics restricted to Admin, public demo credentials disabled. | HTTP two-student/Admin cases, spoofed IDs/owner/roles, literal SQL-like profile strings, ticket/recovery tests, Google verified nonce/token tests. This is regression coverage, not a claim of exhaustive penetration testing. |
| Ask Me + interface coordination — Zihao Liang | A login-scoped support conversation persists messages before the AI reply. Failed AI replies are explicit and retryable. Student and Admin use the same database-backed ticket/reply/status model. No private study documents are attached to support context. | Ticket lifecycle/owner tests; browser sends a support message with external AI disabled and Admin reads/replies to it. |
| Admin + database integration + test coordination — Zhang Jiawen | Inbox searches/filters/sorts, hides empty sessions by default, highlights unanswered student messages, replies and changes status with conflict checks and audit events. Polling preserves drafts. Account-recovery tickets remain separate from password reset. | Component tests and real server restart persistence; browser reply removes the awaiting-staff indicator and reports saved status. |
| Deployment/persistence — Zihao Liang | Current backend included in Docker; database and originals use the same persistent volume. Explicit production storage paths and exact HTTPS origin are required at startup. Backup/verify/restore commands include integrity and per-file checksum checks and refuse overwrite. | Production configuration validation; SQLite + original bytes + profile + quiz/review survive real backend restart. Backup restored into a separate directory; corrupt/incomplete backup rejected. Compose configuration validates. Image build not verified because Docker daemon is unavailable. |
| Password recovery / email verification — Zihao Liang + Zhang Lei | Optional ownership verification and password reset through expiring single-use links. Hashed tokens, request deduplication, throttling and generic public response. Reset revokes old sessions and sibling links. Password-only login remains available when Google is unconfigured. | SQLite/HTTP tests use a fake mail transport; adapter contract tested without sending mail. Actual inbox delivery not verified. |
| Dashboard/navigation/profile/upload | Empty course does not show another course's file. Language switching restores the latest data rather than stale cached text. Profile changes persist. File picker and drag/drop share validation; upload cancellation and rollback are handled. | Component tests, profile restart assertion, browser English → Chinese → empty course → English. English remains the primary supported workflow; no claim of complete bilingual coverage. |
| Study history reliability | Server records hydrate statistics on another browser. Pending saves retain stable IDs, retry safely and are isolated by user. Failures stay visible. Legacy imports do not double-count records. Deleting a course, or a material with tracked source references, removes associated history/reviews. | Queue failure/retry/account-switch tests, hydration/merge tests, database cascade tests and original-file restart/deletion test. Older records without source metadata cannot be linked to a deleted file automatically. |
| AI quality and availability | Full selected source text and OCR warnings reach the fixed prompts; source-grounded output and question schemas are validated. Truncated/malformed responses do not appear as successful results. Provider quota and timeout failures are explicit, retries bounded, key server-only. | Stubbed provider success/failure and contract tests; no live paid generation performed in this pass. |

## Verification commands

`npm run check` runs lint, frontend regression tests, backend regression tests and
the production frontend build. Local browser testing uses a separate disposable
database and disabled external AI; it never changes the existing project database.

Browser proof: `outputs/meeting-review-qa.jpg` (test data, not a production screenshot).

## Required before claiming the hosted release is complete

1. Deploy the current code to Render. Set NODE_ENV=production, the exact
   FRONTEND_URL and both absolute persistent-disk paths. Migrate existing database
   and originals together, with a backup. Verify actual restart **and redeploy** on
   the host; a configured pathname alone does not prove durable storage.
2. Set RESEND_API_KEY, MAIL_FROM (approved sender) and PUBLIC_APP_URL. Verify actual
   verification/reset delivery and consumption with a test inbox. These three
   values were missing from the local backend environment at the start of this work.
   Do not paste private keys into meeting minutes, source control or screenshots.
3. Confirm the hosted origin is authorised for the existing GOOGLE_CLIENT_ID and
   complete an actual Google sign-in. Unit tests cannot verify Google's console settings.
4. Confirm Gemini project billing, available model and actual token/request quota.
   Perform a small authorised generation on the hosted app. Code cannot purchase
   credits, increase provider quotas or infer the available balance from a key.
5. Have each member test their module and submit evidence; Zhang Jiawen consolidates
   issues and retests. Demonstrate the integrated hosted workflow to Mr Lim on
   7 October. A local passing test run is not a substitute for this release check.

See `DEPLOYMENT.md` for configuration and recovery instructions. No Git push,
external deployment, billing change or real email delivery was performed in this pass.
