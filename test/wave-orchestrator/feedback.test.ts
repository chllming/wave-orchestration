import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readWaveHumanFeedbackRequests } from "../../scripts/wave-orchestrator/coordination.mjs";
import {
  answerFeedbackRequest,
  createFeedbackRequest,
} from "../../scripts/wave-orchestrator/feedback.mjs";

const tempDirs = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slowfast-wave-feedback-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("feedback requests", () => {
  it("creates and answers wave 0 requests", () => {
    const feedbackStateDir = makeTempDir();
    const feedbackRequestsDir = path.join(feedbackStateDir, "requests");

    const request = createFeedbackRequest({
      feedbackStateDir,
      feedbackRequestsDir,
      lane: "leap-claw",
      wave: 0,
      agentId: "A0",
      orchestratorId: "orch-0",
      question: "Proceed?",
      context: "wave zero smoke",
    });

    expect(request.payload.wave).toBe(0);
    expect(fs.existsSync(request.filePath)).toBe(true);

    const answered = answerFeedbackRequest({
      feedbackStateDir,
      feedbackRequestsDir,
      requestId: request.requestId,
      response: "yes",
      operator: "tester",
    });

    expect(answered.status).toBe("answered");
    expect(answered.response?.text).toBe("yes");

    expect(
      readWaveHumanFeedbackRequests({
        feedbackRequestsDir,
        lane: "leap-claw",
        waveNumber: 0,
        agentIds: ["A0"],
        orchestratorId: "orch-0",
      }),
    ).toHaveLength(1);
  });

  it("does not overwrite an answered request without force", () => {
    const feedbackStateDir = makeTempDir();
    const feedbackRequestsDir = path.join(feedbackStateDir, "requests");

    const request = createFeedbackRequest({
      feedbackStateDir,
      feedbackRequestsDir,
      lane: "leap-claw",
      wave: 0,
      agentId: "A0",
      orchestratorId: "orch-0",
      question: "Proceed?",
      context: "wave zero smoke",
    });

    answerFeedbackRequest({
      feedbackStateDir,
      feedbackRequestsDir,
      requestId: request.requestId,
      response: "first",
      operator: "tester",
    });

    expect(() =>
      answerFeedbackRequest({
        feedbackStateDir,
        feedbackRequestsDir,
        requestId: request.requestId,
        response: "second",
        operator: "tester-2",
      }),
    ).toThrow(/already answered/);

    const stored = JSON.parse(fs.readFileSync(request.filePath, "utf8"));
    expect(stored.response?.text).toBe("first");
  });
});
