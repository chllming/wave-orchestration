import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyContext7SelectionsToWave,
  loadContext7BundleIndex,
  prefetchContext7ForSelection,
} from "../../scripts/wave-orchestrator/context7.mjs";

const tempDirs = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slowfast-wave-context7-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function writeBundleIndex(dir) {
  const indexPath = path.join(dir, "bundles.json");
  fs.writeFileSync(
    indexPath,
    JSON.stringify(
      {
        version: 1,
        defaultBundle: "none",
        laneDefaults: {
          "leap-claw": "none",
        },
        bundles: {
          none: {
            description: "No external docs.",
            libraries: [],
          },
          "core-go": {
            description: "Temporal docs.",
            libraries: [
              {
                libraryName: "temporal",
                queryHint: "Go SDK workflows",
              },
            ],
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  return indexPath;
}

describe("Context7 selection resolution", () => {
  it("applies wave defaults and agent overrides without changing local prompt ownership", () => {
    const bundleIndex = loadContext7BundleIndex(writeBundleIndex(makeTempDir()));
    const wave = applyContext7SelectionsToWave(
      {
        wave: 4,
        file: "docs/plans/waves/wave-4.md",
        context7Defaults: {
          bundle: "core-go",
          query: "Temporal bootstrap defaults",
        },
        agents: [
          {
            agentId: "A1",
            title: "Bootstrap",
            prompt: "Implement bootstrap.",
            promptOverlay: "Implement bootstrap.",
            context7Config: {
              query: "Temporal activity retries",
            },
            ownedPaths: ["go/internal/bootstrap.go"],
          },
          {
            agentId: "A2",
            title: "Worker",
            prompt: "Implement worker.",
            promptOverlay: "Implement worker.",
            context7Config: null,
            ownedPaths: ["go/internal/worker.go"],
          },
        ],
      },
      {
        lane: "leap-claw",
        bundleIndex,
      },
    );

    expect(wave.context7Defaults).toEqual({
      bundle: "core-go",
      query: "Temporal bootstrap defaults",
    });
    expect(wave.agents[0]?.context7Resolved).toMatchObject({
      bundleId: "core-go",
      query: "Temporal activity retries",
      bundleSource: "wave",
      querySource: "agent",
    });
    expect(wave.agents[1]?.context7Resolved).toMatchObject({
      bundleId: "core-go",
      query: "Temporal bootstrap defaults",
      bundleSource: "wave",
      querySource: "wave",
    });
  });
});

describe("Context7 prefetch", () => {
  it("fails open when CONTEXT7_API_KEY is missing", async () => {
    const result = await prefetchContext7ForSelection(
      {
        bundleId: "core-go",
        query: "Temporal schedules",
        libraries: [{ libraryName: "temporal", libraryId: null, queryHint: null }],
        indexHash: "index",
      },
      {
        cacheDir: makeTempDir(),
        apiKey: "",
      },
    );

    expect(result).toMatchObject({
      mode: "missing-key",
      promptText: "",
    });
  });

  it("caches fetched text and reuses it on subsequent runs", async () => {
    const cacheDir = makeTempDir();
    const selection = {
      bundleId: "core-go",
      query: "Temporal schedules",
      libraries: [{ libraryName: "temporal", libraryId: null, queryHint: null }],
      indexHash: "index",
    };
    const seenUrls = [];
    const fetchImpl = async (url) => {
      seenUrls.push(String(url));
      if (String(url).includes("/libs/search")) {
        return {
          ok: true,
          json: async () => [{ id: "/temporalio/temporal", name: "Temporal" }],
          headers: new Headers(),
        };
      }
      return {
        ok: true,
        text: async () => "Temporal docs snippet",
        headers: new Headers(),
      };
    };

    const fetched = await prefetchContext7ForSelection(selection, {
      cacheDir,
      apiKey: "ctx7sk-test",
      fetchImpl,
      nowMs: Date.UTC(2026, 0, 1),
    });
    expect(fetched.mode).toBe("fetched");
    expect(fetched.promptText).toContain("Temporal docs snippet");
    expect(seenUrls).toHaveLength(2);

    const cached = await prefetchContext7ForSelection(selection, {
      cacheDir,
      apiKey: "ctx7sk-test",
      fetchImpl: async () => {
        throw new Error("cache should prevent refetch");
      },
      nowMs: Date.UTC(2026, 0, 1, 1),
    });
    expect(cached.mode).toBe("cached");
    expect(cached.promptText).toContain("Temporal docs snippet");
  });
});
