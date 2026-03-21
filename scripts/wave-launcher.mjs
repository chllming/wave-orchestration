#!/usr/bin/env node

import { bootstrapWaveArgs } from "./wave-cli-bootstrap.mjs";

const argv = bootstrapWaveArgs(process.argv.slice(2));
const { runLauncherCli } = await import("./wave-orchestrator/launcher.mjs");

runLauncherCli(argv).catch((error) => {
  console.error(`\n[wave-launcher] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(Number.isInteger(error?.exitCode) ? error.exitCode : 1);
});
