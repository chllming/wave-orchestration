import fs from "node:fs";
import path from "node:path";
import { analyzeMessageBoardCommunication } from "./coordination.mjs";
import { commsAgeSummary, deploymentSummary, renderCountsByState } from "./dashboard-state.mjs";
import {
  DEFAULT_REFRESH_MS,
  DEFAULT_WAVE_LANE,
  FINAL_EXIT_DELAY_MS,
  REPO_ROOT,
  TERMINAL_STATES,
  formatAgeFromTimestamp,
  formatElapsed,
  pad,
  sleep,
  truncate,
} from "./shared.mjs";

export function parseDashboardArgs(argv) {
  const options = {
    lane: DEFAULT_WAVE_LANE,
    dashboardFile: null,
    messageBoard: null,
    watch: false,
    refreshMs: DEFAULT_REFRESH_MS,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      continue;
    }
    if (arg === "--watch") {
      options.watch = true;
    } else if (arg === "--lane") {
      options.lane =
        String(argv[++i] || "")
          .trim()
          .toLowerCase() || DEFAULT_WAVE_LANE;
    } else if (arg === "--dashboard-file") {
      options.dashboardFile = path.resolve(REPO_ROOT, argv[++i] || "");
    } else if (arg === "--message-board") {
      options.messageBoard = path.resolve(REPO_ROOT, argv[++i] || "");
    } else if (arg === "--refresh-ms") {
      options.refreshMs = Number.parseInt(String(argv[++i] || ""), 10);
    } else if (arg === "--help" || arg === "-h") {
      return { help: true, options };
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!options.dashboardFile) {
    throw new Error("--dashboard-file is required");
  }
  return { help: false, options };
}

function readMessageBoardTail(messageBoardPath, maxLines = 24) {
  if (!messageBoardPath) {
    return ["(message board path unavailable)"];
  }
  if (!fs.existsSync(messageBoardPath)) {
    return ["(message board missing)"];
  }
  const raw = fs.readFileSync(messageBoardPath, "utf8").trim();
  if (!raw) {
    return ["(message board currently empty)"];
  }
  return raw.split(/\r?\n/).slice(-maxLines);
}

function resolveMessageBoardPath(state, overridePath) {
  if (overridePath) {
    return overridePath;
  }
  if (typeof state?.messageBoardPath === "string") {
    return path.resolve(REPO_ROOT, state.messageBoardPath);
  }
  return null;
}

function isGlobalDashboardState(state) {
  return Boolean(state && Array.isArray(state.waves) && !Array.isArray(state.agents));
}

function renderWaveDashboard({ state, dashboardPath, messageBoardPath, lane }) {
  if (!state) {
    return `Dashboard file not found or invalid: ${dashboardPath}`;
  }
  const lines = [];
  const laneName = String(state?.lane || lane || "").trim() || DEFAULT_WAVE_LANE;
  lines.push(
    `${laneName} Wave Dashboard | wave=${state.wave ?? "?"} | status=${state.status ?? "unknown"} | attempt=${state.attempt ?? "?"}/${state.maxAttempts ?? "?"}`,
  );
  lines.push(
    `Updated ${formatAgeFromTimestamp(Date.parse(state.updatedAt || ""))} | Started ${state.startedAt || "n/a"} | Elapsed ${formatElapsed(state.startedAt)}`,
  );
  lines.push(`Run tag: ${state.runTag || "n/a"} | Wave file: ${state.waveFile || "n/a"}`);
  lines.push(`Counts: ${renderCountsByState(state.agents || []) || "none"}`);
  const comms = analyzeMessageBoardCommunication(messageBoardPath);
  if (!comms.available) {
    lines.push(`Comms: unavailable ${comms.reason || ""}`.trim());
  } else {
    lines.push(
      `Comms: requests=${comms.actionableRequests} unresolved=${comms.unresolvedRequests} unacknowledged=${comms.unacknowledgedRequests} malformed=${comms.malformedEntries} placeholder-ts=${comms.placeholderTimestampEntries}`,
    );
    lines.push(
      `Comms age: last-ack=${commsAgeSummary(comms.lastAcknowledgementTimestamp)} oldest-unack=${commsAgeSummary(comms.oldestUnacknowledgedTimestamp)}`,
    );
  }
  lines.push("");
  lines.push("Agents:");
  lines.push(
    `${pad("ID", 8)} ${pad("State", 12)} ${pad("Attempts", 8)} ${pad("Exit", 6)} ${pad("Deploy", 24)} ${pad("Last Update", 12)} Detail`,
  );
  lines.push(
    `${"-".repeat(8)} ${"-".repeat(12)} ${"-".repeat(8)} ${"-".repeat(6)} ${"-".repeat(24)} ${"-".repeat(12)} ${"-".repeat(36)}`,
  );
  for (const agent of state.agents || []) {
    lines.push(
      `${pad(agent.agentId || "-", 8)} ${pad(agent.state || "-", 12)} ${pad(agent.attempts ?? 0, 8)} ${pad(
        agent.exitCode ?? "-",
        6,
      )} ${pad(deploymentSummary({ service: agent.deploymentService, state: agent.deploymentState }), 24)} ${pad(
        formatAgeFromTimestamp(Date.parse(agent.lastUpdateAt || "")),
        12,
      )} ${truncate(agent.detail || "", 72)}`,
    );
  }
  lines.push("");
  lines.push("Recent events:");
  for (const event of (state.events || []).slice(-12)) {
    const prefix = event.agentId ? `[${event.agentId}]` : "[wave]";
    lines.push(
      `${event.at || "n/a"} ${pad(event.level || "info", 5)} ${prefix} ${event.message || ""}`,
    );
  }
  if ((state.events || []).length === 0) {
    lines.push("(none)");
  }
  lines.push("");
  lines.push("Rolling message board:");
  lines.push(`Path: ${messageBoardPath || "n/a"}`);
  lines.push(...readMessageBoardTail(messageBoardPath));
  return lines.join("\n");
}

