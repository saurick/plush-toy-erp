import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DEFAULT_TEST_DATA_ISOLATION_CHECKS,
  TEST_DATA_ISOLATION_BUCKETS,
  buildTestDataIsolationReport,
  formatTestDataIsolationReport,
  trialFixtureCoverageViolations,
} from "./test-data-isolation-boundary.mjs";
import { yoyoosunTrialDataFixture } from "../../config/customers/yoyoosun/trialDataFixture.mjs";

async function withTempRepo(callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), "plush-test-data-isolation-"));
  try {
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("test-data-isolation-boundary: current repo keeps test data buckets isolated", async () => {
  const report = await buildTestDataIsolationReport();

  assert.equal(
    report.ok,
    true,
    formatTestDataIsolationReport(report),
  );
  assert.equal(report.scope.readOnly, true);
  assert.equal(report.scope.writesDatabase, false);
  assert.equal(report.scope.executesImport, false);
  assert.equal(report.scope.realCustomerImport, false);
  assert.equal(report.checkCount, DEFAULT_TEST_DATA_ISOLATION_CHECKS.length);
  assert.deepEqual(report.buckets, TEST_DATA_ISOLATION_BUCKETS);
  for (const bucket of TEST_DATA_ISOLATION_BUCKETS) {
    assert(
      report.byBucket[bucket].checks > 0,
      `${bucket} must have at least one isolation check`,
    );
  }
});

test("test-data-isolation-boundary: v3 target checks stay atomic and fail closed", () => {
  const ids = DEFAULT_TEST_DATA_ISOLATION_CHECKS.map((check) => check.id);
  assert.equal(new Set(ids).size, ids.length);

  const dataset = DEFAULT_TEST_DATA_ISOLATION_CHECKS.find(
    (check) =>
      check.id === "manual-acceptance-dataset-keeps-one-current-v3-contract",
  );
  assert(dataset);
  assert(
    dataset.required.some((rule) =>
      rule.pattern.test(
        'export const DEFAULT_MANUAL_ACCEPTANCE_DATA_VERSION = "2026.07.15-v3";',
      ),
    ),
  );
  assert(
    dataset.forbidden.some((rule) =>
      rule.pattern.test('const legacy = "2026.07.15-v1";'),
    ),
  );

  const retirement = DEFAULT_TEST_DATA_ISOLATION_CHECKS.find(
    (check) => check.id === "manual-acceptance-retirement-keeps-history",
  );
  assert(
    retirement.required.some((rule) =>
      rule.message.includes("attestation for customer-trial-133"),
    ),
  );
  assert(
    retirement.forbidden.some((rule) =>
      rule.message.includes("physical deletion"),
    ),
  );
});

test("test-data-isolation-boundary: trial fixture coverage follows behavior, not record IDs", () => {
  assert.deepEqual(trialFixtureCoverageViolations(), []);

  const withoutRejectedQuality = structuredClone(yoyoosunTrialDataFixture);
  withoutRejectedQuality.qualityInspections =
    withoutRejectedQuality.qualityInspections.filter(
      (inspection) => inspection.result !== "rejected",
    );
  assert.deepEqual(trialFixtureCoverageViolations(withoutRejectedQuality), [
    "yoyoosun trial fixture must cover a rejected quality inspection",
  ]);
});

test("test-data-isolation-boundary: fixture behavior is wired into the full report", async () => {
  const behaviorCheck = DEFAULT_TEST_DATA_ISOLATION_CHECKS.find(
    (check) => check.id === "yoyoosun-trial-fixture-covers-manual-regression",
  );
  assert(behaviorCheck?.behavior?.length > 0);

  const withoutRejectedQuality = structuredClone(yoyoosunTrialDataFixture);
  withoutRejectedQuality.qualityInspections =
    withoutRejectedQuality.qualityInspections.filter(
      (inspection) => inspection.result !== "rejected",
    );
  const report = await buildTestDataIsolationReport({
    checks: [
      {
        ...behaviorCheck,
        required: [],
        forbidden: [],
      },
    ],
    trialFixture: withoutRejectedQuality,
  });

  assert.equal(report.ok, false);
  assert.equal(report.violationCount, 1);
  assert.deepEqual(report.violations[0], {
    checkId: behaviorCheck.id,
    bucket: behaviorCheck.bucket,
    type: "behavior",
    path: "config/customers/yoyoosun/trialDataFixture.mjs",
    message: "yoyoosun trial fixture must cover a rejected quality inspection",
    reason: "fixture behavior not covered",
  });
});

test("test-data-isolation-boundary: missing required marker fails the check", async () => {
  await withTempRepo(async (root) => {
    await writeFile(path.join(root, "entry.txt"), "wrong content\n", "utf8");

    const report = await buildTestDataIsolationReport({
      root,
      checks: [
        {
          id: "fixture-required",
          bucket: "product-core-demo-seed",
          description: "fixture required check",
          required: [
            {
              path: "entry.txt",
              pattern: /simulatedOnly:\s*true/u,
              message: "fixture must declare simulatedOnly",
            },
          ],
          forbidden: [],
        },
      ],
    });

    assert.equal(report.ok, false);
    assert.equal(report.violationCount, 1);
    assert.equal(report.violations[0].type, "required");
    assert.equal(report.violations[0].reason, "required pattern not found");
  });
});

test("test-data-isolation-boundary: forbidden marker fails the check", async () => {
  await withTempRepo(async (root) => {
    await writeFile(
      path.join(root, "entry.txt"),
      "simulatedOnly: true\nrealCustomerImport: true\n",
      "utf8",
    );

    const report = await buildTestDataIsolationReport({
      root,
      checks: [
        {
          id: "fixture-forbidden",
          bucket: "customer-trial-simulated-data",
          description: "fixture forbidden check",
          required: [
            {
              path: "entry.txt",
              pattern: /simulatedOnly:\s*true/u,
              message: "fixture must declare simulatedOnly",
            },
          ],
          forbidden: [
            {
              path: "entry.txt",
              pattern: /realCustomerImport:\s*true/u,
              message: "fixture must not become real import",
            },
          ],
        },
      ],
    });

    assert.equal(report.ok, false);
    assert.equal(report.violationCount, 1);
    assert.equal(report.violations[0].type, "forbidden");
    assert.equal(report.violations[0].reason, "forbidden pattern found");
  });
});
