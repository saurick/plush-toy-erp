#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const RUNTIME_ROOTS = Object.freeze([
  "server/internal/core",
  "server/internal/biz",
  "server/internal/data",
  "server/internal/service",
  "server/internal/server",
  "server/pkg",
  "web/src",
  "config",
]);

const STATUS_DICTIONARY_PATH = "docs/architecture/状态字典与生命周期索引.md";
const TEXT_EXTENSIONS = new Set([
  ".go",
  ".js",
  ".jsx",
  ".json",
  ".mjs",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);

export const EXPERIMENTAL_RUNTIME_RULES = Object.freeze([
  { id: "legacy-keyword", pattern: /legacy/iu },
  { id: "deprecated-keyword", pattern: /\bDeprecated\s*:|@deprecated\b/iu },
  {
    id: "compatibility-keyword",
    pattern:
      /\b(?:backward(?:s)?|historical)?[\s-]*compatibility[\s-]+(?:alias|branch|layer|path|wrapper)\b/iu,
  },
  {
    id: "compatibility-copy-keyword",
    pattern: /历史兼容|兼容(?:别名|层|分支|键|路径|权限|态|状态|字段)/u,
  },
]);

const EXPERIMENTAL_DICTIONARY_RULES = Object.freeze([
  { id: "legacy-availability-keyword", pattern: /\[L\]|\[P\/L\]/u },
  { id: "legacy-category-keyword", pattern: /\b(?:Legacy|Compatibility)\b/iu },
  { id: "compatibility-state-copy-keyword", pattern: /兼容态/u },
]);

function normalizeRepoPath(value) {
  return value.split(path.sep).join("/").replace(/^\.\//u, "");
}

function isSkippedDirectory(relativePath) {
  const normalized = normalizeRepoPath(relativePath);
  return (
    normalized === "server/internal/data/model/ent" ||
    normalized.startsWith("server/internal/data/model/ent/") ||
    normalized === "server/internal/data/model/migrate" ||
    normalized.startsWith("server/internal/data/model/migrate/") ||
    normalized.split("/").includes("third_party") ||
    normalized.split("/").includes("__tests__")
  );
}

function isSkippedFile(relativePath) {
  const normalized = normalizeRepoPath(relativePath);
  const fileName = path.posix.basename(normalized);
  return (
    isSkippedDirectory(normalized) ||
    fileName.endsWith("_test.go") ||
    /\.(?:spec|test)\.(?:js|jsx|mjs|ts|tsx)$/u.test(fileName) ||
    fileName.endsWith(".pb.go") ||
    !TEXT_EXTENSIONS.has(path.extname(fileName))
  );
}

function walkFiles(root, relativeRoot) {
  const absoluteRoot = path.join(root, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) return [];
  if (fs.statSync(absoluteRoot).isFile()) {
    return isSkippedFile(relativeRoot) ? [] : [relativeRoot];
  }
  const files = [];
  for (const entry of fs
    .readdirSync(absoluteRoot, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = normalizeRepoPath(path.join(relativeRoot, entry.name));
    if (entry.isDirectory()) {
      if (!isSkippedDirectory(relativePath)) {
        files.push(...walkFiles(root, relativePath));
      }
    } else if (entry.isFile() && !isSkippedFile(relativePath)) {
      files.push(relativePath);
    }
  }
  return files;
}

export function matchingExperimentalRuleIDs(
  value,
  rules = EXPERIMENTAL_RUNTIME_RULES,
) {
  return rules.filter((rule) => rule.pattern.test(value)).map((rule) => rule.id);
}

function scanFile(root, relativePath, rules) {
  const content = fs.readFileSync(path.join(root, relativePath), "utf8");
  const hits = [];
  for (const [index, line] of content.split(/\r?\n/u).entries()) {
    for (const rule of rules) {
      if (!rule.pattern.test(line)) continue;
      hits.push({
        file: normalizeRepoPath(relativePath),
        line: index + 1,
        rule: rule.id,
        snippet: line.trim().replace(/\s+/gu, " ").slice(0, 220),
      });
    }
  }
  return hits;
}

export function scanExperimentalCanonicalRuntime(root = DEFAULT_ROOT) {
  const hits = [];
  const runtimeFiles = [
    ...new Set(RUNTIME_ROOTS.flatMap((relativeRoot) => walkFiles(root, relativeRoot))),
  ].sort();
  for (const relativePath of runtimeFiles) {
    for (const rule of EXPERIMENTAL_RUNTIME_RULES) {
      if (rule.pattern.test(relativePath)) {
        hits.push({
          file: relativePath,
          line: 1,
          rule: rule.id,
          snippet: "broad keyword in runtime path",
        });
      }
    }
    hits.push(...scanFile(root, relativePath, EXPERIMENTAL_RUNTIME_RULES));
  }

  if (fs.existsSync(path.join(root, STATUS_DICTIONARY_PATH))) {
    hits.push(
      ...scanFile(root, STATUS_DICTIONARY_PATH, EXPERIMENTAL_DICTIONARY_RULES),
    );
  } else {
    hits.push({
      file: STATUS_DICTIONARY_PATH,
      line: 1,
      rule: "status-dictionary-missing",
      snippet: "status dictionary not found",
    });
  }
  return hits.sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.line - right.line ||
      left.rule.localeCompare(right.rule),
  );
}

export function formatExperimentalAudit(hits) {
  return [
    `[qa:canonical-experimental] non_blocking=true hits=${hits.length}`,
    ...hits.map(
      (hit) =>
        `  - ${hit.file}:${hit.line}: [${hit.rule}] ${hit.snippet || "<empty line>"}`,
    ),
    "[qa:canonical-experimental] broad keyword hits are review leads, not product defects or release evidence.",
    "[qa:canonical-experimental] restore blocking only after per-domain status/key/API/function/runtime contracts replace this broad scan.",
  ].join("\n");
}

function parseArgs(argv) {
  let root = DEFAULT_ROOT;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") {
      const value = argv[index + 1];
      if (!value) throw new Error("--root requires a directory");
      root = path.resolve(value);
      index += 1;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      return { help: true, root };
    }
    throw new Error(`unsupported argument: ${arg}`);
  }
  return { help: false, root };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(`Experimental canonical runtime audit (non-blocking)\n\nUsage:\n  node scripts/qa/experimental/canonical-runtime-audit.mjs [--root <repo>]`);
    return;
  }
  console.log(formatExperimentalAudit(scanExperimentalCanonicalRuntime(options.root)));
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    console.error(`[qa:canonical-experimental] ${error.message}`);
    process.exitCode = 1;
  }
}
