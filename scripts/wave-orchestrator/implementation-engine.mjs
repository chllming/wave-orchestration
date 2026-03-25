import { readStatusCodeIfPresent } from "./dashboard-state.mjs";
import { resolveRetryOverrideRuns } from "./retry-control.mjs";
import {
  applyPersistedRelaunchPlan,
  persistedRelaunchPlanMatchesCurrentState,
  resolveRelaunchRuns,
  selectInitialWaveRuns,
  selectReusablePreCompletedAgentIds,
} from "./retry-engine.mjs";

export function planInitialWaveAttempt({
  agentRuns,
  lanePaths,
  wave,
  derivedState,
  proofRegistry,
  retryOverride,
  persistedRelaunchPlan,
}) {
  const preCompletedAgentIds = selectReusablePreCompletedAgentIds(agentRuns, lanePaths, {
    retryOverride,
    wave,
    derivedState,
    proofRegistry,
  });
  const staleCompletedAgentIds = agentRuns
    .filter(
      (run) =>
        !preCompletedAgentIds.has(run.agent.agentId) &&
        readStatusCodeIfPresent(run.statusPath) === 0,
    )
    .map((run) => run.agent.agentId);

  const persistedPlanIsCurrent =
    !persistedRelaunchPlan ||
    persistedRelaunchPlanMatchesCurrentState(
      agentRuns,
      persistedRelaunchPlan,
      lanePaths,
      wave,
    );
  const effectivePersistedPlan = persistedPlanIsCurrent ? persistedRelaunchPlan : null;
  const availableRuns = agentRuns.filter((run) => !preCompletedAgentIds.has(run.agent.agentId));
  const persistedRuns = applyPersistedRelaunchPlan(
    availableRuns,
    effectivePersistedPlan,
    lanePaths,
    wave,
  );
  const overrideResolution = resolveRetryOverrideRuns(availableRuns, retryOverride, lanePaths, wave);

  let selectedRuns = [];
  let source = "initial";
  if (overrideResolution.unknownAgentIds.length === 0 && overrideResolution.runs.length > 0) {
    selectedRuns = overrideResolution.runs;
    source = "override";
  } else if (persistedRuns.length > 0) {
    selectedRuns = persistedRuns;
    source = "persisted-relaunch";
  } else {
    selectedRuns = selectInitialWaveRuns(availableRuns, lanePaths, wave);
  }

  return {
    preCompletedAgentIds,
    staleCompletedAgentIds,
    availableRuns,
    selectedRuns,
    source,
    overrideResolution,
    persistedPlanIsCurrent,
    shouldClearPersistedRelaunchPlan: Boolean(
      persistedRelaunchPlan && !persistedPlanIsCurrent,
    ),
  };
}

export function planRetryWaveAttempt({
  agentRuns,
  failures,
  derivedState,
  lanePaths,
  wave,
  retryOverride,
  waveState = null,
}) {
  const relaunchResolution = resolveRelaunchRuns(
    agentRuns,
    failures,
    derivedState,
    lanePaths,
    wave,
    waveState ? { waveState } : {},
  );
  const overrideResolution = resolveRetryOverrideRuns(
    agentRuns,
    retryOverride,
    lanePaths,
    wave,
  );

  let selectedRuns = [];
  let source = "retry";
  let barrier = relaunchResolution.barrier || null;
  if (overrideResolution.unknownAgentIds.length === 0 && overrideResolution.runs.length > 0) {
    selectedRuns = overrideResolution.runs;
    barrier = null;
    source = "override";
  } else if (!barrier) {
    selectedRuns = relaunchResolution.runs;
  }

  return {
    selectedRuns,
    source,
    barrier,
    relaunchResolution,
    overrideResolution,
  };
}
