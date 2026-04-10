import fs from "node:fs";
import path from "node:path";
import { writeClosureAdjudication } from "./artifact-schemas.mjs";
import { REPO_ROOT, ensureDirectory } from "./shared.mjs";

function isOpenCoordinationStatus(status) {
  return ["open", "acknowledged", "in_progress"].includes(String(status || "").trim().toLowerCase());
}

function blockingCoordinationForAgent(derivedState, agentId) {
  const latestRecords = Array.isArray(derivedState?.coordinationState?.latestRecords)
    ? derivedState.coordinationState.latestRecords
    : [];
  return latestRecords.some((record) => {
    if (!isOpenCoordinationStatus(record?.status) || record?.blocking === false) {
      return false;
    }
    if (record?.agentId === agentId) {
      return true;
    }
    return (record?.targets || []).some((target) => String(target || "").trim() === `agent:${agentId}`);
  });
}

function buildEvidence(summary, envelope, derivedState) {
  return [
    { kind: "exit-code", value: summary?.exitCode ?? null },
    {
      kind: "deliverables",
      value: (summary?.deliverables || []).map((deliverable) => ({
        path: deliverable.path,
        exists: deliverable.exists === true,
      })),
    },
    {
      kind: "proof-artifacts",
      value: (summary?.proofArtifacts || []).map((artifact) => ({
        path: artifact.path,
        exists: artifact.exists === true,
      })),
    },
    {
      kind: "envelope-role",
      value: envelope?.role || null,
    },
    {
      kind: "integration-summary",
      value: derivedState?.integrationSummary?.recommendation || null,
    },
  ];
}

function synthesizedSignals(summary) {
  const signals = [];
  if (summary?.proof) {
    signals.push(
      `[wave-proof] completion=${summary.proof.completion} durability=${summary.proof.durability} proof=${summary.proof.proof} state=${summary.proof.state}${summary.proof.detail ? ` detail=${summary.proof.detail}` : ""}`,
    );
  }
  if (summary?.docDelta) {
    signals.push(
      `[wave-doc-delta] state=${summary.docDelta.state}${(summary.docDelta.paths || []).length > 0 ? ` paths=${summary.docDelta.paths.join(",")}` : ""}${summary.docDelta.detail ? ` detail=${summary.docDelta.detail}` : ""}`,
    );
  }
  for (const component of summary?.components || []) {
    signals.push(
      `[wave-component] component=${component.componentId} level=${component.level} state=${component.state}${component.detail ? ` detail=${component.detail}` : ""}`,
    );
  }
  return signals;
}

export function closureAdjudicationPath(lanePaths, waveNumber, attempt, agentId) {
  return path.join(
    lanePaths.statusDir,
    "..",
    "closure",
    `wave-${waveNumber}`,
    `attempt-${attempt || 1}`,
    `${agentId}.json`,
  );
}

export function evaluateClosureAdjudication({
  wave,
  lanePaths,
  gate,
  summary,
  derivedState,
  agentRun,
  envelope,
}) {
  if (gate?.failureClass !== "transport-failure" || gate?.eligibleForAdjudication !== true) {
    return {
      status: "ambiguous",
      reason: "not-eligible",
      detail: "Closure failure is not eligible for deterministic adjudication.",
      evidence: [],
      synthesizedSignals: [],
    };
  }
  if (summary?.proof?.state === "gap" || (summary?.gaps || []).length > 0) {
    return {
      status: "rework-required",
      reason: "semantic-negative-signal",
      detail: "Explicit negative semantic proof signals remain.",
      evidence: buildEvidence(summary, envelope, derivedState),
      synthesizedSignals: synthesizedSignals(summary),
    };
  }
  if (blockingCoordinationForAgent(derivedState, agentRun?.agent?.agentId)) {
    return {
      status: "ambiguous",
      reason: "blocking-coordination",
      detail: "Blocking coordination owned by the same agent slice remains open.",
      evidence: buildEvidence(summary, envelope, derivedState),
      synthesizedSignals: synthesizedSignals(summary),
    };
  }
  return {
    status: "pass",
    reason: "artifacts-and-envelope-coherent",
    detail: "Exit 0, landed artifacts, and coherent structured state support closure despite transport-only marker failure.",
    evidence: buildEvidence(summary, envelope, derivedState),
    synthesizedSignals: synthesizedSignals(summary),
  };
}

export function persistClosureAdjudication({
  lanePaths,
  waveNumber,
  attempt,
  agentId,
  payload,
}) {
  const filePath = closureAdjudicationPath(lanePaths, waveNumber, attempt, agentId);
  ensureDirectory(path.dirname(filePath));
  return {
    filePath,
    adjudication: writeClosureAdjudication(
      filePath,
      {
        lane: lanePaths?.lane || null,
        wave: waveNumber,
        attempt,
        agentId,
        ...payload,
      },
      {
        lane: lanePaths?.lane || null,
        wave: waveNumber,
        attempt,
        agentId,
      },
    ),
  };
}

export function readPersistedClosureAdjudication(filePath, defaults = {}) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return {
    ...payload,
    filePath: path.isAbsolute(filePath) ? path.relative(REPO_ROOT, filePath) : filePath,
    ...defaults,
  };
}
