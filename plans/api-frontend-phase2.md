# Phase 2 — Web API Client + Query Layer (Detailed)

## Goal

Introduce a minimal API client and React Query hooks so the web app can consume the local API.

---

## 1) Environment Setup

- Add `apps/web/.env` with `VITE_API_BASE_URL=http://localhost:3001`.
- Keep a single source of truth for base URL (no hardcoding in components).

---

## 2) API Client (Fetch Wrapper)

Create `apps/web/src/lib/api-client.ts`:

- `apiFetch<T>(path, options)`
  - Prepends `VITE_API_BASE_URL`.
  - Sets `Content-Type: application/json` for JSON requests.
  - Parses JSON response or throws a normalized error.

Error shape recommendation:

```
type ApiError = {
  status: number;
  message: string;
  details?: unknown;
};
```

---

## 3) API Hook Layer

Create `apps/web/src/lib/assessment-api.ts` with React Query hooks:

- `useAssessments(params)`
  - GET `/assessments`
- `useAssessment(assessmentId)`
  - GET `/assessments/:assessmentId`
- `useDraftQuestions(assessmentId)`
  - GET `/assessments/:assessmentId/questions`
- `useCreateAssessment()`
  - POST `/assessments`
- `useUpdateAssessment()`
  - PATCH `/assessments/:assessmentId`
- `useCreateDraftVersion()`
  - POST `/assessments/:assessmentId/versions`
- `useReplaceDraftQuestions()`
  - PUT `/assessment-versions/:assessmentVersionId/questions`
- `usePublishAssessment()`
  - POST `/assessments/:assessmentId/publish`

Each hook should:

- Use a stable query key (e.g., `['assessment', assessmentId]`).
- Invalidate related queries on mutation success.
- Return typed data based on shared API schemas.

---

## 4) Shared Types & Validation

- Prefer importing shared payload schemas from `@clase/shared`.
- Use inferred types from schemas in hooks to ensure request payloads match API contract.

---

## 5) UX Considerations

- Global loading states for editor pages while data loads.
- Inline error display for failed mutations.
- Disable save buttons while a mutation is in flight.

---

## 6) Minimal Integration Targets

Phase 2 is complete when:

- `useAssessments` powers the Library page.
- `useAssessment` + `useDraftQuestions` powers the Editor page.
- Save actions call API mutations (draft + publish).

---

## 7) Notes

- No auth yet: use open endpoints with local base URL.
- Keep API client small; avoid a full SDK until needed.
