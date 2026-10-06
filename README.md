# Clase LMS

## Demo

Try the hosted demo: https://web-production-176df.up.railway.app/

Watch the demo video: https://canva.link/egumqag1akqqkxj

## Local development

### Prerequisites

- Node.js 24
- pnpm 11 (11.28.2 is pinned in `package.json`)
- Redis (for workers)

### Install

```
pnpm install
```

### Env setup

- See `docs/env.md` for required variables.
- `apps/api/.env.example`
- `apps/worker/.env.example`
- `apps/web/.env.example`

### Run

- Apply migrations: `pnpm db:migrate` (from the repo root, with `DATABASE_URL` set)
- API: `pnpm dev` (from `apps/api`)
- API pretty logs: `pnpm dev:pretty` (from `apps/api`)
- Worker: `pnpm dev` (from `apps/worker`)
- Worker pretty logs: `pnpm dev:pretty` (from `apps/worker`)
- Web: `pnpm dev` (from `apps/web`)

### Notes

- API and worker need Redis running at `REDIS_URL`.
- The hosted app has no sign-in or shared library. Each upload belongs to the
  browser session that created it and expires after 24 hours. Download the
  edited assessment before then.
- The API uses Redis for daily anonymous usage limits. The worker removes
  expired database records and uploaded files every hour.

## License

Clase is licensed under the [MIT License](LICENSE).
