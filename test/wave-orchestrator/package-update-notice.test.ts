import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  maybeAnnouncePackageUpdate,
  PACKAGE_UPDATE_CHECK_SCHEMA_VERSION,
} from "../../scripts/wave-orchestrator/package-update-notice.mjs";

const tempDirs = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wave-update-notice-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("package update notice", () => {
  it("emits the cached notice immediately when the cache says a newer version exists", async () => {
    const cachePath = path.join(makeTempDir(), ".wave", "package-update-check.json");
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(
      cachePath,
      JSON.stringify(
        {
          schemaVersion: PACKAGE_UPDATE_CHECK_SCHEMA_VERSION,
          packageName: "@chllming/wave-orchestration",
          checkedAt: "2026-03-22T12:00:00.000Z",
          currentVersion: "0.6.1",
          latestVersion: "0.6.2",
          updateAvailable: true,
          lastErrorAt: null,
          lastErrorMessage: null,
        },
        null,
        2,
      ),
      "utf8",
    );
    const lines = [];

    const result = await maybeAnnouncePackageUpdate({
      cachePath,
      nowMs: Date.parse("2026-03-22T13:00:00.000Z"),
      packageMetadata: {
        name: "@chllming/wave-orchestration",
        version: "0.6.1",
      },
      fetchImpl: async () => {
        throw new Error("cache should prevent refetch");
      },
      emit: (line) => lines.push(line),
    });

    expect(result).toMatchObject({
      source: "cache",
      updateAvailable: true,
      latestVersion: "0.6.2",
      currentVersion: "0.6.1",
    });
    expect(lines).toEqual([
      "[wave:update] newer @chllming/wave-orchestration available: installed 0.6.1, latest 0.6.2",
      "[wave:update] update now with: pnpm exec wave self-update",
    ]);
  });

  it("refreshes stale cache entries from npm and records the newer version", async () => {
    const cachePath = path.join(makeTempDir(), ".wave", "package-update-check.json");
    const lines = [];

    const result = await maybeAnnouncePackageUpdate({
      cachePath,
      nowMs: Date.parse("2026-03-22T18:00:00.000Z"),
      packageMetadata: {
        name: "@chllming/wave-orchestration",
        version: "0.6.1",
      },
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ version: "0.6.2" }),
      }),
      emit: (line) => lines.push(line),
    });

    expect(result).toMatchObject({
      source: "network",
      updateAvailable: true,
      latestVersion: "0.6.2",
    });
    const cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    expect(cache).toMatchObject({
      currentVersion: "0.6.1",
      latestVersion: "0.6.2",
      updateAvailable: true,
    });
    expect(lines).toHaveLength(2);
  });

  it("fails open on fetch errors and records the failure without emitting a notice", async () => {
    const cachePath = path.join(makeTempDir(), ".wave", "package-update-check.json");
    const lines = [];

    const result = await maybeAnnouncePackageUpdate({
      cachePath,
      nowMs: Date.parse("2026-03-22T18:00:00.000Z"),
      packageMetadata: {
        name: "@chllming/wave-orchestration",
        version: "0.6.2",
      },
      fetchImpl: async () => {
        throw new Error("network unavailable");
      },
      emit: (line) => lines.push(line),
    });

    expect(result).toMatchObject({
      source: "error",
      updateAvailable: false,
      latestVersion: "0.6.2",
    });
    expect(lines).toEqual([]);
    const cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    expect(cache.lastErrorMessage).toContain("network unavailable");
  });
});
