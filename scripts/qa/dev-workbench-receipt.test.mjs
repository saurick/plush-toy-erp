import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DEV_WORKBENCH_RECEIPT_SCHEMA,
  buildDevWorkbenchReceipt,
  summarizeGateOutput,
  validateDevWorkbenchReceipt,
} from "./dev-workbench-receipt.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const gitContext = {
  comparisonRange: "",
  gitCommit: "a".repeat(40),
  treeState: "dirty",
};

function withRepo(callback) {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-receipt-"));
  try {
    writeFileSync(path.join(root, "artifact.txt"), "immutable artifact\n");
    return callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("dev workbench receipt summarizes Node and Go gate receipts", () => {
  const summary = summarizeGateOutput(
    [
      "[qa:test-gate] label=node status=complete tests=4 pass=4 fail=0 skipped=0",
      "[qa:test-gate] label=go status=complete run=3 pass=3 fail=0 skip=0",
    ].join("\n"),
  );
  assert.deepEqual(summary, {
    executed: 7,
    passed: 7,
    failed: 0,
    skipped: 0,
  });
});

test("dev workbench receipt writes the complete v1 contract without secrets", () => {
  withRepo((repoRoot) => {
    const receipt = buildDevWorkbenchReceipt({
      artifactPaths: ["artifact.txt"],
      databaseRunIdentity: "capacity:20260728-a1",
      durationMs: 20,
      finishedAt: "2026-07-28T01:00:00.020Z",
      gate: "stability",
      gitContext,
      metrics: { p95Ms: 12.3 },
      notProven: ["target capacity"],
      profile: "capacity",
      repoRoot,
      startedAt: "2026-07-28T01:00:00.000Z",
      status: "passed",
      summary: { executed: 2, passed: 2, failed: 0, skipped: 0 },
      invariants: ["duplicate domain effects = 0"],
    });
    assert.equal(receipt.schemaVersion, DEV_WORKBENCH_RECEIPT_SCHEMA);
    assert.equal(receipt.artifacts[0], "artifact.txt");
    assert.match(receipt.artifactDigests["artifact.txt"], /^sha256:[0-9a-f]{64}$/u);
    assert.match(receipt.environmentFingerprint, /^[0-9a-f]{64}$/u);
    assert.doesNotMatch(JSON.stringify(receipt), /\/Users\//u);
  });
});

test("dev workbench receipt never upgrades zero, skipped or failed execution to passed", () => {
  withRepo((repoRoot) => {
    const base = {
      artifactPaths: [],
      durationMs: 1,
      finishedAt: "2026-07-28T01:00:00.001Z",
      gate: "strict",
      gitContext,
      metrics: {},
      notProven: ["target release"],
      profile: "strict",
      repoRoot,
      startedAt: "2026-07-28T01:00:00.000Z",
      status: "passed",
      invariants: [],
    };
    assert.throws(
      () =>
        buildDevWorkbenchReceipt({
          ...base,
          summary: { executed: 0, passed: 0, failed: 0, skipped: 0 },
        }),
      /non-zero all-passed/u,
    );
    assert.throws(
      () =>
        buildDevWorkbenchReceipt({
          ...base,
          summary: { executed: 2, passed: 1, failed: 0, skipped: 1 },
        }),
      /non-zero all-passed/u,
    );
  });
});

test("dev workbench receipt rejects DSNs, tokens and external artifacts", () => {
  withRepo((repoRoot) => {
    const base = {
      artifactPaths: [],
      durationMs: 1,
      finishedAt: "2026-07-28T01:00:00.001Z",
      gate: "browser",
      gitContext,
      metrics: {},
      notProven: [],
      profile: "",
      repoRoot,
      startedAt: "2026-07-28T01:00:00.000Z",
      status: "failed",
      summary: { executed: 1, passed: 0, failed: 1, skipped: 0 },
      invariants: [],
    };
    assert.throws(
      () =>
        buildDevWorkbenchReceipt({
          ...base,
          metrics: { dsn: "postgres://user:secret@localhost/db" },
        }),
      /sensitive data/u,
    );
    assert.throws(
      () =>
        buildDevWorkbenchReceipt({
          ...base,
          artifactPaths: ["../outside.txt"],
        }),
      /inside the product repository/u,
    );
  });
});

test("dev workbench receipt validation rejects extra fields and digest drift", () => {
  const receipt = buildDevWorkbenchReceipt({
    durationMs: 10,
    finishedAt: 20,
    gate: "full",
    gitContext: {
      comparisonRange: "",
      gitCommit: "a".repeat(40),
      treeState: "clean",
    },
    metrics: {},
    notProven: ["target environment release"],
    profile: "full",
    repoRoot: ROOT,
    startedAt: 10,
    status: "passed",
    summary: { executed: 1, passed: 1, failed: 0, skipped: 0 },
  });
  assert.throws(
    () => validateDevWorkbenchReceipt({ ...receipt, arbitrary: true }),
    /fields do not match/u,
  );
  assert.throws(
    () =>
      validateDevWorkbenchReceipt({
        ...receipt,
        artifacts: ["output/example.json"],
        artifactDigests: {},
      }),
    /artifacts and digests do not match/u,
  );
});
