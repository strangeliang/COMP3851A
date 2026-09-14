# Backend API — version 1.1.0

The implemented API uses `/api` and same-origin browser requests. Vite proxies `/api` to `http://127.0.0.1:8000` during development and preview. The Express server can also serve the built frontend.

## Implemented routes

| Method | Route | Access | Result |
| --- | --- | --- | --- |
| GET | `/api/health` | Public | Process health |
| GET | `/api/database/status` | Public local diagnostic | Table availability and counts |
| POST | `/api/auth/login` | Public, rate limited | HttpOnly session cookie and safe user fields |
| POST | `/api/auth/logout` | Current browser session | Invalidate cookie and server session |
| GET | `/api/auth/me` | Active session | Current user |
| GET | `/api/courses` | Test `x-user-id` header | Current user's courses |
| GET | `/api/courses/:courseId/materials` | Test `x-user-id` header | Current user's materials in an owned course |
| POST | `/api/courses/:courseId/materials` | Test `x-user-id` header | Create a material in an owned course |
| DELETE | `/api/materials/:materialId` | Test `x-user-id` header | Delete the current user's material |
| GET | `/api/ai/status` | Active session | Provider/model configuration status; does not probe Gemini |
| POST | `/api/ai/summary` | Active Student session | Summary paragraph and concepts |
| POST | `/api/ai/qa` | Active Student session | Answer |
| POST | `/api/ai/quiz` | Active Student session | Three validated practice questions |

## Authentication

Login request:

```json
{"email":"student@example.com","password":"student123","remember":false}
```

The response contains `{ "user": { "id", "name", "email", "role", "status" } }`; no password, password hash, or bearer token is returned in JSON. An opaque random session identifier is sent in `study_session`, with `HttpOnly`, `SameSite=Strict`, and `Path=/`. `Secure` is enabled when `NODE_ENV=production`; that requires HTTPS. Session lifetimes are 8 hours or 7 days when remembered. Session state is in memory and expires on server restart.

SQLite supplies user identity, status and bcrypt hashes on every protected request. Browser cached users and request-supplied roles cannot grant authorization. Login attempts are limited to 20 per IP per 10 minutes. These limits are process-local and intended for the single-process local application.

The public demo accounts are development fixtures. Administrator account management and public deployment controls are outside this release.

### Course and material test identity

The four Course/Material endpoints above temporarily identify a user from a single header, for example `x-user-id: 1`. The value must be a positive integer and must match a real row in `users`; otherwise the response is `401` with code `TEST_USER_REQUIRED`. A login cookie does not replace this header for these four endpoints, and the header is not applied to Health, Database Status, AI, or other routes.

The middleware sets `req.currentUser = { id }`. A future production authentication layer should set the same request property after login/session validation. Course and material ownership is always supplied to parameterized SQLite queries from `req.currentUser.id`. Client-provided `owner_id` or `ownerId` is rejected, and a missing or differently owned Course/Material returns `404` rather than revealing whether another user owns it.

## Study requests

Summary and Quiz require `materials`. Q&A additionally requires `question` and accepts `history`:

```json
{
  "materials": [{
    "id": "material-id",
    "name": "lecture.txt",
    "content": "Page 1\nFull extracted source text...",
    "readingNotes": "OCR was used; check equations against the original.",
    "incomplete": false
  }],
  "question": "Explain the main idea.",
  "history": [{"role":"user","text":"My earlier question"},{"role":"model","text":"Earlier answer"}]
}
```

Limits are shared in `shared/studyLimits.json`: 1–3 materials, at most 100,000 source characters in total, a question of 1–4,000 characters, and at most 10 recent history messages totaling 32,000 characters. Each reading note is limited to 2,000 characters. Oversized or incomplete inputs fail before contacting Gemini. The JSON body limit is 1 MiB.

The frontend limits selection to the current student's current course. The AI endpoints still accept inline material text and do not retrieve it from SQLite. The separate Course/Material endpoints enforce ownership for persisted course records, but the current frontend has not yet switched its local course/material state to those endpoints.

`studyContracts.js` contains fixed prompts and JSON response schemas. `geminiService.js` sends the full validated source text through the official `generateContent` endpoint. The API key exists only in the server environment and the `x-goog-api-key` request header. Source instructions cannot change the API URL, access application tools, or receive the key.

## Responses

Summary:

```json
{"paragraph":"Summary with source references [S1].","concepts":["Key idea [S1]."],"mode":"api"}
```

Q&A:

```json
{"answer":"Answer supported by [S1], Page 1.","mode":"api"}
```

Quiz: `{ "questions": [...], "mode": "api" }`. There are exactly three questions. Each contains an `id`, `question`, four unique `options`, an integer `answerIndex` from 0 to 3, and an `explanation`. Duplicate questions, invalid options/indices and malformed JSON are rejected. Answers are returned to the browser for local self-assessment, not secure examinations.

Only completed `STOP` responses are accepted. `MAX_TOKENS`, safety stops, missing content and invalid structure become errors. These checks establish format/completion, not factual correctness; source citation accuracy still requires evaluation.

## Errors and lifecycle

Errors have the shape `{ "code": "ERROR_CODE", "message": "Readable explanation" }`.

| HTTP status | Examples |
| --- | --- |
| 400 | Invalid materials, over-budget sources, malformed JSON |
| 401 | Missing/expired session or invalid login |
| 403 | Disallowed origin or non-student AI request |
| 409 | Another AI request is already running for this student |
| 413 | Request body too large |
| 429 | Local rate limit or Gemini rate/quota limit |
| 502 | Truncated, blocked, empty or malformed Gemini output |
| 503 | Missing key, provider configuration error or provider/network failure |
| 504 | AI timeout |

At most one AI request runs per student, with 30 requests per student per 5 minutes. The provider timeout is 90 seconds, shared across at most two attempts. HTTP 429/500/502/503/504 can retry once with a short delay. Authentication/configuration failures do not retry. Provider error bodies and secrets are neither sent back to the browser nor logged.

Browser cancellation disconnects the request and aborts backend generation. Closing a request releases its per-student slot. Whether provider processing had already consumed quota is outside the app's control.

## Persistence boundary

SQLite initialization, foreign keys and idempotent demo seeding remain implemented. The four test-header Course/Material endpoints persist their records in SQLite; the current frontend still keeps its own course/material changes and study records in the browser cache. Material POST stores already-extracted text as JSON and does not provide multipart upload or server-side file storage. There are no production-authenticated Course, Material, Chat, Quiz-attempt, password-reset, or Admin API routes in this release. The older planned JWT/asynchronous-job contracts are not active endpoints.