function renderGlobalDashboard({ state, dashboardPath, lane }) {
  if (!state) {
    return `Dashboard file not found or invalid: ${dashboardPath}`;
  }
  const lines = [];
  const laneName = String(state?.lane || lane || "").trim() || DEFAULT_WAVE_LANE;
  lines.push(
    `${laneName} Wave Global Dashboard | run=${state.runId || "n/a"} | status=${state.status || "unknown"}`,
  );
  lines.push(
    `Updated ${formatAgeFromTimestamp(Date.parse(state.updatedAt || ""))} | Started ${state.startedAt || "n/a"} | Elapsed ${formatElapsed(state.startedAt)}`,
  );
  lines.push(
    `Options: autoNext=${state.options?.autoNext ? "true" : "false"} start=${state.options?.startWave ?? "?"} end=${state.options?.endWave ?? "last"} retries=${state.options?.maxRetriesPerWave ?? "?"}`,
  );
  lines.push("");
  lines.push("Waves:");
  lines.push(
    `${pad("Wave", 6)} ${pad("Status", 10)} ${pad("Attempt", 9)} ${pad("Agents", 16)} ${pad("Started", 12)} ${pad("Last Message", 70)}`,
  );
  lines.push(
    `${"-".repeat(6)} ${"-".repeat(10)} ${"-".repeat(9)} ${"-".repeat(16)} ${"-".repeat(12)} ${"-".repeat(70)}`,
  );
  for (const wave of state.waves || []) {
    const agents = `${wave.agentsCompleted ?? 0}/${wave.agentsTotal ?? 0} ok, ${wave.agentsFailed ?? 0} fail`;
    lines.push(
      `${pad(wave.wave ?? "-", 6)} ${pad(wave.status || "-", 10)} ${pad(
        `${wave.attempt ?? 0}/${wave.maxAttempts ?? 0}`,
        9,
      )} ${pad(agents, 16)} ${pad(
        formatAgeFromTimestamp(Date.parse(wave.startedAt || "")),
        12,
      )} ${truncate(wave.lastMessage || "", 70)}`,
    );
    const deployments = Array.isArray(wave.deployments) ? wave.deployments : [];
    if (deployments.length > 0) {
      const deployLine = deployments
        .slice(-3)
        .map((deployment) => `${deployment.agentId}:${deployment.service}:${deployment.state}`)
        .join(" | ");
      lines.push(`      Deploy: ${truncate(deployLine, 120)}`);
    }
  }
  lines.push("");
  lines.push("Recent events:");
  for (const event of (state.events || []).slice(-16)) {
    const waveTag = event.wave ? `wave:${event.wave}` : "wave:-";
    lines.push(
      `${event.at || "n/a"} ${pad(event.level || "info", 5)} [${waveTag}] ${event.message || ""}`,
    );
  }
  if ((state.events || []).length === 0) {
    lines.push("(none)");
  }
  return lines.join("\n");
}

export function renderDashboard({ state, dashboardPath, messageBoardPath, lane }) {
  return isGlobalDashboardState(state)
    ? renderGlobalDashboard({ state, dashboardPath, lane })
    : renderWaveDashboard({ state, dashboardPath, messageBoardPath, lane });
}

export async function runDashboardCli(argv) {
  const { help, options } = parseDashboardArgs(argv);
  if (help) {
    console.log(`Usage: pnpm exec wave dashboard --dashboard-file <path> [options]

Options:
  --lane <name>            Wave lane name (default: ${DEFAULT_WAVE_LANE})
  --dashboard-file <path>  Path to wave/global dashboard JSON
  --message-board <path>   Optional message board path override
  --watch                  Refresh continuously
  --refresh-ms <n>         Refresh interval in ms (default: ${DEFAULT_REFRESH_MS})
`);
    return;
  }

  let terminalStateReachedAt = null;
  while (true) {
    const raw = fs.existsSync(options.dashboardFile)
      ? JSON.parse(fs.readFileSync(options.dashboardFile, "utf8"))
      : null;
    const boardPath = resolveMessageBoardPath(raw, options.messageBoard);
    const rendered = renderDashboard({
      state: raw,
      dashboardPath: options.dashboardFile,
      messageBoardPath: boardPath,
      lane: options.lane,
    });
    if (process.stdout.isTTY) {
      process.stdout.write("\u001bc");
    }
    process.stdout.write(`${rendered}\n`);
    if (!options.watch) {
      return;
    }
    const currentStatus = raw?.status || "";
    if (TERMINAL_STATES.has(currentStatus)) {
      terminalStateReachedAt ??= Date.now();
      if (Date.now() - terminalStateReachedAt >= FINAL_EXIT_DELAY_MS) {
        return;
      }
    } else {
      terminalStateReachedAt = null;
    }
    await sleep(options.refreshMs);
  }
}
