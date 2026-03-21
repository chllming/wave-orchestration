#!/usr/bin/env node

import { runAutonomousCli } from "./wave-orchestrator/autonomous.mjs";

try {
  runAutonomousCli(process.argv.slice(2));
} catch (error) {
  console.error(`[wave-autonomous] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
