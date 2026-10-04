# Phase 1 — Backend Readiness (Detailed)

## Goal

Lock down API contracts and architecture rules so the web app can consume the API safely.

---

## 1) Architecture Rules (Layered)

- Routes = HTTP only (validate input, call service, map response).
- Services = business logic + orchestration.
- Repositories = DB queries only (optional now; introduce when queries spread).
- lib/ = shared infra (upload, storage, queue, supabase).
- Keep "no domain folder" (per current preference).

---

## 2) API Contract Checklist

Document request/response shapes (ideally with Zod in `packages/shared`).

- GET /assessments
  - Response: list items with `latestDraftVersionId`.
- GET /assessments/:assessmentId
  - Response: full assessment + `latestDraftVersionId`.
- POST /assessments
  - Body: assessment fields.
  - Response: created assessment.
- PATCH /assessments/:assessmentId
  - Body: partial assessment fields.
  - Response: updated assessment.
- GET /assessments/:assessmentId/questions
  - Response: `{ assessmentVersion, questions }`.
- POST /assessments/:assessmentId/versions
  - Response: newly created draft version.
- PUT /assessment-versions/:assessmentVersionId/questions
  - Body: array of questions.
  - Response: `{ assessmentVersion, questions }`.
- POST /assessments/:assessmentId/publish
  - Response: published version or error.

---

## 3) Question Payload Rules

- Required: `type`, `prompt`, `orderIndex`.
- `choices` required for `multiple_choice` / `true_false`, otherwise null.
- `correctAnswer` object always present (label/text nullable).
- `points` nullable (integer).
- `orderIndex` 1-based and sequential (integer).
- Do not persist `sourceText` or `confidence` (not in DB schema).

---

## 4) Error and Status Conventions

- 400 for missing path params.
- 404 for missing assessment/version.
- 409 for state conflicts (e.g., version not draft).
- 422 for validation (Zod) errors.
- Standard error shape: `{ error: string | { ... } }`.

---

## 5) Service Responsibilities to Confirm

- `getAssessmentById` returns `latestDraftVersionId`.
- `getDraftQuestions` returns `{ assessmentVersion, questions }` even if empty.
- `replaceDraftQuestions` clears when input is empty.

---

## 6) Manual Contract Checks

Run a basic flow to verify end-to-end:

1. Create assessment.
2. Create draft version.
3. PUT questions.
4. GET questions and confirm `assessmentVersion` matches.
5. PATCH assessment and confirm `latestDraftVersionId` remains stable.
6. Publish draft; confirm 409 when no draft exists.

---

## 7) Sample Payloads (Request/Response)

Use these as contract references (align to DB fields):

- POST /assessments (request)
  - title, description, assessmentCategory, customCategoryLabel, subject, grade
- GET /assessments/:assessmentId (response)
  - assessment fields + latestDraftVersionId
- GET /assessments/:assessmentId/questions (response)
  - assessmentVersion object + questions[]
- PUT /assessment-versions/:assessmentVersionId/questions (request)
  - questions[] with type, prompt, choices?, correctAnswer, points?, orderIndex

---

## 8) Save Version Decision

- Save draft: keep editing current draft.
- Save version: create new draft version (no publish).
- Publish: explicit action calling publish endpoint.

---

## 9) Schema Alignment Notes

- Keep API request/response aligned to DB columns to avoid silent drops.
- If new fields are required later, add a migration before updating contracts.
