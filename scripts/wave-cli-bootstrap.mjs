import path from "node:path";

function stripRepoRootArg(argv) {
  const normalizedArgs = [];
  let repoRoot = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--repo-root") {
      repoRoot = path.resolve(process.cwd(), String(argv[index + 1] || ""));
      index += 1;
      continue;
    }
    if (String(arg).startsWith("--repo-root=")) {
      repoRoot = path.resolve(process.cwd(), String(arg).slice("--repo-root=".length));
      continue;
    }
    normalizedArgs.push(arg);
  }
  if (repoRoot) {
    process.env.WAVE_REPO_ROOT = repoRoot;
  }
  return normalizedArgs;
}

export function bootstrapWaveArgs(argv) {
  return stripRepoRootArg(Array.isArray(argv) ? argv : []);
}
