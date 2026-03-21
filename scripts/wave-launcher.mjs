#!/usr/bin/env node

import { runLauncherCli } from "./wave-orchestrator/launcher.mjs";

runLauncherCli(process.argv.slice(2)).catch((error) => {
  console.error(`\n[wave-launcher] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(Number.isInteger(error?.exitCode) ? error.exitCode : 1);
});
