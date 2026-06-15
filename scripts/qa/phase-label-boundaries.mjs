#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const SCAN_ROOTS = [
  "config",
  "scripts/qa",
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
  ".go",
  ".js",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx",
  ".md",
  ".json",
  ".yml",
  ".yaml",
  ".css",
]);

const FORBIDDEN = /\bPhase\s*\d+[A-Z0-9-]*\b|\bphase\d+[A-Z0-9-]*\b|\bPHASE\d+[A-Z0-9-]*\b|SIM-[A-Z0-9-]*PHASE\d+[A-Z0-9-]*\b|\bphase\s*:/u;

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
for (const relativeFile of SCAN_ROOTS.flatMap(walk)) {
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
