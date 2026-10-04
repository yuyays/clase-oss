# Phase 4 — Upload + Parsing Flow (Detailed)

## Goal

Let teachers upload a file first, auto-create an assessment, and show parsing status until complete.

---

## 1) Upload UX

- `/upload` supports two modes:
  - **Upload-first (default):** create assessment from filename on upload.
  - **Attach to existing:** optional assessment selector for re-uploads.
- If no assessments exist, the UI still works (auto-create).

---

## 2) API Calls

- If no assessment selected:
  1. `POST /assessments` with `{ title: <filename>, description: null }`
  2. `POST /assessments/:assessmentId/assets` (multipart)
- If assessment selected:
  - `POST /assessments/:assessmentId/assets` (multipart)

---

## 3) Parsing Status (Auto Poll)

- Start polling `GET /assessments/:assessmentId/parsing-status` every 3–5s.
- Stop polling when status is `completed` or `failed`.
- Show status label, updated timestamp, and error message when present.

---

## 4) Completion UX

- Show “Open in editor” link to `/editor/:assessmentId`.
- Optionally show latest parsing metadata (duration, parser, etc.).

---

## 5) Failure Handling

- Upload errors: inline error + retry button.
- Parsing errors: show `errorMessage` from `parsing_jobs`.
- If status is 404: show “No parsing job found” (worker/queue not running).

---

## 6) Worker Assumptions

- Redis + `apps/worker` must be running for parsing jobs.
- If worker is down, upload still succeeds but parsing stays queued.

---

## 7) Completion Criteria

- Teacher can upload a file without pre-creating an assessment.
- Parsing status updates automatically until completion.
- Clicking “Open in editor” lands on `/editor/:assessmentId` with populated data.
