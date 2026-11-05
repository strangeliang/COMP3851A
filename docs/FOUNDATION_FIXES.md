# Foundation Fixes: Version 1.1.0

> Historical snapshot recorded on **2026-09-01** for the uploaded `COMP3851A-main.zip`. The scope, test counts, and limitations below describe that version and validation environment. For the current application and verification results, see the [README](../README.md) and [final verification record](FINAL_VERIFICATION_2026-11-05.md).

This work focused on the main student workflows. A byte-for-byte comparison confirmed that the five administrator pages, administrator layout, and administrator sidebar (seven source files in total) were unchanged. Changes to shared authentication and state handling also added server validation to administrator login; administrator management operations were outside this phase's server-side implementation scope.

## Fixes included

| Previous issue | Behavior introduced in this version | Key files |
| --- | --- | --- |
| Summary and Quiz returned fixed demonstration data. | Both used the backend Gemini service, alongside Q&A, with the defined generation prompts. | `src/services/aiService.js`, `backend/src/services/studyContracts.js` |
| The API key was read by Vite or the browser. | Only the backend read the key; the browser called this application's `/api` routes. | `backend/src/services/geminiService.js` |
| Login trusted cached frontend state. | SQLite and bcrypt validated credentials on the server, with HttpOnly sessions. Cached state could not establish an authenticated identity. | `backend/src/routes/studyRoutes.js`, `src/state/AppDataContext.jsx` |
| Chat messages rendered as HTML by default. | User and model messages used the chat library's plain-text mode. | `src/components/AIChatBox.jsx` |
| Material was cut to its first 13,000 characters, with separate truncation for multiple files. | The complete selected text was sent after limit checks: up to three files and 100,000 characters in total per request. | `shared/studyLimits.json`, `backend/src/services/studyContracts.js` |
| A mixed PDF skipped scanned pages whenever any text was found. | Each page independently used direct text extraction or OCR, retaining page numbers. Empty recognition results did not fail the entire document. | `src/utils/fileTextExtractor.js` |
| OCR supported only English and the first eight pages. | OCR supported English and Simplified Chinese, with a maximum of 20 pages requiring OCR. Larger inputs were explicitly rejected with a request to split the document. | `src/utils/fileTextExtractor.js` |
| Errors, timeouts, or truncated outputs could appear successful or leave requests waiting indefinitely. | Requests gained time limits, cancellation, at most one retry for a transient failure, and completion-state and output-structure validation. | `src/hooks/useAIRequest.js`, `backend/src/services/geminiService.js` |
| A response from previously selected material could enter a new session. | Request scope included the user, course, and every selected file; stale responses were cancelled or discarded. | `src/utils/studyScope.js`, `src/hooks/useAIRequest.js` |
| Returning to chat did not restore messages, and follow-up requests lacked conversation context. | Chat restored the history for the matching scope and sent up to 10 recent messages within a 32,000-character limit. | `src/components/AIChatBox.jsx` |
| Consecutive uploads could bypass the total file limit. | A synchronously acquired upload lock and quota checks before and after processing protected the batch, which was committed together. | `src/state/AppDataContext.jsx` |
| An upload could commit after an account change or storage failure. | Account changes cancelled earlier work; storage failures rolled back the upload batch and displayed an explicit error. | `src/state/AppDataContext.jsx` |
| Quiz scores from different students were combined. | Records and average scores were filtered by user. | `src/state/AppDataContext.jsx` |
| Deleting a non-first file in a multi-file selection left dependent records behind. | Deletion checked all files referenced by each record and removed records dependent on the deleted file. | `src/state/AppDataContext.jsx` |
| Password recovery implied that an email had been sent. | The page stated that automatic password reset was not yet available in that version. | `src/pages/ForgotPasswordPage.jsx` |
| The startup script launched only the frontend. | The script installed missing frontend and backend dependencies, launched both services, and supplied an empty backend configuration template. | `start-demo.bat`, `README.md` |

## Validation completed on 2026-09-01

| Check | Recorded result |
| --- | --- |
| ESLint | Passed |
| Student UI, state, and extraction regression tests | 20 passed, 0 failed |
| Backend contract, API, and SQLite regression tests | 20 passed, 0 failed |
| Vite production build | Passed |
| HTTP integration with real Express, SQLite, and the Vite development proxy | Health check, login, explicit error for unconfigured AI, deep-page routes, and logout passed |
| Vite build-preview proxy and Express serving the production build directly | The same HTTP integration checks passed |
| Production JavaScript inspection | No direct Gemini request URL or frontend Gemini-key read path found |
| Package manifests and lockfiles | Frontend and backend versions and dependencies were consistent |
| Administrator source comparison | All seven files identified above were unchanged |

The tests were included in the package and could be run from the repository root with `npm run check`. Coverage included stale-response isolation, history restoration, HTML escaping, concurrent uploads, logout cancellation, storage failures, per-user statistics, dependent-record deletion, Summary and Quiz flows from page events to API calls, complete text retention, Office archive limits, mixed-PDF page handling, OCR initialization timeouts, input and output validation, server authentication, bounded retries, cancellation, and repeated database initialization.

## Validation limits at that date

The Gemini network layer used simulated responses. No real API keys, user materials, or paid quota were used. These tests verified request flow and boundary handling; they did not establish real Gemini answer accuracy, citation quality, or latency.

Component-state tests ran the real React and application code with a lightweight substitute for the chat widget that depended on browser layout. A separate HTML-safety test statically rendered the actual chat library. PDF/OCR page decisions used controlled PDF pages and OCR results; TXT extraction and Office archive processing ran directly. These checks were not real-browser end-to-end tests or OCR accuracy tests. An interactive browser capable of accessing the application was unavailable in that environment, so visual behavior and real-browser interaction remained unverified for this snapshot.

Validation ran on Linux with Node.js 24. The SQLite installer encountered a file-ownership attribute restriction in the workspace, so tests used the prebuilt module from the official installation cache for the same version. Dependency versions were not changed to work around that restriction. The Windows startup script received static review but had not been run on a Windows machine during this validation. Dependency installation and OCR language-model downloads required network access.

The build reported a main JavaScript chunk above 500 kB. It still passed, with initial-load optimization remaining open. The `react-test-renderer` deprecation warning came from a development test dependency and did not affect production runtime logic.

## Scope retained in version 1.1.0

At this phase, courses, extracted material text, and study records remained in the current browser rather than a complete server database workflow. Filtering browser-cached data by user did not provide multi-user storage isolation. Administrator management operations, full account management, cross-device synchronization, and production deployment remained future work at that date. Quizzes were local practice exercises and offered no exam anti-cheating guarantees.

PDF, Office, and OCR processing extracted text; it did not guarantee correct interpretation of images, formulas, tables, or charts. The application displayed extraction warnings and passed them to the model. Uncertain content still needed comparison with the original document.

The proposed next validation used a small set of course materials with known answers, covering questions about the end of a document, questions across files, scanned Chinese pages, information absent from the materials, and pages containing formulas. Answers would be checked against their sources before changing the model, prompts, or extraction process. This phase did not introduce a retrieval database, routing between multiple models, or tools that executed actions automatically.
