import path from "node:path";
import { fileURLToPath } from "node:url";

export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function resolveWorkspaceRoot(value = process.env.WAVE_REPO_ROOT || process.cwd()) {
  return path.resolve(String(value || process.cwd()));
}

export const WORKSPACE_ROOT = resolveWorkspaceRoot();
