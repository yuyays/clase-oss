# API Transition Plan (Editor + Library)

## Scope

Move `/editor` and `/` (library) from local JSON fixtures to the local API (no auth).
Remove fixture-based data loading once API path is confirmed stable.

## Base URL

- API base: http://localhost:3001
- Web runs on Vite dev server (5173)

## Decision: Save Version vs Publish

- Save Draft: keep working in a draft version.
- Save Version: create a new draft version (do not publish automatically).
- Publish: explicit action that calls the publish endpoint.

---

## Phase 1 — Backend Readiness (no code changes unless missing endpoints)

Goal: Verify API supports editor needs with stable contracts.

1. Endpoints to use
   - GET /assessments
   - GET /assessments/:assessmentId
   - POST /assessments
   - PATCH /assessments/:assessmentId
   - GET /assessments/:assessmentId/questions
   - POST /assessments/:assessmentId/versions
   - PUT /assessment-versions/:assessmentVersionId/questions
   - POST /assessments/:assessmentId/publish

2. Confirm response shapes
   - GET /assessments/:assessmentId => includes latestDraftVersionId
   - GET /assessments/:assessmentId/questions => { assessmentVersion, questions }

3. Add missing bits if needed
   - If any responses are missing fields needed by editor, adjust API contract.

---

## Phase 2 — Web API Client + Query Layer

Goal: Add a thin API client and TanStack Query hooks.

1. Add environment
   - apps/web/.env: VITE_API_BASE_URL=http://localhost:3001

2. API client
   - Fetch wrapper with JSON parsing and consistent error shape.
   - File: apps/web/src/lib/api-client.ts

3. Query hooks
   - useAssessments (list)
   - useAssessment(assessmentId)
   - useDraftQuestions(assessmentId)
   - useCreateAssessment
   - useUpdateAssessment
   - useCreateDraftVersion
   - useReplaceDraftQuestions
   - usePublishAssessment
   - File: apps/web/src/lib/assessment-api.ts

---

## Phase 3 — Router + Editor Wiring

Goal: Swap editor to API-driven data, remove fixtures.

1. Routes
   - /editor/new => create assessment + draft version, then go to /editor/:id
   - /editor/:assessmentId => load assessment + draft questions
   - Optional: /editor redirects to /editor/new

2. Editor screen flow
   - On load: fetch assessment + questions; hydrate editor state.
   - Save draft: PATCH assessment + PUT draft questions.
   - Save version: POST /assessments/:id/versions then PUT questions for new draft.
   - Publish: POST /assessments/:id/publish.
   - Show loading/error states.
   - Remove local JSON import/selection/export.

---

## Phase 4 — Library Wiring

Goal: Show API list of assessments on `/`.

1. Replace placeholder cards with API data
   - GET /assessments
   - Show title, subject/grade, latest draft status
   - Link to /editor/:assessmentId

---

## Phase 5 — Cleanup

Goal: remove fixture-driven preview.

1. Remove fixture JSON loading
2. Remove Vite fs allow for fixtures if no longer needed
3. Keep offline fixtures in repo only if needed for testing

---

## Open Questions

- Confirm expected question payload shape for PUT /assessment-versions/:id/questions
- Confirm how to label status in UI (draft vs published)
