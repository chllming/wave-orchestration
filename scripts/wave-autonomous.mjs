#!/usr/bin/env node

import { bootstrapWaveArgs } from "./wave-cli-bootstrap.mjs";

const argv = bootstrapWaveArgs(process.argv.slice(2));
const { runAutonomousCli } = await import("./wave-orchestrator/autonomous.mjs");

try {
  runAutonomousCli(argv);
} catch (error) {
  console.error(`[wave-autonomous] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
