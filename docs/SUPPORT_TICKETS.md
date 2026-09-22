# Support ticket workflow

The active administrator portal is ticket-only. Admin sign-in opens `/admin/support`;
old `/admin/*` URLs redirect there. Legacy admin page source files remain for reference
but are no longer imported or routed. Student learning pages are unchanged.

## Use

1. Each successful student password or Google login creates one durable support
   conversation, even if the student never opens Ask Me. Admin logins create none.
   Refreshing, route changes, `/auth/me`, and tabs sharing a cookie reuse that record.
   Signing in again creates a new record. This is not an online-presence tracker.
2. Ask Me opens the current login conversation. Sending saves the student message,
   calls the real backend Gemini API, and saves its reply. There is no draft approval
   or separate ticket submission. A visible notice explains that recent support
   messages are sent to Google Gemini and administrators can read the conversation.
3. The admin opens Support Tickets, searches or filters the inbox, reads the issue,
   replies, and sets Open, In progress, or Resolved. Resolved records can be reopened.
4. The student uses This login or Conversation history to read and reply. The admin
   inbox and open chats poll every eight seconds while visible, with manual refresh
   available. Draft text is retained during polling. This is not a live WebSocket chat.
5. Conversation distinguishes student, Gemini AI, legacy preset FAQ, and administrator messages with timestamps.
   Login record shows when that conversation began; Status history shows changes.
   Older tickets retain their original submitted transcript. Private AI study chats
   and unsent drafts are never automatically copied into support.

No example tickets are seeded. An empty database shows zero until a student signs in. Browser-only
legacy tickets are not automatically uploaded, overwritten, or deleted. A student
may review and re-submit an unresolved issue. No email notifications are sent.

## Storage and permissions

`support_tickets`, `support_events`, `support_ai_replies`, and legacy `support_faq_replies` are additive SQLite tables initialized on
backend startup. The existing `STUDY_DATABASE_PATH` selects their persistent database.
Status events and replies record author and time; updates also store resolution time.
Back up this database with the rest of the application data before deployment.

All ticket routes require a valid server session. Students can only list/read/reply
to their own tickets; only admins can view all tickets and update status. Client
ownership or role fields cannot grant access. Frontend and backend reject common
credential patterns, but this is a heuristic, not a guarantee of detecting every secret.
Do not submit passwords, verification codes, API keys, or private documents.

The auth session holds a separate public conversation ID; authentication tokens are
not stored in support records. Session-expiry/logout does not delete support history.
Current-login message requests verify that ID to prevent a stale tab sending to a
new login. Existing sessions without the ID must sign out and back in after upgrade.
Login fails without issuing a new auth cookie if the conversation cannot be saved.

Creation and replies use idempotent request IDs. Status changes use a version check
so a stale admin page cannot silently overwrite newer updates. The inbox currently
shows the latest 200 tickets and labels counts/filters as applying to that loaded set.

## Run and verify

- Restart the existing backend (`npm run backend`) so the new routes and tables load.
- For development use the existing frontend (`npm run dev`); refresh the browser.
- `npm test` includes automatic chat save, failure, retry, polling, and status tests.
- `npm run test:backend` includes isolated SQLite permission, reply, status audit,
  duplicate messages, per-login grouping, parallel tabs, logout, and real process restart tests.
- `npm run build` produces the frontend bundle.

No changes are made to deployment configuration by this feature. Do not use a
temporary preview database or a test session stub as the deployed server.

## Ask Me Gemini configuration and boundaries

Set `GEMINI_API_KEY` in the backend's private `backend/.env` (or server environment),
and optionally `GEMINI_MODEL`. These are the same settings used by the learning tools.
Never put keys in frontend code, `VITE_*` variables, chat messages, or commits. Restart
the backend after editing configuration. API/model quotas and billing still apply.

Ask Me uses `generateContent` with a server-controlled support system instruction,
product facts, the current question, and up to ten recent messages (16,000 characters)
from that owned support session only. No names, emails, materials or study history are
explicitly attached; any personal information the user types would still be content,
so the visible notice asks them not to share sensitive data. Secret-pattern checks are
heuristics, not perfect guarantees. Gemini has no tools or permission to reset accounts,
send emails, change statuses, or access other users' records. Prompts limit it to website
support; generated text is rendered as text, never executable HTML.

There is one in-flight support generation per user in this server process, a 20-request
per-ten-minute AI limit, bounded output, and the existing Gemini timeout/retry handling.
AI errors never fall back to a fabricated answer. The user message remains saved for
human support; Retry AI reply reuses its request ID. A successfully persisted AI response
is reused on retries, avoiding duplicate messages and unnecessary model calls.

Reference: https://ai.google.dev/api/generate-content
# Account recovery intake

The public `/forgot-password` page accepts an account name and linked email, with explicit consent to share them with administrators. `POST /api/auth/recovery-request` creates an unverified recovery request. It does not query whether the account exists, change credentials, issue a token, or send email. Public responses never expose ticket IDs or account history. Requests are rate-limited by IP and persistently by email, and retried client IDs are deduplicated.

Recovery requests appear in the administrator's Support Tickets inbox under Account. Their claimed name/email are not attached to an existing user. Only administrators can read them, add internal notes, and update workflow status. Notes are not sent to applicants. Marking a request Resolved is not a password reset. Future completion requires a configured mail provider plus an expiring, single-use verification/reset flow and session revocation; no manual identity bypass is included.
