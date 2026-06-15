#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const SCAN_ROOTS = [
  "config",
  "scripts",
  "scripts/qa",
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

const LEGACY_PHASE2_PG_PATHS = new Set([
  "scripts/bom-lot-pg.sh",
  "scripts/inventory-pg.sh",
  "scripts/purchase-receipt-pg.sh",
  "scripts/purchase-return-pg.sh",
  "scripts/phase2a-pg.sh",
  "scripts/phase2b-pg.sh",
  "scripts/phase2c-pg.sh",
  "scripts/phase2d-pg.sh",
  "server/Makefile",
  "server/README.md",
  "server/internal/data/inventory_postgres_test.go",
]);

const LEGACY_PHASE2_PG_LINE =
  /Phase2[ABCD][A-Za-z0-9_]*|phase2[ABCDabcd][A-Za-z0-9_-]*|PHASE2[ABCD][A-Z0-9_]*|plush_erp_phase2[abcd]_test/u;

function shouldSkip(relativePath) {
  if (relativePath === "scripts/qa/phase-label-boundaries.mjs") {
    return true;
  }
  return [...SKIP_PARTS].some(
    (part) => relativePath === part || relativePath.startsWith(`${part}/`),
  );
}

function isAllowedLegacyHit(relativePath, line) {
  return (
    LEGACY_PHASE2_PG_PATHS.has(relativePath) && LEGACY_PHASE2_PG_LINE.test(line)
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
  if (
    FORBIDDEN.test(relativeFile) &&
    !isAllowedLegacyHit(relativeFile, relativeFile)
  ) {
    hits.push(`${relativeFile}:1: forbidden phase label in file path`);
  }
  const content = fs.readFileSync(path.join(ROOT, relativeFile), "utf8");
  content.split(/\r?\n/u).forEach((line, index) => {
    if (FORBIDDEN.test(line) && !isAllowedLegacyHit(relativeFile, line)) {
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
