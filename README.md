# COMP3851A Study Companion

An AI-assisted study workspace developed for the COMP3851A group project. The
project contains a Vite + React frontend and an Express + SQLite backend
foundation.

## Features

### Student workspace

- Demo login with role-based student and administrator routes
- Course creation, selection, search, and confirmed deletion
- Multi-file upload grouped by course
- Text extraction from TXT, Markdown, PDF, DOCX, and PPTX files
- OCR for PNG, JPG/JPEG, WEBP, BMP, and scanned PDF content
- Multi-material selection for Summary, Q&A, and Quiz workflows
- Gemini-powered frontend Q&A when an API key is configured
- Safe mock Q&A fallback when Gemini is not configured
- Quiz navigation, submission, scoring, and attempt history
- Browser-local persistence for prototype data

### Administrator workspace

- Dashboard and recent activity overview
- Student and course participation views
- Uploaded-material management
- Q&A activity and AI-output review
- Demo account, status, and permission controls

### Backend foundation

- Express server on `http://localhost:8000`
- SQLite database creation and foreign key enforcement
- `users`, `courses`, and `materials` tables
- Idempotent demo seed data with bcrypt password hashes
- Live health and database status endpoints

## Requirements

- Node.js 20 or newer
- npm
- A recent Chromium-based browser for PDF, Office, and OCR processing

## Frontend Setup

Run all frontend commands from the project root.

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Optional: copy `.env.example` to `.env.local` and enter a temporary Gemini
   API key for local Q&A testing:

   ```text
   VITE_GEMINI_API_KEY=replace_with_your_own_temporary_key
   ```

3. Start the frontend:

   ```powershell
   npm run dev
   ```

4. Open the local URL printed by Vite, normally
   `http://localhost:5173`.

On Windows, `start-demo.bat` performs the frontend install/start flow
automatically.

## Backend Setup

Run all backend commands from the `backend` directory.

```powershell
cd backend
npm install
npm start
```

For development with automatic restart:

```powershell
npm run dev
```

The backend listens on `http://localhost:8000` by default.

Implemented endpoints:

```http
GET http://localhost:8000/api/health
GET http://localhost:8000/api/database/status
```

## SQLite Database

The backend automatically creates
`backend/data/study_companion.db` when it starts. It enables SQLite foreign
keys, creates the `users`, `courses`, and `materials` tables when missing, and
seeds four demo users, three courses, and three materials without creating
duplicates on later starts.

Passwords in SQLite are stored only as bcrypt hashes. The database and its
journal, WAL, and SHM runtime files are ignored by Git.

## Demo Accounts

Authentication is still frontend-only in this phase.

- Administrator: `admin@example.com` / `admin123`
- Student: `student@example.com` / `student123`

The same four demo identities are seeded into SQLite for later backend
integration, but the current login form does not call the backend.

## Current Integration Status

The frontend continues to use browser `localStorage` and is not yet fully
connected to the Express or SQLite backend.

- Summary uses mock demonstration content.
- Quiz questions and scoring use mock demonstration content.
- Q&A currently calls Gemini directly from the frontend when a temporary key is
  configured and uses a mock fallback without a key.
- Course creation, material upload, authentication, and administrator actions
  still update frontend prototype state rather than SQLite.

JWT authentication, secure backend Gemini calls, backend file uploads, full
Course and Material CRUD APIs, and complete frontend/backend integration are
planned for later phases.

## File-Processing Scope

The prototype accepts up to five files per course, ten files in total, and
10 MB per file.

- TXT and Markdown are read directly.
- PDF text is extracted with PDF.js. A scanned PDF falls back to OCR for up to
  the first eight pages.
- DOCX and PPTX text is read from their embedded XML content.
- Supported images are processed with English OCR.

Text extraction runs entirely in the browser. OCR speed and accuracy depend on
the device, source quality, and language. Large extracted documents can also
reach browser storage limits, so stored extracted text is capped for this
prototype.

## Gemini Configuration and Security

The current Q&A prototype reads `VITE_GEMINI_API_KEY` from `.env.local`.
Without a key, the application remains usable and clearly labels mock fallback
answers.

Do not commit `.env.local` or a live API key. Variables prefixed with `VITE_`
are embedded into frontend code and are visible to browser users. A production
deployment must call Gemini through a secured backend.

## Verification

From the project root, run:

```powershell
npm run check
```

This runs ESLint and creates a production frontend build.

From `backend`, start the server and query both implemented endpoints. Restart
the server to confirm that schema creation and demo seeding remain idempotent.

See [`backend/docs/API_DESIGN.md`](backend/docs/API_DESIGN.md) for implemented
and planned backend contracts, and
[`docs/FEATURE_COMPARISON.md`](docs/FEATURE_COMPARISON.md) for the archive
comparison and merge decisions used to produce this version.
