# Completion candidate, 20 October 2026

Base: main `a3e05e227bd60bcf5cc337609ba7f88f0353ca47`.
Working branch: `codex/completion-oct20`.
This record describes local implementation and testing, not production acceptance.
Existing user edits in the primary checkout were not overwritten.

## Changes delivered locally

| Requirement | Implementation | Evidence |
| --- | --- | --- |
| Randomized full/wrong-question retakes | Each new attempt gets a new option order, stable during input. Choices retain canonical indices for server scoring. The original quiz is unchanged. A repeated permutation is rotated to avoid the immediately previous order. | Actual HistoryPage component exercises single/multiple answers, both modes, repeat attempts and original answers. Existing HTTP tests check server marking and original results. |
| Complete support search | Database search includes metadata, descriptions, student/staff replies, AI/FAQ replies and administrator-only recovery notes before pagination. UTC creation dates, status, category and queue filters work across history. | More than 200 newer records do not hide an older reply-only match. Literal wildcard characters, combined dates, mixed recovery pages, permissions and cursor/filter mismatch are tested. Local browser confirms reply-text search and inclusive dates. |
| Explicit human request | Student button, persistent Waiting/In progress/Resolved state, admin waiting queue, audit history, idempotent requests and owner checks. AI cannot clear the queue. | HTTP lifecycle, AI reply while waiting, duplicate/replayed requests, stale admin changes, real backend restart, and local student/admin browser workflow. |
| Dependency maintenance | Updated affected packages within allowed version ranges. Development restart uses Node's built-in `--watch` instead of nodemon. | Root and backend npm audits reported zero known vulnerabilities after updates. This is not a security guarantee. |

## Automated verification

`npm run check`: lint, 67 frontend tests, 48 backend tests, production build passed.
The suite includes isolated backup restoration and checksum/integrity rejection,
registration/reset with fake mail transport, Google token validation with a stub,
AI input/output contracts and provider failure simulations, ownership checks,
and real local backend restart tests.

The build still emits a non-blocking JavaScript chunk-size warning.
Tests use independent disposable databases. No paid Gemini calls, real emails,
production database edits, credential changes or production restore were performed.

## Local browser acceptance

1. Sign in as the seeded local student and open Ask Me.
2. Request human support and observe Waiting.
3. Sign in as the local administrator. Select Human support waiting queue.
4. Reply and observe In progress and removal from the waiting queue.
5. Search a phrase present only in the reply. Apply UTC creation dates.
   A future start date excludes the record; the matching date restores it.
6. Mark Resolved. The request and staff message remain in the student's history.

## Remaining production acceptance gates

These gates remain open until evidence from the release candidate is recorded.
Team reports of earlier tests are useful but do not replace final-release checks.

| Area | Required evidence before claiming 100% |
| --- | --- |
| Deployment | Review/merge the candidate, deploy the accepted revision, record commit and live health. |
| Identity and email | Real new Google user, existing password account with same email, disabled user, registration code delivery/verification and reset consumption. Existing-account handling remains explicit rejection of automatic linking; use the existing password or reset flow. |
| AI quality | Use representative actual course materials. Manually compare summary, Q&A and quiz answers with the sources. Confirm hosted quota/error responses do not create false success. |
| Hosted persistence/recovery | Back up hosted database and originals together. Restore to a separate destination, compare records/files, and test the accepted deployment across restart/redeploy. Never overwrite production for the recovery test. |
| Final delivery | Full student/admin demo, module documentation, team contribution confirmation, expected/actual results and any remaining defects. |

Owners remain the team's agreed owners: Chen Tingshu (retakes/history), Zhang Lei
(marking/quiz quality), Zhang Jiawen (admin search/queue), Zihao Liang
(student handoff/Google/email/deployment), Wang Junkai (regression/recovery).
All members review AI quality and prepare the demonstration.
