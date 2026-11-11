# Study Companion

Study Companion is a course-based learning website built for the COMP3851 Work Integrated Learning project. Students organise materials, generate summaries and revision activities with Google Gemini, and revisit saved work in Study History and Review Centre. Ask Me provides website help and access to administrator support.

The application uses React and Vite, an Express backend, SQLite account storage and private filesystem storage for uploaded originals. API credentials stay on the backend. The current administrator workspace manages support tickets; legacy user, material and AI-output administration pages are not routed.

## Features

| Area | Available functionality |
| --- | --- |
| Courses and materials | Create, rename and select courses; upload notes, PDF, Office and image files; inspect extracted text and available originals. |
| Summary | Generate an overview and key concepts, copy the result and inspect cited sources. |
| Q&A | Ask follow-up questions using Simple, Detailed, Example or Hint Only answers. Conversations are scoped to the account, course and selected materials. |
| Quiz | Choose question count, difficulty and single-answer, multiple-answer or mixed questions. Track unanswered questions, jump between them and inspect results. |
| Flashcards | Generate six cards, reveal answers, inspect citations and save mastery to the account. Regeneration checks previous cards for repeated text. |
| Study History | Search and filter saved work; preview records; delete and restore individual records or all records. New badges clear after a record is opened and acknowledged. |
| Review Centre | Practise wrong questions or retake a complete saved quiz. Separate practice results preserve the original score. History and Review Centre have independent read states. |
| Profile and settings | Edit a personal profile and avatar; choose English or Simplified Chinese, reading and chat sizes, and defaults for new workspaces. Display preferences are saved in the current browser. |
| Ask Me and support | Use AI help, submit a separate human-support request and review saved conversations. Administrators search, reply, manage the waiting queue and update ticket status. |

## Run locally

Use **Node.js 22.13 or newer**, npm, and a recent Chrome or Edge browser. To create a new local copy:

```sh
git clone https://github.com/strangeliang/COMP3851A.git
cd COMP3851A
npm ci
npm --prefix backend ci
```

Run the remaining commands from the repository root. Copy `backend/.env.example` to `backend/.env`. In PowerShell:

```powershell
Copy-Item backend/.env.example backend/.env
```

Edit the new private file. Minimum local configuration:

```dotenv
PORT=8000
HOST=127.0.0.1
FRONTEND_URL=http://localhost:5173
PUBLIC_APP_URL=http://localhost:5173
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
```

Set `GEMINI_API_KEY` to your own key to enable AI. Never put it in a `VITE_*` variable, frontend code or Git. Restart the backend after changing environment variables. Without a configured key, sign-in and material management remain available, while AI features report their unavailable state.

For a local demonstration with an empty database, add `STUDY_SEED_DEMO=1` before the first backend start. This creates the demonstration accounts below. Keep it disabled on public deployments. New email registration requires a configured mail provider; see [deployment](docs/DEPLOYMENT.md).

Open two terminals at the repository root:

```sh
# Terminal 1: backend
npm run backend
```

```sh
# Terminal 2: frontend
npm run dev
```

Open **http://localhost:5173** and keep both terminals running. Windows users can also run `start-demo.bat`; it installs missing dependencies and prompts for configuration when needed. If the backend port changes, update both proxy targets in `vite.config.js`.

### Local demonstration accounts

| Role | Email | Password |
| --- | --- | --- |
| Student Alex | student@example.com | student123 |
| Student Mia | mia@student.edu | student123 |
| Administrator | admin@example.com | admin123 |

These accounts are seeded only in an empty, explicitly enabled non-production database. They are not public deployment credentials. Production administrators are created with the private setup command in [deployment](docs/DEPLOYMENT.md).

## Learning workflow

1. Create or select a course and upload its materials.
2. Open an AI function and select up to three materials from that course.
3. Generate a summary, ask a question, take a quiz or generate flashcards.
4. Revisit saved results in Study History and practise quizzes in Review Centre.

Quiz supports 1–20 questions for single-answer or multiple-answer mode, and 2–20 for mixed mode. Multiple-answer questions require the exact correct selection, without partial credit. Previous is hidden on the first question and Next on the last. Submit remains disabled until every question has an answer. Cancel Quiz discards the unsubmitted attempt after confirmation and retains earlier saved work.

Flashcard mastery belongs to a specific saved set. The workspace restores the latest set for the same account and exact material selection; a new set starts unmastered. Progress changes wait for server confirmation. Regeneration compares current cards and the latest saved, undeleted set and rejects repeated front or back text. This does not guarantee that every paraphrase is semantically unique. Failed or cancelled generation retains the previous set.

Citations such as `[S1]`, `[S1, Slide 39]` and `[S1, Page 2]` open the relevant extracted source text. Available sections are highlighted; missing locations are reported without inventing a match. PDF original links include a page target only when the corresponding extracted page exists. Office originals are downloaded for viewing in a local application.

The backend validates input, output structure and source labels. Summary and Quiz can retry an invalid structured result within a shared maximum of two provider calls and a 90-second deadline. Quiz also rejects common equivalent numerical options. Requests report configuration, quota, timeout and output errors instead of substituting demonstration answers. Switching accounts or source scope cancels or discards stale results.

## Supported files and limits

Limits are defined in [shared/studyLimits.json](shared/studyLimits.json) and enforced at the relevant browser and server boundaries.

