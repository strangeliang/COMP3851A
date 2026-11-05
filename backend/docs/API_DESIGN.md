# Backend API reference

Checked against the current source on 5 November 2026. All routes below use the
`/api` prefix. The active app is `backend/src/app.js`, started by
`backend/src/server.js`; the older `databaseRoutes.js` router is not mounted.
Vite proxies `/api` to `http://127.0.0.1:8000` in development and preview. The
backend serves the built frontend when `dist/index.html` exists.

## Authentication and ownership

Protected routes require the `study_session` cookie. An `x-user-id` header does
not authenticate a request. Cookies are `HttpOnly`, `SameSite=Strict`, `Path=/`,
and `Secure` in production. Sessions last 8 hours, or 7 days with `remember: true`,
and are held in server memory, so a restart requires sign-in again. Protected
requests recheck the account's active status and current password hash.

Learning-data routes use the signed-in user's ID. Administrator status does not
grant access to another student's learning data. Ticket administrators can manage
support records; students see only their own tickets. Client ownership or role
fields cannot grant permissions. Writes with a supplied disallowed Origin are
rejected. The normal JSON limit is 1 MiB; original uploads have a separate limit.

## Account and diagnostic routes

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/health` | Public process health; does not prove AI, mail or durable storage works. |
| POST | `/auth/login` | Public `{email, password, remember}`; creates a session and returns safe user fields. |
| POST | `/auth/logout` | Clears the current browser session; safe without an active session. |
| GET | `/auth/me` | Active session; returns the current user. |
| PATCH | `/auth/profile` | Active session; `{name, bio, learningGoal, avatar}`; avatar is a PNG data URL. |
| GET | `/auth/google/config` | Public enabled state and, when configured, client ID and short-lived nonce. |
| POST | `/auth/google` | Public `{credential}`; validates audience/nonce and signs in. |
| POST | `/auth/register` | Public `{name, email, password}`; sends a code and returns a challenge, without creating the account yet. |
| POST | `/auth/register/resend` | Public `{challengeId}`; issues a new challenge/code after the cooldown. |
| POST | `/auth/register/verify` | Public `{challengeId, code}`; valid six-digit code creates the verified Student account. |
| GET | `/auth/email/status` | Public mail-configuration state; does not test delivery. |
| POST | `/auth/email/request` | Public `{email, purpose: "verify" or "reset", clientId}`; generic eligibility response. |
| POST | `/auth/email/consume` | Public `{token, purpose, password?}`; consumes the link; reset requires a new password. |
| POST | `/auth/recovery-request` | Public `{accountName, email, consent: true, clientId}`; unverified support intake; no password change or email. |
| GET | `/database/status` | Active Admin session; database diagnostics. |

Registration requires configured mail, at least 12 password characters and at most
72 UTF-8 bytes, and successful code verification. Codes expire after 10 minutes,
allow five attempts, and can be resent after 60 seconds, at most three per email per
hour. Only the newest code works. Existing password accounts can use the separate
optional verification-link flow; legacy unverified status does not block login.
One-time links expire after 15 minutes. Reset invalidates old-credential sessions
and sibling links. Google-linked accounts use Google sign-in/recovery. See
[Google login](../../docs/GOOGLE_LOGIN.md) for existing-account linking rules and
[deployment](../../docs/DEPLOYMENT.md) for mail setup.

## Courses and materials

Every route below requires a session and enforces ownership.

| Method | Route | Input / result |
| --- | --- | --- |
| GET / POST | `/courses` | List courses / create with `{code, name}`. |
| PATCH | `/courses/:courseId` | Update `{code, name}`, preserving materials and study records. |
| DELETE | `/courses/:courseId` | Delete the course and dependent records; clean up originals. |
| GET / POST | `/courses/:courseId/materials` | List materials / create with `{name, type, sizeBytes, content, readingNotes?}`. |
| PUT | `/materials/:materialId/original` | Save `application/octet-stream` bytes, up to 10 MiB; refuses replacement. |
| GET | `/materials/:materialId/original` | Download original; `?preview=1` enables inline PDF/image preview. |
| DELETE | `/materials/:materialId` | Delete material, tracked dependent records and original. |

Course codes allow 32 characters and names 120. Material types are TXT, MD, PDF,
DOCX, PPTX, PNG, JPG, JPEG, WEBP and BMP. Each user can store 10 materials, with 5 per
course; extracted text is limited to 100,000 characters per material and reading
notes to 2,000. The browser extracts text before submitting JSON, then uploads the
original separately. Older materials without originals require re-upload for
original access. See `shared/studyLimits.json` for browser extraction/upload limits.

## Study generation

`GET /ai/status` requires a session and reports provider/model configuration without
probing Gemini. `POST /ai/summary`, `/ai/qa`, `/ai/quiz` and `/ai/flashcards` require
an active Student session. They accept inline source text, rather than retrieving
materials from SQLite. Saving history separately validates source ownership.

All modes supply `materials: [{id, name, content, readingNotes?, incomplete?}]`:
1–3 unique sources, totaling at most 100,000 source characters. Empty or incomplete
text is rejected. Successful results include `mode: "api"`.

| Mode | Additional input | Result fields |
| --- | --- | --- |
| Summary | None | `paragraph`, `concepts`. |
| Q&A | `question` (1–4,000 characters); optional `history`, `answerStyle` | `answer`. Styles: `simple`, `detailed`, `example`, `hint`. History allows 10 `{role: "user" or "model", text}` messages, totaling 32,000 characters. |
| Quiz | `questionCount` (1–20, default 5), `difficulty` (`easy`, `medium`, `hard`), `quizType` (`single`, `multiple`, `mixed`) | `questions`, `quizType`. Each question has `id`, `question`, four distinct `options`, zero-based `answerIndices`, `explanation`. Mixed requires at least two questions and both answer types; multiple-answer questions have two or three correct options. |
| Flashcards | Optional `previousCards`, up to 12 `{front, back}` comparisons | Exactly six `cards` with `id`, `front`, `back`, `source`. The server also compares the latest saved, undeleted set for those materials. |

Quiz options are shuffled with their answer mapping. Grading uses the exact answer
set, without partial credit. Answers are visible to the browser for self-assessment;
this is not a secure examination API. Outputs can include source labels and page/
slide references for source preview. Invalid source numbers, malformed/truncated
output and known ambiguous quiz options are rejected. These checks do not prove
factual correctness or semantic uniqueness.

At most one study generation runs per student in this process, with 30 requests per
5 minutes. Browser cancellation aborts backend generation; provider quota may already
have been consumed. Provider failures are explicit. Generation responses do not
save history automatically; the frontend submits completed activities to `/history`.

## History, review and flashcard mastery

Every route below requires a session and uses only the current account's records.

| Method | Route | Input / result |
| --- | --- | --- |
| GET | `/history` | `{records, reviews, deletedRecords, sourceMaterials, viewed: {history, review}}`; viewed lists contain record IDs. |
| POST | `/history` | `{id, kind, courseId, payload}`; kinds: `summary`, `qa`, `quiz`, `flashcards`. Validates payload/source ownership; returns the account-prefixed saved ID. Reusing an ID with different content conflicts. |
| POST | `/history/:id/view` | `{page: "history" or "review"}`; independently acknowledges that page. Review acknowledgements require a quiz. |
| GET | `/history/:id/flashcards-progress` | `{mastered: [cardId, ...]}` for the owned saved set. |
| PATCH | `/history/:id/flashcards-progress` | `{cardId, mastered: boolean}`; validates membership and returns mastered IDs. Progress is saved in the account database. |
| POST | `/history/:id/review` | `{answers, mode: "wrong" or "all", clientId?}`; marks practice and saves a separate result; preserves the original quiz. |
| DELETE | `/history/:id` | Soft-delete the record or its linked Q&A conversation. |
| POST | `/history/:id/restore` | Restore an available record/conversation; returns record/reviews. |
| POST | `/history/delete-all` | Soft-delete all account study records; returns affected count. |
| POST | `/history/restore-all` | Restore eligible deleted records; returns affected count. |

History payloads allow 200,000 serialized characters and have kind-specific
validation. Stable review `clientId` values prevent duplicate practice saves.
Deleting a course or tracked source removes dependent records, which cannot then be
restored. Older records without source metadata cannot be linked automatically.

## Support routes

`/tickets` requires Student or Admin authentication. Students see their own records;
administrators also handle unverified recovery intakes. Writes use request IDs;
status changes require the current `version`.

| Method | Route | Purpose |
| --- | --- | --- |
| GET / POST | `/tickets` | Search/list authorized tickets / create a separate Student human-support request. |
| GET | `/tickets/current-session` | Student's current login conversation. |
| POST | `/tickets/current-session/messages` | `{conversationId, clientId, text, language}`; save message, then attempt AI reply. `aiError` can accompany a saved message. |
| GET | `/tickets/:id` | Read an authorized ticket/events. |
| POST | `/tickets/:id/replies` | `{clientId, text}`; add a reply, or Admin-only recovery note. |
| POST | `/tickets/:id/human-support` | Student owner requests/reopens help with `{clientId}`. |
| PATCH | `/tickets/:id/status` | Admin `{status, version}`: `Open`, `In progress`, `Resolved`. |
| POST | `/tickets/:id/retry-email` | Admin retries failed/skipped notifications with an empty JSON body. |

List filters: `q` (200 characters), `status`, `category`, UTC `from`/`to`, `hideEmpty`,
`needsReply`, `humanOnly`, `sort`, `cursor`. Sort is `newest`, `oldest`, or `requested`
(the last requires `humanOnly=true`). Search/filtering precedes pagination, at most
200 matches per page; cursors require identical filters. Categories: `account`,
`upload`, `quiz`, `review`, `other`.

The support AI uses only recent messages from the owned support conversation, without
automatically attaching study files/chats. It has a separate one-request slot and
20 requests per 10 minutes; ticket writes allow 40 per 10 minutes. AI failure leaves
saved messages available. Staff replies to regular tickets queue email for eligible
owners; recovery notes do not. Provider acceptance does not prove inbox delivery.
See [support workflow](../../docs/SUPPORT_TICKETS.md) and
[email follow-up](../../docs/SUPPORT_FOLLOWUP.md).

## Errors, persistence and verification

Errors return `{code, message}`: 400 invalid input, 401 missing/expired identity,
403 disallowed access/origin, 404 unavailable record, 409 conflicting/pending request,
413 oversized body, 429 rate/quota limit, and 502/503/504 provider/output/availability/
timeout failures. Unexpected errors use a generic 500 response. Credentials and
provider error bodies are not returned.

SQLite persists accounts, courses, extracted material text, history/review records,
viewed flags, mastery, support events and notification queues. Original bytes use
the upload directory. Browser preferences/caches and unsent drafts are separate.
Production requires persistent database and original-file paths and backups of both
together. Local automated tests with isolated fixtures do not prove hosted storage,
live Google sign-in, inbox delivery or live Gemini quality/quota. Complete the
[deployment release checks](../../docs/DEPLOYMENT.md) on the accepted deployment.
