# Environment Variables

This repo uses per-app `.env` files. Only include variables that are actually referenced in code.

## Root (Drizzle CLI)

Used by `drizzle.config.ts` and `packages/shared/src/db/env.ts`.

- `DATABASE_URL`

## API (`apps/api`)

Required for uploads, queueing, and Supabase storage.

- `PORT` (default: 3001)
- `CORS_ORIGIN` (default: `http://localhost:5173`; set to the web origin in production)
- `LOG_PRETTY` (set `1` for pretty logs)
- `REDIS_URL` (default: `redis://localhost:6379`)
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET`
- `BETA_ACCESS_KEY` (required when `NODE_ENV=production`; set the same value on the web proxy)

## Worker (`apps/worker`)

Handles LLM parsing and requires Redis + database access.

- `REDIS_URL` (default: `redis://localhost:6379`)
- `LOG_PRETTY` (set `1` for pretty logs)
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET`
- `LLM_MODE` (default: `chunk`)
- `LLM_CHUNK_SIZE`
- `LLM_PROVIDER` (default: `openai`)
- `LLM_MODEL` (default: `gpt-5-nano-2025-08-07`)
- `LLM_MAX_CHARS`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`

## Web (`apps/web`)

- `VITE_API_BASE_URL` (local default: `http://localhost:3001`; set to `/api` for the Docker image)
- `API_UPSTREAM` (required by the Caddy container; the API origin, for example `https://api.example.com`)
- `BETA_ACCESS_KEY` (Caddy runtime secret sent to the API; never prefix it with `VITE_`)

On Railway, set the web service's `API_UPSTREAM` to
`https://${{@clase/api.RAILWAY_PUBLIC_DOMAIN}}` so each PR environment proxies to
its own API service. A fixed production URL would route preview traffic to
production.

The Caddy proxy key is a shared service credential. Each visitor receives an
HTTP-only session cookie for temporary assessment access. The browser must use
the same web origin to keep its session, and losing the cookie ends access.

## Optional CLI

Used by `scripts/openai-extract.mjs`.

- `OPENAI_API_KEY`