| Item | Limit |
| --- | --- |
| Files per upload / AI selection | 3 |
| Materials per course / student account | 5 / 10 |
| Original file size | 40 MiB per file |
| Extracted text per file | 100,000 characters |
| Combined source text per AI request | 100,000 characters |
| PDF | 100 pages; at most 20 pages requiring OCR |
| Office text XML actually read after decompression | 20 MiB total; unread embedded media is skipped |
| Image size for OCR | 20 million pixels |
| File-reading timeout | 3 minutes per file |
| Q&A question | 4,000 characters |

TXT and Markdown use their full text. PDF extraction runs page by page and uses optical character recognition (OCR) on pages with insufficient selectable text. DOCX and PPTX extraction reads document or slide text and retains slide markers. PNG, JPG/JPEG, WEBP and BMP use English and Simplified Chinese OCR in the browser. Legacy PPT and DOC formats are not supported.

Oversized or unreadable files are rejected rather than silently truncated. Upload batches are rolled back if saving fails; interruption between metadata and original-file requests can leave a clearly labelled text-only record. Existing records without original bytes require re-upload for original preview or download.

OCR may need an initial network download. Extraction does not guarantee interpretation of formulas, diagrams, tables, embedded images or speaker notes. Inspect extracted text and warnings, and compare important answers with the original. Warnings accompany source text sent to Gemini. Files marked as incomplete by older extraction versions need re-upload.

## Data and account boundaries

Accounts, courses, extracted text, study records, review attempts, read states, flashcard progress and support records are stored in SQLite. Original bytes are stored privately on the backend. HttpOnly sessions establish identity, and server ownership checks separate student data. Browser identity headers cannot grant access. Sessions are held in memory, so restarting the backend requires sign-in again.

Human support is asynchronous. Students can leave after submitting a request and read saved replies later. Eligible staff replies queue an email notification; provider acceptance does not prove inbox delivery. Support AI receives recent support messages without automatically attaching private study files or learning conversations.

Git synchronises code, not `backend/.env`, databases, uploaded originals or browser preferences. Each installation needs its own private configuration. Cloud deployments need persistent storage for both the database and originals, verified after restarting and redeploying. Deleting a course or material permanently removes tracked dependent learning records; history-only deletion can be undone.

## Verification

```sh
npm run check
```

This runs ESLint, frontend regression tests, backend/API/SQLite tests and a production build. Automated Gemini, mail, Google and OCR tests use controlled fixtures where appropriate and do not prove live service quality or delivery.

The **5 November 2026** verification recorded **225 frontend and 98 backend tests passing**, a successful build and zero known vulnerabilities in both dependency audits. Separate small live Gemini checks covered Summary, Q&A, Quiz, Flashcards and website support using synthetic text. See [final verification](docs/FINAL_VERIFICATION_2026-11-05.md) for scope, fixes and remaining deployment checks.

AI output validation does not establish factual correctness, universal citation accuracy or semantic uniqueness. Quizzes provide self-assessment; answers are available to the browser, so this is not an examination system with anti-cheating guarantees. The current large-bundle and test-renderer deprecation warnings do not indicate a failed build or test.

### Preview a production build locally

Keep the backend running, stop the development frontend, then run:

```sh
npm run build
npm run preview
```

Open http://localhost:5173. Development and preview use the same port and cannot run together. The backend can also serve `dist` directly after a build; this is a local preview, not evidence of a public deployment.

## Update and deploy

Save your local changes before updating an existing clone. To use the latest merged version:

```sh
git switch main
git pull --ff-only origin main
npm ci
npm --prefix backend ci
npm run check
```

An unmerged feature branch is not yet part of `main`. Restart local services after updating. Deploy the matching frontend and backend together, retain the existing private environment and persistent data, and back up the database and originals together. Schema migrations run at backend startup; do not reset the database to apply this release.

For production, follow [deployment and recovery](docs/DEPLOYMENT.md), including the actual HTTPS origin, persistent paths, mail configuration, private administrator creation and post-deployment acceptance checks. A successful local test run or GitHub push does not establish live deployment status.

## Documentation

| Current reference | Purpose |
| --- | --- |
| [Final verification](docs/FINAL_VERIFICATION_2026-11-05.md) | Final audit, test evidence, release changes and acceptance boundaries. |
| [Deployment](docs/DEPLOYMENT.md) | Build/start commands, persistent storage, environment, backup and recovery. |
| [API reference](backend/docs/API_DESIGN.md) | Active authentication, learning, history, progress and support routes. |
| [Original file storage](docs/ORIGINAL_FILE_STORAGE.md) | Private originals, access checks, cleanup and migration. |
| [Q&A history](docs/QA_HISTORY.md) | Conversation grouping, ordering and retry behaviour. |
| [Google sign-in](docs/GOOGLE_LOGIN.md) | Client setup, token verification and account-linking rules. |
| [SMTP setup](docs/SMTP_SETUP.md) | SMTP configuration for registration, recovery and support mail. |
| [Support workflow](docs/SUPPORT_TICKETS.md) | Student and administrator support flows and permissions. |
| [Support follow-up](docs/SUPPORT_FOLLOWUP.md) | Waiting queue, replies and email notification retries. |

The following are dated historical records, not current setup instructions: [original integration comparison](docs/FEATURE_COMPARISON.md), [September foundation fixes](docs/FOUNDATION_FIXES.md), [PR 9 merge notes](docs/PR9_MERGE_NOTES.md), [September meeting acceptance](docs/MEETING_23_SEP_ACCEPTANCE.md), [October 20 completion candidate](docs/COMPLETION_ACCEPTANCE_2026-10-20.md), and [October 30 release notes](docs/RELEASE_NOTES_2026-10-30.md). Their dates, test counts and release states describe those snapshots.
