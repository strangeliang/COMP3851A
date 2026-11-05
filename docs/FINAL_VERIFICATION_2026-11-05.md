# Study Companion: Final Verification and Handoff

**Verification date:** 5 November 2026

**Branch:** `codex/teacher-feedback-20261105`

**Delivery:** [Pull request #23](https://github.com/strangeliang/COMP3851A/pull/23), open at this review. Refer to the pull request for its current revision and merge status.

The local version passed the checks recorded below and is ready for the demonstration and deployment handoff. These results establish local acceptance; deployment and live service acceptance remain separate steps.

## Review scope

The review covered 212 existing source, test, configuration, and documentation files across `src`, `backend/src`, `backend/scripts`, `shared`, all frontend and backend tests, the public logo, and startup and deployment configuration. The reading inventory was checked against the actual file list. The database concurrency fixes also received an independent review.

The count excludes the two dependency lockfiles, empty `.gitkeep` files, installed dependencies, build output, Git objects, runtime databases, uploaded originals, and private `.env` files. Dependency checks used the lockfiles and `npm audit`. The real AI smoke test used the backend's existing private configuration without displaying secrets.

## Fixes included

| Issue | Resolution |
| --- | --- |
| Deleted courses or materials could remain in loaded history and New counts. | Remove the relevant snapshots after server-confirmed deletion, retaining account isolation and stale-request guards. Handle legacy `sourceFileId` when the selected-source array is empty. |
| A material deleted between validation and history saving could reappear in a late result. | Both history insertion paths check every source inside the SQLite insert statement. |
| Concurrent original-file upload and course or material deletion could leave files behind. | Database deletion triggers atomically queue original-file keys for cleanup. Deletion and startup processing retry failed items. |
| SQLite could reuse the highest deleted material ID. | A persistent increasing sequence preserves existing IDs and prevents old history or original-file requests from pointing to a later upload. |
| Docker builds omitted the public logo. | Include `public` in the build context and copy it during the build. |
| Compose omitted SMTP settings. | Forward `MAIL_PROVIDER` and SMTP parameters explicitly, retaining the default Resend behavior and private secret configuration. |
| Ask Me product guidance used outdated tab names. | Align guidance with AI help, Human support, and History. |
| API and support documentation described outdated behavior. | Document current cookie authentication, registration codes, study endpoints, read and mastery state, support notifications, and administrator routes. |

The previously removed page-level lazy-loading change was not reintroduced.

## Automated verification

| Check | Recorded result |
| --- | --- |
| ESLint | Passed |
| Frontend regression suite | 225 passed, 0 failed |
| Backend regression suite | 98 passed, 0 failed |
| Total | **323 passed, 0 failed** |
| Vite production build | Passed |
| Frontend and backend `npm audit` | 0 known vulnerabilities in each |
| `git diff --check` | Passed; Windows line-ending conversion warnings remained |

The complete `npm run check` passed. After the final help-prompt wording update, ESLint and the full backend suite passed again.

New regressions cover loaded history after deletion, deletion interleaved with saving, concurrent original-file deletion and cleanup retries, ID migration, and uploading again after deletion. An independent concurrency probe confirmed unique IDs across concurrent course uploads, no sequence rollback after deletion or reinitialization, and continued incrementing after an explicitly imported larger ID.

Existing tests also cover registration and recovery, cookie identity, Google verifier boundaries, account and material isolation, source validation, upload limits and rollback, parsing boundaries, cancellation and stale requests, history and retry flows, read and mastery progress, ticket permissions, notification queues, and original-file persistence across an isolated backend restart.

The main JavaScript bundle remains approximately 693 KB, triggering Vite's 500 KB warning. The test tooling also reports a `react-test-renderer` deprecation warning. Neither caused a failed check; the current loading approach and test framework remain in place.

## Browser acceptance

Browser checks used a loopback test site, an isolated SQLite database, and synthetic short text. They did not modify the production runtime database. Study AI responses in these checks used fixed test fixtures; the separate real Gemini smoke test is recorded below.

| Area | Observed result |
| --- | --- |
| Student access and dashboard | Login and logout worked. Statistics opened and showed one saved quiz at 50%, matching the submitted answers. |
| Upload | File selection, queueing, upload, the server original-file link, and material details worked. The result used the `uploaded` status. |
| Summary and Q&A | A summary was saved. A citation opened and highlighted Slide 2. Questions and answers were saved to the relevant conversation. |
| Quiz | Previous was absent on the first question and Next on the last. Submit remained disabled until all questions were answered. Mixed question types displayed correct and incorrect results. |
| Flashcards | A set contained six cards. Marking one mastered produced 1/6 in history details. Progress and records remained separate between accounts. |
| Review Centre | New quiz indicators appeared and cleared when opened. Wrong-answer practice saved a 1/1 result while the original score remained 50%. Retry all displayed both questions. |
| Study History | Unopened records displayed New independently of Review Centre. Single-record and delete-all actions both supported undo. |
| Settings and profile | The language menu switched between English and Chinese. The avatar selector used English in English mode. |
| Ask Me and support | All three tabs worked. Human support created a separate ticket and displayed Add information while awaiting a reply. An administrator read the waiting ticket, saved a reply, and marked it Resolved; the student saw the same reply and status after logging in again. |
| Mobile width | The Compact help window fitted a 390 × 720 viewport, with a working close icon. |
| Empty-account first use | A second student account started with zero courses, materials, and quizzes, and no New indicators. Course creation, upload, the first six-card generation, progress saving, and independent history worked. |

The captured test-tab browser console contained zero errors. The empty-account check used an existing test account with no study data; it did not verify delivery of registration email to a new real mailbox.

## Real Gemini smoke test

Five services were exercised through the current backend using its existing private key and synthetic short text about vectors: Summary returned a valid summary, Q&A returned an answer, Quiz returned two questions, Flashcards returned six cards, and Ask Me returned website guidance. No original teaching slides or personal course materials were sent.

This confirms successful connectivity and acceptable response structure at the time of the test. It does not establish course-wide answer accuracy, semantic uniqueness of every card, or future quota availability. Formula extraction and question accuracy require checks against the relevant original slides; scanned-document OCR requires checks against the actual scans.

## Merge and deployment handoff

Deploy the frontend and backend from the same revision. Install the locked dependencies, run `npm run check`, and follow [Deployment](DEPLOYMENT.md). Preserve the private environment configuration, existing database, and original-file directory, with a paired database-and-originals backup before deployment. Do not replace existing data with the test database.

Backend startup creates `original_cleanup_queue`, `material_id_sequence`, and their triggers automatically. **No database reset is required**; existing material IDs and content are preserved. History read state and flashcard mastery also require the updated backend. Sessions are held in memory, so users must log in again after a restart.

Docker configuration was corrected, but the local Docker daemon was not running, so an actual container build was not verified. If deploying with Docker, build with a running engine and check `/api/health`. The successful Vite production build does not replace container verification.

Complete these checks on the actual deployment:

- Use two student accounts and one administrator account to exercise upload, Summary, Q&A, Quiz, Flashcards, history, retry, and support replies. Confirm New and mastery state survive logging in again.
- Verify receipt of registration and password-reset emails, Google login, and the deployed Gemini configuration and quota.
- Restart or redeploy and confirm both database records and uploaded originals remain available. Configured paths and local restart tests alone do not prove cloud persistence.

## Demonstration boundaries

The demonstrated student workflow is course creation and upload, AI study tools, saved history, targeted review, and website help. Report the evidence as **323 local automated tests passed** and **five real AI services smoke-tested with synthetic short text**; neither figure establishes accuracy for all course materials.

The current administrator entry point is **Support Tickets**, including search and filters, the waiting queue, ticket details, replies, and status management. Legacy Users, Materials, and AI Outputs page sources remain in the repository but are not routed as current administrator features. Exclude them from the completed feature demonstration. Model interpretation, OCR quality, live email delivery, and cloud persistence remain subject to the limits and deployment checks above.
