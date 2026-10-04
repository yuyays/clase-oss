#!/usr/bin/env bash
set -euo pipefail

entry=${1:?entry is required}

pnpm --filter @clase/shared build
pnpm build

pnpm --filter @clase/shared exec tsc -p tsconfig.json --watch --preserveWatchOutput &
shared_watch_pid=$!

pnpm exec tsc -p tsconfig.json --watch --preserveWatchOutput &
workspace_watch_pid=$!

node --watch "dist/src/${entry}.js" &
node_pid=$!

trap 'kill "$shared_watch_pid" "$workspace_watch_pid" "$node_pid" 2>/dev/null || true' EXIT INT TERM
wait -n "$shared_watch_pid" "$workspace_watch_pid" "$node_pid"
