import path from "node:path";
import { PACKAGE_ROOT, readJsonOrNull } from "./shared.mjs";

export const WAVE_PACKAGE_NAME = "@chllming/wave-orchestration";
export const PACKAGE_METADATA_PATH = path.join(PACKAGE_ROOT, "package.json");

export function readInstalledPackageMetadata(metadataPath = PACKAGE_METADATA_PATH) {
  const payload = readJsonOrNull(metadataPath);
  if (!payload?.name || !payload?.version) {
    throw new Error(`Invalid package metadata: ${metadataPath}`);
  }
  return payload;
}

function normalizeVersionParts(version) {
  return String(version || "")
    .split(".")
    .map((part) => Number.parseInt(part.replace(/[^0-9].*$/, ""), 10) || 0);
}

export function compareVersions(a, b) {
  const left = normalizeVersionParts(a);
  const right = normalizeVersionParts(b);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}
