# Context7 and Wave Orchestrator

Context7 is for external library truth. Repository docs and source are for repository truth.

## Rules

- Prefer a narrow bundle per agent or wave.
- Do not load broad external docs by default.
- Treat prefetched Context7 text as non-canonical prompt context.
- Keep Context7 bundle definitions in `docs/context7/bundles.json`.
- Launcher-side prefetch writes only to ignored cache paths under `.tmp/`.

## Resolution Order

1. Agent `### Context7`
2. Wave `## Context7 defaults`
3. Lane default from `docs/context7/bundles.json`
4. `none`

## Injection

When a bundle is active, the launcher injects:

- the resolved bundle id
- the resolved query focus
- the allowed library list
- prefetched third-party snippets when available

The injected block appears before the assigned implementation prompt and is labeled non-canonical.
