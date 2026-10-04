# Clase MVP — Summary + Phased Task List (for Codex / Engineering)

Reference: UI workflow in `plans/ui-workflow.md`.

## 0) One-paragraph product summary

Clase is a teacher-first LMS for Japanese K–12 (Japanese, Math, English, Social Studies/History, Science) that reduces time spent creating and grading assessments. Teachers upload past tests (DOCX/PDF/images), the system extracts questions into an editable digital format, supports publishing to classes, auto-grades objective items, supports inline written answers, and stores everything in a reusable school library. Optional (later) feature: generate similar, level-appropriate practice questions based on student performance—always teacher-reviewed. Key UX principle: “1 screen = 1 task” and a single-path workflow: Library → Upload → Auto-generate → Edit → Publish → Results → Library.

---

## 1) MVP Scope (what we ship first)

### Must-have

- Teacher auth + RBAC (teacher/admin/student) [Sprint 2]
- Classes + roster (basic) [Sprint 2]
- Test Library (teacher hub)
- Upload past test files (PDF/DOCX/images)
- Parse/extract questions to structured format (MCQ/Yes-No/Written)
- Generated Test Editor (teacher review + edit + reorder + points)
- Manual test creation + paste (first-class flow)
- Publish settings (classes, schedule, time limit) [Sprint 2]
- Student test-taking (objective + inline written answers) [Sprint 2]
- Auto-grading for objective questions [Sprint 2]
- Results dashboard (class summary + per-student table) [Sprint 2]
- Manual grading workflow for written questions + feedback [Sprint 2]
- Audit logs for generation/parsing + versioning for tests

### Explicitly not in MVP (Phase 2+)

- Fully personalized exams without teacher review
- High-stakes autonomous grading
- Full IRT/CAT adaptive testing
- Cross-school marketplace sharing (limit to “within school”; duplicate-only sharing)

---

## 2) System architecture (high-level)

- Web Client (Teacher/Student) → API (Express + Zod)
- Core Services:
  - Exam/Test Service
  - Question Bank / Library Service
  - Class/Roster Service
  - Submissions/Results/Grading Service
- Orchestration / Heavy-lifting Layer (async jobs):
  - OCR/Parsing pipeline (BullMQ + Redis)
  - Optional LLM classification / generation pipeline
  - Validation + audit trail
- Storage:
  - Postgres (core data)
  - Object storage (Supabase Storage) for PDFs/images/submissions
- Queue:
  - BullMQ + Redis for async parsing/grading tasks
- Deployment:
  - Frontend: Vercel
  - API + workers + Redis: Railway
  - DB + Storage: Supabase

---

## 3) AI/Orchestration design (MVP-safe)

Principle: LLM is a tool called only via orchestration. Deterministic rules + validation + teacher review.

### Pipelines

1. Import Pipeline (file → structured questions)

- OCR (images/scanned PDFs): Google Cloud Vision (fallback only if PDF text extraction is empty)
- Text extraction: DOCX via `mammoth`, PDF via `pdf-parse`
- Structure detection: heuristics + optional small LLM classifier (Phase 2)
- Output: normalized question JSON with type/difficulty/topic tags
- Question editor: TipTap rich text

2. Optional Similar-Question Generation (Phase 2+)

- Inputs: original question + constraints (topic/type/difficulty/grade)
- Model: strong generator (GPT-4.1 / Claude Sonnet)
- Output: candidates (JSON only)
- Validation: solver/rules + similarity checks
- Teacher must approve before publish

3. Grading Assistance (Phase 1 for objective; Phase 2 for written)

- Objective: rule-based auto-grade
- Written/short answer: rubric assist (LLM mini) + teacher finalization

### Model mapping (suggested)

- OCR: Google Cloud Vision (no LLM)
- Classification: GPT-4.1 mini / Claude Haiku (temp 0, schema)
- Generation (Phase 2): GPT-4.1 / Claude Sonnet (temp 0.2–0.4, schema)
- Feedback writing: GPT-4.1 mini (temp low)
- Validation: non-LLM solvers/rules whenever possible

