import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { spawnAgentProcessRunner } from "../../scripts/wave-orchestrator/agent-process-runner.mjs";
import { sleep } from "../../scripts/wave-orchestrator/shared.mjs";

const tempDirs = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wave-agent-process-runner-"));
  tempDirs.push(dir);
  return dir;
}

async function waitForFile(filePath, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(filePath)) {
      return true;
    }
    await sleep(50);
  }
  return fs.existsSync(filePath);
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("spawnAgentProcessRunner", () => {
  it("supports direct launches without a supervisor runtime record", async () => {
    const dir = makeTempDir();
    const statusPath = path.join(dir, "status", "A1.status.json");
    const logPath = path.join(dir, "logs", "A1.log");
    const payloadPath = path.join(dir, "runner-payload.json");

    const result = spawnAgentProcessRunner({
      payloadPath,
      lane: "main",
      waveNumber: 0,
      attempt: 1,
      agentId: "A1",
      sessionName: "main-wave-0-A1",
      statusPath,
      logPath,
      command: "exit 0",
    });

    expect(result.runnerPid).toBeGreaterThan(0);
    expect(await waitForFile(statusPath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(statusPath, "utf8"))).toMatchObject({
      code: 0,
      attempt: 1,
    });
    expect(fs.readFileSync(logPath, "utf8")).toContain("finished with code 0");
  });
});
