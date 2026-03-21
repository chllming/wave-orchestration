# Changelog

## 0.4.0 - 2026-03-21

- Expanded Codex runtime support with documented `exec` flags for model, profile, inline config, search, images, extra dirs, JSON mode, and ephemeral sessions.
- Added Claude settings overlay merging for inline settings JSON, hooks JSON, and allowed HTTP hook URLs, while keeping the harness system-prompt overlay flow.
- Added richer OpenCode runtime overlays with merged config JSON, multi-file attachments, and dry-run launch previews for all supported executors.

## 0.3.0 - 2026-03-21

- Added the Phase 1 and 2 harness runtime: canonical coordination store, compiled inboxes, wave ledger, integration summaries, and clarification triage.
- Added planning-time runtime profiles, lane runtime policy, hard runtime-mix validation, and retry fallback reassignment recording.
- Added integration stewardship and staged closure so integration gates documentation and evaluator closure.

## 0.2.0 - 2026-03-21

- Added workspace-root aware runtime support so the package can run from `node_modules` against an adopting repository.
- Added package management commands: `wave init`, `wave upgrade`, `wave changelog`, and `wave doctor`.
- Added `.wave/install-state.json` and upgrade-history reporting for non-destructive repo upgrades.

## 0.1.0 - 2026-03-21

- Initial generic wave orchestrator runtime.
- Added Context7 bundle resolution and multi-executor support for Codex, Claude Code, and OpenCode.
