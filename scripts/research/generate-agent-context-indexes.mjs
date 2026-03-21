#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  TOPIC_DEFINITIONS,
  buildPaperSectionAssignments,
  buildTopicGroups,
  loadArchiveEntries,
  parsePaperSectionMap,
  renderArticleIndex,
  renderPaperIndex,
  renderTopicPage,
  renderTopicsIndex,
} from "./agent-context-archive.mjs";

const REPO_ROOT = process.cwd();
const ARCHIVE_ROOT = path.join(REPO_ROOT, "docs/research/agent-context-cache");

async function writeFileIfChanged(filePath, content) {
  const normalized = `${content.trimEnd()}\n`;
  let current = null;
  try {
    current = await fs.readFile(filePath, "utf8");
  } catch {
    current = null;
  }
  if (current === normalized) {
    return false;
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, normalized, "utf8");
  return true;
}

async function main() {
  const entries = await loadArchiveEntries(ARCHIVE_ROOT);
  const paperIndexPath = path.join(ARCHIVE_ROOT, "papers/index.md");
  let existingPaperIndex = "";
  try {
    existingPaperIndex = await fs.readFile(paperIndexPath, "utf8");
  } catch {
    existingPaperIndex = "";
  }

  const sectionAssignments = buildPaperSectionAssignments(
    entries,
    parsePaperSectionMap(existingPaperIndex),
  );
  const topicGroups = buildTopicGroups(entries, sectionAssignments);

  const writes = [];
  writes.push(writeFileIfChanged(paperIndexPath, renderPaperIndex(entries, sectionAssignments)));
  writes.push(
    writeFileIfChanged(
      path.join(ARCHIVE_ROOT, "articles/index.md"),
      renderArticleIndex(entries),
    ),
  );
  writes.push(
    writeFileIfChanged(
      path.join(ARCHIVE_ROOT, "topics/index.md"),
      renderTopicsIndex(topicGroups),
    ),
  );

  for (const topic of TOPIC_DEFINITIONS) {
    writes.push(
      writeFileIfChanged(
        path.join(ARCHIVE_ROOT, "topics", `${topic.id}.md`),
        renderTopicPage(topic, topicGroups.get(topic.id) ?? []),
      ),
    );
  }

  const changed = (await Promise.all(writes)).filter(Boolean).length;
  console.log(
    `agent-context indexes updated (${entries.filter((entry) => entry.kind === "paper").length} papers, ${entries.filter((entry) => entry.kind === "article").length} articles, ${changed} files changed)`,
  );
}

main().catch((error) => {
  console.error(error.stack ?? String(error));
  process.exit(1);
});
