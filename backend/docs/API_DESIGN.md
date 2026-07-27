# Backend API Design

## 1. Overview

This document records both the implemented backend foundation and the planned
API contracts for the AI-Powered Study Companion.

Base API path:

```text
/api
```

The current implementation provides system health, SQLite schema
initialisation, idempotent demo data seeding, and database status reporting.
Authentication, Course and Material CRUD, backend file processing, and backend
AI workflows remain planned.

## 2. Implemented Endpoints

Only the endpoints in this section are currently implemented.

| Module | Method | Endpoint | Purpose | Access |
| --- | --- | --- | --- | --- |
| System | GET | `/api/health` | Check whether the Express server is running | Public |
| System | GET | `/api/database/status` | Query SQLite table availability and record counts | Public during local development |

### Health Check

```http
GET /api/health
```

Example response:

```json
{
  "status": "ok",
  "message": "Backend is running"
}
```

### Database Status

```http
GET /api/database/status
```

The route performs live SQLite queries. It does not return passwords or
password hashes.

Example response after the demo seed has been applied:

```json
{
  "status": "ok",
  "database": "connected",
  "tablesCreated": true,
  "counts": {
    "users": 4,
    "courses": 3,
    "materials": 3
  }
}
```

## 3. Implemented Database Foundation

SQLite foreign key enforcement is enabled when the backend starts. Schema
creation uses `CREATE TABLE IF NOT EXISTS`, and seed insertion is idempotent.

### `users`

- Primary key: `id`
- Case-insensitive unique email: `email`
- Hashed password only: `password_hash`
- Role values: `Student`, `Admin`
- Status values: `Active`, `Disabled`
- Audit timestamps: `created_at`, `updated_at`

### `courses`

- Primary key: `id`
- Owner relationship: `owner_id` references `users.id`
- Course identity: `code`, `name`
- A course code is unique per owner
- Audit timestamps: `created_at`, `updated_at`

### `materials`

- Primary key: `id`
- Course relationship: `course_id` references `courses.id`
- Owner relationship: `owner_id` references `users.id`
- Material metadata: `name`, `type`, `size_bytes`, `status`
- Extracted demo text: `content`
- Audit timestamps: `created_at`, `updated_at`
- Deleting a course cascades to its related materials

## 4. Planned Endpoints

The endpoints below are contracts for later phases. They are not implemented
and must not be treated as available backend functionality.

| Module | Method | Endpoint | Purpose | Planned access |
| --- | --- | --- | --- | --- |
| Authentication | POST | `/api/auth/login` | Log in and receive an access token | Public |
| Authentication | GET | `/api/auth/me` | Get the current user | Logged-in user |
| Courses | GET | `/api/courses` | Get the current user's courses | Student |
| Courses | POST | `/api/courses` | Create a course | Student |
| Courses | GET | `/api/courses/{course_id}` | Get one course | Owner or Admin |
| Courses | PATCH | `/api/courses/{course_id}` | Update a course | Owner |
| Courses | DELETE | `/api/courses/{course_id}` | Delete a course | Owner |
| Materials | GET | `/api/courses/{course_id}/materials` | Get materials in a course | Owner or Admin |
| Materials | POST | `/api/courses/{course_id}/materials` | Upload a material | Owner |
| Materials | GET | `/api/materials/{material_id}` | Get material information and parsing status | Owner or Admin |
| Materials | DELETE | `/api/materials/{material_id}` | Delete a material | Owner |
| AI | POST | `/api/ai/requests` | Create a Summary, Q&A, or Quiz request | Student |
| AI | GET | `/api/ai/requests/{request_id}` | Get an AI request result and status | Request owner |
| Chat | POST | `/api/courses/{course_id}/chat-sessions` | Create a chat session | Student |
| Chat | GET | `/api/chat-sessions/{session_id}/messages` | Get chat messages | Session owner |
| Quiz | POST | `/api/quiz-attempts` | Submit quiz answers | Student |
| Activity | GET | `/api/activity-logs` | Get personal learning activities | Student |
| Admin | GET | `/api/admin/statistics` | Get system statistics | Admin |
| Admin | GET | `/api/admin/activity-logs` | Get system activity records | Admin |

## 5. Planned Login Contract

This section is a planned contract, not an implemented route. The current
frontend still performs demo login locally.

### Request

```http
POST /api/auth/login
Content-Type: application/json
```

```json
{
  "email": "student@example.com",
  "password": "student123"
}
```

### Planned Successful Response

```json
{
  "access_token": "example-jwt-token",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "name": "Alex Chen",
    "email": "student@example.com",
    "role": "Student",
    "status": "Active"
  }
}
```

### Planned Failed Response

```json
{
  "detail": "Invalid email or password"
}
```

When authentication is implemented, protected requests will include:

```http
Authorization: Bearer example-jwt-token
```

## 6. Planned Course Creation Contract

```http
POST /api/courses
```

```json
{
  "code": "COMP3851",
  "name": "Industry Project"
}
```

Planned response:

```json
{
  "id": "comp3851",
  "owner_id": 1,
  "code": "COMP3851",
  "name": "Industry Project",
  "created_at": "2026-07-27T10:30:00Z"
}
```

## 7. Planned Material and AI Contracts

Material uploads will use `multipart/form-data`:

```http
POST /api/courses/inft3050/materials
Content-Type: multipart/form-data
```

Planned material processing states are `Pending`, `Processing`, `Ready`, and
`Failed`.

Summary, Q&A, and Quiz are planned to use a shared request endpoint:

```http
POST /api/ai/requests
```

Example planned Q&A request:

```json
{
  "course_id": "inft3050",
  "request_type": "qa",
  "material_ids": [1, 2],
  "chat_session_id": 4,
  "prompt_text": "What is the main topic of these materials?"
}
```

The `material_ids` array allows one AI request to use multiple materials from
the same course.

## 8. HTTP Status Codes

| Status | Meaning | Example |
| --- | --- | --- |
| `200 OK` | A request completed successfully | Health or database status |
| `201 Created` | A resource was created | Planned course creation |
| `202 Accepted` | A request was accepted for processing | Planned AI request |
| `400 Bad Request` | Request data is invalid | Unsupported file type |
| `401 Unauthorized` | Login is required or invalid | Invalid access token |
| `403 Forbidden` | The user lacks permission | Student accesses an Admin API |
| `404 Not Found` | The resource does not exist | Course not found |
| `409 Conflict` | Data conflicts with an existing resource | Duplicate course code |
| `500 Internal Server Error` | An unexpected server error occurred | Application failure |
| `503 Service Unavailable` | A required service is unavailable | Database status query fails |

## 9. Validation and Security Rules

- User emails must be unique and matched case-insensitively.
- Passwords must be stored only as password hashes.
- Students must not access another student's courses or materials.
- Every selected material must belong to the specified course.
- Uploaded files must be checked for type and size.
- A production Gemini key must be stored on the backend, not in browser code.
- Quiz scores must be calculated by the backend when that workflow is
  implemented.
- Correct quiz answers must not be exposed before submission.

## 10. Current Phase Boundary

The completed backend scope is limited to:

- Express server structure
- SQLite connection and automatic database file creation
- `users`, `courses`, and `materials` schema
- Password-hashed, idempotent demo seed data
- `GET /api/health`
- `GET /api/database/status`

JWT authentication, full frontend integration, backend uploads, Course and
Material CRUD APIs, real Summary and Quiz AI, and the remaining planned
endpoints belong to later phases.
