import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const DEFAULT_WAVE_CONFIG_PATH = path.join(REPO_ROOT, "wave.config.json");
export const DEFAULT_WAVE_LANE = "main";
export const DEFAULT_EVALUATOR_AGENT_ID = "A0";
export const DEFAULT_DOCUMENTATION_AGENT_ID = "A9";
export const DEFAULT_ROLE_PROMPT_DIR = "docs/agents";
export const DEFAULT_EVALUATOR_ROLE_PROMPT_PATH = "docs/agents/wave-evaluator-role.md";
export const DEFAULT_DOCUMENTATION_ROLE_PROMPT_PATH =
  "docs/agents/wave-documentation-role.md";
export const DEFAULT_TERMINALS_PATH = ".vscode/terminals.json";
export const DEFAULT_DOCS_DIR = "docs";
export const DEFAULT_STATE_ROOT = ".tmp";
export const DEFAULT_ORCHESTRATOR_STATE_DIR = ".tmp/wave-orchestrator";
export const DEFAULT_CONTEXT7_BUNDLE_INDEX_PATH = "docs/context7/bundles.json";
export const DEFAULT_REQUIRED_PROMPT_REFERENCES = [
  "docs/reference/repository-guidance.md",
  "docs/research/agent-context-sources.md",
];

function sanitizeLaneName(value) {
  const lane = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!lane) {
    throw new Error("Lane name is required");
  }
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(lane)) {
    throw new Error(`Invalid lane: ${value}`);
  }
  return lane;
}

function readJsonOrNull(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function normalizeRepoRelativePath(value, label) {
  const raw = String(value || "")
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "");
  if (!raw) {
    throw new Error(`${label} is required`);
  }
  if (raw.startsWith("/") || raw.startsWith("../") || raw.includes("/../")) {
    throw new Error(`${label} must stay within the repository: ${value}`);
  }
  return raw;
}

function normalizeOptionalPathArray(values, label) {
  if (!Array.isArray(values)) {
    return null;
  }
  return values.map((entry, index) =>
    normalizeRepoRelativePath(entry, `${label}[${index}]`),
  );
}

