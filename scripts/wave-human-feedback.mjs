#!/usr/bin/env node

import { bootstrapWaveArgs } from "./wave-cli-bootstrap.mjs";

const argv = bootstrapWaveArgs(process.argv.slice(2));
const { runFeedbackCli } = await import("./wave-orchestrator/feedback.mjs");

runFeedbackCli(argv).catch((error) => {
  console.error(`[wave-human-feedback] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
