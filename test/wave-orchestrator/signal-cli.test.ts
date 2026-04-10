import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { PACKAGE_ROOT } from "../../scripts/wave-orchestrator/shared.mjs";

const tempDirs = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wave-signal-cli-"));
  tempDirs.push(dir);
  return dir;
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

describe("wave signal CLI", () => {
  it("prints canonical proof markers and normalizes complete to met", () => {
    const repoDir = makeTempDir();
    const result = runWaveCli(
      [
        "signal",
        "proof",
        "--completion",
        "integrated",
        "--durability",
        "durable",
        "--proof",
        "integration",
        "--state",
        "complete",
        "--detail",
        "ready-for-closeout",
      ],
      repoDir,
    );

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(
      "[wave-proof] completion=integrated durability=durable proof=integration state=met detail=ready-for-closeout",
    );
  });

  it("can append canonical signal lines to a file and emit json", () => {
    const repoDir = makeTempDir();
    const appendFile = path.join(repoDir, "signals.log");
    const result = runWaveCli(
      [
        "signal",
        "component",
        "--id",
        "runtime-render-snapshot",
        "--level",
        "contract-frozen",
        "--state",
        "met",
        "--detail",
        "component-landed",
        "--append-file",
        appendFile,
        "--json",
      ],
      repoDir,
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      kind: "component",
      line: "[wave-component] component=runtime-render-snapshot level=contract-frozen state=met detail=component-landed",
      appendFile,
    });
    expect(fs.readFileSync(appendFile, "utf8").trim()).toBe(
      "[wave-component] component=runtime-render-snapshot level=contract-frozen state=met detail=component-landed",
    );
  });
});
