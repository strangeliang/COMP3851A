# COMP3851A Study Companion

An AI-assisted study workspace developed for the COMP3851A group project. The
application provides separate student and administrator experiences and runs as
a Vite + React single-page application.

## Features

### Student workspace

- Demo login with role-based student and administrator routes
- Course creation, selection, search, and deletion
- Multi-file upload grouped by course
- Text extraction from TXT, Markdown, PDF, DOCX, and PPTX files
- OCR for PNG, JPG/JPEG, WEBP, BMP, and scanned PDF content
- Multi-material selection for Summary, Q&A, and Quiz workflows
- Gemini-powered Q&A when an API key is configured
- Safe mock Q&A fallback when Gemini is not configured
- Quiz navigation, submission, scoring, and attempt history
- Browser-local persistence for prototype data

### Administrator workspace

- Dashboard and recent activity overview
- Student and course participation views
- Uploaded-material management
- Q&A activity and AI-output review
- Demo account, status, and permission controls

## Requirements

- Node.js 20 or newer
- A recent Chromium-based browser for PDF, Office, and OCR processing

## Quick start

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Optional: copy `.env.example` to `.env.local` and enter a Gemini API key.

   ```text
   VITE_GEMINI_API_KEY=replace_with_your_own_temporary_key
   ```

3. Start the development server:

   ```powershell
   npm run dev
   ```

4. Open the local URL printed by Vite, normally
   `http://localhost:5173`.

On Windows, `start-demo.bat` performs the install/start flow automatically.

## Demo accounts

Authentication is frontend-only in this prototype.

- Administrator: `admin@example.com` / `admin123`
- Student: `student@example.com` / `student123`

## File-processing scope

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

## Gemini configuration and security

The Q&A feature reads `VITE_GEMINI_API_KEY` from `.env.local`. Without a key,
the application remains usable and clearly labels mock fallback answers.

Do not commit `.env.local` or a live API key. Variables prefixed with `VITE_`
are embedded into frontend code and are visible to browser users. A production
deployment should call Gemini through a secured backend instead.

## Verification

Run the complete local check before submitting changes:

```powershell
npm run check
```

This runs ESLint and creates a production build.

## Project status

This is a frontend prototype. Application data is stored in the browser rather
than in a production database, authentication is mocked, summaries and quizzes
use demo content, and administrator actions affect local prototype state only.

See [`docs/FEATURE_COMPARISON.md`](docs/FEATURE_COMPARISON.md) for the archive
comparison and merge decisions used to produce this version.
