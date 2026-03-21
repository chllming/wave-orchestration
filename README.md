# Wave Orchestration

Wave Orchestration is a generic repository harness for running multi-agent work in bounded waves.

It includes:

- wave parsing and validation
- launcher, dashboard, autonomous, and human-feedback CLIs
- role prompt imports and closure-sweep gating
- Context7 bundle selection, prefetch, caching, and prompt injection
- starter docs and a sample wave scaffold

## Quick Start

1. `pnpm install`
2. Review [`wave.config.json`](/home/coder/wave-orchestration/wave.config.json)
3. Review the starter docs in [`docs/plans`](/home/coder/wave-orchestration/docs/plans)
4. Run `pnpm wave:launch -- --lane main --dry-run --no-dashboard`

## Research Sources

The repository only commits a source index. Hydrated paper or article caches should stay local and ignored under `docs/research/cache/` or `docs/research/agent-context-cache/`.
