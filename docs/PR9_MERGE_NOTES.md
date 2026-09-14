# PR #9 local merge notes

Compared the user-provided `COMP3851A-main (24).zip` (74 files, identical to
main commit `02a3d5456933d3aab8ae0d4306a3b16aa30682e5`) with update commit
`08fdaa4f291f436dc268c135fdfd1089283b2b3c`.

## Resolution decisions

- Preserve the existing database ownership checks, AI contracts and edge-case tests.
- Use authenticated cookie sessions for all course/material endpoints. Do not
  restore the temporary `x-user-id` identity middleware. Adapt its isolation tests
  to verify sessions and reject spoofed headers instead.
- Preserve registration, Google sign-in, profile storage, study history and review
  tables/routes, plus private original-file storage and upload rollback handling.
- Preserve the one-time seed marker so deleted demo courses are not recreated.
- Preserve the grouped AI navigation, original-file links, and flashcard history.
- Keep Google's dependency and matching lockfile entries alongside existing
  backend dependencies and tests.
- Keep private-data ignore rules and main's removal of frontend sample passwords
  and unused mock AI output. Keep the empty backend data-directory placeholder.
- Exclude the obsolete release ZIP from Git; its local copy is retained.

## Verification

`npm run check` passed on Node v24.15.0:

- ESLint passed.
- Frontend: 36 tests passed.
- Backend: 27 tests passed, including original-file persistence across a real
  backend restart, account isolation and nonce-bound Google token handling.
- Vite production build passed (large-chunk warning remains).

Backend dependency installation reported two audit findings (one moderate, one
high). Dependency upgrades are not part of this conflict-resolution change.
Google login tests use a test verifier; a real Google account login was not tested
in this isolated directory. No personal environment files or databases were copied.

Dashboard/server-history consistency is a separate follow-up, not changed here.
This merge was prepared locally; it does not publish or deploy the website.
