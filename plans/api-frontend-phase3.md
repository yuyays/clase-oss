# Phase 3 — Router + Editor Wiring (Detailed)

## Goal

Move the editor to API-driven routing with clean URLs and explicit creation flow.

---

## 1) Routes to Add

- `/editor/new`
  - Creates a new assessment and draft version, then navigates to `/editor/:assessmentId`.
- `/editor/:assessmentId`
  - Loads an existing assessment and its draft questions.
- Optional: keep `/editor` and redirect to `/editor/new`.

---

## 2) Data Flow

For `/editor/:assessmentId`:

- `GET /assessments/:assessmentId` (metadata)
- `GET /assessments/:assessmentId/questions` (draft version + questions)

For `/editor/new`:

- `POST /assessments` to create the assessment
- `POST /assessments/:assessmentId/versions` to create the draft version
- Initialize empty question list

---

## 3) Save Actions

- Save draft
  - `PATCH /assessments/:assessmentId`
  - `PUT /assessment-versions/:assessmentVersionId/questions`

- Save version (new draft)
  - `PATCH /assessments/:assessmentId`
  - `POST /assessments/:assessmentId/versions`
  - `PUT /assessment-versions/:newDraftVersionId/questions`

- Publish
  - `POST /assessments/:assessmentId/publish`

---

## 4) UX Requirements

- Loading state while assessment + questions are fetched.
- Disable save buttons while mutations are in flight.
- Show inline error for any failed action.
- Warn if switching assessments with unsaved changes (optional, later).

---

## 5) Routing Integration

- Library cards should link to `/editor/:assessmentId`.
- “Create assessment” should go to `/editor/new` after creation.

---

## 6) Completion Criteria

- Direct deep links to `/editor/:assessmentId` load correct data.
- New assessment flow creates and redirects correctly.
- Save actions persist assessment + questions.
- Publish updates status on the backend.
