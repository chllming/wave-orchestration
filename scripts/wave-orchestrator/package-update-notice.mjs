import fs from "node:fs";
import path from "node:path";
import { ensureDirectory, readJsonOrNull, REPO_ROOT, writeJsonAtomic } from "./shared.mjs";
import {
  compareVersions,
  readInstalledPackageMetadata,
  WAVE_PACKAGE_NAME,
} from "./package-version.mjs";

export const PACKAGE_UPDATE_CHECK_SCHEMA_VERSION = 1;
export const PACKAGE_UPDATE_CHECK_PATH = path.join(REPO_ROOT, ".wave", "package-update-check.json");
export const PACKAGE_UPDATE_CHECK_TTL_MS = 6 * 60 * 60 * 1000;
export const PACKAGE_UPDATE_CHECK_TIMEOUT_MS = 2000;
export const WAVE_SKIP_UPDATE_CHECK_ENV = "WAVE_SKIP_UPDATE_CHECK";
export const WAVE_SUPPRESS_UPDATE_NOTICE_ENV = "WAVE_SUPPRESS_UPDATE_NOTICE";
export const NPM_REGISTRY_LATEST_URL = "https://registry.npmjs.org";

function isTruthyEnvValue(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function parsePackageManagerId(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized.startsWith("pnpm@")) {
    return "pnpm";
  }
  if (normalized.startsWith("npm@")) {
    return "npm";
  }
  if (normalized.startsWith("yarn@")) {
    return "yarn";
  }
  if (normalized.startsWith("bun@")) {
    return "bun";
  }
  return null;
}

function runtimeSelfUpdateCommand(workspaceRoot = REPO_ROOT) {
  const workspacePackage = readJsonOrNull(path.join(workspaceRoot, "package.json"));
  const packageManagerId = parsePackageManagerId(workspacePackage?.packageManager);
  if (packageManagerId === "pnpm") {
    return "pnpm exec wave self-update";
  }
  if (packageManagerId === "npm") {
    return "npm exec -- wave self-update";
  }
  if (packageManagerId === "yarn") {
    return "yarn exec wave self-update";
  }
  if (packageManagerId === "bun") {
    return "bun x wave self-update";
  }
  if (fs.existsSync(path.join(workspaceRoot, "pnpm-lock.yaml"))) {
    return "pnpm exec wave self-update";
  }
  if (fs.existsSync(path.join(workspaceRoot, "yarn.lock"))) {
    return "yarn exec wave self-update";
  }
  if (fs.existsSync(path.join(workspaceRoot, "bun.lock")) || fs.existsSync(path.join(workspaceRoot, "bun.lockb"))) {
    return "bun x wave self-update";
  }
  return "npm exec -- wave self-update";
}

function buildPackageLatestUrl(packageName) {
  return `${NPM_REGISTRY_LATEST_URL}/${encodeURIComponent(String(packageName || WAVE_PACKAGE_NAME)).replace("%40", "@")}/latest`;
}

function readUpdateCheckCache(cachePath = PACKAGE_UPDATE_CHECK_PATH) {
  const payload = readJsonOrNull(cachePath);
  return payload && typeof payload === "object" ? payload : null;
}

function writeUpdateCheckCache(cachePath, payload) {
  ensureDirectory(path.dirname(cachePath));
  writeJsonAtomic(cachePath, payload);
}

function buildNoticeLines(packageName, currentVersion, latestVersion, workspaceRoot = REPO_ROOT) {
  return [
    `[wave:update] newer ${packageName} available: installed ${currentVersion}, latest ${latestVersion}`,
    `[wave:update] update now with: ${runtimeSelfUpdateCommand(workspaceRoot)}`,
  ];
}

function emitNotice(packageName, currentVersion, latestVersion, emit = console.error, workspaceRoot = REPO_ROOT) {
  for (const line of buildNoticeLines(packageName, currentVersion, latestVersion, workspaceRoot)) {
    emit(line);
  }
}

