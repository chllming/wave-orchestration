#!/usr/bin/env node
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const REPO_ROOT = process.cwd();
const DEFAULT_OUTPUT_ROOT = path.join(REPO_ROOT, "docs/research/agent-context-cache");
const TODAY = new Date().toISOString().slice(0, 10);
const require = createRequire(import.meta.url);
const PDFJS_PACKAGE_DIR = path.dirname(require.resolve("pdfjs-dist/package.json"));
const STANDARD_FONT_DATA_URL = `${pathToFileURL(path.join(PDFJS_PACKAGE_DIR, "standard_fonts")).href}/`;

function usage() {
  console.error(
    "Usage: node scripts/research/import-agent-context-archive.mjs <manifest-module> [--output-root <dir>] [--only <slug1,slug2>]",
  );
}

function parseArgs(argv) {
  const args = [...argv];
  const manifestPath = args.shift();
  if (!manifestPath) {
    usage();
    process.exit(1);
  }

  let outputRoot = DEFAULT_OUTPUT_ROOT;
  let only = null;

  while (args.length > 0) {
    const arg = args.shift();
    if (arg === "--") {
      continue;
    }
    if (arg === "--output-root") {
      outputRoot = path.resolve(REPO_ROOT, args.shift() ?? "");
      continue;
    }
    if (arg === "--only") {
      const value = args.shift() ?? "";
      only = new Set(
        value
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean),
      );
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    manifestPath: path.resolve(REPO_ROOT, manifestPath),
    outputRoot,
    only,
  };
}

function normalizeWhitespace(value) {
  return String(value ?? "")
    .replaceAll("\u00a0", " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function normalizeAuthorName(value) {
  const name = normalizeWhitespace(value)
    .replace(/[∗*†‡§¶‖]+$/g, "")
    .trim();
  const parts = name
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 2) {
    return `${parts[1]} ${parts[0]}`;
  }
  return name;
}

function extractYear(value) {
  const match = String(value ?? "").match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function escapeInlinePipes(value) {
  return String(value ?? "").replaceAll("|", "\\|");
}

function escapeYamlSingleQuoted(value) {
  return String(value ?? "").replaceAll("'", "''");
}

function normalizeList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeWhitespace(entry))
    .filter(Boolean);
}

