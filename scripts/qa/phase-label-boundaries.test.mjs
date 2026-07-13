#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(
  new URL("./phase-label-boundaries.mjs", import.meta.url),
);

function runFixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "plush-phase-labels-"));
  try {
    for (const [relativePath, content] of Object.entries(files)) {
      const absolutePath = path.join(root, relativePath);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, content);
    }
    return spawnSync(process.execPath, [SCRIPT_PATH], {
      cwd: root,
      encoding: "utf8",
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("rejects full and abbreviated numbered implementation stages", () => {
  for (const content of [
    "Phase" + " 8 simulated closure",
    "reviewed P4" + "-3 chain",
    "P5" + " release candidate",
  ]) {
    const result = runFixture({ "active.md": content });
    assert.equal(result.status, 1, content);
    assert.match(result.stderr, /active Phase-number labels found/u);
  }
});

test("allows priorities, percentiles, product codes, and technical phases", () => {
  const result = runFixture({
    "active.md": [
      "P0/P1 risks",
      "product P001 and P-001",
      "p50 / p95 / p99 latency",
      "migration phase: status, dry-run, apply",
    ].join("\n"),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[phase-label-boundaries\] ok/u);
});

test("ignores historical and generated paths", () => {
  const result = runFixture({
    ["docs/archive/phase" + "8-history.md"]:
      "Phase" + " 8 historical evidence",
    "web/node_modules/example/index.js": "const phase = 2;",
    ["server/bin/seed-phase" + "7"]:
      "Phase" + " 7 generated binary fixture",
  });
  assert.equal(result.status, 0, result.stderr);
});
