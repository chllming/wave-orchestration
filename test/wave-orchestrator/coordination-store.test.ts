import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  compileAgentInbox,
  compileSharedSummary,
  isClarificationLinkedRequest,
  materializeCoordinationState,
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

describe("clarification linking", () => {
  it("requires an exact clarification id match for closureCondition links", () => {
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
  it("surfaces open coordination relevant to owned paths and components via artifactRefs", () => {
    const state = materializeCoordinationState([
      {
        id: "block-owned-file",
        kind: "blocker",
        lane: "main",
        wave: 0,
        agentId: "A2",
        targets: [],
        status: "open",
        priority: "high",
        artifactRefs: ["src/owned.ts"],
        dependsOn: [],
        closureCondition: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        confidence: "medium",
        summary: "Owned file blocked",
        detail: "Need follow-up on src/owned.ts",
        source: "agent",
      },
      {
        id: "evidence-owned-dir",
        kind: "evidence",
        lane: "main",
        wave: 0,
        agentId: "A3",
        targets: [],
        status: "open",
        priority: "normal",
        artifactRefs: ["src/runtime/helpers.ts"],
        dependsOn: [],
        closureCondition: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        confidence: "medium",
        summary: "Owned directory evidence",
        detail: "Runtime helper changed",
        source: "agent",
      },
      {
        id: "request-owned-component",
        kind: "request",
        lane: "main",
        wave: 0,
        agentId: "A8",
        targets: [],
        status: "open",
        priority: "normal",
        artifactRefs: ["runtime-engine"],
        dependsOn: [],
        closureCondition: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        confidence: "medium",
        summary: "Runtime component follow-up",
        detail: "Need more proof for the runtime-engine component.",
        source: "agent",
      },
    ]);

    const inbox = compileAgentInbox({
      wave: { wave: 0 },
      agent: {
        agentId: "A1",
        ownedPaths: ["src/owned.ts", "src/runtime"],
        components: ["runtime-engine"],
      },
      state,
    });

    expect(inbox.text).toContain("## Relevant open coordination");
    expect(inbox.text).toContain("Owned file blocked");
    expect(inbox.text).toContain("Owned directory evidence");
    expect(inbox.text).toContain("Runtime component follow-up");
  });

  it("renders enriched integration evidence in shared summaries and inboxes", () => {
    const state = materializeCoordinationState([]);
    const integrationSummary = {
      recommendation: "needs-more-work",
      detail: "Integration still has open cross-component issues.",
      changedInterfaces: ["decision-1: API contract changed for runtime-engine"],
      crossComponentImpacts: ["decision-1: API contract changed [owners: A1, A2]"],
      proofGaps: ["A1: Missing integration proof."],
      deployRisks: ["A2: Deployment api ended in state failed (healthcheck-failed)."],
      docGaps: ["A1:shared:docs/plans/master-plan.md: Shared-plan reconciliation required"],
      runtimeAssignments: [],
      conflictingClaims: [],
    };

    const shared = compileSharedSummary({
      wave: { wave: 0 },
      state,
      integrationSummary,
    });
    const inbox = compileAgentInbox({
      wave: { wave: 0 },
      agent: { agentId: "A1", ownedPaths: [], components: [] },
      state,
      integrationSummary,
    });

    expect(shared.text).toContain("## Changed interfaces");
    expect(shared.text).toContain("## Deploy risks");
    expect(shared.text).toContain("API contract changed for runtime-engine");
    expect(inbox.text).toContain("Changed interfaces");
    expect(inbox.text).toContain("Cross-component impacts");
    expect(inbox.text).toContain("Deployment api ended in state failed");
  });
});
