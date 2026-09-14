> Historical integration note for the original uploaded archive. This document is retained as project history and does not describe version 1.1.0. The current implementation and limits are documented in `README.md` and `docs/FOUNDATION_FIXES.md`.

# Feature Comparison and Integration Notes

This project was produced by comparing and integrating the following two
archives:

- `COMP3851A-Study-Companion-main.zip`: the public repository version
- `COMP3851A.zip`: the newer local development version

## Comparison Results

| Feature | Public repository version | Local development version | Final integration |
| --- | --- | --- | --- |
| Student and administrator pages | Available | Available, with the same main pages | Retained |
| Course and material management | Available | Available, with the same main logic | Retained |
| TXT / Markdown upload | Available | Available | Retained |
| PDF text extraction | No real parsing | Real parsing with PDF.js | Newer version adopted |
| Scanned PDF OCR | Not available | Processes up to the first 8 pages | Newer version adopted |
| DOCX / PPTX text extraction | Declared in the UI only | Reads Office XML | Newer version adopted |
| Image OCR | Not available | PNG, JPG/JPEG, WEBP, and BMP | Newer version adopted |
| Per-file size limit | 100 KB | 10 MB | Newer version adopted |
| Q&A material scope | Separate upload inside the chat component, not correctly integrated with the workspace | Uses multiple selected materials from the current course | Newer version adopted |
| Gemini invocation | Called directly inside the component | Centralised through `aiService`, with a mock fallback when no key is available | Newer version adopted |
| Upload parsing warnings | Not available | Can display OCR and parsing warnings | Newer version adopted |
| README and Git ignore rules | More complete | Less complete | Public version adopted and updated |

## Main Integration Decisions

The final version uses the local development version's source code and
dependencies as its foundation because that version adds real file extraction,
OCR, a more complete material-selection workflow, and a corrected chat
component. The more complete README and Git ignore rules from the public
repository version were also merged and updated. The integration additionally
introduced:

- `.env.example`
- `npm run check`
- This feature comparison document
- Ignore rules for `.compare`, local backups, and generated test reports

Real `.env.local` files, API keys, `node_modules`, `dist`, old backups, and
large HTML test reports are excluded from the Git repository.

## Known Prototype Limitations

- Login and permission control still use frontend demo logic rather than secure
  backend authentication.
- Frontend application data is still stored in browser `localStorage`; the
  SQLite foundation is not yet connected to the full frontend workflow.
- Summary and Quiz still use fixed demonstration content.
- OCR currently uses an English model, and its quality depends on source image
  clarity.
- Frontend `VITE_*` environment variables are included in browser builds and
  are not suitable for production secrets.