export async function fetchLatestPackageVersion(
  packageName = WAVE_PACKAGE_NAME,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = PACKAGE_UPDATE_CHECK_TIMEOUT_MS,
  } = {},
) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Package update check is unavailable in this Node runtime.");
  }
  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), timeoutMs);
  try {
    const response = await fetchImpl(buildPackageLatestUrl(packageName), {
      signal: abortController.signal,
      headers: {
        Accept: "application/json",
      },
    });
    if (!response?.ok) {
      throw new Error(`Upstream package check failed with status ${response?.status || "unknown"}.`);
    }
    const payload = await response.json();
    const latestVersion = String(payload?.version || "").trim();
    if (!latestVersion) {
      throw new Error("Upstream package check returned no version.");
    }
    return latestVersion;
  } finally {
    clearTimeout(timer);
  }
}

export async function maybeAnnouncePackageUpdate(options = {}) {
  const env = options.env || process.env;
  if (
    isTruthyEnvValue(env[WAVE_SKIP_UPDATE_CHECK_ENV]) ||
    isTruthyEnvValue(env[WAVE_SUPPRESS_UPDATE_NOTICE_ENV])
  ) {
    return {
      skipped: true,
      reason: "disabled",
      updateAvailable: false,
      latestVersion: null,
      currentVersion: null,
    };
  }

  const metadata = options.packageMetadata || readInstalledPackageMetadata();
  const packageName = String(metadata.name || WAVE_PACKAGE_NAME);
  const currentVersion = String(metadata.version || "").trim();
  const cachePath = options.cachePath || PACKAGE_UPDATE_CHECK_PATH;
  const workspaceRoot = options.workspaceRoot || REPO_ROOT;
  const cacheTtlMs = options.cacheTtlMs ?? PACKAGE_UPDATE_CHECK_TTL_MS;
  const nowMs = options.nowMs ?? Date.now();
  const emit = options.emit || console.error;
  const cache = readUpdateCheckCache(cachePath);
  const cachedCheckedAtMs = Date.parse(String(cache?.checkedAt || ""));
  const cacheMatchesCurrentVersion = cache?.currentVersion === currentVersion;
  const cachedUpdateAvailable =
    cacheMatchesCurrentVersion &&
    typeof cache?.latestVersion === "string" &&
    compareVersions(cache.latestVersion, currentVersion) > 0;
  const cacheFresh =
    cacheMatchesCurrentVersion &&
    Number.isFinite(cachedCheckedAtMs) &&
    nowMs - cachedCheckedAtMs <= cacheTtlMs;
  let emitted = false;

  if (cachedUpdateAvailable) {
    emitNotice(packageName, currentVersion, cache.latestVersion, emit, workspaceRoot);
    emitted = true;
  }

  if (cacheFresh) {
    return {
      skipped: false,
      source: "cache",
      updateAvailable: cachedUpdateAvailable,
      latestVersion: cache?.latestVersion || currentVersion,
      currentVersion,
    };
  }

  try {
    const latestVersion = await fetchLatestPackageVersion(packageName, options);
    const updateAvailable = compareVersions(latestVersion, currentVersion) > 0;
    writeUpdateCheckCache(cachePath, {
      schemaVersion: PACKAGE_UPDATE_CHECK_SCHEMA_VERSION,
      packageName,
      checkedAt: new Date(nowMs).toISOString(),
      currentVersion,
      latestVersion,
      updateAvailable,
      lastErrorAt: null,
      lastErrorMessage: null,
    });
    if (updateAvailable && !emitted) {
      emitNotice(packageName, currentVersion, latestVersion, emit, workspaceRoot);
    }
    return {
      skipped: false,
      source: "network",
      updateAvailable,
      latestVersion,
      currentVersion,
    };
  } catch (error) {
    writeUpdateCheckCache(cachePath, {
      schemaVersion: PACKAGE_UPDATE_CHECK_SCHEMA_VERSION,
      packageName,
      checkedAt: new Date(nowMs).toISOString(),
      currentVersion,
      latestVersion:
        cacheMatchesCurrentVersion && typeof cache?.latestVersion === "string"
          ? cache.latestVersion
          : currentVersion,
      updateAvailable: cachedUpdateAvailable,
      lastErrorAt: new Date(nowMs).toISOString(),
      lastErrorMessage: error instanceof Error ? error.message : String(error),
    });
    return {
      skipped: false,
      source: "error",
      updateAvailable: cachedUpdateAvailable,
      latestVersion:
        cacheMatchesCurrentVersion && typeof cache?.latestVersion === "string"
          ? cache.latestVersion
          : currentVersion,
      currentVersion,
    };
  }
}
