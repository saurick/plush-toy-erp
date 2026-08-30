import assert from "node:assert/strict";
import test from "node:test";

import {
  CI_QUALITY_AGGREGATE_SCHEMA,
  CI_EVIDENCE_MANIFEST_SCHEMA,
  matchesStrictSourceArchive,
  validateCiQualityShardSet,
} from "./ci-quality-aggregate.mjs";
import {
  CI_QUALITY_SHARDS,
  CI_QUALITY_SHARD_SCHEMA,
} from "./ci-quality-shard.mjs";

const sha = "a".repeat(40);
const digest = "b".repeat(64);
const expected = {
  repository: "saurick/plush-toy-erp",
  gitSha: sha,
  pipelineId: "12",
  pipelineIid: "7",
  pipelineSource: "push",
  planSha256: digest,
  rangeSha256: "c".repeat(64),
  range: `${sha}..HEAD`,
};

function fingerprint(shard, definition) {
  const stable = (value) => {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, nested]) => [key, stable(nested)]),
      );
    }
    return value;
  };
  return import("node:crypto").then(({ createHash }) =>
    createHash("sha256")
      .update(JSON.stringify(stable({ shard, definition })))
      .digest("hex"),
  );
}

async function receipts() {
  const values = [];
  for (const [shard, definition] of Object.entries(CI_QUALITY_SHARDS)) {
    values.push({
      schemaVersion: CI_QUALITY_SHARD_SCHEMA,
      shard,
      status: "passed",
      repository: expected.repository,
      gitSha: expected.gitSha,
      ref: "refs/heads/main",
      protectedDefaultBranch: true,
      pipeline: { id: "12", iid: "7", source: "push" },
      job: { id: String(values.length + 20), name: definition.job },
      commandFingerprint: await fingerprint(shard, definition),
      plan: {
        planSha256: expected.planSha256,
        rangeSha256: expected.rangeSha256,
        range: expected.range,
      },
      expectedStages: [...definition.stages],
      stageTimings: definition.stages.map((id) => ({ id, status: "passed", durationMs: 1 })),
      substepTimings: [],
      summary: { executed: 1, passed: 1, failed: 0, skipped: 0 },
      categoryCounts: Object.fromEntries(
        ["web", "server", "database", "browser", "security"].map((key) => [
          key,
          { executed: key === "web" && shard === "web" ? 1 : 0, passed: key === "web" && shard === "web" ? 1 : 0, failed: 0, skipped: 0 },
        ]),
      ),
      cleanupPassed: true,
      redaction: {
        containsSecrets: false,
        containsCredentials: false,
        containsFullDsn: false,
        containsAbsoluteWorkspacePaths: false,
        containsRawLogs: false,
      },
    });
  }
  return values;
}

test("aggregate contracts keep v3 strict evidence external shape", () => {
  assert.equal(CI_QUALITY_AGGREGATE_SCHEMA, "plush.gitlab-strict-aggregate/v1");
  assert.equal(CI_EVIDENCE_MANIFEST_SCHEMA, "plush.gitlab-ci-evidence/v1");
});

test("aggregate matches the tagged shard archive digest to strict plain SHA-256", () => {
  assert.equal(
    matchesStrictSourceArchive(
      { status: "passed", archiveSha256: `sha256:${digest}` },
      { sourceArchiveSha256: digest },
    ),
    true,
  );
  assert.equal(
    matchesStrictSourceArchive(
      { status: "passed", archiveSha256: digest },
      { sourceArchiveSha256: digest },
    ),
    false,
  );
});

test("aggregate rejects missing, duplicate and failed shards", async () => {
  const values = await receipts();
  assert.equal(validateCiQualityShardSet(values, expected).size, 7);
  assert.throws(() => validateCiQualityShardSet(values.slice(1), expected), /every shard/u);
  const failed = structuredClone(values);
  failed[0].status = "failed";
  assert.throws(() => validateCiQualityShardSet(failed, expected), /invalid/u);
  const duplicate = structuredClone(values);
  duplicate[1] = structuredClone(duplicate[0]);
  assert.throws(() => validateCiQualityShardSet(duplicate, expected), /invalid/u);
});