---

## 4) Phased implementation plan (big tasks per phase)

## Phase 0 — Foundations (1–2 weeks)

**Goal:** repo scaffolding + core tooling + parsing pipeline + editor without auth.

- Monorepo setup (apps/web, apps/api, apps/worker, packages/shared)
- Tooling baseline:
  - TypeScript, ESLint, Prettier
  - Root scripts + env config (.env.example)
  - Logging: pino + pino-http
- Stack:
  - Backend: Express + TypeScript + Drizzle + Zod
  - DB: Postgres (Supabase)
  - Storage: Supabase Storage
  - Queue: BullMQ + Redis
  - Frontend: React + TanStack Router/Query + Shadcn UI (custom theme)
- Core entities + migrations:
  - School, Test, TestVersion, Question, AssetFile, ParsingJob, AuditLog
- Parsing pipeline:
  - DOCX via `mammoth`, PDF via `pdf-parse`, OCR via Google Vision when needed
- Basic UI routes:
  - Library (open access)
  - Upload + parsing status
  - Test editor + student preview (TipTap rich text)
- Platform basics:
  - Health check endpoint (`/healthz`)
  - Upload validation (file type + size limits)
  - Env var inventory per app (Supabase, Vision API, DB, Redis)
  - CORS + security headers (helmet)
  - Seed data for demo tests (fixtures)
  - Migrations + seeding scripts
  - Local dev services (optional docker compose for Postgres/Redis)
- CI baseline:
  - Lint + typecheck
- Deployment baseline:
  - Vercel (web), Railway (api/worker/redis), Supabase (db/storage)

Deliverable:

- Deployed app with upload → parse → edit → preview → save flow (open access).

---

## Phase 1 — Teacher workflow (3–6 weeks)

**Goal:** “Library → Upload → Parse → Edit → Preview → Save” works with OCR + manual creation.

### 1) Data model + migrations (teacher-only)

- Test, TestVersion, Question, AssetFile, ParsingJob, AuditLog
- Draft versioning with save history

### 2) Upload + storage

- Upload DOCX/PDF/images to Supabase Storage
- Create ParsingJob record (pending/processing/done/failed)

### 3) Parsing pipeline

- DOCX via `mammoth`
- PDF via `pdf-parse` + OCR fallback
- Images via Google Vision OCR
- Heuristic question segmentation + draft questions saved

### 4) Teacher editor workflow

- Library list + Create Test CTA
- Create Test entry: upload + paste + start blank
- Parsing status screen
- Two-column editor (question list + editor)
- CRUD questions + reorder + points
- Student preview toggle (read-only)
- Save draft + save version

Deliverable:

- Teacher-only workflow with parsing + manual creation + versioning (no auth/classes/students).

---

## Phase 2 — Core LMS workflow (3–6 weeks)

**Goal:** “Library → Publish → Take → Results” works with auth + classes.

### 1) Auth + Tenant + RBAC

- BetterAuth integration
- One school per user
- Roles: admin, teacher, student
- School library sharing: duplicate-only within school (no co-edit in MVP)

### 2) Classes + roster

- Class creation
- Enrollment (manual entry in MVP; CSV later)
- ClassTeacher join table (class_id, teacher_id, subject)

### 3) Publish settings

- Select classes
- Start/end time + time limit
- Late submission allowed
- Visibility: class-only vs school-share (duplicate-only)
- Publish creates immutable TestVersion snapshot

### 4) Student experience

- Assigned test list
- Take test UI:
  - objective questions (MCQ/Yes-No)
  - written questions: inline text answers (no file upload in MVP)
- Submit + confirmation

### 5) Grading & Results

- Auto-grade objective items
- Store submission + grade record
- Teacher results dashboard:
  - class summary
  - per-student rows
  - banner for “written ungraded”
