#!/usr/bin/env node

import { bootstrapWaveArgs } from "./wave-cli-bootstrap.mjs";

const argv = bootstrapWaveArgs(process.argv.slice(2));
const { runDashboardCli } = await import("./wave-orchestrator/dashboard-renderer.mjs");

runDashboardCli(argv).catch((error) => {
  console.error(`[wave-dashboard] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
