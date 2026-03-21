#!/usr/bin/env node

import { bootstrapWaveArgs } from "./wave-cli-bootstrap.mjs";

const argv = bootstrapWaveArgs(process.argv.slice(2));
const { runLocalExecutorCli } = await import("./wave-orchestrator/local-executor.mjs");

try {
  runLocalExecutorCli(argv);
} catch (error) {
  console.error(`[wave-local-executor] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
