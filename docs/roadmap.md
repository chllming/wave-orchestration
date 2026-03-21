# Wave Orchestrator Roadmap

This roadmap proposes the highest-value upgrades to Wave Orchestration that preserve the current architecture:

- lane-scoped runs
- wave markdown as the authored plan surface
- multi-role agents with explicit ownership
- component promotions, exit contracts, documentation stewardship, and evaluator closure

The goal is not to replace waves with a different orchestration model. The goal is to make the existing wave model more durable for long-running, multi-agent, multi-lane repository work.

## Design Position

The recent harness and blackboard sources point in the same direction:

- compaction alone is not enough for long-running work
- append-only communication logs are useful, but not sufficient as the canonical coordination substrate
- messaging quality matters less than whether the system can integrate distributed findings into a coherent decision
- the harness needs reproducible traces, explicit loop control, and durable state across sessions

Wave Orchestration already has a strong base:

- wave parsing and role imports
- lane-scoped state under `.tmp/`
- message boards
- structured proof and documentation markers
- documentation closure and evaluator closure sweep
- a file-backed human feedback queue

The next step is to evolve the harness from “agents write progress notes” into “agents coordinate through typed shared state, compiled inboxes, and an explicit integration phase.”

## What To Keep

These parts of the current model should stay:

- Wave markdown remains the authored planning surface.
- Lanes remain the top-level isolation unit for separate workstreams.
- Agent IDs and role prompts remain the basic execution model.
- Exit contracts, component promotions, documentation stewardship, and evaluator closure remain the primary completion controls.
- The markdown message board remains as a human-readable audit view.

## Highest-Value Addons

### 1. Canonical Coordination Store

Add a lane- and wave-scoped structured coordination store and treat the markdown message board as a rendered view.

Why this is highest value:

- The current board format in `scripts/wave-orchestrator/coordination.mjs` is easy to read but weak as machine state.
- The parser depends on regexes and free-text fields.
- Blackboard-style coordination works best when requests, claims, evidence, blockers, and decisions are explicit typed objects.

Proposed artifact:

- `.tmp/<lane>-wave-launcher/coordination/wave-<n>.jsonl`

Proposed record kinds:

- `request`
- `ack`
- `claim`
- `evidence`
- `decision`
- `blocker`
- `handoff`
- `human-feedback`
- `integration-summary`

Required fields:

- `id`
- `kind`
- `wave`
- `lane`
- `agentId`
- `targets`
- `status`
- `priority`
- `artifactRefs`
- `dependsOn`
- `closureCondition`
- `createdAt`
- `updatedAt`
- `confidence`
- `summary`
- `detail`

Compatibility rule:

- keep writing the markdown board, but generate it from the coordination store and append a short human-readable projection

### 2. Agent Inbox Compiler

Stop injecting a raw board tail into every agent prompt. Compile role-specific inboxes from the canonical coordination state.

Why this is high value:

- Long-running harness guidance favors explicit handoff artifacts and short “get up to speed” paths.
- Raw tail snapshots are noisy and lose important old-but-still-open obligations.
- Multi-agent blackboard systems work when the current blackboard state determines who should act next and what they should see.

Proposed artifacts:

- `.tmp/<lane>-wave-launcher/inboxes/wave-<n>/<agent-id>.md`
- `.tmp/<lane>-wave-launcher/inboxes/wave-<n>/shared-summary.md`

Each inbox should contain:

- owned open requests
- claims that conflict with this agent’s work
- unresolved blockers affecting owned files or components
- required doc deltas
- human feedback relevant to that agent
- integration findings from prior attempts
- only the minimal recent audit context needed for recovery

Prompt change:

- `buildExecutionPrompt` should inject the compiled inbox plus the shared wave summary, not the last N characters of the board

### 3. Explicit Integration Phase Before Final Closure

Add a dedicated integration phase between implementation completion and documentation/evaluator closure.

Why this is essential:

- Silo-Bench shows a communication-reasoning gap: agents can exchange enough information and still fail to integrate it.
- DOVA’s strongest pattern is ensemble breadth, blackboard transparency, then iterative refinement.
- The current closure sweep checks implementation, docs, evaluator, and infra, but does not assign integration as a first-class role.

Proposed model:

- reserve a configurable integration steward, default `A8`
- the integration steward does not own feature implementation
- it owns synthesis, conflict detection, integration risk, and open dependency reconciliation

Integration outputs:

- `.tmp/<lane>-wave-launcher/integration/wave-<n>.json`
- `.tmp/<lane>-wave-launcher/integration/wave-<n>.md`

Required fields:

- open claims
- conflicting claims
- unresolved blockers
- changed interfaces
- cross-component impacts
- proof gaps
- doc gaps
- release/deploy risks
- final recommendation: `ready-for-doc-closure` or `needs-more-work`

Gate rule:

- the documentation steward and evaluator do not run their final pass until the integration steward emits a final integration summary

### 4. Durable Wave Task Ledger

Add a machine-readable wave ledger separate from the coordination log.

