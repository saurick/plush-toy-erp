#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const SCAN_ROOTS = ["."];

const SKIP_PARTS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "docs/archive",
  "docs/reference",
  "docs/customers/yoyoosun/raw-source-files",
  "output",
  "server/bin",
  "server/internal/data/model/ent",
  "deployments/yoyoosun/evidence/releases",
]);

const SKIP_FILES = new Set([
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
  ".json",
  ".yml",
  ".yaml",
  ".css",
]);

const NUMBERED_PHASE =
  /Phase\s*\d+[A-Za-z0-9-]*|phase\d+[A-Za-z0-9-]*|PHASE\d+[A-Z0-9-]*|SIM-[A-Z0-9-]*PHASE\d+[A-Z0-9-]*|\/erp\/phase\d+|jsonrpc_phase\d*/u;
const ABBREVIATED_STAGE =
  /\bP\d+(?:-\d+)+\b|\bP\d+\s+(?:phase|stage|milestone|release|goal|chain|loader|handler|command|阶段|里程碑|发布阶段|目标阶段|实施链路)/iu;

function hasForbiddenStageLabel(value) {
  return NUMBERED_PHASE.test(value) || ABBREVIATED_STAGE.test(value);
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
  if (!fs.existsSync(absoluteRoot)) {
    return [];
  }
  const stat = fs.statSync(absoluteRoot);
  if (stat.isFile()) {
    return shouldSkip(relativeRoot) ||
      !TEXT_EXTENSIONS.has(path.extname(relativeRoot))
      ? []
      : [relativeRoot];
  }
  const entries = fs.readdirSync(absoluteRoot, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
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

const hits = [];
const scanFiles = [...new Set(SCAN_ROOTS.flatMap(walk))];
for (const relativeFile of scanFiles) {
  if (hasForbiddenStageLabel(relativeFile)) {
    hits.push(`${relativeFile}:1: forbidden phase label in file path`);
  }
  const content = fs.readFileSync(path.join(ROOT, relativeFile), "utf8");
  content.split(/\r?\n/u).forEach((line, index) => {
    if (hasForbiddenStageLabel(line)) {
      hits.push(`${relativeFile}:${index + 1}: ${line.trim()}`);
    }
  });
}

if (hits.length > 0) {
  console.error("[phase-label-boundaries] active Phase-number labels found:");
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

console.log("[phase-label-boundaries] ok");
