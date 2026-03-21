#!/usr/bin/env bash
# Minimal Context7 API smoke test (expects CONTEXT7_API_KEY in the environment).
set -euo pipefail

if [[ -z "${CONTEXT7_API_KEY:-}" ]]; then
  echo "context7-api-check: CONTEXT7_API_KEY is not set" >&2
  exit 1
fi

URL='https://context7.com/api/v2/libs/search?libraryName=temporal&query=go%20workflow'
echo "GET $URL" >&2
RESP="$(curl -fsS "$URL" -H "Authorization: Bearer ${CONTEXT7_API_KEY}" -H "Accept: application/json")"
RESP_JSON="$RESP" node -e "
const j = JSON.parse(process.env.RESP_JSON || '{}');
const list = Array.isArray(j) ? j : (j.results ?? j.items ?? []);
const first = list[0];
if (!first) { console.error('Unexpected response shape:', Object.keys(j)); process.exit(1); }
const id = first.id ?? first.libraryId;
const name = first.title ?? first.name;
console.log('ok — first library:', id || name || JSON.stringify(first).slice(0, 120));
"
