#!/usr/bin/env bash
set -euo pipefail

pnpm --filter @clase/api dev &
api_pid=$!

pnpm --filter @clase/worker dev &
worker_pid=$!

trap 'kill $api_pid $worker_pid 2>/dev/null || true' INT TERM EXIT

wait $api_pid $worker_pid
