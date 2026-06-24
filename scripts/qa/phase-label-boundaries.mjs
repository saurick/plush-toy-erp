#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const SCAN_ROOTS = [
  "AGENTS.md",
  "README.md",
  "config",
  "scripts",
  "scripts/qa",
  "docs/当前真源与交接顺序.md",
  "docs/product",
  "server/Makefile",
  "server/README.md",
  "web/src",
  "server/internal/biz",
  "server/internal/data",
  "docs/architecture",
];

const SKIP_PARTS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "server/internal/data/model/ent",
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

const FORBIDDEN = /Phase\s*\d+[A-Za-z0-9-]*|phase\d+[A-Za-z0-9-]*|PHASE\d+[A-Z0-9-]*|SIM-[A-Z0-9-]*PHASE\d+[A-Z0-9-]*|\/erp\/phase\d+|jsonrpc_phase\d*|\bphase\s*:/u;

function shouldSkip(relativePath) {
  if (relativePath === "scripts/qa/phase-label-boundaries.mjs") {
    return true;
  }
  return [...SKIP_PARTS].some(
    (part) => relativePath === part || relativePath.startsWith(`${part}/`),
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
  if (FORBIDDEN.test(relativeFile)) {
    hits.push(`${relativeFile}:1: forbidden phase label in file path`);
  }
  const content = fs.readFileSync(path.join(ROOT, relativeFile), "utf8");
  content.split(/\r?\n/u).forEach((line, index) => {
    if (FORBIDDEN.test(line)) {
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
    "[phase-label-boundaries] use capability, domain, scenario, reviewMilestone, or evidence names instead.",
  );
  process.exit(1);
}

console.log("[phase-label-boundaries] ok");
