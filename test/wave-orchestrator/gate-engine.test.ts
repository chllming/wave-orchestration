import { describe, expect, it } from "vitest";
import { readWaveImplementationGatePure } from "../../scripts/wave-orchestrator/gate-engine.mjs";

describe("readWaveImplementationGatePure", () => {
  it("adjudicates eligible transport-only implementation failures when landed artifacts are otherwise coherent", () => {
    const wave = {
      wave: 0,
      agents: [
        {
          agentId: "A1",
          exitContract: {
            completion: "integrated",
            durability: "durable",
            proof: "integration",
            docImpact: "owned",
          },
          components: ["runtime-render-snapshot"],
          componentTargets: {
            "runtime-render-snapshot": "contract-frozen",
          },
          deliverables: ["docs/example.md"],
          proofArtifacts: [{ path: ".tmp/proof.json", kind: "check" }],
        },
      ],
    };

    const result = readWaveImplementationGatePure(
      wave,
      {
        A1: {
          agentId: "A1",
          exitCode: 0,
          proof: {
            completion: "integrated",
            durability: "durable",
            proof: "integration",
            state: "met",
          },
          docDelta: {
            state: "owned",
            paths: ["docs/example.md"],
          },
          components: [],
          deliverables: [{ path: "docs/example.md", exists: true }],
          proofArtifacts: [{ path: ".tmp/proof.json", kind: "check", exists: true }],
        },
      },
      {
        derivedState: {
          coordinationState: {
            latestRecords: [],
          },
        },
      },
    );

    expect(result).toMatchObject({
      ok: true,
      agentId: "A1",
      adjudicated: true,
      adjudicationStatus: "pass",
      failureClass: "transport-failure",
    });
  });

  it("holds transport-only failures in awaiting-adjudication when blocking coordination for the same agent remains open", () => {
    const wave = {
      wave: 0,
      agents: [
        {
          agentId: "A1",
          exitContract: {
            completion: "integrated",
            durability: "durable",
            proof: "integration",
            docImpact: "owned",
          },
          components: ["runtime-render-snapshot"],
          componentTargets: {
            "runtime-render-snapshot": "contract-frozen",
          },
        },
      ],
    };

    const result = readWaveImplementationGatePure(
      wave,
      {
        A1: {
          agentId: "A1",
          exitCode: 0,
          proof: {
            completion: "integrated",
            durability: "durable",
            proof: "integration",
            state: "met",
          },
          docDelta: {
            state: "owned",
            paths: ["docs/example.md"],
          },
          components: [],
        },
      },
      {
        derivedState: {
          coordinationState: {
            latestRecords: [
              {
                agentId: "A1",
                status: "open",
                blocking: true,
              },
            ],
          },
        },
      },
    );

    expect(result).toMatchObject({
      ok: false,
      agentId: "A1",
      statusCode: "awaiting-adjudication",
      adjudicated: true,
      adjudicationStatus: "ambiguous",
      failureClass: "transport-failure",
      eligibleForAdjudication: true,
    });
  });
});
