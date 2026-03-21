# Wave 0 - Starter Scaffold Validation

**Commit message**: `Chore: validate starter wave scaffold`

## Context7 defaults

- bundle: node-typescript
- query: "Node.js and TypeScript basics for orchestrator maintenance"

## Agent A0: Running Evaluator

### Role prompts

- docs/agents/wave-evaluator-role.md

### Context7

- bundle: none

### Prompt

```text
Primary goal:
- Keep the starter scaffold coherent while the rest of the wave runs.

Required context before coding:
- Read docs/reference/repository-guidance.md.
- Read docs/research/agent-context-sources.md.
- Read docs/plans/master-plan.md, docs/plans/current-state.md, and docs/plans/migration.md.

File ownership (only touch these paths):
- docs/plans/waves/reviews/wave-0-evaluator.md
```

## Agent A9: Documentation Steward

### Role prompts

- docs/agents/wave-documentation-role.md

### Context7

- bundle: none

### Prompt

```text
Keep the starter shared plan docs aligned with the landed Wave 0 outcomes.

Required context before coding:
- Read docs/reference/repository-guidance.md.
- Read docs/research/agent-context-sources.md.

File ownership (only touch these paths):
- docs/plans/current-state.md
- docs/plans/master-plan.md
- docs/plans/migration.md
```

## Agent A1: Starter Runtime Review

### Context7

- bundle: node-typescript
- query: "Node.js module layout, process spawning, and vitest test execution"

### Exit contract

- completion: contract
- durability: none
- proof: unit
- doc-impact: owned

### Prompt

```text
Review and tighten the starter runtime and test harness.

Required context before coding:
- Read docs/reference/repository-guidance.md.
- Read docs/research/agent-context-sources.md.
- Read docs/plans/wave-orchestrator.md and docs/plans/context7-wave-orchestrator.md.

File ownership (only touch these paths):
- README.md
- test/wave-orchestrator/shared.test.ts
```
