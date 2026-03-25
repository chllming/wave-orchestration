import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const orchestratorDir = path.join(repoRoot, "scripts", "wave-orchestrator");
const removedModuleNames = [
  "launcher-closure.mjs",
  "launcher-derived-state.mjs",
  "launcher-gates.mjs",
  "launcher-retry.mjs",
  "launcher-supervisor.mjs",
];

describe("engine module layout", () => {
  it("keeps engine implementations under the engine-oriented file names", () => {
    for (const moduleName of removedModuleNames) {
      expect(
        fs.existsSync(path.join(orchestratorDir, moduleName)),
        `${moduleName} should not exist in the live runtime tree`,
      ).toBe(false);
    }
  });
});