function sanitizeTextForMarkdown(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .split("\u0000")
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractProxyMarkdownContent(value) {
  const text = String(value ?? "").replace(/\r\n/g, "\n");
  const marker = "\nMarkdown Content:\n";
  const markerIndex = text.indexOf(marker);
  if (markerIndex >= 0) {
    return text.slice(markerIndex + marker.length).trim();
  }
  return text
    .replace(/^Title:.*?\n/m, "")
    .replace(/^URL Source:.*?\n/m, "")
    .trim();
}

function fileExists(p) {
  return fs
    .access(p)
    .then(() => true)
    .catch(() => false);
}

async function fetchText(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "text/html,application/xhtml+xml,application/xml,text/plain;q=0.9,*/*;q=0.8",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return await response.text();
}

async function fetchBuffer(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/pdf,application/octet-stream,*/*;q=0.8",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function deriveArxivPdfUrl(url) {
  const match = String(url).match(/^https?:\/\/arxiv\.org\/(?:abs|html)\/([^?#/]+(?:v\d+)?)\/?$/);
  if (!match) {
    return null;
  }
  return `https://arxiv.org/pdf/${match[1]}.pdf`;
}

function resolveUrlMaybe(baseUrl, candidate) {
  try {
    return new URL(candidate, baseUrl).toString();
  } catch {
    return null;
  }
}

function discoverPdfFromHtml(doc, baseUrl) {
  const metaPdf = doc.querySelector('meta[name="citation_pdf_url"]')?.getAttribute("content");
  if (metaPdf) {
    return resolveUrlMaybe(baseUrl, metaPdf);
  }

  const anchors = [...doc.querySelectorAll("a[href]")];
  const exactPdf = anchors
    .map((anchor) => ({
      href: resolveUrlMaybe(baseUrl, anchor.getAttribute("href")),
      text: normalizeWhitespace(anchor.textContent),
    }))
    .find(({ href }) => href && /\.pdf(?:[?#].*)?$/i.test(href));
  if (exactPdf?.href) {
    return exactPdf.href;
  }

  const labeledPdf = anchors
    .map((anchor) => ({
      href: resolveUrlMaybe(baseUrl, anchor.getAttribute("href")),
      text: normalizeWhitespace(anchor.textContent).toLowerCase(),
    }))
    .find(({ href, text }) => href && text.includes("pdf"));
  return labeledPdf?.href ?? null;
}

function parseMetadataFromHtml(html, url) {
  const dom = new JSDOM(html, { url });
  const { document } = dom.window;
  const meta = {
    title:
      document.querySelector('meta[name="citation_title"]')?.getAttribute("content") ??
      document.querySelector("title")?.textContent ??
      null,
    authors: [...document.querySelectorAll('meta[name="citation_author"]')]
      .map((element) => normalizeAuthorName(element.getAttribute("content")))
      .filter(Boolean),
    year:
      extractYear(
        document.querySelector('meta[name="citation_publication_date"]')?.getAttribute("content"),
      ) ??
      extractYear(document.querySelector('meta[name="citation_date"]')?.getAttribute("content")) ??
      extractYear(
        document.querySelector('meta[property="article:published_time"]')?.getAttribute("content"),
      ) ??
      null,
    venue:
      document.querySelector('meta[name="citation_conference_title"]')?.getAttribute("content") ??
      document.querySelector('meta[name="citation_journal_title"]')?.getAttribute("content") ??
      document.querySelector('meta[name="dc.source"]')?.getAttribute("content") ??
      null,
    pdfUrl: discoverPdfFromHtml(document, url),
  };

  return { dom, meta };
}

function collectReadableTextFromHtml(html, url) {
  const sourceDom = new JSDOM(html, { url });
  const article = new Readability(sourceDom.window.document).parse();
  if (!article) {
    return null;
  }

  const articleDom = new JSDOM(article.content);
  const blockSelectors = "h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,tr";
  const blocks = [...articleDom.window.document.querySelectorAll(blockSelectors)]
    .map((node) => normalizeWhitespace(node.textContent))
    .filter(Boolean);
  if (blocks.length === 0) {
    return sanitizeTextForMarkdown(article.textContent ?? "");
  }
  return sanitizeTextForMarkdown(blocks.join("\n\n"));
}

function shouldInsertSpace(prevText, nextText, currentX, previousEndX) {
  if (!prevText) {
    return false;
  }
  if (/[-/([{]$/.test(prevText)) {
    return false;
  }
  if (/^[,.;:!?)}\]]/.test(nextText)) {
    return false;
  }
  if (previousEndX == null || currentX == null) {
    return true;
  }
  return currentX - previousEndX > 0.8;
}

function finalizePdfLine(chunks) {
  return sanitizeTextForMarkdown(
    chunks
      .join("")
      .replace(/\s+([,.;:!?])/g, "$1")
      .replace(/([([{])\s+/g, "$1")
      .replace(/\s+([)\]}])/g, "$1")
      .replace(/-\s+\n/g, "-"),
  );
}

async function extractPdfText(buffer) {
  const originalWarn = console.warn;
  const originalLog = console.log;
  console.warn = (...args) => {
    const message = String(args[0] ?? "");
    if (message.includes("Unable to load font data") || message.includes("standardFontDataUrl")) {
      return;
    }
    originalWarn(...args);
  };
  console.log = (...args) => {
    const message = String(args[0] ?? "");
    if (message.startsWith("Warning: TT:")) {
      return;
    }
    originalLog(...args);
  };

  const pdf = await getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
  }).promise;
  const sections = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const lines = [];
      let currentLine = [];
      let lastY = null;
      let lastXEnd = null;
      let lastHeight = null;

      for (const item of textContent.items) {
        if (!("str" in item)) {
          continue;
        }
        const text = String(item.str ?? "");
        if (!text.trim()) {
          if (item.hasEOL && currentLine.length > 0) {
            lines.push(finalizePdfLine(currentLine));
            currentLine = [];
            lastY = null;
            lastXEnd = null;
            lastHeight = null;
          }
          continue;
        }

        const transform = Array.isArray(item.transform) ? item.transform : [];
        const currentX = Number(transform[4] ?? 0);
        const currentY = Number(transform[5] ?? 0);
        const currentHeight = Number(item.height ?? 0);
        const currentWidth = Number(item.width ?? 0);

        const yThreshold = Math.max(2, (lastHeight ?? currentHeight) * 0.6);
        const shouldBreakLine = lastY != null && Math.abs(currentY - lastY) > yThreshold;
        if (shouldBreakLine && currentLine.length > 0) {
          lines.push(finalizePdfLine(currentLine));
          currentLine = [];
          lastXEnd = null;
        }

        if (shouldInsertSpace(currentLine.at(-1) ?? "", text, currentX, lastXEnd)) {
          currentLine.push(" ");
        }
        currentLine.push(text);

        lastY = currentY;
        lastHeight = currentHeight || lastHeight;
        lastXEnd = currentX + currentWidth;

        if (item.hasEOL) {
          lines.push(finalizePdfLine(currentLine));
          currentLine = [];
          lastY = null;
          lastXEnd = null;
          lastHeight = null;
        }
      }

      if (currentLine.length > 0) {
        lines.push(finalizePdfLine(currentLine));
      }

      const pageText = sanitizeTextForMarkdown(lines.filter(Boolean).join("\n\n"));
      if (pageText) {
        sections.push(`### Page ${pageNumber}\n\n${pageText}`);
      }
    }
  } finally {
    console.warn = originalWarn;
    console.log = originalLog;
  }

  return sections.join("\n\n");
}

function inferAuthorsFromPdfText(extractedText, title) {
  const titleFragments = title
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 3);
  const pages = extractedText
    .split(/^### Page \d+\s*$/m)
    .map((page) =>
      page
        .split("\n")
        .map((line) => normalizeWhitespace(line))
        .filter(Boolean),
    )
    .filter((pageLines) => pageLines.length > 0);

  const affiliationWords = [
    "@",
    "abstract",
    "introduction",
    "university",
    "università",
    "institute",
    "department",
    "research",
    "laboratory",
    "lab",
    "college",
    "school",
    "center",
    "centre",
    "microsoft",
    "google",
    "amazon",
    "meta",
    "berkeley",
    "cambridge",
    "italy",
    "united kingdom",
    "united states",
    "usa",
    "uk",
    "doi",
    "arxiv",
    "proceedings",
  ];

  const selectCandidates = (probeLines) => {
    const cleanAuthorLine = (line) => {
      if (line.includes(";")) {
        return line
          .split(";")
          .map((segment) => segment.split(",")[0]?.trim())
          .filter(Boolean)
          .join(", ");
      }

      const commaParts = line
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
      if (commaParts.length >= 2) {
        while (commaParts.length > 0) {
          const tail = commaParts.at(-1)?.toLowerCase() ?? "";
          if (affiliationWords.some((word) => tail.includes(word))) {
            commaParts.pop();
            continue;
          }
          break;
        }
        return commaParts.join(", ");
      }
      return line;
    };

    const candidates = [];
    for (const rawLine of probeLines) {
      const line = rawLine.replace(/[∗*†‡§¶‖0-9]+$/g, "").trim();
      if (!line || line.length < 6 || line.length > 160) {
        continue;
      }
      const cleanedLine = cleanAuthorLine(line);
      const lower = cleanedLine.toLowerCase();
      if (titleFragments.slice(0, 3).every((word) => lower.includes(word))) {
        continue;
      }
      if (affiliationWords.some((word) => lower.includes(word))) {
        continue;
      }
      if (line.includes("http")) {
        continue;
      }
      if (line.includes("https://")) {
        continue;
      }

      const tokens = cleanedLine.replaceAll(",", " ").split(/\s+/).filter(Boolean);
      if (tokens.length < 2 || tokens.length > 24) {
        continue;
      }
      const uppercaseishTokens = tokens.filter(
        (token) => /^[A-Z][A-Za-z.'-]*$/.test(token) || /^[A-Z]\.$/.test(token),
      );
      if (uppercaseishTokens.length < Math.ceil(tokens.length * 0.6)) {
        continue;
      }
      candidates.push(cleanedLine);
    }
    return candidates.length > 0 ? [...new Set(candidates)].join(", ") : null;
  };

  for (const lines of pages.slice(0, 4)) {
    const titleLineIndex = lines.findIndex((line) => {
      const lower = line.toLowerCase();
      return titleFragments.slice(0, 4).every((word) => lower.includes(word));
    });
    if (titleLineIndex < 0) {
      continue;
    }
    const titleEndIndex = lines.findIndex(
      (line, index) => index > titleLineIndex && line.toLowerCase().startsWith("abstract"),
    );
    const probeLines = lines.slice(
      Math.max(0, titleLineIndex + 1),
      titleEndIndex > 0 ? titleEndIndex : Math.min(lines.length, titleLineIndex + 24),
    );
    const candidates = selectCandidates(probeLines);
    if (candidates) {
      return candidates;
    }
  }

  return selectCandidates(pages[0] ?? []);
}

async function enrichFromHtmlSource(url, resolved, options = {}) {
  const html = await fetchText(url);
  const { meta } = parseMetadataFromHtml(html, url);
  if (!resolved.authors && meta.authors.length > 0) {
    resolved.authors = meta.authors.join(", ");
  }
  if (!resolved.year && meta.year) {
    resolved.year = meta.year;
  }
  if (!resolved.venue && meta.venue) {
    resolved.venue = normalizeWhitespace(meta.venue);
  }
  if (!options.preferHtml && !resolved.sourcePdf && meta.pdfUrl) {
    resolved.sourcePdf = meta.pdfUrl;
  }
  if (!resolved.extractedText && (options.preferHtml || !resolved.sourcePdf)) {
    const readableText = collectReadableTextFromHtml(html, url);
    if (readableText) {
      resolved.extractedText = readableText;
    }
  }
}

async function tryHtmlFallback(url, resolved, slug, label) {
  if (!url || String(url).toLowerCase().endsWith(".pdf")) {
    return false;
  }
  try {
    const html = await fetchText(url);
    const readableText = collectReadableTextFromHtml(html, url);
    if (readableText) {
      resolved.extractedText = readableText;
      return true;
    }
  } catch (error) {
    console.error(`[warn] ${slug}: could not extract ${label} HTML (${error.message})`);
  }
  return false;
}

function renderMetadataRows(entry, resolved) {
  const rows = [
    ["Content type", entry.kind === "article" ? "Article" : "Paper / report"],
    ["Authors", resolved.authors],
    ["Year", String(resolved.year)],
    ["Venue", resolved.venue],
    ["Research bucket", entry.researchBucket],
    ["Maps to", entry.mapsTo],
    ["Harness fit", entry.fit],
    ["Source page", entry.sourcePage ? `[Open source](${entry.sourcePage})` : null],
    ["Source PDF", resolved.sourcePdf ? `[Open PDF](${resolved.sourcePdf})` : null],
    [
      "Additional source",
      entry.additionalSource ? `[Open source](${entry.additionalSource})` : null,
    ],
    ["Additional PDF", entry.additionalPdf ? `[Open PDF](${entry.additionalPdf})` : null],
    ["Notes", entry.notes ?? null],
  ].filter(([, value]) => value);

  return rows.map(([field, value]) => `| ${field} | ${escapeInlinePipes(value)} |`).join("\n");
}

function renderMarkdown(entry, resolved) {
  const kind = entry.kind === "article" ? "article" : "paper";
  const summary = `${kind === "article" ? "Cached article text" : "Converted paper text"} and source links for ${entry.title}.`;
  const readWhenLines =
    kind === "article"
      ? [
          "  - Reviewing current harness guidance in the local archive",
          "  - You want the extracted article text with source links preserved",
        ]
      : [
          "  - Reviewing harness and coordination research source material in the docs tree",
          "  - You want the extracted paper text with source links preserved",
        ];
  const topics = normalizeList(entry.topics);
  const topicBlock =
    topics.length > 0 ? `topics:\n${topics.map((topic) => `  - ${topic}`).join("\n")}\n` : "";
  const sourceLabel = kind === "article" ? "source page" : "source document";

  return `---
summary: '${escapeYamlSingleQuoted(summary)}'
read_when:
${readWhenLines.join("\n")}
${topicBlock}kind: '${kind}'
title: '${escapeYamlSingleQuoted(entry.title)}'
---
# ${entry.title}

<Note>
Converted from the ${sourceLabel} on ${TODAY}. The repo does not retain downloaded source files; they were fetched transiently, converted to Markdown, and deleted after extraction.
</Note>

## Metadata

| Field | Value |
| --- | --- |
${renderMetadataRows(entry, resolved)}

## Extracted text
${resolved.extractedText}
`;
}

async function loadManifest(manifestPath) {
  const manifestUrl = pathToFileURL(manifestPath).href;
  const module = await import(manifestUrl);
  const manifest = module.paperManifest ?? module.default;
  if (!Array.isArray(manifest)) {
    throw new Error(`Manifest ${manifestPath} did not export paperManifest/default array`);
  }
  return manifest;
}

async function hydrateTextSource(entry, resolved) {
  if (!entry.textSourceUrl || resolved.extractedText) {
    return;
  }
  const raw = await fetchText(entry.textSourceUrl);
  let extracted =
    entry.textSourceFormat === "jina-markdown" ? extractProxyMarkdownContent(raw) : raw;
  if (entry.textStartMarker) {
    const markerIndex = extracted.indexOf(entry.textStartMarker);
    if (markerIndex >= 0) {
      extracted = extracted.slice(markerIndex).trimStart();
    }
  }
  resolved.extractedText = sanitizeTextForMarkdown(extracted);
}

async function processEntry(entry, outputRoot, tempDir) {
  const preferHtml = Boolean(entry.preferHtml);
  const resolved = {
    title: entry.title,
    sourcePdf: preferHtml ? null : (entry.sourcePdf ?? deriveArxivPdfUrl(entry.sourcePage)),
    authors: entry.authors ?? null,
    year: entry.year ?? null,
    venue: entry.venue ?? null,
    extractedText: null,
  };

  await hydrateTextSource(entry, resolved);

  if (
    entry.sourcePage &&
    entry.skipSourcePageFetch !== true &&
    !String(entry.sourcePage).toLowerCase().endsWith(".pdf")
  ) {
    try {
      await enrichFromHtmlSource(entry.sourcePage, resolved, { preferHtml });
    } catch (error) {
      console.error(
        `[warn] ${entry.slug}: could not parse source page metadata (${error.message})`,
      );
    }
  }

  if (!resolved.sourcePdf && entry.additionalSource) {
    const derivedPdf = deriveArxivPdfUrl(entry.additionalSource);
    if (derivedPdf) {
      resolved.sourcePdf = derivedPdf;
    }
  }

  if (
    entry.additionalSource &&
    (!resolved.authors ||
      !resolved.venue ||
      !resolved.year ||
      !resolved.sourcePdf ||
      !resolved.extractedText) &&
    !String(entry.additionalSource).toLowerCase().endsWith(".pdf")
  ) {
    try {
      await enrichFromHtmlSource(entry.additionalSource, resolved, { preferHtml });
    } catch (error) {
      console.error(
        `[warn] ${entry.slug}: could not parse additional source metadata (${error.message})`,
      );
    }
  }

  if (!resolved.extractedText && typeof resolved.sourcePdf === "string" && resolved.sourcePdf) {
    try {
      const pdfBuffer = await fetchBuffer(resolved.sourcePdf);
      const tempPdfPath = path.join(tempDir, `${entry.slug}.pdf`);
      await fs.writeFile(tempPdfPath, pdfBuffer);
      resolved.extractedText = await extractPdfText(pdfBuffer);
      await fs.rm(tempPdfPath, { force: true });
    } catch (error) {
      console.error(`[warn] ${entry.slug}: could not extract PDF (${error.message})`);
      if (entry.additionalPdf && entry.additionalPdf !== resolved.sourcePdf) {
        try {
          const pdfBuffer = await fetchBuffer(entry.additionalPdf);
          const tempPdfPath = path.join(tempDir, `${entry.slug}.pdf`);
          await fs.writeFile(tempPdfPath, pdfBuffer);
          resolved.extractedText = await extractPdfText(pdfBuffer);
          await fs.rm(tempPdfPath, { force: true });
        } catch (innerError) {
          console.error(
            `[warn] ${entry.slug}: could not extract additional PDF (${innerError.message})`,
          );
        }
      }
    }
  }

  if (!resolved.extractedText && entry.additionalSource) {
    await tryHtmlFallback(entry.additionalSource, resolved, entry.slug, "additional source");
  }

  if (!resolved.extractedText && entry.sourcePage && entry.skipSourcePageFetch !== true) {
    await tryHtmlFallback(entry.sourcePage, resolved, entry.slug, "source");
  }

  if (!resolved.extractedText) {
    throw new Error(`${entry.slug}: no extractable source found`);
  }

  if (!resolved.authors && entry.kind !== "article") {
    resolved.authors =
      inferAuthorsFromPdfText(resolved.extractedText, entry.title) ?? "See extracted text";
  }
  if (!resolved.year) {
    resolved.year = "Unknown";
  }
  if (!resolved.venue) {
    resolved.venue = "Unknown";
  }

  const markdown = renderMarkdown(entry, resolved);
  const kindDir = path.join(outputRoot, entry.kind === "article" ? "articles" : "papers");
  await fs.mkdir(kindDir, { recursive: true });
  const outPath = path.join(kindDir, `${entry.slug}.md`);
  await fs.writeFile(outPath, `${markdown.trimEnd()}\n`, "utf8");
  return {
    slug: entry.slug,
    outPath,
    authors: resolved.authors,
    sourcePdf: resolved.sourcePdf ?? null,
  };
}

async function main() {
  const { manifestPath, outputRoot, only } = parseArgs(process.argv.slice(2));
  const manifest = await loadManifest(manifestPath);
  const selected = only ? manifest.filter((entry) => only.has(entry.slug)) : manifest;
  if (selected.length === 0) {
    throw new Error("No manifest entries selected");
  }

  await fs.mkdir(outputRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wave-agent-context-import-"));
  const results = [];

  try {
    for (const entry of selected) {
      console.error(`[archive] ${entry.slug}`);
      results.push(await processEntry(entry, outputRoot, tempDir));
    }
  } finally {
    if (await fileExists(tempDir)) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  for (const result of results) {
    console.log(`${result.slug}\t${path.relative(REPO_ROOT, result.outPath)}\t${result.authors}`);
  }
}

main().catch((error) => {
  console.error(error.stack ?? String(error));
  process.exit(1);
});
