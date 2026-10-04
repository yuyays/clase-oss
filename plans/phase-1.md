# Phase 1 — Teacher Workflow (Sprint 1)

## Goal

Deliver the teacher-only workflow: Library → Upload → Parse → Edit → Preview → Save.
No auth, classes, students, publishing, or grading in this phase.

## Scope

- Upload and parse past tests (DOCX/PDF/images)
- Manual test creation + paste flow
- Question editor + versioning
- Student preview (read-only)
- OCR and parsing pipeline (Vision + heuristics)

## Checklist

### Data + storage

- [ ] Drizzle schema for Test/TestVersion/Question/AssetFile/ParsingJob/AuditLog
- [ ] Migrations and seed script
- [ ] Supabase Storage integration (upload + signed URLs)

### Parsing pipeline

- [ ] Parsing job enqueue from API
- [ ] Worker consumes parsing job
- [ ] DOCX -> `mammoth`
- [ ] PDF -> `pdf-parse` + OCR fallback
- [ ] Images -> Vision OCR
- [ ] Heuristic segmentation into draft questions

### API endpoints (Phase 1)

- [ ] `POST /tests` (create draft)
- [ ] `GET /tests`
- [ ] `GET /tests/:id`
- [ ] `POST /tests/:id/assets` (upload)
- [ ] `GET /tests/:id/parsing-status`
- [ ] `GET /tests/:id/questions`
- [ ] `PATCH /questions/:id`
- [ ] `POST /tests/:id/versions` (save version)

### Frontend workflow

- [ ] Library list + Create Test CTA
- [ ] Create Test entry (upload + paste + start blank)
- [ ] Parsing status screen
- [ ] Editor (two-column list + editor)
- [ ] CRUD questions + reorder + points
- [ ] Student preview toggle
- [ ] Save draft + Save version

## PR breakdown

### PR1 — DB schema + migrations

- Drizzle models + migrations
- Seed script for demo tests

### PR2 — Upload + Storage

- Supabase Storage upload
- Create ParsingJob record
- AssetFile records

### PR3 — Parsing worker

- BullMQ job consume
- OCR + parsing pipeline
- Update ParsingJob status + draft questions

### PR4 — Teacher API

- Tests CRUD + versioning endpoints
- Questions CRUD
- Parsing status endpoint

### PR5 — Frontend wiring

- Replace placeholders with API calls
- Editor state + save flows
- Preview toggle

## Acceptance criteria

- Teacher can upload or paste test files
- Parsing creates draft questions
- Teacher can edit, reorder, and save versions
- Teacher can preview student view
- Library shows saved drafts
