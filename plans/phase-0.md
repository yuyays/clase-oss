# Phase 0 — Foundations Checklist

## Goal

Repo scaffolding + core tooling + parsing/editor baseline (open access).

## Scope

- Monorepo structure: apps/web, apps/api, apps/worker, packages/shared
- Tooling baseline: TypeScript, ESLint, Prettier
- Env var inventory + `.env.example` per app
- Health check endpoint (`/healthz`)
- Upload validation (file types + size limits)
- Seed data and fixture files
- Basic CI (lint + typecheck)
- Deployment baseline (Vercel + Railway + Supabase)

## Tasks

### Repo + tooling

- Scaffold monorepo (pnpm workspaces)
- Add root scripts (dev/build/lint/typecheck)
- Add shared TS config

## Checklist (track as we go)

- [x] Monorepo scaffolded
- [x] Tooling baseline configured
- [x] Env vars documented
- [x] Health endpoint wired
- [x] Upload validation in place
- [ ] Parsing job stub working
- [ ] Seed/fixture flow verified
- [ ] CI lint + typecheck passing

### API baseline

- Express app + pino logging
- Health endpoint
- CORS + helmet
- Upload endpoint with validation (Multer)

### Worker baseline

- BullMQ + Redis connection
- Job stub for parsing pipeline

### Storage + DB

- Supabase Storage setup
- Postgres connection via Drizzle
- Initial migrations for core entities

### Fixtures / seed data

- `fixtures/` folder for sample DOCX/PDF/images
- Seed script creates demo tests and links assets

### Frontend baseline

- React + TanStack Router/Query
- Library screen shell
- Upload + parsing status shell
- Editor shell + student preview toggle

### CI baseline

- Lint + typecheck on PR

## Acceptance criteria

- App boots locally
- Health endpoint works
- Upload accepts files and stores them
- Parsing job enqueued successfully
- Editor screen loads and saves a draft
- Seed data visible in Library

## Inputs needed

- Sample files for `fixtures/`
- Supabase project + bucket
- Google Vision credentials
