import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { findBrokenLocalMarkdownLinks } from "./lib/markdown-links.mjs";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const INVENTORY_PATH = path.join(ROOT_DIR, "docs/文档清单.md");
const CURRENT_TRUTH_PATH = path.join(ROOT_DIR, "docs/当前真源与交接顺序.md");

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
  "progress.md",
];

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

test("repository does not retain external reference source documents", () => {
  const maintainedReferenceFiles = [
    ...new Set([
      ...gitList(["ls-files", "-z", "--", "docs/reference/**"]),
      ...gitList([
        "ls-files",
        "--others",
        "--exclude-standard",
        "-z",
        "--",
        "docs/reference/**",
      ]),
    ]),
  ]
    .filter((file) => fs.existsSync(path.join(ROOT_DIR, file)))
    .sort();

  assert.deepEqual(
    maintainedReferenceFiles,
    [],
    `external reference source documents must stay outside the repository:\n${maintainedReferenceFiles.join("\n")}`,
  );
});

test("active Markdown does not name retired adjacent projects", () => {
  const retiredProjectPattern = /trade[-_ ]erp/iu;
  const matches = [];

  for (const sourceFile of collectMarkdownFiles()) {
    if (sourceFile === "progress.md" || sourceFile.startsWith("docs/archive/")) {
      continue;
    }
    const lines = fs.readFileSync(path.join(ROOT_DIR, sourceFile), "utf8").split(/\r?\n/u);
    lines.forEach((line, index) => {
      if (retiredProjectPattern.test(line)) {
        matches.push(`${sourceFile}:${index + 1}: ${line.trim()}`);
      }
    });
  }

  assert.deepEqual(
    matches,
    [],
    `active Markdown names retired adjacent projects:\n${matches.join("\n")}`,
  );
});

test("active Markdown local links resolve to repository files", () => {
  const broken = findBrokenLocalMarkdownLinks({
    rootDir: ROOT_DIR,
    sourceFiles: collectMarkdownFiles(),
    ignoredPrefixes: LOCAL_LINK_SCAN_IGNORED_PREFIXES,
  });

  assert.deepEqual(
    broken,
    [],
    `active Markdown contains broken local links:\n${broken.join("\n")}`,
  );
});

test("current truth stays a compact routing document", () => {
  const source = fs.readFileSync(CURRENT_TRUTH_PATH, "utf8");
  const lineCount = source.split(/\r?\n/u).length;
  const byteCount = Buffer.byteLength(source, "utf8");

  assert(
    lineCount <= 120,
    `docs/当前真源与交接顺序.md must stay at or below 120 lines, got ${lineCount}`,
  );
  assert(
    byteCount <= 20 * 1024,
    `docs/当前真源与交接顺序.md must stay at or below 20 KiB, got ${byteCount} bytes`,
  );

  for (const required of [
    "## 阅读顺序",
    "## 真源层级",
    "## 当前业务边界",
    "## Workflow 与 Fact",
    "## 前端入口",
    "## 测试与发布",
    "产品能力进度台账.md",
    "自动化测试策略.md",
    "server/deploy/README.md",
  ]) {
    assert(source.includes(required), `current truth missing routing anchor: ${required}`);
  }

  for (const volatileDetail of [
    /customer-trial-133/u,
    /workflow\.task-mutation-result\/v\d+/u,
    /domain_command_compensated_by/u,
    /2026\d{10}_migrate\.sql/u,
    /\d+ 项只读浏览器/u,
  ]) {
    assert.doesNotMatch(
      source,
      volatileDetail,
      `current truth must route to implementation evidence instead of copying ${volatileDetail}`,
    );
  }
});