- Manual grading UI for written:
  - score + feedback

Deliverable:

- End-to-end LMS with auth + classes + assignments + results.

---

## Phase 3 — “Heavy lifting” upgrades (2–6 weeks)

**Goal:** Improve extraction quality + start “similar question” suggestions (teacher-reviewed).

### 1) Better extraction

- Add question-type classifier (small LLM) after heuristic segmentation
- Add structured JSON schema enforcement
- Add confidence flags per question for teacher review

### 2) Similar question generation (practice mode only)

- Endpoint: POST /suggestions (input: question_id + target difficulty)
- Orchestrator:
  - call generator model → candidates
  - validate correctness (solvers/rules)
  - similarity/dup checks
  - store suggestions as “unpublished”
- Teacher UI: “suggest variants” button per question

### 3) Analytics (basic)

- Acceptance rate, edit time, validation pass rate
- Accuracy by difficulty band (aggregated)

Deliverable:

- “Generate similar practice quiz” feature with safety + teacher approval.

---

## Phase 4 — Adaptive quizzes (optional, later)

**Goal:** personalized practice sets based on performance, still teacher-controlled.

- Topic mastery estimation (rules, not LLM)
- Assignment rules:
  - <60% → easy, 60–80% → medium, >80% → hard
- Generate/select items from bank + suggestions
- Student receives adaptive practice quiz
- Add learning gain metrics dashboard

Deliverable:

- Teacher can assign level-appropriate practice automatically with approval.

---

## 5) API endpoints (starting set)

### Auth / Users

- POST /auth/login [Sprint 2]
- GET /me [Sprint 2]

### Classes

- GET /classes [Sprint 2]
- POST /classes [Sprint 2]
- POST /classes/{id}/enroll (manual entry; CSV upload later) [Sprint 2]

### Library / Tests

- GET /tests?scope=my|school&grade=&subject=&q=
- POST /tests (create draft)
- POST /tests/{id}/duplicate
- GET /tests/{id}
- PATCH /tests/{id}
- POST /tests/{id}/preview (student preview, Sprint 1)

### Upload & Parsing

- POST /tests/{id}/assets (upload file)
- GET /tests/{id}/parsing-status
- GET /tests/{id}/questions (draft structured)
- PATCH /questions/{id}

### Publishing

- POST /tests/{id}/publish [Sprint 2]
- GET /tests/{id}/publications [Sprint 2]

### Student

- GET /assignments [Sprint 2]
- GET /assignments/{pub_id}/take [Sprint 2]
- POST /assignments/{pub_id}/submit [Sprint 2]

### Results / Grading

- GET /tests/{id}/results [Sprint 2]
- GET /submissions/{id} [Sprint 2]
- POST /submissions/{id}/grade (manual) [Sprint 2]
- POST /submissions/{id}/feedback [Sprint 2]

### (Phase 2) Suggestions

- POST /questions/{id}/suggestions?difficulty=easy|medium|hard
- GET /suggestions?test_id=
- POST /suggestions/{id}/approve-to-test

---

## 6) Event & job queue tasks (orchestrator)

- job.parse_test_asset(asset_id)
- job.ocr_asset(asset_id) [if needed]
- job.segment_questions(test_id)
- job.classify_questions(test_id) [Phase 2]
- job.generate_suggestions(question_id, difficulty) [Phase 2]
- job.validate_question(question_id)
- job.autograde_submission(submission_id) [Sprint 2]

---

## 7) Quality & safety checklist (MVP)

- Teacher always reviews imported questions before publish
- Objective grading is deterministic
- Written grading: teacher final authority
- All AI outputs stored with:
  - model name/version
  - prompt template version
  - timestamps
  - validation results
- Avoid training on student data; use aggregated analytics only

---

## 8) Definition of Done (MVP)

- Teacher can upload past test → get draft → edit → publish → students take → objective auto-graded → teacher grades written → students see score + feedback → test saved in library and reusable.
