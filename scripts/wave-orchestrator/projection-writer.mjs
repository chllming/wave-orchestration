import path from "node:path";
import { parseStructuredSignalsFromLog } from "./dashboard-state.mjs";
import { readRunExecutionSummary } from "./gate-engine.mjs";
import { waveProofRegistryPath } from "./proof-registry.mjs";
import { relaunchReasonBuckets, writeWaveRelaunchPlan } from "./retry-engine.mjs";
import { toIsoTimestamp } from "./shared.mjs";
import { buildQualityMetrics, writeTraceBundle } from "./traces.mjs";

export function writeWaveAttemptTraceProjection({
  lanePaths,
  wave,
  attempt,
  launcherOptions,
  derivedState,
  manifest,
  agentRuns,
  gateSnapshot,
  tracesDir,
}) {
  const structuredSignals = Object.fromEntries(
    agentRuns.map((run) => [run.agent.agentId, parseStructuredSignalsFromLog(run.logPath)]),
  );
  const summariesByAgentId = Object.fromEntries(
    agentRuns
      .map((run) => [run.agent.agentId, readRunExecutionSummary(run, wave, { mode: "compat" })])
      .filter(([, summary]) => summary),
  );
  const traceDir = writeTraceBundle({
    tracesDir,
    lanePaths,
    launcherOptions,
    wave,
    attempt,
    manifest,
    coordinationLogPath: derivedState.coordinationLogPath,
    coordinationState: derivedState.coordinationState,
    ledger: derivedState.ledger,
    docsQueue: derivedState.docsQueue,
    capabilityAssignments: derivedState.capabilityAssignments,
    dependencySnapshot: derivedState.dependencySnapshot,
    securitySummary: derivedState.securitySummary,
    integrationSummary: derivedState.integrationSummary,
    integrationMarkdownPath: derivedState.integrationMarkdownPath,
    proofRegistryPath: lanePaths.proofDir ? waveProofRegistryPath(lanePaths, wave.wave) : null,
    controlPlanePath: path.join(lanePaths.controlPlaneDir, `wave-${wave.wave}.jsonl`),
    clarificationTriage: derivedState.clarificationTriage,
    agentRuns,
    structuredSignals,
    gateSnapshot,
    quality: buildQualityMetrics({
      tracesDir,
      wave,
      coordinationState: derivedState.coordinationState,
      integrationSummary: derivedState.integrationSummary,
      ledger: derivedState.ledger,
      docsQueue: derivedState.docsQueue,
      capabilityAssignments: derivedState.capabilityAssignments,
      dependencySnapshot: derivedState.dependencySnapshot,
      summariesByAgentId,
      agentRuns,
      gateSnapshot,
      attempt,
      coordinationLogPath: derivedState.coordinationLogPath,
    }),
  });
  return {
    traceDir,
    structuredSignals,
    summariesByAgentId,
  };
}

export function writeWaveRelaunchProjection({
  lanePaths,
  wave,
  attempt,
  runs,
  failures,
  derivedState,
}) {
  writeWaveRelaunchPlan(lanePaths, wave.wave, {
    wave: wave.wave,
    attempt,
    phase: derivedState?.ledger?.phase || null,
    selectedAgentIds: runs.map((run) => run.agent.agentId),
    reasonBuckets: relaunchReasonBuckets(runs, failures, derivedState),
    executorStates: Object.fromEntries(
      runs.map((run) => [run.agent.agentId, run.agent.executorResolved || null]),
    ),
    fallbackHistory: Object.fromEntries(
      runs.map((run) => [
        run.agent.agentId,
        run.agent.executorResolved?.executorHistory || [],
      ]),
    ),
    createdAt: toIsoTimestamp(),
  });
}
