import fs from "node:fs";
import path from "node:path";
import {
  ensureDirectory,
  readJsonOrNull,
  toIsoTimestamp,
  writeJsonAtomic,
} from "./shared.mjs";

function normalizeStringArray(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
}

export function launcherProgressPathForRun(lanePaths, runId) {
  if (!lanePaths?.controlDir || !runId) {
    return null;
  }
  return path.join(lanePaths.controlDir, "supervisor", "runs", runId, "launcher-progress.json");
}

export function normalizeLauncherProgress(payload, defaults = {}) {
  const source = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  return {
    runId: String(source.runId || defaults.runId || "").trim() || null,
    waveNumber: Number.isFinite(Number(source.waveNumber))
      ? Number(source.waveNumber)
      : Number.isFinite(Number(defaults.waveNumber))
        ? Number(defaults.waveNumber)
        : null,
    attemptNumber: Number.isFinite(Number(source.attemptNumber))
      ? Number(source.attemptNumber)
      : Number.isFinite(Number(defaults.attemptNumber))
        ? Number(defaults.attemptNumber)
        : null,
    phase: String(source.phase || defaults.phase || "").trim() || null,
    selectedAgentIds: normalizeStringArray(source.selectedAgentIds),
    launchedAgentIds: normalizeStringArray(source.launchedAgentIds),
    completedAgentIds: normalizeStringArray(source.completedAgentIds),
    resumeFromPhase: String(source.resumeFromPhase || defaults.resumeFromPhase || "").trim() || null,
    forwardedClosureGaps: Array.isArray(source.forwardedClosureGaps)
      ? JSON.parse(JSON.stringify(source.forwardedClosureGaps))
      : [],
    gateSnapshotSummary:
      source.gateSnapshotSummary && typeof source.gateSnapshotSummary === "object"
        ? JSON.parse(JSON.stringify(source.gateSnapshotSummary))
        : null,
    finalized: source.finalized === true,
    finalDisposition: String(source.finalDisposition || defaults.finalDisposition || "").trim() || null,
    exitCode: Number.isInteger(source.exitCode) ? source.exitCode : null,
    updatedAt: String(source.updatedAt || defaults.updatedAt || "").trim() || toIsoTimestamp(),
  };
}

export function readLauncherProgress(filePath, defaults = {}) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  return normalizeLauncherProgress(readJsonOrNull(filePath), defaults);
}

export function writeLauncherProgress(filePath, payload, defaults = {}) {
  if (!filePath) {
    return null;
  }
  ensureDirectory(path.dirname(filePath));
  const normalized = normalizeLauncherProgress(payload, defaults);
  writeJsonAtomic(filePath, normalized);
  return normalized;
}

export function updateLauncherProgress(filePath, patch, defaults = {}) {
  if (!filePath) {
    return null;
  }
  const current = readLauncherProgress(filePath, defaults) || normalizeLauncherProgress({}, defaults);
  return writeLauncherProgress(
    filePath,
    {
      ...current,
      ...patch,
      updatedAt: toIsoTimestamp(),
    },
    defaults,
  );
}
