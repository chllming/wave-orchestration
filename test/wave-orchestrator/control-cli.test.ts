import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { PACKAGE_ROOT } from "../../scripts/wave-orchestrator/shared.mjs";

const tempDirs = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wave-control-cli-"));
  tempDirs.push(dir);
  return dir;
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function runWaveCli(args, cwd) {
  return spawnSync("node", [path.join(PACKAGE_ROOT, "scripts", "wave.mjs"), ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      WAVE_SKIP_UPDATE_CHECK: "1",
    },
  });
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("wave control CLI", () => {
  it("writes, shows, and clears rerun requests", () => {
    const repoDir = makeTempDir();
    writeJson(path.join(repoDir, "package.json"), { name: "fixture-repo", private: true });

    expect(runWaveCli(["init"], repoDir).status).toBe(0);

    const requestResult = runWaveCli(
      [
        "control",
        "rerun",
        "request",
        "--lane",
        "main",
        "--wave",
        "0",
        "--agent",
        "A1",
        "--clear-reuse",
        "A1",
        "--requested-by",
        "tester",
        "--reason",
        "resume targeted implementation work",
      ],
      repoDir,
    );
    expect(requestResult.status).toBe(0);
    expect(JSON.parse(requestResult.stdout)).toMatchObject({
      rerunRequest: {
        selectedAgentIds: ["A1"],
        clearReusableAgentIds: ["A1"],
        requestedBy: "tester",
      },
      effectiveSelectedAgentIds: ["A1"],
    });

    const getResult = runWaveCli(
      ["control", "rerun", "get", "--lane", "main", "--wave", "0"],
      repoDir,
    );
    expect(getResult.status).toBe(0);
    expect(JSON.parse(getResult.stdout)).toMatchObject({
      rerunRequest: {
        selectedAgentIds: ["A1"],
        clearReusableAgentIds: ["A1"],
      },
      effectiveSelectedAgentIds: ["A1"],
    });

    const clearResult = runWaveCli(
      ["control", "rerun", "clear", "--lane", "main", "--wave", "0"],
      repoDir,
    );
    expect(clearResult.status).toBe(0);

    const clearedGet = runWaveCli(
      ["control", "rerun", "get", "--lane", "main", "--wave", "0"],
      repoDir,
    );
    expect(clearedGet.status).toBe(0);
    expect(JSON.parse(clearedGet.stdout).rerunRequest).toBeNull();
  });

  it("surfaces pending human-input tasks in control status", () => {
    const repoDir = makeTempDir();
    writeJson(path.join(repoDir, "package.json"), { name: "fixture-repo", private: true });

    expect(runWaveCli(["init"], repoDir).status).toBe(0);

    const createResult = runWaveCli(
      [
        "control",
        "task",
        "create",
        "--lane",
        "main",
        "--wave",
        "0",
        "--agent",
        "A1",
        "--kind",
        "human-input",
        "--summary",
        "Need rollout window",
        "--detail",
        "Confirm the live maintenance window before continuing.",
      ],
      repoDir,
    );
    expect(createResult.status).toBe(0);

    const statusResult = runWaveCli(
      [
        "control",
        "status",
        "--lane",
        "main",
        "--wave",
        "0",
        "--agent",
        "A1",
        "--json",
      ],
      repoDir,
    );
    expect(statusResult.status).toBe(0);
    expect(JSON.parse(statusResult.stdout)).toMatchObject({
      agentId: "A1",
      blockingEdge: {
        kind: "human-input",
      },
      tasks: [
        expect.objectContaining({
          taskType: "human-input",
          state: "input-required",
          ownerAgentId: "A1",
        }),
      ],
      logicalAgents: [
        expect.objectContaining({
          agentId: "A1",
          state: "blocked",
        }),
      ],
    });
  });
});
