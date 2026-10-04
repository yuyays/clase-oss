#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is required. Install jq and retry."
  exit 1
fi

API_URL=${API_URL:-"http://localhost:3001"}
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FIXTURE_PATH=${FIXTURE_PATH:-"${SCRIPT_DIR}/../apps/web/public/samples/clase-demo-worksheet.pdf"}
COOKIE_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR"' EXIT
CURL=(curl -sS -b "$COOKIE_JAR" -c "$COOKIE_JAR")

ASSESSMENT_ID=$("${CURL[@]}" -X POST "${API_URL}/assessments" \
  -H "Content-Type: application/json" \
  -d '{"title":"Sample Midterm","assessmentCategory":"midterm","subject":"Math","grade":"8"}' \
  | jq -r '.id')

echo "ASSESSMENT_ID=${ASSESSMENT_ID}"

"${CURL[@]}" -F "file=@${FIXTURE_PATH}" "${API_URL}/assessments/${ASSESSMENT_ID}/assets" | jq

"${CURL[@]}" "${API_URL}/assessments/${ASSESSMENT_ID}/parsing-status" | jq

"${CURL[@]}" "${API_URL}/assessments/${ASSESSMENT_ID}/questions" | jq

"${CURL[@]}" "${API_URL}/assessments/${ASSESSMENT_ID}/versions" | jq

"${CURL[@]}" -X POST "${API_URL}/assessments/${ASSESSMENT_ID}/publish" | jq
