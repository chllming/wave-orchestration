# Monorepo Projects Guide

Use this guide when one repository needs multiple independent Wave tracks.

Wave now supports:

- `defaultProject`
- `projects.<projectId>`
- project-scoped lanes
- project-scoped planner memory
- project-scoped ad-hoc runs
- project-scoped launcher state and telemetry

## What A Project Means

A Wave project is the namespace above lanes.

- a project owns its own `lanes`
- a project can relocate its docs root with `rootDir`
- a project can override planner, runtime, skills, and Wave Control settings
- a project gets isolated runtime state when it is explicit in `wave.config.json`

That isolation is what lets one checkout run multiple project/lane/wave tracks without tmux, telemetry, ad-hoc storage, or planner-profile collisions.

## Minimal Config

```json
{
  "defaultProject": "app",
  "projects": {
    "app": {
      "rootDir": ".",
      "lanes": {
        "main": {}
      }
    },
    "service": {
      "rootDir": "services/api",
      "lanes": {
        "main": {}
      }
    }
  }
}
```

Rules:

- `defaultProject` is used when you omit `--project`
- `projects.<projectId>.rootDir` changes that project's default docs root
- `projects.<projectId>.lanes.<lane>` is the authoritative lane map for that project
- legacy top-level `lanes` still work as the implicit default-project compatibility layer

## Where State Lives

Implicit default project:

- planner profile: `.wave/project-profile.json`
- ad-hoc runs: `.wave/adhoc/default/runs/<run-id>/`
- launcher state: `.tmp/<lane>-wave-launcher/`

Explicit projects:

- planner profile: `.wave/projects/<projectId>/project-profile.json`
- ad-hoc runs: `.wave/adhoc/<projectId>/runs/<run-id>/`
- launcher state: `.tmp/projects/<projectId>/<lane>-wave-launcher/`

Project-scoped tmux session names, terminal prefixes, and telemetry spools derive from that same project id.

## Common Commands

Set project defaults:

```bash
pnpm exec wave project setup --project service
pnpm exec wave project show --project service --json
```

Draft and dry-run:

```bash
pnpm exec wave draft --project service --lane main --wave 1 --template implementation
pnpm exec wave launch --project service --lane main --dry-run --no-dashboard
```

Control and inspection:

```bash
pnpm exec wave control status --project service --lane main --wave 0 --json
pnpm exec wave coord show --project service --lane main --wave 0 --json
pnpm exec wave dep show --project service --lane main --wave 0 --json
pnpm exec wave dashboard --project service --lane main --attach current
```

Ad-hoc work:

```bash
pnpm exec wave adhoc plan --project service --lane main --task "Investigate release blocker"
pnpm exec wave adhoc run --project service --lane main --task "Patch the deploy script" --yes
```

Benchmarks:

```bash
pnpm exec wave benchmark run --project service --lane main --json
pnpm exec wave benchmark external-run --project service --lane main --adapter swe-bench-pro --dry-run --json
```

## Cross-Project Dependencies

Use owner and requester project metadata when the dependency crosses project boundaries:

```bash
pnpm exec wave dep post \
  --owner-project service --owner-lane main \
  --requester-project app --requester-lane release \
  --owner-wave 0 --requester-wave 2 \
  --agent launcher \
  --summary "Need API contract landed before release wave 2"
```

Dependency tickets are stored under the owner project's scoped dependency directory and carry both owner and requester project metadata.

## Telemetry Defaults

Packaged defaults:

- endpoint: `https://wave-control.up.railway.app/api/v1`
- enabled: `true`
- report mode: `metadata-only`

By default, repos using the packaged surface send project, lane, wave, run, proof, and benchmark metadata to the author's Wave Control endpoint. This is a personal project default, not a neutral hosted default.

Opt out explicitly with any of:

- `waveControl.enabled: false`
- `waveControl.reportMode: "disabled"`
- `pnpm exec wave launch --project service --lane main --no-telemetry`

Project-scoped telemetry identity defaults to the resolved `projectId` first, then lane and wave metadata from the active run.