function normalizeOptionalStringArray(values, fallback = []) {
  if (!Array.isArray(values)) {
    return fallback;
  }
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function normalizeThreshold(value, fallback) {
  if (value === null) {
    return null;
  }
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid wave threshold: ${value}`);
  }
  return parsed;
}

function defaultDocsDirForLane(lane, defaultLane, repoMode) {
  if (repoMode === "single-repo" && lane === defaultLane) {
    return DEFAULT_DOCS_DIR;
  }
  return `${DEFAULT_DOCS_DIR}/${lane}`;
}

function defaultPlansDir(docsDir) {
  return `${docsDir}/plans`;
}

function defaultWavesDir(plansDir) {
  return `${plansDir}/waves`;
}

function defaultSharedPlanDocs(plansDir) {
  return ["current-state.md", "master-plan.md", "migration.md"].map(
    (fileName) => `${plansDir}/${fileName}`,
  );
}

function normalizeRoles(rawRoles = {}) {
  const rolePromptDir = normalizeRepoRelativePath(
    rawRoles.rolePromptDir || DEFAULT_ROLE_PROMPT_DIR,
    "roles.rolePromptDir",
  );
  return {
    rolePromptDir,
    evaluatorAgentId: String(rawRoles.evaluatorAgentId || DEFAULT_EVALUATOR_AGENT_ID).trim(),
    documentationAgentId: String(
      rawRoles.documentationAgentId || DEFAULT_DOCUMENTATION_AGENT_ID,
    ).trim(),
    evaluatorRolePromptPath: normalizeRepoRelativePath(
      rawRoles.evaluatorRolePromptPath || DEFAULT_EVALUATOR_ROLE_PROMPT_PATH,
      "roles.evaluatorRolePromptPath",
    ),
    documentationRolePromptPath: normalizeRepoRelativePath(
      rawRoles.documentationRolePromptPath || DEFAULT_DOCUMENTATION_ROLE_PROMPT_PATH,
      "roles.documentationRolePromptPath",
    ),
  };
}

function normalizeValidation(rawValidation = {}) {
  return {
    requiredPromptReferences: normalizeOptionalStringArray(
      rawValidation.requiredPromptReferences,
      DEFAULT_REQUIRED_PROMPT_REFERENCES,
    ),
    requireDocumentationStewardFromWave: normalizeThreshold(
      rawValidation.requireDocumentationStewardFromWave,
      5,
    ),
    requireContext7DeclarationsFromWave: normalizeThreshold(
      rawValidation.requireContext7DeclarationsFromWave,
      6,
    ),
    requireExitContractsFromWave: normalizeThreshold(
      rawValidation.requireExitContractsFromWave,
      6,
    ),
  };
}

export function loadWaveConfig(configPath = DEFAULT_WAVE_CONFIG_PATH) {
  const rawConfig = readJsonOrNull(configPath) || {};
  const repoMode =
    String(rawConfig.repoMode || "single-repo")
      .trim()
      .toLowerCase() || "single-repo";
  if (!["single-repo", "multi-lane"].includes(repoMode)) {
    throw new Error(`Unsupported repoMode in ${path.relative(REPO_ROOT, configPath)}: ${repoMode}`);
  }
  const defaultLane = sanitizeLaneName(rawConfig.defaultLane || DEFAULT_WAVE_LANE);
  const paths = {
    docsDir: normalizeRepoRelativePath(rawConfig.paths?.docsDir || DEFAULT_DOCS_DIR, "paths.docsDir"),
    stateRoot: normalizeRepoRelativePath(
      rawConfig.paths?.stateRoot || DEFAULT_STATE_ROOT,
      "paths.stateRoot",
    ),
    orchestratorStateDir: normalizeRepoRelativePath(
      rawConfig.paths?.orchestratorStateDir || DEFAULT_ORCHESTRATOR_STATE_DIR,
      "paths.orchestratorStateDir",
    ),
    terminalsPath: normalizeRepoRelativePath(
      rawConfig.paths?.terminalsPath || DEFAULT_TERMINALS_PATH,
      "paths.terminalsPath",
    ),
    context7BundleIndexPath: normalizeRepoRelativePath(
      rawConfig.paths?.context7BundleIndexPath || DEFAULT_CONTEXT7_BUNDLE_INDEX_PATH,
      "paths.context7BundleIndexPath",
    ),
  };
  const sharedPlanDocs =
    normalizeOptionalPathArray(rawConfig.sharedPlanDocs, "sharedPlanDocs") || null;
  const lanes = Object.fromEntries(
    Object.entries(rawConfig.lanes || {}).map(([laneName, laneConfig]) => [
      sanitizeLaneName(laneName),
      laneConfig || {},
    ]),
  );
  return {
    version: Number.parseInt(String(rawConfig.version ?? "1"), 10) || 1,
    projectName: String(rawConfig.projectName || "Wave Orchestrator").trim(),
    repoMode,
    defaultLane,
    paths,
    roles: normalizeRoles(rawConfig.roles),
    validation: normalizeValidation(rawConfig.validation),
    sharedPlanDocs,
    lanes,
    configPath,
  };
}

export function resolveLaneProfile(config, laneInput = config.defaultLane) {
  const lane = sanitizeLaneName(laneInput || config.defaultLane);
  const laneConfig = config.lanes[lane] || {};
  const docsDir = normalizeRepoRelativePath(
    laneConfig.docsDir || defaultDocsDirForLane(lane, config.defaultLane, config.repoMode),
    `${lane}.docsDir`,
  );
  const plansDir = normalizeRepoRelativePath(
    laneConfig.plansDir || defaultPlansDir(docsDir),
    `${lane}.plansDir`,
  );
  const wavesDir = normalizeRepoRelativePath(
    laneConfig.wavesDir || defaultWavesDir(plansDir),
    `${lane}.wavesDir`,
  );
  const roles = normalizeRoles({
    ...config.roles,
    ...(laneConfig.roles || {}),
  });
  const validation = normalizeValidation({
    ...config.validation,
    ...(laneConfig.validation || {}),
  });
  return {
    lane,
    docsDir,
    plansDir,
    wavesDir,
    sharedPlanDocs:
      normalizeOptionalPathArray(laneConfig.sharedPlanDocs, `${lane}.sharedPlanDocs`) ||
      config.sharedPlanDocs ||
      defaultSharedPlanDocs(plansDir),
    roles,
    validation,
    paths: {
      terminalsPath: normalizeRepoRelativePath(
        laneConfig.terminalsPath || config.paths.terminalsPath,
        `${lane}.terminalsPath`,
      ),
      stateRoot: normalizeRepoRelativePath(
        laneConfig.stateRoot || config.paths.stateRoot,
        `${lane}.stateRoot`,
      ),
      orchestratorStateDir: normalizeRepoRelativePath(
        laneConfig.orchestratorStateDir || config.paths.orchestratorStateDir,
        `${lane}.orchestratorStateDir`,
      ),
      context7BundleIndexPath: normalizeRepoRelativePath(
        laneConfig.context7BundleIndexPath || config.paths.context7BundleIndexPath,
        `${lane}.context7BundleIndexPath`,
      ),
    },
  };
}