Why this matters:

- Anthropic’s initializer/progress/feature-list pattern and OpenAI’s repository-as-system-of-record point to the same need: durable task state
- a coordination stream is not the same thing as a canonical ledger of what is left

Proposed artifact:

- `.tmp/<lane>-wave-launcher/ledger/wave-<n>.json`

Track:

- tasks and subgoals derived from the wave
- owner agent
- current state
- proof status
- docs status
- infra/deploy status
- dependent tasks
- baseline verification status

Use:

- the autonomous runner should use the ledger, not only run-state, to decide whether to continue, relaunch a role, or stop

### 5. Communication-Aware Scheduling

Use coordination state to drive execution decisions.

Why this matters:

- the current dashboard renders communication health, but the launcher and autonomous runner do not meaningfully act on it
- blackboard systems are strongest when blackboard state affects who runs next

Additions:

- if an agent has unacknowledged targeted requests, prioritize or relaunch that agent
- if a high-priority blocker remains unresolved, prevent wave completion
- if integration detects unresolved cross-agent contradictions, force a focused follow-up round
- if only documentation deltas remain, relaunch only the documentation steward
- if only deployment or infra proof remains, relaunch only the relevant infra/deploy role

### 6. Capability-Based Volunteer Roles

Extend fixed roles with optional capability-based volunteering.

Why this is useful:

- the blackboard papers show that rigid controller knowledge does not scale well
- the current wave format already supports multiple roles; capability tags make routing smarter without removing explicit ownership

Wave file addition:

- optional `### Capabilities`

Examples:

- `integration`
- `docs-shared-plan`
- `infra-k8s`
- `deploy-railway`
- `schema-migration`
- `frontend-validation`

Use:

- requests can target a named agent or a capability class
- the launcher can assign the next step to the least-busy matching agent or a configured preferred role

### 7. Stronger Human Feedback As A Board Primitive

Unify the feedback queue with the coordination model.

Why:

- the current feedback queue is useful but separate from the main shared workspace
- human feedback should participate in the same lifecycle as requests, acknowledgements, and closure

Change:

- every `wave-feedback ask` request creates both the existing JSON file and a coordination event
- answering feedback writes a typed `human-feedback` record and updates dependent open requests

### 8. Reproducible Harness Traces

Add replayable trace capture for evaluation and regression control.

Why this is mandatory:

- VeRO and EvoClaw both argue that long-running agent systems need reproducible traces and continuous-history evaluation
- without this, harness changes are anecdotal

Per-attempt trace bundle:

- wave file hash
- prompt fingerprints
- compiled inboxes
- coordination store snapshot
- structured markers from logs
- exit contract outcomes
- integration summary
- evaluator verdict
- docs closure state
- runtime budgets and retries

Proposed artifact:

- `.tmp/<lane>-wave-launcher/traces/wave-<n>/attempt-<k>/`

## Upgraded Architecture

### Current Model

Current flow, simplified:

1. Parse wave file.
2. Launch one session per agent.
3. Ask all agents to coordinate on a markdown board.
4. Parse logs and structured markers.
5. Run documentation closure and evaluator closure.

This is workable, but it leaves three gaps:

- communication is mostly free-text
- integration is implicit
- scheduling is not strongly driven by shared state

### Proposed Model

Upgraded flow, still wave- and lane-native:

1. Parse wave file into the manifest and wave ledger.
2. Build or update the canonical coordination store.
3. Compile shared summary and per-agent inboxes.
4. Launch implementation, infra, deploy, docs, or research roles based on the ledger and open requests.
5. Continuously ingest structured outputs into the coordination store and ledger.
6. Run a dedicated integration phase to synthesize all claims and remaining gaps.
7. Run documentation closure using the integration summary.
8. Run evaluator closure using the integration summary plus final doc state.
9. Persist the attempt trace bundle for replay and evaluation.

## Recommended Role Model

This role model works with the current multi-role architecture and extends it rather than replacing it:

- `A0` evaluator
- `A8` integration steward
- `A9` documentation steward
- implementation roles, each owning explicit files and components
- optional infra role for identity, admission, machine conformance, or deployment substrates
- optional deploy verifier role for rollout, health, and operational proof

Responsibilities:

- implementation roles produce code, proofs, and doc deltas
- infra/deploy roles produce structured environment proof
- integration steward synthesizes cross-role state
- documentation steward reconciles shared docs and component matrix
- evaluator decides whether the wave is coherent enough to pass

## Lanes And Cross-Lane Coordination

Lanes should remain isolated in execution state but gain typed cross-lane dependency tickets.

Current strength:

- lane-scoped paths already exist
- an orchestrator board already exists

Upgrade:

- add `.tmp/wave-orchestrator/dependencies/<lane>.jsonl`
- each cross-lane dependency is a typed ticket with owner lane, requester lane, closure condition, and related waves
- lane autonomous mode should refuse to finalize if it has unresolved required inbound dependencies

