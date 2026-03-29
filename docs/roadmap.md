# Wave Orchestrator Roadmap

This roadmap is intentionally short and current. The older planner-foundation and ad-hoc-run phase list has been removed because that work no longer describes the actual shipping direction for this package.

## Current Release: 0.9.1

`0.9.1` is the runtime-hardening release.

It focuses on:

- detached process-backed agent execution instead of tmux-heavy live execution
- lower steady-state memory pressure and less terminal churn during long runs
- better behavior in constrained sandboxes such as LEAPclaw, OpenClaw, Nemoshell, and Docker-based operator environments
- a safer `submit -> supervise -> status/wait -> attach` control path for long-running agentic orchestration
- tighter supervisor recovery, progress journaling, and closure/retry correctness

## Next Release: Final Planned Feature Release On This Line

The next planned release after `0.9.1`, aside from bug fixes and release-surface maintenance, is the final feature release for this standalone Node-based line.

That release is focused on Wave Control authentication:

- token-based auth for `wave-control`
- web auth for the Wave Control operator surface
- a cleaner control-plane boundary between the local orchestrator runtime and authenticated operator access
- documentation and setup guidance for protected control surfaces in local, containerized, and hosted environments

After that release, this package should move into maintenance mode:

- bug fixes
- compatibility updates
- documentation updates
- release-surface alignment work

## Strategic Direction: LEAPclaw Execution Model

After the Wave Control auth release, the main execution roadmap moves away from expanding this Node runtime and toward the LEAPclaw execution model.

The target shape is:

- LEAPclaw-native execution semantics for agent orchestration and management
- Go-based runtime ownership for the long-running execution layer
- Temporal-backed workflow and recovery coordination
- LEAPclaw nodes as the durable execution substrate for orchestrated agent work
- Wave Control acting as an authenticated control and observability surface rather than the long-term primary execution engine

This direction matches the broader local platform work in the sibling `slowfast.ai` repository, where the support-service and runtime direction already points toward LEAPclaw support services, Go runtime ownership, and Temporal-backed orchestration.

## Future Standalone Runtime Direction

For future standalone Wave Orchestrator versions, the preferred implementation direction is the Rust runtime at:

- `https://github.com/chllming/agent-wave-orchestrator`

That line is expected to carry:

- its own runtime implementation
- its own terminal-native/TUI operator surface
- the longer-term standalone execution model once the Node package settles into maintenance mode

## Practical Guidance

For this repository, the practical sequence is:

1. Ship `0.9.1` with the sandbox/runtime hardening and aligned docs.
2. Ship the Wave Control token/web auth release as the last planned feature release on this Node line.
3. Keep this package maintained for bug fixes, compatibility, and release-surface sync.
4. Move long-term execution investment to the LEAPclaw + Go + Temporal architecture and the Rust standalone runtime.
