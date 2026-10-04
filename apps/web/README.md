# React + TypeScript + Vite + shadcn/ui

This is a template for a new Vite project with React, TypeScript, and shadcn/ui.

Use `.env` with:

- `VITE_API_BASE_URL`

The browser bundle must not contain `BETA_ACCESS_KEY` or other server secrets. For a
deployed site, set `VITE_API_BASE_URL=/api` at build time and configure the Caddy
proxy with `API_UPSTREAM` and `BETA_ACCESS_KEY` at runtime.