This keeps lane isolation while making cross-lane work explicit and schedulable.

## Documentation Upgrades

The current documentation steward role is good, but it is overloaded.

Improve it by adding:

- doc delta extraction from implementation markers into a machine-readable queue
- explicit shared-plan reconciliation checklist
- component-matrix reconciliation checklist
- release-notes or changelog queue when a wave changes public package behavior

Documentation should consume integration outputs, not rediscover them from raw logs.

## Evaluation Upgrades

The harness should move from “wave passed or failed” to “wave quality is replayable and comparable.”

Add:

- per-wave regression datasets
- replayable trace bundles
- scoring for communication health, integration quality, and proof quality
- continuous-history benchmark scenarios, not only single-wave success

Suggested metrics:

- unresolved request count at closure
- integration contradiction count
- documentation drift count
- proof completeness ratio
- relaunch count by role
- mean time to first acknowledgement
- mean time to blocker resolution
- evaluator reversal rate between early and final verdicts

## Infra And DevOps Upgrades

The harness already has structured deploy and infra markers. The next step is to make them durable and wave-aware.

Add:

- infra proof records into the coordination store and ledger
- deploy readiness and deploy verification as separate states
- environment baseline checks at wave start
- required rollback or recovery guidance for waves that touch live systems

For infra- or deploy-heavy lanes, the integration steward should treat infra proof as first-class, not as a side detail in implementation logs.

## Prioritized Delivery Order

### Phase 1: Coordination Foundation

- canonical coordination store
- markdown board as rendered view
- per-agent inbox compiler
- typed human-feedback events

Why first:

- every other improvement depends on better shared state

### Phase 2: Integration And Scheduling

- integration steward role
- integration summary artifacts
- communication-aware relaunch and closure rules
- wave ledger

Why second:

- this closes the communication-reasoning gap without changing the authored wave format

### Phase 3: Evaluation And Replay

- trace bundles
- wave quality metrics
- continuous-history replay scenarios

Why third:

- once state and flow are structured, evaluation becomes meaningful

### Phase 4: Capability Routing And Cross-Lane Dependencies

- capability tags
- volunteer or dynamic assignment for helper roles
- typed cross-lane dependency tickets

Why fourth:

- this is valuable, but only after the coordination core is trustworthy

## Immediate Recommendation

The highest-value near-term upgrade is:

1. canonical coordination store
2. compiled agent inboxes
3. explicit integration steward and integration summary

That combination gives the harness the biggest improvement in:

- long-running robustness
- intra-agent messaging quality
- closure reliability
- lane and multi-role scalability

without forcing a rewrite of wave files, lane structure, or existing proof markers.

## Source References

- [Effective harnesses for long-running agents](./research/agent-context-cache/articles/effective-harnesses-for-long-running-agents.md)
- [Harness engineering: leveraging Codex in an agent-first world](./research/agent-context-cache/articles/harness-engineering-leveraging-codex-in-an-agent-first-world.md)
- [Unlocking the Codex harness: how we built the App Server](./research/agent-context-cache/articles/unlocking-the-codex-harness-how-we-built-the-app-server.md)
- [Building Effective AI Coding Agents for the Terminal: Scaffolding, Harness, Context Engineering, and Lessons Learned](./research/agent-context-cache/papers/building-effective-ai-coding-agents-for-the-terminal-scaffolding-harness-context-engineering-and-lessons-learned.md)
- [VeRO: An Evaluation Harness for Agents to Optimize Agents](./research/agent-context-cache/papers/vero-an-evaluation-harness-for-agents-to-optimize-agents.md)
- [EvoClaw: Evaluating AI Agents on Continuous Software Evolution](./research/agent-context-cache/papers/evoclaw-evaluating-ai-agents-on-continuous-software-evolution.md)
- [LLM-based Multi-Agent Blackboard System for Information Discovery in Data Science](./research/agent-context-cache/papers/llm-based-multi-agent-blackboard-system-for-information-discovery-in-data-science.md)
- [Exploring Advanced LLM Multi-Agent Systems Based on Blackboard Architecture](./research/agent-context-cache/papers/exploring-advanced-llm-multi-agent-systems-based-on-blackboard-architecture.md)
- [DOVA: Deliberation-First Multi-Agent Orchestration for Autonomous Research Automation](./research/agent-context-cache/papers/dova-deliberation-first-multi-agent-orchestration-for-autonomous-research-automation.md)
- [Silo-Bench: A Scalable Environment for Evaluating Distributed Coordination in Multi-Agent LLM Systems](./research/agent-context-cache/papers/silo-bench-a-scalable-environment-for-evaluating-distributed-coordination-in-multi-agent-llm-systems.md)
- [SYMPHONY: Synergistic Multi-agent Planning with Heterogeneous Language Model Assembly](./research/agent-context-cache/papers/symphony-synergistic-multi-agent-planning-with-heterogeneous-language-model-assembly.md)
- [An Open Agent Architecture](./research/agent-context-cache/papers/an-open-agent-architecture.md)
