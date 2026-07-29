import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  OUTPUT_RETENTION_MANAGED_BUDGET_BYTES,
  OUTPUT_RETENTION_PREVIEW_CONTRACT,
  buildOutputRetentionPreview,
} from "./output-retention-preview.mjs";

const CURRENT_SHA = "a".repeat(40);

function createFixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-retention-preview-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const lifecycle = path.join(
    root,
    "output",
    "qa",
    "local-acceptance-lifecycle",
  );
  mkdirSync(lifecycle, { recursive: true });
  return { root, lifecycle };
}

test("retention preview protects newest, status and referenced SHA without deleting", (t) => {
  const { root, lifecycle } = createFixture(t);
  for (let index = 0; index < 6; index += 1) {
    const directory = path.join(lifecycle, `run-${index}`);
    mkdirSync(directory);
    writeFileSync(
      path.join(directory, "receipt.json"),
      `${JSON.stringify({
        status: index === 1 ? "passed" : "failed",
        gitSha: index === 0 ? CURRENT_SHA : "b".repeat(40),
      })}\n`,
    );
    writeFileSync(path.join(directory, "evidence.bin"), Buffer.alloc(32));
    const date = new Date(1_000 + index * 1_000);
    utimesSync(directory, date, date);
  }

  const preview = buildOutputRetentionPreview(root, {
    protectedShas: [CURRENT_SHA],
    generatedAt: "2026-07-29T01:00:00.000Z",
  });
  assert.equal(preview.schemaVersion, OUTPUT_RETENTION_PREVIEW_CONTRACT);
  assert.equal(preview.mode, "preview_only");
  assert.equal(preview.policy.deletesFiles, false);
  const entries = preview.groups.find(
    (group) => group.key === "local-acceptance-lifecycle",
  ).entries;
  assert.equal(
    entries.find((entry) => entry.name === "run-0").reason,
    "referenced-sha",
  );
  assert.equal(
    entries.find((entry) => entry.name === "run-1").reason,
    "latest-passed",
  );
  assert(entries.some((entry) => entry.decision === "review_delete"));
  assert(preview.summary.reviewDeleteBytes > 0);
  assert.equal(
    preview.summary.managedBytes,
    preview.summary.keepBytes + preview.summary.reviewDeleteBytes,
  );
  assert.equal(
    preview.policy.managedBudgetBytes,
    OUTPUT_RETENTION_MANAGED_BUDGET_BYTES,
  );
  assert.equal(preview.summary.budgetStatus, "within_budget");
  assert.equal(preview.redaction.containsAbsolutePaths, false);
});

test("retention preview fails closed on symbolic links in managed output", (t) => {
  const { root, lifecycle } = createFixture(t);
  const directory = path.join(lifecycle, "linked-run");
  mkdirSync(directory);
  writeFileSync(
    path.join(directory, "receipt.json"),
    '{"status":"failed"}\n',
  );
  symlinkSync(path.join(directory, "receipt.json"), path.join(directory, "link"));
  const preview = buildOutputRetentionPreview(root);
  const entry = preview.groups
    .find((group) => group.key === "local-acceptance-lifecycle")
    .entries.find((item) => item.name === "linked-run");
  assert.equal(entry.decision, "keep");
  assert.equal(entry.reason, "manual-review-required");
  assert.equal(entry.hasSymbolicLink, true);
});
