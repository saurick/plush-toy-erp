#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const SKIP_PARTS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "docs/archive",
  "docs/customers/yoyoosun/raw-source-files",
  "output",
  "server/bin",
  "server/internal/data/model/ent",
  "deployments/yoyoosun/evidence/releases",
]);

const SKIP_FILES = new Set([
  ".gitleaksignore",
  "docs/文档清单.md",
  "progress.md",
  "scripts/qa/phase-label-boundaries.mjs",
]);

const SKIP_DIRECTORY_NAMES = new Set([
  ".git",
  "bin",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "output",
]);

const TEXT_EXTENSIONS = new Set([
  "",
  ".go",
  ".js",
  ".jsx",
  ".mjs",
  ".sh",
  ".ts",
  ".tsx",
  ".md",
  ".html",
  ".json",
  ".yml",
  ".yaml",
  ".css",
]);

const NUMBERED_PHASE =
  /Phase\s*\d+[A-Za-z0-9-]*|phase\d+[A-Za-z0-9-]*|PHASE\d+[A-Z0-9-]*|SIM-[A-Z0-9-]*PHASE\d+[A-Z0-9-]*|\/erp\/phase\d+|jsonrpc_phase\d*/u;
const ABBREVIATED_STAGE =
  /\bP\d+(?:-\d+)+\b|\bP\d+\s+(?:phase|stage|milestone|release|goal|chain|loader|handler|command|阶段|里程碑|发布阶段|目标阶段|实施链路)/iu;
const PROJECT_STAGE_VERSION =
  /\bV[1-9]\d*(?:[A-Z][A-Za-z0-9]*Page|_ROUTE_PATHS)\b|(?:^|[^A-Za-z0-9_-])(?:formal|erp|business)-v[1-9]\d*\b|\bv[1-9]\d*-(?:local-)?acceptance-plan\b/u;
const PROJECT_ORIGIN_COPY = /旧项目(?:与外部规划|只作迁移背景|只能作迁移背景)/u;
const PRESENTATION_VERSION =
  /(?:统一\s*UI|统一界面(?:交互)?评审稿)\s+V[1-9]\d*\b|\bV[1-9]\d*\s+(?:字段真源|字段|客户配置|candidate|purchase order|currency set|single-)|(?:existing|现有)\s+V[1-9]\d*\s+(?:snapshot|样本)|\berp-prototype-v[1-9]\d*-/u;
const INTERNAL_CATALOG_VERSION =
  /\bdev-(?:business-chain-catalog|flow-state-catalog|fact-ledger-catalog|business-chain-customer-review)\/v[1-9]\d*\b/u;
const INTERNAL_IMPLEMENTATION_VERSION =
  /\b(?:existing[_-]v[0-9]+[_-]snapshot|workflow[_-]v[0-9]+[_-]page|runtime_v[0-9]+)\b|\b(?:[Ww]orkflow\s+V[0-9]+\s+page|V[0-9]+\s+masterdata)\b/u;
const IMPLEMENTATION_KIND =
  "(?:Page|Panel|Component|Helper|Catalog|Runner|Repository|Usecase|Controller|Service|Adapter|Module)";
const MODULE_IMPLEMENTATION_VERSION = new RegExp(
  `\\b(?:V[0-9]+(?:[A-Z][A-Za-z0-9]*)?${IMPLEMENTATION_KIND}|[A-Za-z_][A-Za-z0-9_]*(?:V[0-9]+${IMPLEMENTATION_KIND}|${IMPLEMENTATION_KIND}V[0-9]+))\\b`,
  "u",
);
const VERSIONED_MODULE_FILE = new RegExp(
  `(?:^|[-_])v[0-9]+[-_](?:[a-z0-9]+[-_])*${IMPLEMENTATION_KIND}(?:[.-]|$)|(?:^|[-_])${IMPLEMENTATION_KIND}[-_]v[0-9]+(?:[.-]|$)`,
  "iu",
);
const IMPLEMENTATION_EXTENSIONS = new Set([
  ".go",
  ".js",
  ".jsx",
  ".mjs",
  ".sh",
  ".ts",
  ".tsx",
]);

