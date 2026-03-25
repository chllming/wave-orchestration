#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${CONTEXT7_API_KEY:-}" ]]; then
  echo "context7-api-check: CONTEXT7_API_KEY is not set" >&2
  exit 1
fi

node <<'NODE'
const fs = require("fs");
const path = require("path");

const apiKey = process.env.CONTEXT7_API_KEY || "";
const repoRoot = process.cwd();
const bundlePath = path.join(repoRoot, "docs/context7/bundles.json");
const payload = JSON.parse(fs.readFileSync(bundlePath, "utf8"));

const entries = [];
for (const [bundleId, bundle] of Object.entries(payload.bundles || {})) {
  for (const library of bundle.libraries || []) {
    if (!library.libraryId) {
      throw new Error(
        `Bundle "${bundleId}" must pin exact Context7 libraryId values. Found libraryName=${JSON.stringify(library.libraryName || "")}.`,
      );
    }
    entries.push({
      bundleId,
      libraryId: String(library.libraryId),
      queryHint: String(library.queryHint || "overview"),
    });
  }
}

const uniqueEntries = [...new Map(entries.map((entry) => [entry.libraryId, entry])).values()];

async function validate(entry) {
  const url = new URL("https://context7.com/api/v2/context");
  url.searchParams.set("libraryId", entry.libraryId);
  url.searchParams.set("query", entry.queryHint);
  url.searchParams.set("type", "txt");
  const response = await fetch(url, {
    headers: {
      Authorization: "Bearer " + apiKey,
      Accept: "text/plain, application/json",
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Context7 ${entry.libraryId} failed (${response.status}): ${text.slice(0, 200)}`);
  }
  if (text.trim().length === 0) {
    throw new Error(`Context7 ${entry.libraryId} returned empty context.`);
  }
  console.log(`ok -- ${entry.libraryId} (${entry.bundleId})`);
}

(async () => {
  for (const entry of uniqueEntries) {
    await validate(entry);
  }
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
NODE
