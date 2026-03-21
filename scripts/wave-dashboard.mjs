#!/usr/bin/env node

import { runDashboardCli } from "./wave-orchestrator/dashboard-renderer.mjs";

runDashboardCli(process.argv.slice(2)).catch((error) => {
  console.error(`[wave-dashboard] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
