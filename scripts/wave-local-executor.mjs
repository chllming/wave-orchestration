#!/usr/bin/env node

import { runLocalExecutorCli } from "./wave-orchestrator/local-executor.mjs";

try {
  runLocalExecutorCli(process.argv.slice(2));
} catch (error) {
  console.error(`[wave-local-executor] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
