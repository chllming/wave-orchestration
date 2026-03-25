import { compactSingleLine } from "./shared.mjs";

export function formatReconcileBlockedWaveLine(blockedWave) {
  const parts = Array.isArray(blockedWave?.reasons)
    ? blockedWave.reasons
        .map((reason) => {
          const code = compactSingleLine(reason?.code || "", 80);
          const detail = compactSingleLine(reason?.detail || "", 240);
          return code && detail ? `${code}=${detail}` : "";
        })
        .filter(Boolean)
    : [];
  return `[reconcile] wave ${blockedWave?.wave ?? "unknown"} not reconstructable: ${
    parts.join("; ") || "unknown reason"
  }`;
}

export function formatReconcilePreservedWaveLine(preservedWave) {
  const parts = Array.isArray(preservedWave?.reasons)
    ? preservedWave.reasons
        .map((reason) => {
          const code = compactSingleLine(reason?.code || "", 80);
          const detail = compactSingleLine(reason?.detail || "", 240);
          return code && detail ? `${code}=${detail}` : "";
        })
        .filter(Boolean)
    : [];
  const previousState = compactSingleLine(preservedWave?.previousState || "completed", 80);
  return `[reconcile] wave ${preservedWave?.wave ?? "unknown"} preserved as ${previousState}: ${
    parts.join("; ") || "unknown reason"
  }`;
}
