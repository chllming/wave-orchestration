import { spawn } from "node:child_process";
import {
  REPO_ROOT,
  TMUX_COMMAND_TIMEOUT_MS,
  sleep,
} from "./shared.mjs";

const RETRYABLE_TMUX_ERROR_CODES = new Set(["EAGAIN", "EMFILE", "ENFILE"]);
const MISSING_SESSION_MARKERS = [
  "can't find session",
  "no current target",
];
const NO_SERVER_MARKERS = [
  "no server running",
  "failed to connect",
  "error connecting",
];
const DEFAULT_TMUX_RETRY_ATTEMPTS = 4;

function tmuxCombinedOutput(stdout = "", stderr = "") {
  return `${String(stderr || "").toLowerCase()}\n${String(stdout || "").toLowerCase()}`;
}

function classifyTmuxOutput(stdout = "", stderr = "") {
  const combined = tmuxCombinedOutput(stdout, stderr);
  return {
    combined,
    missingSession: MISSING_SESSION_MARKERS.some((marker) => combined.includes(marker)),
    noServer: NO_SERVER_MARKERS.some((marker) => combined.includes(marker)),
  };
}

function buildTmuxError(message, details = {}) {
  const error = new Error(message);
  Object.assign(error, details);
  return error;
}

function retryDelayMs(attemptIndex) {
  const baseDelay = Math.min(250, 25 * (2 ** attemptIndex));
  return baseDelay + Math.floor(Math.random() * 25);
}

async function defaultSpawnTmux(socketName, args, { stdio = "pipe", timeoutMs = TMUX_COMMAND_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("tmux", ["-L", socketName, ...args], {
      cwd: REPO_ROOT,
      env: { ...process.env, TMUX: "" },
      stdio,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    if (child.stdout) {
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
    }
    if (child.stderr) {
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
    }
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(
        buildTmuxError(`tmux process failed: ${error.message}`, {
          code: error?.code || null,
          stdout,
          stderr,
        }),
      );
    });
    child.once("close", (status) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(
          buildTmuxError(`tmux command timed out after ${timeoutMs}ms`, {
            code: "ETIMEDOUT",
            status,
            stdout,
            stderr,
            tmuxTimedOut: true,
          }),
        );
        return;
      }
      resolve({
        status: typeof status === "number" ? status : 1,
        stdout,
        stderr,
      });
    });
  });
}

