# Study Companion Release Handoff: 2026-10-30

> Historical snapshot recorded on **2026-10-30** for PR #21 and commit `7178c5d`. PR status, test counts, release instructions, and limitations below reflect that date; they do not establish the current merge or deployment state. For the current application and verification results, see the [README](../README.md) and [final verification record](FINAL_VERIFICATION_2026-11-05.md).

This handoff was prepared for the team lead's review, merge, and deployment. The release covered study features, page interactions, backend APIs, and reliability fixes. It required deploying the frontend and backend together and installing the locked dependencies. Backend startup automatically upgraded the existing database without requiring accounts, courses, materials, or study records to be cleared.

## Version and merge scope

| Item | Recorded value |
| --- | --- |
| Repository | `strangeliang/COMP3851A` |
| Pull request | [PR #21: Complete study workspace improvements and reliability fixes](https://github.com/strangeliang/COMP3851A/pull/21) |
| Development branch | `codex/study-workspace-final-20261030` |
| Baseline commit | `6f1ef489758fa513a8a522d27e7c4e79c560ba9b` |
| First commit | `acfdbd0`: first-question Quiz navigation and Flashcards regeneration |
| Final code commit for this handoff | `7178c5dbfe14021fb9d35f38106443989c3e5dfc` |

As checked on **2026-10-30**, PR #21 was unmerged, and GitHub reported no merge conflicts. Approval under the repository's existing review rules was still required. [PR #20](https://github.com/strangeliang/COMP3851A/pull/20) had been closed; its changes were included in #21 and did not need a separate merge.

The changes below are relative to the baseline above. Existing Settings, profile, history deletion and undo, and retrying incorrect or all quiz questions were retained, with their integration into the updated interface and data-saving behavior improved.

## Changes included

| Area | Release changes |
| --- | --- |
| Quiz | Corrected navigation so the first question had no Previous button, the last had no Next button, and a one-question quiz showed neither. Existing question types, quantity, difficulty, and scoring rules were retained. |
| Flashcards | Retained six cards per set. Regeneration used the current cards and recent saved, undeleted cards for the same user and material combination to detect duplicates and retry when needed. Added mastered status, a remaining-review count, and filters. Successfully generating a new set reset that set's mastery state. |
| Study history and Review Centre | Records opened in a dedicated dialog where review could be completed, without repeating the entire exercise below the page. Added a prompt for reopening exercises, content search, consistent filter styling, dates, and source names. Improved handling when switching exercises, saving results, and deleting records overlapped. Original quiz scores and review scores were stored separately. |
| Dashboard and courses | Made all four statistics cards open previews and kept their counts consistent with the account's records. Course cards could also be selected through their blank areas. Added course-name and code editing, improved new-user empty states and guidance, and strengthened Continue Studying restoration of valid courses, materials, and study modes. |
| Uploads and materials | Improved information hierarchy, spacing, status, and actions on material cards. Added material search within the current course. Improved full extracted-text display, original-file preview or download, and extraction-warning display. Warnings were saved with materials and remained available after login. |
| AI study workspace | Added source previews, source links in answers, and Summary copying. Improved AI configuration status, errors, and stopping generation. Existing results were retained when regeneration failed or was cancelled. Requests from a previous account, course, or material selection could not overwrite the new workspace. |
| Ask Me and administrator support | Improved chat opening, closing, and resizing, corrected the close-button position, and improved small-screen and onscreen-keyboard layouts. English date filters used English prompts, administrator filter formats were consistent, and draft handling, retries, and duplicate-send handling were improved. |
| Branding and shared pages | Applied a consistent Study Companion icon and favicon. Added unknown-page guidance and page-error recovery, and improved keyboard focus, dialog closing, and mobile display. |
| Accounts and state handling | Fixed avatar loading and preview-resource cleanup, profile-progress display, asynchronous state during login or logout, duplicate saves, and stale material references. Strengthened server checks for material ownership, input parameters, and saved study records. |
| Dependencies and regression tests | Updated Vite, Nodemailer, and related lockfile dependencies. Added regression coverage for pages, APIs, databases, state transitions, and failure cases. |

Flashcard duplicate detection rejected repeated front text or explanation text, but did not guarantee that every paraphrase was semantically distinct. When the material could not support six new cards, generation returned an error and retained the previous set rather than substituting fixed demonstration answers.

## Pre-merge checks

The handoff required reviewing the full PR #21 diff, especially matching frontend and backend API changes and database compatibility. The candidate release was to be checked from the repository root:

```sh
npm ci
npm --prefix backend ci
npm run check
```

The release required Node.js 22.13 or later. `npm run check` included ESLint, frontend tests, backend tests, and the production build. Both the root and `backend` dependencies needed installation.

If another team member updated `main` before the merge, the integrated version needed another check. Deployment was to use the resulting merged `main` commit. A squash merge could produce a different commit ID from the development branch.

## Database and existing data

This release added the `materials.reading_notes` field and the `idx_history_owner_kind_created` index. Backend startup applied the compatible upgrade automatically and supported repeated starts without manual SQL.

`reading_notes` stored extraction or OCR warnings, with an empty-string default and a 2,000-character limit. It was not a field for handwritten study notes. The upgrade preserved existing material text but could not recreate extraction warnings that had not previously been saved.

Before deployment, the handoff required stopping backend writes and backing up the SQLite database together with the original-upload directory. The repository's backup and verification scripts are described in [Deployment: backup and recovery commands](DEPLOYMENT.md#backup--recovery-commands). Backups needed durable, non-public storage and verification before the upgrade.

Git synchronized code; it did not copy local accounts, databases, uploaded files, private environment variables, or browser preferences. At this release, Flashcard mastery marks and some temporary workspace state belonged to the current browser session and did not promise cross-device synchronization. Materials without a saved original file needed re-uploading before original-file download could be offered.

## Render deployment procedure for this release

### Confirm environment configuration

The release introduced no new required environment variables and did not require replacing the Gemini key. Existing valid configuration was to be retained, with these settings checked:

| Setting | Requirement at this release |
| --- | --- |
| Node.js | 22.13 or later |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `FRONTEND_URL`, `PUBLIC_APP_URL` | The deployed site's actual HTTPS address |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Valid server-side configuration, kept out of frontend code |
| Google login and email configuration | Existing valid service configuration for the relevant features |
| `STUDY_DATABASE_PATH` | The database on the actual mounted persistent disk |
| `STUDY_UPLOAD_PATH` | The original-file directory on persistent storage |
| `STUDY_SEED_DEMO` | Disabled in production; no public demonstration accounts |

Both storage paths needed actual persistent storage behind them. A configured path alone did not establish survival across deployments. Existing correct paths were not to be replaced with example paths or local-machine paths.

### Build and deploy

The Render service was to use the repository root as its project root and merged `main` as its deployment branch.

Build Command:

```sh
npm ci && npm --prefix backend ci && npm run build
```

Start Command:

```sh
npm run backend
```

Health Check Path:

```text
/api/health
```

Deployment was to follow backup and configuration checks. With automatic deployment enabled, these preparations needed completion before merging; otherwise, the latest merged commit could be deployed manually. The Render deployment commit needed to match the merge result, with build and startup logs reviewed.

The backend started from `backend/src/server.js` and served the built frontend. This release added course-editing endpoints and extended source data returned by study-history endpoints, so deploying only new static pages with the old backend was insufficient.

Backend restarts invalidated the in-memory login sessions in this version, requiring users to log in again. That behavior was separate from preservation of accounts and study data. If an old interface remained visible, refreshing the page and checking the deployed version formed part of verification.

## Post-deployment acceptance checks

The handoff called for a dedicated test account, course, and materials to verify these flows without deleting real user data:

- The site and `/api/health` responded correctly. Newly registered users saw their own empty state, and returning users retained their data after login.
- Courses could be created, selected, and edited. Uploaded materials exposed extracted text, supported originals could be previewed, and saved originals could be downloaded.
- Summary, Q&A, and Quiz generated through the real Gemini service. Quiz navigation was correct at the first and last question, and submitted scores were saved.
- Flashcards produced six cards. Flipping, mastery marks, and filtering worked. Successful regeneration replaced the set; failed regeneration retained it.
- Study history supported search, record dialogs, and undo after deleting test records. Review Centre supported retrying incorrect or all questions without overwriting the original score.
- Students could request help through Ask Me. Administrators could view, reply, and update status, and students could see the updates. Email notifications required checking both delivery status and the actual inbox.
- Student accounts could not access one another's courses, materials, or study records. Ordinary students could not enter the administrator workspace.
- Main workflows remained usable at phone widths, with Ask Me, dialogs, and inputs within the visible area.
- After a controlled backend restart and redeployment, accounts, original files, history, and support tickets remained available after login, confirming the deployment's storage configuration.

## Local validation completed on 2026-10-30

These results were recorded for commit `7178c5d`:

| Check | Recorded result |
| --- | --- |
| ESLint | Passed |
| Frontend regression tests | 197 passed, 0 failed |
| Backend API and database tests | 82 passed, 0 failed |
| Production build | Passed |
| Frontend and backend dependency audits | Zero known vulnerabilities in both audits at that time |
| Browser checks in an isolated environment | Covered uploads and original-file access, AI study flows, Flashcards, history and review, Settings and profile, account isolation, administrator support, and a 390px viewport |

Automated tests and the browser checks used simulated AI and email responses. Real Gemini calls, actual email delivery, Render configuration, and deployed data persistence still required the post-deployment acceptance checks above. Passing local checks did not establish that GitHub CI or a live deployment had passed.

The build still reported a large JavaScript chunk, and tests reported the `react-test-renderer` deprecation warning. Neither caused the recorded checks to fail.

## Troubleshooting and rollback guidance

For missing endpoints, failed course editing, or unloaded data, the handoff advised first checking that frontend and backend belonged to the same release and that the backend had restarted. AI failures required checking server configuration, model access, and quota. Real keys were to remain outside the webpage, and errors were not to be concealed with fixed answers.

Rollback required restoring the frontend and backend together to the previous verified version, installing its dependencies, and rebuilding. The database additions were a field and an index, so rollback did not require deleting them; compatibility between the older application and current data still needed checking. If database restoration was necessary, current data was to be preserved first and the backup restored into a separate directory for validation. Records created after the backup would not automatically exist in it.

See [Deployment](DEPLOYMENT.md) for full deployment parameters and backup operations, and the [README](../README.md) for local setup. The [final verification record](FINAL_VERIFICATION_2026-11-05.md) documents the later local validation snapshot.