function hasVersionedModulePath(relativePath) {
  if (!IMPLEMENTATION_EXTENSIONS.has(path.extname(relativePath))) return false;
  return (
    VERSIONED_MODULE_FILE.test(path.basename(relativePath)) ||
    /(?:^|\/)(?:pages|components|modules|helpers|utils)\/[vV][0-9]+\//u.test(
      relativePath,
    )
  );
}

function hasForbiddenStageLabel(value) {
  return (
    NUMBERED_PHASE.test(value) ||
    ABBREVIATED_STAGE.test(value) ||
    PROJECT_STAGE_VERSION.test(value) ||
    PROJECT_ORIGIN_COPY.test(value) ||
    PRESENTATION_VERSION.test(value) ||
    INTERNAL_CATALOG_VERSION.test(value) ||
    INTERNAL_IMPLEMENTATION_VERSION.test(value) ||
    MODULE_IMPLEMENTATION_VERSION.test(value)
  );
}

function normalizeScanRoot(value) {
  const absolute = path.resolve(ROOT, String(value || "."));
  const relative = path.relative(ROOT, absolute);
  if (relative === ".." || relative.startsWith(`..${path.sep}`)) {
    throw new Error(`scan path must stay inside the repository: ${value}`);
  }
  return relative || ".";
}

function shouldSkip(relativePath) {
  const normalizedPath = relativePath.replace(/^\.\//u, "");
  if (SKIP_FILES.has(normalizedPath)) {
    return true;
  }
  if (
    normalizedPath
      .split(path.sep)
      .some((part) => SKIP_DIRECTORY_NAMES.has(part))
  ) {
    return true;
  }
  return [...SKIP_PARTS].some(
    (part) =>
      normalizedPath === part || normalizedPath.startsWith(`${part}/`),
  );
}

function walk(relativeRoot) {
  const absoluteRoot = path.join(ROOT, relativeRoot);
  if (!fs.existsSync(absoluteRoot) || shouldSkip(relativeRoot)) {
    return [];
  }
  const stat = fs.statSync(absoluteRoot);
  if (stat.isFile()) {
    return TEXT_EXTENSIONS.has(path.extname(relativeRoot))
      ? [relativeRoot]
      : [];
  }
  if (!stat.isDirectory()) {
    return [];
  }
  const files = [];
  for (const entry of fs.readdirSync(absoluteRoot, { withFileTypes: true })) {
    const relativePath = path.join(relativeRoot, entry.name);
    if (shouldSkip(relativePath)) {
      continue;
    }
    if (entry.isDirectory()) {
      files.push(...walk(relativePath));
      continue;
    }
    if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(relativePath);
    }
  }
  return files;
}

let scanRoots;
try {
  scanRoots =
    process.argv.length > 2
      ? process.argv.slice(2).map(normalizeScanRoot)
      : ["."];
} catch (error) {
  console.error(`[phase-label-boundaries] ${error.message}`);
  process.exit(2);
}

const hits = [];
const scanFiles = [...new Set(scanRoots.flatMap(walk))];
for (const relativeFile of scanFiles) {
  if (
    hasForbiddenStageLabel(relativeFile) ||
    hasVersionedModulePath(relativeFile)
  ) {
    hits.push(`${relativeFile}:1: forbidden phase label in file path`);
  }
  const content = fs.readFileSync(path.join(ROOT, relativeFile));
  if (content.includes(0)) {
    continue;
  }
  content
    .toString("utf8")
    .split(/\r?\n/u)
    .forEach((line, index) => {
      if (hasForbiddenStageLabel(line)) {
        hits.push(`${relativeFile}:${index + 1}: ${line.trim()}`);
      }
    });
}

if (hits.length > 0) {
  console.error("[phase-label-boundaries] active implementation labels found:");
  for (const hit of hits.slice(0, 80)) {
    console.error(`  - ${hit}`);
  }
  if (hits.length > 80) {
    console.error(`  ... ${hits.length - 80} more`);
  }
  console.error(
    "[phase-label-boundaries] use capability, domain, module, test shape, layer, scenario, or evidence names instead.",
  );
  process.exit(1);
}

console.log(
  `[phase-label-boundaries] ok mode=${process.argv.length > 2 ? "affected" : "repository"} files=${scanFiles.length}`,
);