export function createTmuxAdapter({
  spawnTmuxFn = defaultSpawnTmux,
  sleepFn = sleep,
  retryAttempts = DEFAULT_TMUX_RETRY_ATTEMPTS,
} = {}) {
  let mutationQueue = Promise.resolve();

  const enqueueMutation = (callback) => {
    const run = mutationQueue.then(callback, callback);
    mutationQueue = run.catch(() => {});
    return run;
  };

  const runWithRetry = async (callback, { description = "tmux command" } = {}) => {
    for (let attemptIndex = 0; attemptIndex < retryAttempts; attemptIndex += 1) {
      try {
        return await callback();
      } catch (error) {
        if (!RETRYABLE_TMUX_ERROR_CODES.has(String(error?.code || "")) || attemptIndex === retryAttempts - 1) {
          throw error;
        }
        await sleepFn(retryDelayMs(attemptIndex));
      }
    }
    throw new Error(`${description} failed after ${retryAttempts} attempts.`);
  };

  const runTmuxCommand = async (
    socketName,
    args,
    { description = "tmux command", stdio = "pipe", mutate = false } = {},
  ) => {
    const invoke = async () => {
      try {
        const result = await spawnTmuxFn(socketName, args, { stdio, timeoutMs: TMUX_COMMAND_TIMEOUT_MS });
        if (result.status === 0) {
          return result;
        }
        const classification = classifyTmuxOutput(result.stdout, result.stderr);
        throw buildTmuxError(
          `${description} failed: ${(result.stderr || result.stdout || "tmux command failed").trim() || "tmux command failed"}`,
          {
            status: result.status,
            stdout: result.stdout,
            stderr: result.stderr,
            tmuxMissingSession: classification.missingSession,
            tmuxNoServer: classification.noServer,
          },
        );
      } catch (error) {
        if (error?.tmuxTimedOut || error?.tmuxMissingSession || error?.tmuxNoServer) {
          throw error;
        }
        if (error?.code === "ENOENT") {
          throw buildTmuxError(`${description} failed: tmux is not installed or not on PATH`, {
            code: "ENOENT",
            tmuxMissingBinary: true,
          });
        }
        if (error?.code === "ETIMEDOUT") {
          throw buildTmuxError(
            `${description} failed: tmux command timed out after ${TMUX_COMMAND_TIMEOUT_MS}ms`,
            {
              code: "ETIMEDOUT",
              tmuxTimedOut: true,
            },
          );
        }
        if (error instanceof Error) {
          throw buildTmuxError(`${description} failed: ${error.message}`, {
            code: error?.code || null,
            stdout: error?.stdout || "",
            stderr: error?.stderr || "",
          });
        }
        throw error;
      }
    };
    const runner = () => runWithRetry(invoke, { description });
    return mutate ? enqueueMutation(runner) : runner();
  };

  const listSessions = async (socketName) => {
    try {
      const result = await runTmuxCommand(socketName, ["list-sessions", "-F", "#{session_name}"], {
        description: "list tmux sessions",
      });
      return String(result.stdout || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    } catch (error) {
      if (error?.tmuxMissingBinary || error?.tmuxNoServer) {
        return [];
      }
      throw error;
    }
  };

  const hasSession = async (socketName, sessionName, { allowMissingBinary = true } = {}) => {
    try {
      await runTmuxCommand(socketName, ["has-session", "-t", sessionName], {
        description: `lookup tmux session ${sessionName}`,
      });
      return true;
    } catch (error) {
      if (error?.tmuxMissingSession || error?.tmuxNoServer) {
        return false;
      }
      if (error?.tmuxMissingBinary && allowMissingBinary) {
        return false;
      }
      throw error;
    }
  };

  const killSessionIfExists = async (socketName, sessionName) => {
    try {
      await runTmuxCommand(socketName, ["kill-session", "-t", sessionName], {
        description: `kill existing session ${sessionName}`,
        mutate: true,
      });
      return true;
    } catch (error) {
      if (error?.tmuxMissingBinary || error?.tmuxMissingSession || error?.tmuxNoServer) {
        return false;
      }
      throw error;
    }
  };

  const createSession = async (socketName, sessionName, command, { description = `launch session ${sessionName}` } = {}) => {
    await runTmuxCommand(socketName, ["new-session", "-d", "-s", sessionName, command], {
      description,
      mutate: true,
    });
    return sessionName;
  };

  const attachSession = async (socketName, sessionName) => {
    const exists = await hasSession(socketName, sessionName, { allowMissingBinary: false });
    if (!exists) {
      throw buildTmuxError(`No live tmux session named ${sessionName}.`, {
        tmuxMissingSession: true,
      });
    }
    try {
      await runTmuxCommand(socketName, ["attach", "-t", sessionName], {
        description: `attach tmux session ${sessionName}`,
        stdio: "inherit",
      });
    } catch (error) {
      if (error?.tmuxMissingBinary) {
        throw error;
      }
      const stillExists = await hasSession(socketName, sessionName);
      if (!stillExists || error?.tmuxMissingSession || error?.tmuxNoServer) {
        throw buildTmuxError(`No live tmux session named ${sessionName}.`, {
          tmuxMissingSession: true,
        });
      }
      throw error;
    }
  };

  return {
    runTmuxCommand,
    createSession,
    killSessionIfExists,
    listSessions,
    hasSession,
    attachSession,
  };
}

const defaultTmuxAdapter = createTmuxAdapter();

export function runTmuxCommand(socketName, args, options = {}) {
  return defaultTmuxAdapter.runTmuxCommand(socketName, args, options);
}

export function createSession(socketName, sessionName, command, options = {}) {
  return defaultTmuxAdapter.createSession(socketName, sessionName, command, options);
}

export function killSessionIfExists(socketName, sessionName) {
  return defaultTmuxAdapter.killSessionIfExists(socketName, sessionName);
}

export function listSessions(socketName) {
  return defaultTmuxAdapter.listSessions(socketName);
}

export function hasSession(socketName, sessionName, options = {}) {
  return defaultTmuxAdapter.hasSession(socketName, sessionName, options);
}

export function attachSession(socketName, sessionName) {
  return defaultTmuxAdapter.attachSession(socketName, sessionName);
}
