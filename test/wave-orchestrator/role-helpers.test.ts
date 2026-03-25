import { describe, expect, it } from "vitest";
import {
  isClosureRoleAgentId,
  resolveWaveRoleBindings,
} from "../../scripts/wave-orchestrator/role-helpers.mjs";

describe("resolveWaveRoleBindings", () => {
  it("prefers wave-specific closure role overrides over lane defaults", () => {
    const roleBindings = resolveWaveRoleBindings(
      {
        contEvalAgentId: "E9",
        integrationAgentId: "I8",
        documentationAgentId: "D9",
        contQaAgentId: "Q0",
        agents: [
          { agentId: "I8" },
          { agentId: "Q0" },
        ],
      },
      {
        contEvalAgentId: "E0",
        integrationAgentId: "A8",
        documentationAgentId: "A9",
        contQaAgentId: "A0",
      },
    );

    expect(roleBindings).toMatchObject({
      contEvalAgentId: "E9",
      integrationAgentId: "I8",
      documentationAgentId: "D9",
      contQaAgentId: "Q0",
    });
    expect(isClosureRoleAgentId("I8", roleBindings)).toBe(true);
    expect(isClosureRoleAgentId("A8", roleBindings)).toBe(false);
  });

  it("treats security reviewers as closure roles", () => {
    const roleBindings = resolveWaveRoleBindings(
      {
        agents: [
          {
            agentId: "S7",
            rolePromptPaths: ["docs/agents/wave-security-role.md"],
          },
        ],
      },
      {
        contEvalAgentId: "E0",
        integrationAgentId: "A8",
        documentationAgentId: "A9",
        contQaAgentId: "A0",
      },
    );

    expect(roleBindings.securityReviewerAgentIds).toEqual(["S7"]);
    expect(roleBindings.closureAgentIds).toContain("S7");
    expect(isClosureRoleAgentId("S7", roleBindings)).toBe(true);
  });
});
