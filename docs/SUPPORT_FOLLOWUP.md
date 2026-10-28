# Asynchronous human-support follow-up

## Behaviour

- Ask Me remains the AI website-help conversation. **Request human support** opens a form; opening it does not create a ticket.
- Submitting a category, title and problem description creates a separate `ASK-...` ticket in the human waiting queue. Reproduction steps and page/browser/device details are optional. AI chat is not automatically copied. Use a new ticket for a different issue.
- The administrator inbox defaults to waiting requests, ordered by the time human help was requested (oldest first), with stable ID ordering for ties. Selecting a status or a summary card exits the waiting-only view. Search and date filters continue to run on the server across stored records.
- Admin replies mark human requests in progress. Students can reopen a resolved issue; a new student reply on an in-progress/resolved human request also returns it to the waiting queue. Retried submissions do not duplicate tickets or reset waiting time.
- Students do not need to remain online. Saved replies remain available in ticket history. This is not live chat and there is no guaranteed response time.

## Email notifications

An SQLite trigger queues an email atomically with each new administrator reply to a regular support ticket. AI replies, student messages, status-only changes and private account-recovery notes do not queue emails. Existing replies are not backfilled.

The server processes the persistent queue at startup and every 30 seconds, up to 20 due messages per pass. A lease prevents concurrent workers from claiming the same event. Failed sends retry with increasing delays, with a maximum of five attempts. Administrators can explicitly retry failed/skipped notifications from the selected ticket. Successful sends are not reset by that action.

Only active ticket owners with a verified email or a linked Google account are emailed. Unverified or disabled accounts are skipped and the reason is shown. A reply stays saved even if email fails. The displayed `sent` state means the mail provider accepted the email, **not** proof that it reached the inbox.

Emails contain only the ticket identifier and a sign-in-required link based on the configured `PUBLIC_APP_URL`. Conversation bodies are not emailed. Opening another student's ticket still fails the server ownership check. Both password and Google sign-in preserve a valid ticket destination.

This uses the existing `MAIL_PROVIDER`, `MAIL_FROM`, `PUBLIC_APP_URL` and SMTP/Resend credentials. No new credentials are required. Keep credentials out of Git and chat. Production SQLite must remain on the existing persistent disk so queued notifications survive restart.

SMTP does not provide end-to-end idempotency: a crash after the provider accepts a message but before SQLite records that success can produce a duplicate after recovery. Resend receives a stable per-event idempotency key. Do not describe either mechanism as a delivery guarantee.

## Validation and deployment handoff

Run `npm run check` (lint, component tests, backend tests and production build). Coverage includes form validation/retry locking, queue filtering and FIFO pagination, student/admin authorization, persisted outbox restart and retry handling, verified recipient checks, failure visibility, safe email content and existing quiz/authentication/storage regression tests.

After the user pushes, merges and deploys:

1. Use a student account with a verified email to submit a new issue. Note its ticket ID; close the chat or sign out.
2. As an administrator, confirm it appears in the human queue. Submit another issue and check the older request appears first.
3. Reply to the first issue. Confirm the reply is saved and email status progresses from queued to provider accepted, or displays a failure/skip reason.
4. Check the student's actual inbox and spam folder. Open the email link while signed out, sign in with the owning account, and confirm the correct ticket opens. Repeat with a linked Google account if used.
5. Reply as the student and confirm the ticket returns to the waiting queue. Resolve and explicitly reopen the same issue. Create a separate ticket for a different problem.
6. Verify a second student cannot access the first student's ticket link. Verify recovery notes remain private and send no email.
7. Verify a queued test notification survives a backend restart. Use an isolated test environment to simulate email-service failure; confirm saved replies remain accessible and retry works after service restoration.

Local automated tests do not prove live SMTP delivery, the current Render deployment, or resolution of any separate Google OAuth origin configuration issue. Those require the online acceptance steps above.
