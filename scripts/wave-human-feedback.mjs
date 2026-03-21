#!/usr/bin/env node

import { runFeedbackCli } from "./wave-orchestrator/feedback.mjs";

runFeedbackCli(process.argv.slice(2)).catch((error) => {
  console.error(`[wave-human-feedback] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
