import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  QUALITY_GATE_CATALOG,
  buildQualityGateComplexityCandidates,
  buildQualityGateGapAnalysis,
  buildQualityGateGovernance,
  buildQualityGateStatistics,
  deriveQualityGateRisks,
} from "./quality-gate-catalog.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const repository = Object.freeze({
  commit: "a".repeat(40),
  dirty: true,
  fingerprint: "b".repeat(64),
});

function operation({
  profile = "full",
  status = "passed",
  dirty = true,
  environment = "c".repeat(64),
  durationMs = 1000,
  fingerprint = repository.fingerprint,
} = {}) {
  return {
    profile,
    status,
    updatedAt: "2026-08-09T10:00:00.000Z",
    repository: { ...repository, dirty, fingerprint },
    receipt:
      status === "passed"
        ? {
            profile,
            status: "passed",
            gitCommit: repository.commit,
            treeState: dirty ? "dirty" : "clean",
            durationMs,
            finishedAt: "2026-08-09T10:00:00.000Z",
            environmentFingerprint: environment,
            stageTimings: [],
          }
        : null,
  };
}

function receipt(profile = "full") {
  return {
    profile,
    status: "passed",
    gitCommit: repository.commit,
    treeState: "dirty",
    durationMs: 1000,
    finishedAt: "2026-08-09T10:00:00.000Z",
    environmentFingerprint: "c".repeat(64),
    stageTimings: [],
  };
}

test("quality gate catalog references formal sources without copying commands", () => {
  assert(QUALITY_GATE_CATALOG.some((gate) => gate.key === "full"));
  assert(QUALITY_GATE_CATALOG.some((gate) => gate.key === "strict"));
  assert(
    QUALITY_GATE_CATALOG.filter((gate) => gate.highConsequence).every((gate) =>
      /不能|只有|正式/u.test(gate.exitCondition),
    ),
  );
  for (const gate of QUALITY_GATE_CATALOG) {
    assert.equal(Object.hasOwn(gate, "command"), false);
    assert.equal(Object.hasOwn(gate, "tests"), false);
    assert(gate.sources.every((source) => !source.startsWith("/")));
  }
});

test("current change risk mapping covers schema, RBAC, Workflow, UI, PDF, release and test data", () => {
  const risks = deriveQualityGateRisks([
    "server/internal/data/model/schema/order.go",
    "server/internal/service/auth.go",
    "server/internal/biz/workflow.go",
    "web/src/erp/pages/OrderPage.jsx",
    "web/src/erp/utils/printPdf.mjs",
    ".gitlab-ci.yml",
    "scripts/qa/scenario-demo-data.mjs",
  ]);
  assert.deepEqual(risks.map((risk) => risk.key).toSorted(), [
    "database",
    "frontend",
    "pdf-chromium",
    "release",
    "security",
    "test-data",
    "workflow-fact",
  ]);
  assert(
    QUALITY_GATE_CATALOG.find((gate) => gate.key === "release-identity").sources.includes(
      ".gitlab-ci.yml",
    ),
  );
});

test("gap analysis distinguishes current proof, stale result and release or UAT boundaries", () => {
  const operations = [operation()];
  const analysis = buildQualityGateGapAnalysis({
    changedFiles: ["web/src/dev-workbench/pages/DevQualityGatesPage.jsx"],
    repository,
    receipts: { full: receipt("full"), strict: null },
    operations,
    range: "current",
    risk: "all",
    root,
  });
  assert.equal(analysis.schemaVersion, "plush.quality-gate-gap-analysis/v2");
  assert(analysis.affectedScopes.includes("T5"));
  assert.equal(analysis.maxAffectedScope, "T5");
  assert.equal(analysis.localGate, "focused");
  assert.equal(analysis.matched, true);
  assert.equal(analysis.categories[0].key, "frontend");
  assert(
    analysis.categories[0].gateResults.some(
      (gate) => gate.status === "current",
    ),
  );
  assert(
    analysis.categories.every((category) =>
      category.gateResults.every((gate) => /[\u4e00-\u9fff]/u.test(gate.label)),
    ),
  );
  assert.match(analysis.boundaries.join(" "), /目标环境发布/u);
  assert.match(analysis.boundaries.join(" "), /UAT/u);
});

test("statistics never mix dirty, clean or incomparable environments", () => {
  const stats = buildQualityGateStatistics(
    [
      operation({ durationMs: 1000 }),
      operation({ durationMs: 2000 }),
      operation({ durationMs: 3000 }),
      operation({ durationMs: 9999, dirty: false }),
      operation({ durationMs: 8888, environment: "d".repeat(64) }),
    ],
    { profile: "full", repository },
  );
  assert.equal(stats.sampleCount, 3);
  assert.equal(stats.medianDurationMs, 2000);
  assert.equal(stats.slowerDurationMs, 3000);
  assert.equal(stats.enoughSamples, true);
});

test("complexity signals remain objective and preserve high-risk layering", () => {
  const candidates = buildQualityGateComplexityCandidates({
    changedFiles: ["unknown.config"],
    operations: [],
    receipts: {},
    repository,
    localGate: "full",
  });
  assert(candidates.some((item) => item.key === "narrow-change-full"));
  assert(
    candidates.some(
      (item) =>
        item.key === "strict-full-layering" &&
        item.recommendation === "有独立高风险价值，建议保留",
    ),
  );
  assert.doesNotMatch(JSON.stringify(candidates), /健康总分/u);
  assert.equal(
    candidates.some((item) =>
      /^(?:建议|允许|可以)自动删除/u.test(item.recommendation),
    ),
    false,
  );
});

test("governance defaults to gates related to the current change", () => {
  const governance = buildQualityGateGovernance({
    changedFiles: ["web/src/dev-workbench/pages/DevQualityGatesPage.jsx"],
    operations: [operation()],
    receipts: { full: receipt("full"), strict: null },
    repository,
    filter: "relevant",
    q: "",
    root,
  });
  assert(governance.rows.some((row) => row.key === "browser-experience"));
  assert(governance.rows.some((row) => row.key === "full"));
  assert(governance.rows.every((row) => row.sources.length > 0));
});
