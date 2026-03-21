import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendCoordinationRecord,
  compileAgentInbox,
  isClarificationLinkedRequest,
  readMaterializedCoordinationState,
  serializeCoordinationState,
  updateSeedRecords,
} from "../../scripts/wave-orchestrator/coordination-store.mjs";

const tempDirs = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wave-coordination-store-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("updateSeedRecords", () => {
  it("refreshes launcher seed records when the wave definition changes", () => {
    const dir = makeTempDir();
    const logPath = path.join(dir, "wave-0.jsonl");

    updateSeedRecords(logPath, {
      lane: "main",
      wave: 0,
      agents: [
        {
          agentId: "A1",
          title: "Initial title",
          prompt: "First prompt",
          ownedPaths: ["src/first.ts"],
        },
      ],
      componentPromotions: [],
      sharedPlanDocs: [],
      feedbackRequests: [],
    });

    updateSeedRecords(logPath, {
      lane: "main",
      wave: 0,
      agents: [
        {
          agentId: "A1",
          title: "Updated title",
          prompt: "Second prompt",
          ownedPaths: ["src/second.ts"],
        },
      ],
      componentPromotions: [],
      sharedPlanDocs: [],
      feedbackRequests: [],
    });

    const state = readMaterializedCoordinationState(logPath);
    expect(state.latestRecords).toHaveLength(1);
    expect(state.latestRecords[0]).toMatchObject({
      id: "wave-0-agent-A1-request",
      summary: "Wave 0 assigned to A1: Updated title",
      detail: "Second prompt",
      artifactRefs: ["src/second.ts"],
    });
  });
});

describe("serializeCoordinationState", () => {
  it("converts materialized maps to plain JSON-safe objects", () => {
    const dir = makeTempDir();
    const logPath = path.join(dir, "wave-0.jsonl");

    updateSeedRecords(logPath, {
      lane: "main",
      wave: 0,
      agents: [
        {
          agentId: "A1",
          title: "Runtime",
          prompt: "Own the runtime",
          ownedPaths: ["src/runtime.ts"],
        },
      ],
      componentPromotions: [],
      sharedPlanDocs: [],
      feedbackRequests: [],
    });

    const serialized = serializeCoordinationState(readMaterializedCoordinationState(logPath));
    expect(serialized.byId["wave-0-agent-A1-request"]).toMatchObject({
      agentId: "launcher",
      summary: "Wave 0 assigned to A1: Runtime",
    });
    expect(serialized.recordsByTarget["agent:A1"]).toHaveLength(1);
  });
});

describe("clarification-linked coordination matching", () => {
  it("matches closure conditions only for the referenced clarification id", () => {
    expect(
      isClarificationLinkedRequest(
        { closureCondition: "clarification:clarify-b" },
        new Set(["clarify-a"]),
      ),
    ).toBe(false);
    expect(
      isClarificationLinkedRequest(
        { closureCondition: "clarification:clarify-b" },
        new Set(["clarify-b"]),
      ),
    ).toBe(true);
  });
});

describe("compileAgentInbox", () => {
  it("includes open artifact-linked coordination for the owning agent", () => {
    const dir = makeTempDir();
    const logPath = path.join(dir, "wave-0.jsonl");

    updateSeedRecords(logPath, {
      lane: "main",
      wave: 0,
      agents: [
        {
          agentId: "A1",
          title: "Runtime",
          prompt: "Own the runtime",
          ownedPaths: ["src/runtime.ts"],
          components: ["runtime-engine"],
        },
      ],
      componentPromotions: [],
      sharedPlanDocs: [],
      feedbackRequests: [],
    });
    appendCoordinationRecord(logPath, {
      id: "block-runtime",
      lane: "main",
      wave: 0,
      agentId: "A8",
      kind: "blocker",
      targets: [],
      priority: "high",
      summary: "Runtime change is blocked pending integration confirmation",
      detail: "This blocker touches the implementation-owned runtime file.",
      artifactRefs: ["src/runtime.ts"],
      status: "open",
      source: "agent",
    });

    const state = readMaterializedCoordinationState(logPath);
    const inbox = compileAgentInbox({
      wave: { wave: 0 },
      agent: {
        agentId: "A1",
        ownedPaths: ["src/runtime.ts"],
        components: ["runtime-engine"],
      },
      state,
    });

    expect(inbox.text).toContain("## Artifact-linked open coordination");
    expect(inbox.text).toContain("Runtime change is blocked pending integration confirmation");
    expect(inbox.text).toContain("src/runtime.ts");
  });
});
