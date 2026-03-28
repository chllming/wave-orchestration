import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildSingleWaveLauncherArgs,
  nextIncompleteWave,
  parseArgs,
  readAutonomousBarrier,
} from "../../scripts/wave-orchestrator/autonomous.mjs";
import { appendDependencyTicket } from "../../scripts/wave-orchestrator/coordination-store.mjs";
const tempDirs = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wave-autonomous-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("autonomous parseArgs", () => {
  it("defaults to a single external attempt per wave", () => {
    const parsed = parseArgs([]);
    expect(parsed.help).toBe(false);
    expect(parsed.options.maxAttemptsPerWave).toBe(1);
    expect(parsed.options.executorMode).toBe("codex");
    expect(parsed.options.codexSandboxMode).toBe(null);
  });

  it("rejects the local executor", () => {
    expect(() => parseArgs(["--executor", "local"])).toThrow(/does not support --executor local/i);
  });

  it("accepts an explicit codex sandbox override", () => {
    const parsed = parseArgs(["--codex-sandbox", "workspace-write"]);
    expect(parsed.options.codexSandboxMode).toBe("workspace-write");
  });

  it("builds single-wave launcher args without referencing stale local variables", () => {
    expect(
      buildSingleWaveLauncherArgs({
        project: "default",
        lane: "main",
        wave: 3,
        attempt: 2,
        timeoutMinutes: 20,
        maxRetriesPerWave: 1,
        agentRateLimitRetries: 2,
        agentRateLimitBaseDelaySeconds: 5,
        agentRateLimitMaxDelaySeconds: 15,
        agentLaunchStaggerMs: 1000,
        executorMode: "codex",
        orchestratorId: "main-autonomous",
        noDashboard: true,
        codexSandboxMode: "workspace-write",
        keepSessions: true,
        keepTerminals: true,
        residentOrchestrator: true,
      }),
    ).toEqual([
      "--project",
      "default",
      "--lane",
      "main",
      "--start-wave",
      "3",
      "--end-wave",
      "3",
      "--timeout-minutes",
      "20",
      "--max-retries-per-wave",
      "1",
      "--agent-rate-limit-retries",
      "2",
      "--agent-rate-limit-base-delay-seconds",
      "5",
      "--agent-rate-limit-max-delay-seconds",
      "15",
      "--agent-launch-stagger-ms",
      "1000",
      "--executor",
      "codex",
      "--orchestrator-id",
      "main-autonomous",
      "--coordination-note",
      "autonomous single-wave run wave=3 attempt=2",
      "--no-dashboard",
      "--codex-sandbox",
      "workspace-write",
      "--keep-sessions",
      "--keep-terminals",
      "--resident-orchestrator",
    ]);
  });
});

describe("nextIncompleteWave", () => {
  it("returns the first wave not present in run-state", () => {
    expect(nextIncompleteWave([0, 1, 2, 3], [0, 1, 3])).toBe(2);
    expect(nextIncompleteWave([0, 1], [0, 1])).toBe(null);
  });
});

describe("readAutonomousBarrier", () => {
  it("blocks finalization when required inbound dependencies remain open", () => {
    const dir = makeTempDir();
    const lanePaths = {
      crossLaneDependenciesDir: path.join(dir, "dependencies"),
      ledgerDir: path.join(dir, "ledger"),
    };

    appendDependencyTicket(lanePaths.crossLaneDependenciesDir, "main", {
      id: "dep-1",
      kind: "request",
      lane: "main",
      wave: 0,
      agentId: "launcher",
      status: "open",
      summary: "Need release proof from another lane",
      detail: "required=true",
      closureCondition: "required=true",
      required: true,
    });

    expect(readAutonomousBarrier(lanePaths, "main")).toMatchObject({
      kind: "dependencies",
    });
    expect(readAutonomousBarrier(lanePaths, "main").message).toContain(
      "Stopping finalization for lane main",
    );
  });

  it("blocks finalization when any completed wave still has pending human input", () => {
    const dir = makeTempDir();
    const lanePaths = {
      crossLaneDependenciesDir: path.join(dir, "dependencies"),
      ledgerDir: path.join(dir, "ledger"),
    };
    fs.mkdirSync(lanePaths.ledgerDir, { recursive: true });
    fs.writeFileSync(
      path.join(lanePaths.ledgerDir, "wave-2.json"),
      JSON.stringify(
        {
          humanFeedback: ["feedback-1"],
          humanEscalations: ["escalation-1"],
        },
        null,
        2,
      ),
      "utf8",
    );

    const barrier = readAutonomousBarrier(lanePaths, "main");
    expect(barrier).toMatchObject({
      kind: "human-input",
      pendingHumanItems: ["feedback-1", "escalation-1"],
    });
    expect(barrier.message).toContain("Stopping finalization for lane main");
    expect(barrier.message).toContain("wave 2: feedback-1");
  });

  it("blocks the next wave when pending human input remains in the ledger", () => {
    const dir = makeTempDir();
    const lanePaths = {
      crossLaneDependenciesDir: path.join(dir, "dependencies"),
      ledgerDir: path.join(dir, "ledger"),
    };
    fs.mkdirSync(lanePaths.ledgerDir, { recursive: true });
    fs.writeFileSync(
      path.join(lanePaths.ledgerDir, "wave-2.json"),
      JSON.stringify(
        {
          humanFeedback: ["feedback-1"],
          humanEscalations: ["escalation-1"],
        },
        null,
        2,
      ),
      "utf8",
    );

    const barrier = readAutonomousBarrier(lanePaths, "main", 2);
    expect(barrier).toMatchObject({
      kind: "human-input",
      pendingHumanItems: ["feedback-1", "escalation-1"],
    });
    expect(barrier.message).toContain("Stopping before wave 2");
  });

  it("ignores non-blocking live human tasks even when stale ledger entries remain", () => {
    const dir = makeTempDir();
    const lanePaths = {
      crossLaneDependenciesDir: path.join(dir, "dependencies"),
      ledgerDir: path.join(dir, "ledger"),
      coordinationDir: path.join(dir, "coordination"),
      feedbackRequestsDir: path.join(dir, "feedback", "requests"),
    };
    fs.mkdirSync(lanePaths.ledgerDir, { recursive: true });
    fs.mkdirSync(lanePaths.coordinationDir, { recursive: true });
    fs.mkdirSync(lanePaths.feedbackRequestsDir, { recursive: true });
    fs.writeFileSync(
      path.join(lanePaths.ledgerDir, "wave-2.json"),
      JSON.stringify(
        {
          humanFeedback: ["feedback-1"],
          humanEscalations: [],
        },
        null,
        2,
      ),
      "utf8",
    );
    fs.writeFileSync(
      path.join(lanePaths.coordinationDir, "wave-2.jsonl"),
      `${JSON.stringify({
        id: "feedback-1",
        kind: "human-feedback",
        lane: "main",
        wave: 2,
        agentId: "A1",
        status: "open",
        blocking: false,
        blockerSeverity: "advisory",
        summary: "Optional operator note",
        detail: "Helpful context that should not block autonomous finalization.",
        createdAt: "2026-03-22T00:00:00.000Z",
        updatedAt: "2026-03-22T00:00:00.000Z",
      })}\n`,
      "utf8",
    );

    expect(readAutonomousBarrier(lanePaths, "main")).toBeNull();
    expect(readAutonomousBarrier(lanePaths, "main", 2)).toBeNull();
  });
});
