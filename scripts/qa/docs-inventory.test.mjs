import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const INVENTORY_PATH = path.join(ROOT_DIR, "docs/文档清单.md");

const MAINTAINED_MARKDOWN_PREFIXES = [
  "AGENTS.md",
  "README.md",
  "progress.md",
  "config/",
  "deployments/",
  "docs/",
  "scripts/",
  "server/",
  "web/",
];

const IGNORED_MARKDOWN_PREFIXES = [
  ".agents/",
  "node_modules/",
  "output/",
  "tmp/",
  "server/bin/",
  "web/node_modules/",
];

const LOCAL_LINK_SCAN_IGNORED_PREFIXES = [
  "docs/archive/",
  "docs/reference/",
  "progress.md",
];

const EXTERNAL_LINK_SCHEMES = new Set([
  "app:",
  "chatgpt-conversation:",
  "data:",
  "http:",
  "https:",
  "mailto:",
  "sandbox:",
  "tel:",
]);

function gitList(args) {
  const output = execFileSync("git", args, {
    cwd: ROOT_DIR,
    encoding: "utf8",
  });
  return output.split("\0").filter(Boolean);
}

function isMaintainedMarkdown(file) {
  return (
    MAINTAINED_MARKDOWN_PREFIXES.some(
      (prefix) => file === prefix || file.startsWith(prefix),
    ) &&
    !IGNORED_MARKDOWN_PREFIXES.some(
      (prefix) => file === prefix || file.startsWith(prefix) || file.includes(`/${prefix}`),
    )
  );
}

function collectMarkdownFiles() {
  return [
    ...new Set([
      ...gitList(["ls-files", "-z", "--", "*.md"]),
      ...gitList(["ls-files", "--others", "--exclude-standard", "-z", "--", "*.md"]),
    ]),
  ]
    .filter(isMaintainedMarkdown)
    .filter((file) => fs.existsSync(path.join(ROOT_DIR, file)))
    .sort();
}

function collectInventoryMarkdownPaths(inventory) {
  return [...inventory.matchAll(/\|\s*`([^`]+\.md)`\s*\|/gu)].map(
    (match) => match[1],
  );
}

function stripFencedCode(markdown) {
  return markdown.replace(/^\s*(```|~~~)[\s\S]*?^\s*\1\s*$/gmu, "");
}

function markdownLinkTargets(markdown) {
  const targets = [];
  const source = stripFencedCode(markdown);
  const linkPattern = /!?\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+["'][^)]*["'])?\)/gu;
  for (const match of source.matchAll(linkPattern)) {
    targets.push(match[1].replace(/^<|>$/gu, ""));
  }
  return targets;
}

function resolveLocalLink(sourceFile, rawTarget) {
  const target = rawTarget.trim();
  if (!target || target.startsWith("#") || target.startsWith("/")) {
    return null;
  }
  try {
    const url = new URL(target);
    if (EXTERNAL_LINK_SCHEMES.has(url.protocol)) {
      return null;
    }
  } catch {
    // Relative repository links are not absolute URLs and are handled below.
  }
  const pathOnly = target.split(/[?#]/u, 1)[0];
  if (!pathOnly) {
    return null;
  }
  let decodedPath = pathOnly;
  try {
    decodedPath = decodeURIComponent(pathOnly);
  } catch {
    // Keep the original path so the failure reports the malformed target.
  }
  return path.resolve(ROOT_DIR, path.dirname(sourceFile), decodedPath);
}

test("document inventory lists maintained Markdown files", () => {
  const inventory = fs.readFileSync(INVENTORY_PATH, "utf8");
  const markdownFiles = collectMarkdownFiles();
  const missing = markdownFiles.filter((file) => !inventory.includes(`\`${file}\``));

  assert.deepEqual(
    missing,
    [],
    `docs/文档清单.md missing maintained Markdown paths:\n${missing.join("\n")}`,
  );
  console.log(`docs inventory ok: markdownFiles=${markdownFiles.length}`);
});

test("document inventory does not retain missing Markdown paths", () => {
  const inventory = fs.readFileSync(INVENTORY_PATH, "utf8");
  const missing = collectInventoryMarkdownPaths(inventory).filter(
    (file) => !fs.existsSync(path.join(ROOT_DIR, file)),
  );

  assert.deepEqual(
    missing,
    [],
    `docs/文档清单.md contains missing Markdown paths:\n${missing.join("\n")}`,
  );
});

test("active Markdown local links resolve to repository files", () => {
  const activeMarkdownFiles = collectMarkdownFiles().filter(
    (file) =>
      !LOCAL_LINK_SCAN_IGNORED_PREFIXES.some(
        (prefix) => file === prefix || file.startsWith(prefix),
      ),
  );
  const broken = [];

  for (const sourceFile of activeMarkdownFiles) {
    const markdown = fs.readFileSync(path.join(ROOT_DIR, sourceFile), "utf8");
    for (const rawTarget of markdownLinkTargets(markdown)) {
      const resolved = resolveLocalLink(sourceFile, rawTarget);
      if (resolved && !fs.existsSync(resolved)) {
        broken.push(`${sourceFile} -> ${rawTarget}`);
      }
    }
  }

  assert.deepEqual(
    broken,
    [],
    `active Markdown contains broken local links:\n${broken.join("\n")}`,
  );
});
