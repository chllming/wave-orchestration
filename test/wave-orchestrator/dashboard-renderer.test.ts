import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseDashboardArgs,
  renderDashboard,
  resolveDashboardAttachFallback,
} from "../../scripts/wave-orchestrator/dashboard-renderer.mjs";

const tempDirs = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wave-dashboard-renderer-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("dashboard renderer", () => {
  it("shows completed versus active versus pending counts in the global dashboard", () => {
    const now = new Date().toISOString();
    const rendered = renderDashboard({
      dashboardPath: "/tmp/global.json",
      lane: "main",
      state: {
        lane: "main",
        runId: "run-1",
        status: "running",
        startedAt: now,
        updatedAt: now,
        options: {
          autoNext: false,
          startWave: 0,
          endWave: 0,
          maxRetriesPerWave: 1,
        },
        waves: [
          {
            wave: 0,
            status: "running",
            attempt: 1,
            maxAttempts: 2,
            agentsTotal: 9,
            agentsCompleted: 2,
            agentsActive: 3,
            agentsPending: 4,
            agentsFailed: 0,
            coordinationOpen: 2,
            openClarifications: 1,
            openHumanEscalations: 0,
            oldestOpenCoordinationAgeMs: 600000,
            oldestUnackedRequestAgeMs: 300000,
            overdueAckCount: 1,
            overdueClarificationCount: 0,
            lastMessage: "active",
            deployments: [],
          },
        ],
        events: [],
      },
    });

    expect(rendered).toContain("done 2/9 active 3 pending 4 fail 0");
    expect(rendered).toContain("Coord: open 2 clarifications 1 human 0 overdue-ack 1 overdue-clarification 0");
    expect(rendered).not.toContain("2/9 ok, 0 fail");
  });

  it("adds ANSI color cues when colorized output is requested", () => {
    const now = new Date().toISOString();
    const rendered = renderDashboard({
      dashboardPath: "/tmp/wave.json",
      lane: "main",
      colorize: true,
      state: {
        lane: "main",
        wave: 0,
        status: "running",
        attempt: 1,
        maxAttempts: 2,
        startedAt: now,
        updatedAt: now,
        runTag: "run-1",
        waveFile: "docs/plans/waves/wave-0.md",
        messageBoardPath: "board.md",
        agents: [
          {
            agentId: "A1",
            state: "running",
            attempts: 1,
            exitCode: null,
            deploymentService: null,
            deploymentState: null,
            detail: "",
            lastUpdateAt: now,
          },
        ],
        events: [{ at: now, level: "warn", agentId: "A1", message: "waiting on proof" }],
      },
    });

    expect(rendered).toContain("\u001b[");
  });

  it("accepts stable attach mode without requiring a dashboard file", () => {
    expect(parseDashboardArgs(["--project", "service", "--lane", "release", "--attach", "global"])).toEqual({
      help: false,
      options: expect.objectContaining({
        project: "service",
        lane: "release",
        attach: "global",
        dashboardFile: null,
      }),
    });
  });

  it("falls back to the last written current-wave dashboard when no live session exists", () => {
    const dir = makeTempDir();
    const dashboardsDir = path.join(dir, "dashboards");
    fs.mkdirSync(dashboardsDir, { recursive: true });
    const globalDashboardPath = path.join(dashboardsDir, "global.json");
    const currentWavePath = path.join(dashboardsDir, "wave-3.json");
    const olderWavePath = path.join(dashboardsDir, "wave-2.json");
    fs.writeFileSync(
      globalDashboardPath,
      JSON.stringify(
        {
          lane: "main",
          waves: [
            { wave: 2, status: "completed", updatedAt: "2026-03-28T00:00:00.000Z" },
            { wave: 3, status: "running", updatedAt: "2026-03-28T01:00:00.000Z" },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );
    fs.writeFileSync(currentWavePath, JSON.stringify({ wave: 3 }, null, 2), "utf8");
    fs.writeFileSync(olderWavePath, JSON.stringify({ wave: 2 }, null, 2), "utf8");

    expect(
      resolveDashboardAttachFallback(
        {
          dashboardsDir,
          globalDashboardPath,
        },
        "current",
      ),
    ).toEqual({
      dashboardFile: currentWavePath,
    });
  });
});
