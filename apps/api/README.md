# API

## Local development

- Install deps: `pnpm install` (from repo root)
- Start API: `pnpm dev` (set `LOG_PRETTY=true` for pretty logs)
- Set `CORS_ORIGIN` to your frontend origin(s), comma-separated when multiple.
- Set `BETA_ACCESS_KEY` in production. The API refuses to start without it.
- The shared key protects the API origin from direct unauthenticated requests.
  An HTTP-only browser cookie isolates temporary assessments. Cookie access
  lasts 24 hours; there is no account recovery or shared library.
- Redis is required for daily limits: 10 assessment creations, 6 uploads, and
  10 question regenerations per IP; global caps are 200, 50, and 100 per day.
  If Redis is unavailable, these actions return 503.
- Set `CORS_ORIGIN` to the deployed web origin. `*` is rejected in production.

## Endpoints

- `GET /healthz`
- `GET /assessments` is disabled; the browser can access only its own
  unexpired assessment by ID.

The migration leaves existing assessments without a session owner. They are
inaccessible through the public API and are not removed by the 24-hour cleanup;
review or export them before deleting them separately.
