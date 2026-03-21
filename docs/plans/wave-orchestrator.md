# Wave Orchestrator

The Wave Orchestrator coordinates repository work as bounded execution waves.

## What It Does

- parses wave plans from `docs/plans/waves/`
- fans a wave out into one session per `## Agent ...` section
- supports standing role imports from `docs/agents/*.md`
- validates Context7 declarations and exit contracts from configurable wave thresholds
- writes prompts, logs, dashboards, message boards, and status summaries under `.tmp/`
- supports launcher-side Context7 prefetch and injection for headless runs
- supports a file-backed human feedback queue
- performs a closure sweep so evaluator and documentation gates reflect final landed state

## Main Commands

- `pnpm wave:launch -- --lane main --dry-run --no-dashboard`
- `pnpm wave:launch -- --lane main --start-wave 0 --end-wave 0 --executor codex --codex-sandbox danger-full-access`
- `pnpm wave:autonomous -- --lane main --executor codex --codex-sandbox danger-full-access`
- `pnpm wave:feedback -- list --lane main --pending`

## Configuration

- `wave.config.json` controls docs roots, shared plan docs, role prompts, validation thresholds, and Context7 bundle-index location.
- `docs/context7/bundles.json` controls allowed external library bundles and lane defaults.
