# clase UI Workflow (MVP)

## Core flow (Teacher)

### 1) Library

- Primary CTA: Create Test
- List tests with filters (subject, grade, search)
- Actions: open, duplicate

### 2) Create Test entry

- Upload area (multi-file PDF/DOCX/images)
- Paste area (plain or rich text)
- Secondary CTA: Start blank editor
- Primary flow: upload/paste -> parsing -> editor

### 3) Parsing status

- File list with status
- Progress + retry on failure
- Continue to editor with raw text

### 4) Test editor

- Two-column layout: question list (left) + editor panel (right)
- Inline add question (no modal)
- TipTap rich text for prompts/choices
- Edit: text, choices, correct answer, points, reorder
- Student preview toggle (read-only)
- Save Draft (publish later in Sprint 2)

### 5) Student preview (toggle)

- Same page, read-only UI
- Mirrors student view (inline written answers)

## Alternate paths

- No upload: Start blank editor
- Parsing failed: manual edit with raw text
- Duplicate test: opens editor with cloned version

## Student flow (Sprint 2)

- Assigned tests list
- Take test (objective + inline written answers)
- Submit confirmation

## Teacher results (Sprint 2)

- Class summary + per-student table
- Manual grading for written responses (score + feedback)
