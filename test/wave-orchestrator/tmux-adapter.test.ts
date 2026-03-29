import { describe, expect, it } from "vitest";
import { createTmuxAdapter } from "../../scripts/wave-orchestrator/tmux-adapter.mjs";

describe("tmux-adapter", () => {
  it("retries retryable mutating tmux errors before succeeding", async () => {
    const sleepCalls: number[] = [];
    let attempts = 0;
    const adapter = createTmuxAdapter({
      sleepFn: async (ms) => {
        sleepCalls.push(ms);
      },
      spawnTmuxFn: async () => {
        attempts += 1;
        if (attempts < 3) {
          const error: Error & { code?: string } = new Error("resource temporarily unavailable");
          error.code = "EAGAIN";
          throw error;
        }
        return { status: 0, stdout: "", stderr: "" };
      },
    });

    await adapter.createSession("socket", "wave-a1", "bash -lc true");

    expect(attempts).toBe(3);
    expect(sleepCalls).toHaveLength(2);
  });

  it("tolerates missing sessions during cleanup and no-server list lookups", async () => {
    const adapter = createTmuxAdapter({
      spawnTmuxFn: async (_socketName, args) => {
        if (args[0] === "list-sessions") {
          return { status: 1, stdout: "", stderr: "no server running on /tmp/tmux-0/default" };
        }
        if (args[0] === "kill-session") {
          return { status: 1, stdout: "", stderr: "can't find session" };
        }
        return { status: 0, stdout: "", stderr: "" };
      },
    });

    await expect(adapter.listSessions("socket")).resolves.toEqual([]);
    await expect(adapter.killSessionIfExists("socket", "wave-a1")).resolves.toBe(false);
  });

  it("serializes mutating tmux operations through one queue", async () => {
    const order: string[] = [];
    let releaseFirst: (() => void) | null = null;
    const firstCommandFinished = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const adapter = createTmuxAdapter({
      spawnTmuxFn: async (_socketName, args) => {
        const operation = String(args[0] || "");
        order.push(`start:${operation}`);
        if (operation === "new-session") {
          await firstCommandFinished;
        }
        order.push(`end:${operation}`);
        return { status: 0, stdout: "", stderr: "" };
      },
    });

    const first = adapter.createSession("socket", "wave-a1", "bash -lc true");
    const second = adapter.killSessionIfExists("socket", "wave-a1");
    await Promise.resolve();
    expect(order).toEqual(["start:new-session"]);

    releaseFirst?.();
    await Promise.all([first, second]);

    expect(order).toEqual([
      "start:new-session",
      "end:new-session",
      "start:kill-session",
      "end:kill-session",
    ]);
  });
});
