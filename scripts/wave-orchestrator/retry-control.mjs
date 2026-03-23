import fs from "node:fs";
import path from "node:path";
import {
  readRetryOverride,
  readRelaunchPlan,
  writeRetryOverride,
} from "./artifact-schemas.mjs";
import {
  appendWaveControlEvent,
  readWaveControlPlaneState,
  syncWaveControlPlaneProjections,
} from "./control-plane.mjs";
import { isSecurityReviewAgent } from "./role-helpers.mjs";
import { ensureDirectory, parseNonNegativeInt } from "./shared.mjs";

function uniqueAgentIds(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
}

export function waveRetryOverridePath(lanePaths, waveNumber) {
  return path.join(lanePaths.controlDir, `retry-override-wave-${parseNonNegativeInt(waveNumber, "wave")}.json`);
}

export function waveRelaunchPlanPath(lanePaths, waveNumber) {
  return path.join(lanePaths.statusDir, `relaunch-plan-wave-${parseNonNegativeInt(waveNumber, "wave")}.json`);
}

export function readWaveRetryOverride(lanePaths, waveNumber) {
  const state = readWaveControlPlaneState(lanePaths, waveNumber);
  const activeRequest = state.activeRerunRequest;
  if (!activeRequest && state.rerunRequests.length === 0) {
    return readRetryOverride(waveRetryOverridePath(lanePaths, waveNumber), {
      lane: lanePaths?.lane || null,
      wave: waveNumber,
    });
  }
  if (!activeRequest) {
    return null;
  }
  return readRetryOverride(waveRetryOverridePath(lanePaths, waveNumber), {
    lane: lanePaths?.lane || null,
    wave: waveNumber,
  }) || {
    lane: lanePaths?.lane || null,
    wave: waveNumber,
    selectedAgentIds: activeRequest.selectedAgentIds,
    clearReusableAgentIds: activeRequest.clearReusableAgentIds,
    preserveReusableAgentIds: activeRequest.preserveReusableAgentIds,
    resumePhase: activeRequest.resumeCursor || null,
    requestedBy: activeRequest.requestedBy || "human-operator",
    reason: activeRequest.reason || null,
    applyOnce: activeRequest.applyOnce !== false,
    createdAt: activeRequest.createdAt,
  };
}

export function writeWaveRetryOverride(lanePaths, waveNumber, payload) {
  const filePath = waveRetryOverridePath(lanePaths, waveNumber);
  ensureDirectory(path.dirname(filePath));
  const requestId =
    String(payload?.requestId || "").trim() ||
    `rerun-wave-${parseNonNegativeInt(waveNumber, "wave")}-${Date.now()}`;
  appendWaveControlEvent(lanePaths, waveNumber, {
    entityType: "rerun_request",
    entityId: requestId,
    action: "requested",
    source: "operator",
    actor: String(payload?.requestedBy || "human-operator"),
    data: {
      requestId,
      state: "active",
      selectedAgentIds: uniqueAgentIds(payload?.selectedAgentIds),
      resumeCursor: String(payload?.resumeCursor || payload?.resumePhase || "").trim() || null,
      reuseAttemptIds: uniqueAgentIds(payload?.reuseAttemptIds),
      reuseProofBundleIds: uniqueAgentIds(payload?.reuseProofBundleIds),
      reuseDerivedSummaries: payload?.reuseDerivedSummaries !== false,
      invalidateComponentIds: uniqueAgentIds(payload?.invalidateComponentIds),
      clearReusableAgentIds: uniqueAgentIds(payload?.clearReusableAgentIds),
      preserveReusableAgentIds: uniqueAgentIds(payload?.preserveReusableAgentIds),
      requestedBy: String(payload?.requestedBy || "human-operator"),
      reason: String(payload?.reason || "").trim() || null,
      applyOnce: payload?.applyOnce !== false,
      createdAt: String(payload?.createdAt || "") || undefined,
    },
  });
  const projections = syncWaveControlPlaneProjections(
    lanePaths,
    waveNumber,
    readWaveControlPlaneState(lanePaths, waveNumber),
  );
  return writeRetryOverride(filePath, projections.retryOverride, {
    lane: lanePaths?.lane || null,
    wave: waveNumber,
  });
}

export function clearWaveRetryOverride(lanePaths, waveNumber) {
  const activeRequest = readWaveControlPlaneState(lanePaths, waveNumber).activeRerunRequest;
  if (activeRequest?.requestId) {
    appendWaveControlEvent(lanePaths, waveNumber, {
      entityType: "rerun_request",
      entityId: activeRequest.requestId,
      action: "cleared",
      source: "operator",
      actor: "human-operator",
      data: {
        ...activeRequest,
        state: "cleared",
        updatedAt: undefined,
      },
    });
    syncWaveControlPlaneProjections(
      lanePaths,
      waveNumber,
      readWaveControlPlaneState(lanePaths, waveNumber),
    );
  }
  try {
    fs.rmSync(waveRetryOverridePath(lanePaths, waveNumber), { force: true });
  } catch {
    // no-op
  }
}

export function readWaveRelaunchPlanSnapshot(lanePaths, waveNumber) {
  return readRelaunchPlan(waveRelaunchPlanPath(lanePaths, waveNumber), {
    wave: waveNumber,
  });
}

export function resolveRetryOverrideAgentIds(waveDefinition, lanePaths, override) {
  const selectedAgentIds = uniqueAgentIds(override?.selectedAgentIds);
  if (selectedAgentIds.length > 0) {
    return selectedAgentIds;
  }
  const resumePhase = String(override?.resumePhase || "")
    .trim()
    .toLowerCase();
  if (!resumePhase) {
    return [];
  }
  const agents = Array.isArray(waveDefinition?.agents) ? waveDefinition.agents : [];
  const closureAgentIds = new Set(
    [
      lanePaths?.contEvalAgentId || "E0",
      lanePaths?.integrationAgentId || "A8",
      lanePaths?.documentationAgentId || "A9",
      lanePaths?.contQaAgentId || "A0",
    ].filter(Boolean),
  );
  if (resumePhase === "implementation") {
    return agents
      .filter((agent) => agent?.agentId && !closureAgentIds.has(agent.agentId) && !isSecurityReviewAgent(agent))
      .map((agent) => agent.agentId);
  }
  if (resumePhase === "integrating") {
    return [lanePaths?.integrationAgentId || "A8"];
  }
  if (resumePhase === "docs-closure") {
    return [lanePaths?.documentationAgentId || "A9"];
  }
  if (resumePhase === "cont-qa-closure") {
    return [lanePaths?.contQaAgentId || "A0"];
  }
  if (resumePhase === "cont-eval") {
    return [lanePaths?.contEvalAgentId || "E0"];
  }
  return [];
}

export function resolveRetryOverrideRuns(agentRuns, override, lanePaths, waveDefinition) {
  const selectedAgentIds = resolveRetryOverrideAgentIds(waveDefinition, lanePaths, override);
  if (selectedAgentIds.length === 0) {
    return {
      runs: [],
      selectedAgentIds: [],
      unknownAgentIds: [],
    };
  }
  const runsByAgentId = new Map((agentRuns || []).map((run) => [run?.agent?.agentId, run]));
  const unknownAgentIds = selectedAgentIds.filter((agentId) => !runsByAgentId.has(agentId));
  return {
    runs: selectedAgentIds.map((agentId) => runsByAgentId.get(agentId)).filter(Boolean),
    selectedAgentIds,
    unknownAgentIds,
  };
}
