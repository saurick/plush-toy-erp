import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  BUSINESS_DOMAINS,
  GATE_LEVELS,
  OUTPUT_RELATIVE_PATH,
  SCHEMA_VERSION,
  assembleCoverageReport,
  buildCoverageReport,
  evidencePath,
  evaluateArtifactFreshness,
  normalizeCoverageMetrics,
  normalizeExecutionRecord,
  parseArgs,
  parseGoCoverprofile,
  parseNodeNativeCoverage,
  parseWebCoverageJson,
  repositoryFingerprint,
  repositoryStateFromGitOutput,
  resolveGeneratedAt,
  usage,
  writeCoverageReport,
} from "./test-coverage-report.mjs";

const THIS_FILE = fileURLToPath(import.meta.url);
const SCRIPT = path.join(path.dirname(THIS_FILE), "test-coverage-report.mjs");
const GENERATED_AT = "2026-07-19T08:00:00.000Z";
const REPOSITORY = Object.freeze({
  commit: "1234567890abcdef1234567890abcdef12345678",
  dirty: true,
  fingerprint: "a".repeat(64),
});

async function temporaryDirectory(t, prefix) {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function nativeCoverage({
  tests = 2,
  pass = 2,
  fail = 0,
  cancelled = 0,
  skipped = 0,
  todo = 0,
  lines = "91.25",
  branches = "86.50",
  functions = "88.75",
} = {}) {
  return `TAP version 13
# tests ${tests}
# pass ${pass}
# fail ${fail}
# cancelled ${cancelled}
# skipped ${skipped}
# todo ${todo}
# start of coverage report
# ----------------------------------------------------------------
# file      | line % | branch % | funcs % | uncovered lines
# all files | ${lines} | ${branches} | ${functions} |
# end of coverage report
`;
}

test("repository fingerprint includes tracked diff and untracked content", () => {
  const commit = "abcdef1234567890abcdef1234567890abcdef12";
  const porcelain = Buffer.from(" M tracked.mjs\0?? new.mjs\0", "utf8");
  const trackedDiff = Buffer.from("tracked-diff-v1", "utf8");
  const untrackedEntries = [
    { path: "new.mjs", type: "file", content: "untracked-v1" },
  ];
  const expected = repositoryFingerprint(
    commit,
    porcelain,
    trackedDiff,
    untrackedEntries,
  );

  assert.deepEqual(
    repositoryStateFromGitOutput(
      Buffer.from(`${commit}\n`),
      porcelain,
      trackedDiff,
      untrackedEntries,
    ),
    { commit, dirty: true, fingerprint: expected },
  );
  assert.notEqual(
    expected,
    repositoryFingerprint(
      commit,
      porcelain,
      Buffer.from("tracked-diff-v2", "utf8"),
      untrackedEntries,
    ),
  );
  assert.notEqual(
    expected,
    repositoryFingerprint(commit, porcelain, trackedDiff, [
      { path: "new.mjs", type: "file", content: "untracked-v2" },
    ]),
  );
  assert.equal(
    repositoryStateFromGitOutput(`${commit}\n`, Buffer.alloc(0)).dirty,
    false,
  );
  assert.throws(
    () => repositoryFingerprint("abcdef1", porcelain),
    /full Git object id/u,
  );
});

test("Go coverprofile reports only real statement counts", () => {
  const report = parseGoCoverprofile(`mode: atomic
example.invalid/a.go:10.1,12.2 2 1
example.invalid/a.go:14.1,18.2 3 0
`);
  assert.equal(report.status, "collected");
  assert.deepEqual(report.metrics, {
    statements: { covered: 2, total: 5, percent: 40 },
  });
  assert.equal(Object.hasOwn(report.metrics, "lines"), false);
  assert.match(report.note, /package scope/u);
  assert.match(report.note, /不是仓库整体基线/u);

  assert.equal(parseGoCoverprofile("mode: set\n").status, "missing");
  assert.equal(
    parseGoCoverprofile("mode: set\na.go:1.1,1.2 0 0\n").status,
    "missing",
  );
  assert.throws(
    () => parseGoCoverprofile("mode: set\nnot-a-profile-record\n"),
    /invalid Go coverprofile record/u,
  );
});

test("Node native coverage requires complete report and fail-closed test summary", () => {
  const report = parseNodeNativeCoverage(nativeCoverage());
  assert.equal(report.status, "collected");
  assert.deepEqual(report.metrics, {
    lines: { percent: 91.25 },
    branches: { percent: 86.5 },
    functions: { percent: 88.75 },
  });
  assert.equal(report.testExecution.status, "passed");
  assert.equal(report.testExecution.executed, 2);
  assert.match(report.note, /实际加载模块/u);
  assert.match(report.note, /不是完整 Web source baseline/u);

  const skipped = parseNodeNativeCoverage(
    nativeCoverage({ tests: 2, pass: 1, skipped: 1 }),
  );
  assert.equal(skipped.status, "skipped");
  assert.equal(skipped.testExecution.skipped, 1);

  const zero = parseNodeNativeCoverage(nativeCoverage({ tests: 0, pass: 0 }));
  assert.equal(zero.status, "missing");
  assert.match(zero.note, /0 tests executed/u);

  assert.throws(
    () =>
      parseNodeNativeCoverage(
        nativeCoverage().replace("# end of coverage report\n", ""),
      ),
    /complete start\/end report/u,
  );
  assert.throws(
    () =>
      parseNodeNativeCoverage(nativeCoverage().replace("# skipped 0\n", "")),
    /complete test summary/u,
  );
});

test("Web JSON importer supports c8 summary and Istanbul counts without invented metrics", () => {
  const c8 = parseWebCoverageJson(
    JSON.stringify({
      total: {
        lines: { covered: 9, total: 10, pct: 90 },
        statements: { covered: 8, total: 10, pct: 80 },
        branches: { covered: 3, total: 4, pct: 75 },
        functions: { covered: 2, total: 2, pct: 100 },
      },
    }),
  );
  assert.equal(c8.status, "collected");
  assert.deepEqual(c8.metrics.lines, { covered: 9, total: 10, percent: 90 });
  assert.match(c8.note, /制品 scope/u);

  const istanbul = parseWebCoverageJson(
    JSON.stringify({
      "/private/user/project/module.mjs": {
        statementMap: {
          0: { start: { line: 1 } },
          1: { start: { line: 2 } },
        },
        s: { 0: 1, 1: 0 },
        f: { 0: 1, 1: 0 },
        b: { 0: [1, 0] },
      },
    }),
  );
  assert.deepEqual(istanbul.metrics.statements, {
    covered: 1,
    total: 2,
    percent: 50,
  });
  assert.deepEqual(istanbul.metrics.lines, {
    covered: 1,
    total: 2,
    percent: 50,
  });
  assert.deepEqual(istanbul.metrics.branches, {
    covered: 1,
    total: 2,
    percent: 50,
  });
  assert.equal(JSON.stringify(istanbul).includes("/private/user"), false);

  assert.equal(
    parseWebCoverageJson(
      JSON.stringify({
        total: {
          lines: { covered: 0, total: 0, pct: "Unknown" },
        },
      }),
    ).status,
    "missing",
  );
});

test("execution records never turn skip, block, missing, or zero tests into passed", () => {
  assert.equal(
    normalizeExecutionRecord({ status: "passed" }).status,
    "missing",
  );
  assert.equal(
    normalizeExecutionRecord({ executed: 0, passed: 0 }).status,
    "missing",
  );
  assert.equal(
    normalizeExecutionRecord({ executed: 2, passed: 1, skipped: 1 }).status,
    "skipped",
  );
  assert.equal(
    normalizeExecutionRecord({ executed: 1, passed: 1, blocked: 1 }).status,
    "blocked",
  );
  assert.equal(
    normalizeExecutionRecord({
      requiredCount: 3,
      executed: 2,
      passed: 2,
    }).status,
    "partial",
  );
  assert.equal(
    normalizeExecutionRecord({
      requiredCount: 2,
      executed: 2,
      passed: 2,
      failed: 0,
      skipped: 0,
      blocked: 0,
    }).status,
    "passed",
  );
  assert.equal(
    normalizeExecutionRecord({ executed: 1, passed: 2 }).status,
    "failed",
  );
  for (const status of [
    "missing",
    "stale",
    "not_collected",
    "collected",
    "partial",
  ]) {
    assert.equal(
      normalizeExecutionRecord({ status, executed: 1, passed: 1 }).status,
      status,
    );
  }
  assert.equal(
    normalizeExecutionRecord({
      status: "unknown-status",
      executed: 1,
      passed: 1,
    }).status,
    "failed",
  );
  for (const status of ["PASSED", " passed", "passed "]) {
    assert.equal(
      normalizeExecutionRecord({ status, executed: 1, passed: 1 }).status,
      "failed",
    );
  }
  assert.equal(
    normalizeExecutionRecord({
      status: "stale",
      executed: 2,
      passed: 1,
      failed: 1,
    }).status,
    "failed",
  );
  const notApplicableInput = {
    required: false,
    executed: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    blocked: 0,
  };
  assert.equal(normalizeExecutionRecord(notApplicableInput).status, "missing");
  const notApplicable = normalizeExecutionRecord(notApplicableInput, {
    allowNotApplicable: true,
  });
  assert.equal(notApplicable.status, "not_applicable");
  assert.equal(notApplicable.total, 0);
  assert.equal(notApplicable.missing, 0);
  assert.equal(
    normalizeExecutionRecord(
      { ...notApplicableInput, status: "not_applicable" },
      { allowNotApplicable: true },
    ).status,
    "not_applicable",
  );
  assert.equal(
    normalizeExecutionRecord({
      ...notApplicableInput,
      status: "not_applicable",
    }).status,
    "missing",
  );
  assert.equal(
    normalizeExecutionRecord(
      {
        ...notApplicableInput,
        required: true,
        status: "not_applicable",
      },
      { allowNotApplicable: true },
    ).status,
    "failed",
  );
});

test("execution counts require strict safe integers and consistent aliases", () => {
  assert.equal(
    normalizeExecutionRecord({
      requiredCount: "2",
      executed: "2",
      passed: "2",
      failed: "0",
      skipped: "0",
      blocked: "0",
    }).status,
    "passed",
  );

  const invalidCounts = [
    true,
    false,
    null,
    {},
    [],
    "",
    " ",
    "1e2",
    "1.0",
    "+1",
    "-1",
    Number.MAX_SAFE_INTEGER + 1,
  ];
  for (const value of invalidCounts) {
    const record = normalizeExecutionRecord({
      requiredCount: value,
      executed: 1,
      passed: 1,
    });
    assert.equal(record.status, "failed", `unexpected value: ${String(value)}`);
    assert.match(record.note, /计数格式无效/u);
  }

  assert.equal(
    normalizeExecutionRecord({
      executed: 1,
      passed: 1,
      failed: 0,
      counts: { failed: 1 },
    }).status,
    "failed",
  );
  assert.equal(
    normalizeExecutionRecord({ executed: 1, passed: 1, pass: 0 }).status,
    "failed",
  );
});

test("cancelled and todo counts cannot be hidden by passing counts", () => {
  const cancelled = normalizeExecutionRecord({
    executed: 2,
    passed: 2,
    cancelled: 1,
  });
  assert.equal(cancelled.status, "failed");
  assert.equal(cancelled.failed, 1);

  const todo = normalizeExecutionRecord({
    executed: 3,
    passed: 2,
    todo: 1,
  });
  assert.equal(todo.status, "skipped");
  assert.equal(todo.skipped, 1);
});

test("artifact freshness requires exact commit, dirty flag, and fingerprint", () => {
  assert.equal(
    evaluateArtifactFreshness({ repository: REPOSITORY }, REPOSITORY).status,
    "current",
  );
  assert.equal(evaluateArtifactFreshness({}, REPOSITORY).status, "stale");
  assert.equal(
    evaluateArtifactFreshness(
      { repository: { ...REPOSITORY, fingerprint: "b".repeat(64) } },
      REPOSITORY,
    ).status,
    "stale",
  );
});

test("report assembly has full schema, policy, domains and T0-T8 missing defaults", () => {
  const report = assembleCoverageReport({
    generatedAt: GENERATED_AT,
    repository: REPOSITORY,
  });
  assert.equal(report.schemaVersion, SCHEMA_VERSION);
  assert.equal(Object.hasOwn(report, "schema"), false);
  assert.equal(report.generatedAt, GENERATED_AT);
  assert.deepEqual(report.repository, REPOSITORY);
  assert.equal(report.codeCoverage.go.status, "missing");
  assert.equal(report.codeCoverage.web.status, "missing");
  assert.equal(report.businessCoverage.status, "missing");
  assert.deepEqual(
    report.businessCoverage.domains.map((domain) => domain.key),
    BUSINESS_DOMAINS.map((domain) => domain.key),
  );
  assert.deepEqual(
    report.gates.map((gate) => gate.key),
    GATE_LEVELS,
  );
  assert.equal(report.gates[0].label, "T0 现场与静态");
  assert(report.gates.every((gate) => gate.status === "missing"));
  assert.equal(report.acceptance.postgres.status, "missing");
  assert.equal(report.acceptance.browser.status, "missing");
  assert.equal(report.acceptance.readiness.status, "missing");
  assert.equal(report.acceptance.targetEnvironment.status, "missing");
  assert.equal(report.acceptance.uat.status, "missing");
  assert.equal(report.policy.businessContracts.targetPercent, 100);
  assert.equal(report.policy.changedBusinessLogic.linesMinimumPercent, 90);
  assert.equal(report.policy.changedBusinessLogic.branchesMinimumPercent, 85);
  assert.match(report.policy.businessContracts.note, /100%/u);
  assert.match(
    report.policy.changedBusinessLogic.note,
    /lines \/ statements >= 90%/u,
  );
  assert.match(report.policy.repositoryBaseline.note, /只采集/u);
  assert.match(report.policy.requiredGates.note, /100% executed/u);
  assert.deepEqual(report.policy.requiredGates.incomplete, [
    "failed",
    "skipped",
    "blocked",
    "partial",
    "missing",
    "stale",
    "not_collected",
    "0-tests-executed",
  ]);
  assert.equal(report.policy.runtimeAcceptance.targetPercent, 100);
  assert.match(report.policy.runtimeAcceptance.note, /PostgreSQL/u);
  assert.match(report.policy.runtimeAcceptance.note, /browser/u);
  assert.match(report.policy.runtimeAcceptance.note, /readiness/u);
  assert.match(report.policy.runtimeAcceptance.note, /target/u);
  assert.match(report.policy.runtimeAcceptance.note, /UAT/u);
  assert.match(report.policy.runtimeAcceptance.note, /按环境分别取证/u);

  const serialized = JSON.stringify(report);
  assert.doesNotMatch(
    serialized,
    /overallPercent|overallCoverage|totalCoveragePercent/u,
  );
  assert.doesNotMatch(serialized, /"status":"invalid"/u);
});

test("current artifact can prove one domain, gate and acceptance slice without filling others", () => {
  const artifact = {
    schemaVersion: "field-linkage/v1",
    generatedAt: GENERATED_AT,
    repository: REPOSITORY,
    codeCoverage: {
      web: {
        status: "collected",
        metrics: { lines: { covered: 9, total: 10, percent: 1 } },
      },
    },
    businessCoverage: {
      domains: [
        {
          key: "finance",
          status: "passed",
          requiredCount: 2,
          executed: 2,
          passed: 2,
          failed: 0,
          skipped: 0,
          blocked: 0,
        },
        {
          key: "print",
          required: false,
          status: "not_applicable",
          executed: 0,
          passed: 0,
          failed: 0,
          skipped: 0,
          blocked: 0,
        },
      ],
    },
    gates: {
      T2: {
        required: false,
        status: "not_applicable",
        executed: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        blocked: 0,
      },
      T3: {
        required: true,
        status: "passed",
        executed: 3,
        passed: 3,
        failed: 0,
        skipped: 0,
        blocked: 0,
      },
    },
    acceptance: {
      browser: {
        required: false,
        status: "not_applicable",
        executed: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        blocked: 0,
      },
      postgres: {
        status: "passed",
        executed: 1,
        passed: 1,
        failed: 0,
        skipped: 0,
        blocked: 0,
      },
    },
  };
  const report = assembleCoverageReport({
    generatedAt: GENERATED_AT,
    repository: REPOSITORY,
    artifacts: [
      {
        artifact,
        evidence: "output/qa/coverage/field-linkage.latest.json",
        freshness: { status: "current", note: "current" },
      },
    ],
  });

  assert.equal(report.codeCoverage.web.status, "collected");
  assert.deepEqual(report.codeCoverage.web.metrics.lines, {
    covered: 9,
    total: 10,
    percent: 90,
  });
  assert.equal(
    report.businessCoverage.domains.find(
      (domain) => domain.key === "fact-finance",
    ).status,
    "passed",
  );
  assert.equal(report.businessCoverage.status, "partial");
  assert.equal(
    report.businessCoverage.domains.find((domain) => domain.key === "print")
      .status,
    "missing",
  );
  assert.equal(report.gates.find((gate) => gate.key === "T3").status, "passed");
  assert.equal(
    report.gates.find((gate) => gate.key === "T2").status,
    "not_applicable",
  );
  assert.equal(report.acceptance.postgres.status, "passed");
  assert.equal(report.acceptance.browser.status, "missing");
  assert.equal(report.acceptance.uat.status, "missing");
});

test("explicit code coverage statuses cannot be upgraded to collected", () => {
  const codeRecord = (status, includeStatus = true) => {
    const entry = {
      metrics: { lines: { covered: 9, total: 10 } },
    };
    if (includeStatus) entry.status = status;
    const report = assembleCoverageReport({
      generatedAt: GENERATED_AT,
      repository: REPOSITORY,
      artifacts: [
        {
          artifact: {
            generatedAt: GENERATED_AT,
            repository: REPOSITORY,
            codeCoverage: { go: entry },
          },
          evidence: "output/qa/coverage/code.json",
          freshness: { status: "current", note: "current" },
        },
      ],
    });
    return report.codeCoverage.go;
  };

  assert.equal(codeRecord("", false).status, "collected");
  for (const status of [
    "collected",
    "missing",
    "stale",
    "not_collected",
    "partial",
  ]) {
    assert.equal(codeRecord(status).status, status);
  }
  assert.equal(codeRecord("passed").status, "failed");
  assert.equal(codeRecord("unknown-status").status, "failed");
  assert.equal(codeRecord("COLLECTED").status, "failed");
  assert.equal(codeRecord(" collected ").status, "failed");
});

test("code coverage surfaces incomplete nested test execution", () => {
  const codeRecord = (testExecution) => {
    const report = assembleCoverageReport({
      generatedAt: GENERATED_AT,
      repository: REPOSITORY,
      artifacts: [
        {
          artifact: {
            generatedAt: GENERATED_AT,
            repository: REPOSITORY,
            codeCoverage: {
              go: {
                metrics: { statements: { covered: 9, total: 10 } },
                testExecution,
              },
            },
          },
          evidence: "output/qa/coverage/code.json",
          freshness: { status: "current", note: "current" },
        },
      ],
    });
    return report.codeCoverage.go;
  };

  assert.equal(
    codeRecord({ status: "passed", executed: 1, passed: 1 }).status,
    "collected",
  );
  for (const [testExecution, expected] of [
    [{ status: "failed", executed: 1, failed: 1 }, "failed"],
    [{ status: "blocked", executed: 1, passed: 1, blocked: 1 }, "blocked"],
    [{ status: "skipped", executed: 1, skipped: 1 }, "skipped"],
    [{ status: "missing", executed: 1, passed: 1 }, "missing"],
    [{ status: "partial", executed: 1, passed: 1 }, "partial"],
    [{ status: "stale", executed: 1, passed: 1 }, "stale"],
    [{ status: "not_collected", executed: 1, passed: 1 }, "not_collected"],
    [{ status: "collected", executed: 1, passed: 1 }, "partial"],
  ]) {
    const record = codeRecord(testExecution);
    assert.equal(record.status, expected);
    assert.equal(record.testExecution.status, testExecution.status);
  }
});

test("passed business wrapper exposes positive aggregate counts", () => {
  const artifact = {
    generatedAt: GENERATED_AT,
    repository: REPOSITORY,
    businessCoverage: {
      domains: BUSINESS_DOMAINS.map(({ key }) => ({
        key,
        status: "passed",
        requiredCount: 1,
        executed: 1,
        passed: 1,
        failed: 0,
        skipped: 0,
        blocked: 0,
        missing: 0,
      })),
    },
  };
  const report = assembleCoverageReport({
    generatedAt: GENERATED_AT,
    repository: REPOSITORY,
    artifacts: [
      {
        artifact,
        evidence: "business.json",
        freshness: { status: "current", note: "current" },
      },
    ],
  });
  assert.equal(report.businessCoverage.status, "passed");
  assert.equal(
    report.businessCoverage.applicableCount,
    BUSINESS_DOMAINS.length,
  );
  assert.equal(
    report.businessCoverage.passedDomainCount,
    BUSINESS_DOMAINS.length,
  );
  assert.equal(report.businessCoverage.missingDomainCount, 0);
  assert.equal(report.businessCoverage.incompleteDomainCount, 0);
  assert.equal(report.businessCoverage.total, BUSINESS_DOMAINS.length);
  assert.equal(report.businessCoverage.executed, BUSINESS_DOMAINS.length);
  assert.equal(report.businessCoverage.passed, BUSINESS_DOMAINS.length);
  assert.equal(report.businessCoverage.missing, 0);
});

test("field-linkage summary maps once to Frontend as a scoped partial domain", () => {
  const artifact = {
    generatedAt: GENERATED_AT,
    command: "node scripts/qa/erp-field-linkage.mjs",
    repository: REPOSITORY,
    summary: {
      totalFields: 37,
      coveredFields: 35,
      partialFields: 2,
      missingFields: 0,
      failingFields: 0,
      totalCases: 78,
      passedCases: 78,
      failedCases: 0,
      skippedCases: 0,
      missingCases: 0,
      totalScenarios: 68,
      passedScenarios: 66,
      failedScenarios: 0,
      skippedScenarios: 0,
      missingScenarios: 2,
    },
  };
  const report = assembleCoverageReport({
    generatedAt: GENERATED_AT,
    repository: REPOSITORY,
    artifacts: [
      {
        artifact,
        evidence: "output/qa/coverage/field-linkage.latest.json",
        freshness: { status: "current", note: "current" },
      },
    ],
  });
  const frontend = report.businessCoverage.domains.find(
    (domain) => domain.key === "frontend",
  );
  const print = report.businessCoverage.domains.find(
    (domain) => domain.key === "print",
  );
  assert.equal(frontend.status, "partial");
  assert.equal(frontend.requiredCount, 68);
  assert.equal(frontend.total, 68);
  assert.equal(frontend.executed, 66);
  assert.equal(frontend.passed, 66);
  assert.equal(frontend.missing, 2);
  assert.match(frontend.note, /含打印链路/u);
  assert.match(frontend.note, /不代表整个 Frontend/u);
  assert.equal(print.status, "missing");
});

test("field-linkage adapter fails when scenario classification is incomplete", () => {
  const report = assembleCoverageReport({
    generatedAt: GENERATED_AT,
    repository: REPOSITORY,
    artifacts: [
      {
        artifact: {
          command: "node scripts/qa/erp-field-linkage.mjs",
          repository: REPOSITORY,
          summary: { totalScenarios: 2, passedScenarios: 2 },
        },
        evidence: "output/qa/coverage/field-linkage.latest.json",
        freshness: { status: "current", note: "current" },
      },
    ],
  });
  const frontend = report.businessCoverage.domains.find(
    (domain) => domain.key === "frontend",
  );
  assert.equal(frontend.status, "failed");
  assert.match(frontend.note, /summary 不完整/u);
});

test("field-linkage adapter rejects coercible non-count values", () => {
  for (const value of [true, false, null, {}, [], "", " ", "1e2", "1.0"]) {
    const report = assembleCoverageReport({
      generatedAt: GENERATED_AT,
      repository: REPOSITORY,
      artifacts: [
        {
          artifact: {
            command: "node scripts/qa/erp-field-linkage.mjs",
            repository: REPOSITORY,
            summary: {
              totalScenarios: value,
              passedScenarios: 1,
              failedScenarios: 0,
              skippedScenarios: 0,
              missingScenarios: 0,
            },
          },
          evidence: "output/qa/coverage/field-linkage.latest.json",
          freshness: { status: "current", note: "current" },
        },
      ],
    });
    const frontend = report.businessCoverage.domains.find(
      (domain) => domain.key === "frontend",
    );
    assert.equal(
      frontend.status,
      "failed",
      `unexpected value: ${String(value)}`,
    );
    assert.match(frontend.note, /计数格式无效/u);
  }
});

test("stale artifact cannot produce a current pass", () => {
  const artifact = {
    generatedAt: GENERATED_AT,
    repository: { ...REPOSITORY, commit: "f".repeat(40) },
    businessCoverage: {
      domains: {
        workflow: { status: "passed", executed: 1, passed: 1 },
      },
    },
    gates: { T7: { status: "passed", executed: 1, passed: 1 } },
    acceptance: {
      browser: { status: "passed", executed: 1, passed: 1 },
    },
  };
  const freshness = evaluateArtifactFreshness(artifact, REPOSITORY);
  const report = assembleCoverageReport({
    generatedAt: GENERATED_AT,
    repository: REPOSITORY,
    artifacts: [
      {
        artifact,
        evidence: "stale.json",
        freshness,
      },
    ],
  });
  assert.equal(
    report.businessCoverage.domains.find((domain) => domain.key === "workflow")
      .status,
    "stale",
  );
  assert.equal(report.gates.find((gate) => gate.key === "T7").status, "stale");
  assert.equal(report.acceptance.browser.status, "stale");
  assert.notEqual(report.businessCoverage.status, "passed");
});

test("coverage metrics are recomputed and reject impossible counts", () => {
  assert.deepEqual(
    normalizeCoverageMetrics({
      lines: { covered: 1, total: 4, percent: 99 },
      branches: { percent: 85.555 },
    }),
    {
      lines: { covered: 1, total: 4, percent: 25 },
      branches: { percent: 85.56 },
    },
  );
  assert.throws(
    () => normalizeCoverageMetrics({ lines: { covered: 2, total: 1 } }),
    /cannot exceed/u,
  );
});

test("argument parsing and generated time are deterministic and fail closed", () => {
  assert.deepEqual(
    parseArgs([
      "--write",
      "--go-coverprofile",
      "go.out",
      "--web-coverage-json",
      "coverage.json",
      "--artifact",
      "one.json",
      "--artifact",
      "two.json",
      "--generated-at",
      GENERATED_AT,
    ]),
    {
      write: true,
      help: false,
      generatedAt: GENERATED_AT,
      goCoverprofile: "go.out",
      webCoverage: "coverage.json",
      artifacts: ["one.json", "two.json"],
    },
  );
  assert.throws(() => parseArgs(["--unknown"]), /unsupported argument/u);
  assert.throws(() => parseArgs(["--artifact"]), /requires a path/u);
  assert.throws(
    () => parseArgs(["--web-coverage", "a", "--web-coverage-json", "b"]),
    /only be specified once/u,
  );
  assert.equal(resolveGeneratedAt(GENERATED_AT), GENERATED_AT);
  assert.equal(
    resolveGeneratedAt("", { SOURCE_DATE_EPOCH: "0" }),
    "1970-01-01T00:00:00.000Z",
  );
  assert.throws(
    () => resolveGeneratedAt("", { SOURCE_DATE_EPOCH: "not-a-number" }),
    /SOURCE_DATE_EPOCH/u,
  );
  assert.match(
    usage(),
    /裸 --go-coverprofile\/--web-coverage 不含 repository identity，只作 stale 诊断/u,
  );
  assert.match(
    usage(),
    /当前代码证据须使用含 repository identity 的 --artifact/u,
  );
});

test("file aggregation redacts paths, marks malformed input failed and writes fixed output", async (t) => {
  const root = await temporaryDirectory(t, "plush-test-coverage-files-");
  await mkdir(path.join(root, "inputs"), { recursive: true });
  await writeFile(path.join(root, "inputs", "bad.json"), "{not-json\n", "utf8");
  await writeFile(
    path.join(root, "inputs", "go.coverprofile"),
    "mode: set\nexample.invalid/a.go:1.1,2.1 1 1\n",
    "utf8",
  );
  await writeFile(
    path.join(root, "inputs", "web-coverage.txt"),
    nativeCoverage(),
    "utf8",
  );
  const report = await buildCoverageReport({
    projectRoot: root,
    repository: REPOSITORY,
    generatedAt: GENERATED_AT,
    artifactPaths: [path.join(root, "inputs", "bad.json")],
    goCoverprofile: "inputs/go.coverprofile",
    webCoverage: "inputs/web-coverage.txt",
  });
  assert.equal(report.inputArtifacts[0].status, "failed");
  assert.equal(report.codeCoverage.go.status, "stale");
  assert.equal(report.codeCoverage.go.freshness, "unbound");
  assert.match(report.codeCoverage.go.note, /不能作为当前代码证据/u);
  assert.deepEqual(report.codeCoverage.go.metrics.statements, {
    covered: 1,
    total: 1,
    percent: 100,
  });
  assert.equal(report.codeCoverage.web.status, "stale");
  assert.equal(report.codeCoverage.web.freshness, "unbound");
  assert.match(report.codeCoverage.web.note, /不能作为当前代码证据/u);

  const outputPath = await writeCoverageReport(root, report);
  assert.equal(outputPath, path.join(root, OUTPUT_RELATIVE_PATH));
  const written = JSON.parse(await readFile(outputPath, "utf8"));
  const serialized = JSON.stringify(written);
  assert.equal(serialized.includes(root), false);
  assert.equal(serialized.includes(os.homedir()), false);
  assert.equal(serialized.includes("http://"), false);
  assert.equal(serialized.includes("https://"), false);
  assert.deepEqual(written.repository, REPOSITORY);

  assert.equal(
    evidencePath(root, path.join(root, "inputs", "bad.json")),
    "inputs/bad.json",
  );
  assert.equal(
    evidencePath(root, "/Users/alice/private/secret.json"),
    "secret.json",
  );
});

test("repository-bound code coverage wins over explicit unbound raw input", async (t) => {
  const root = await temporaryDirectory(t, "plush-bound-coverage-");
  await mkdir(path.join(root, "inputs"), { recursive: true });
  const artifactPath = path.join(root, "inputs", "bound.json");
  await writeFile(
    artifactPath,
    JSON.stringify({
      generatedAt: GENERATED_AT,
      repository: REPOSITORY,
      codeCoverage: {
        go: { metrics: { statements: { covered: 9, total: 10 } } },
      },
    }),
    "utf8",
  );
  await writeFile(
    path.join(root, "inputs", "raw.out"),
    "mode: set\nexample.invalid/a.go:1.1,2.1 1 0\n",
    "utf8",
  );

  const withRaw = await buildCoverageReport({
    projectRoot: root,
    repository: REPOSITORY,
    generatedAt: GENERATED_AT,
    artifactPaths: [artifactPath],
    goCoverprofile: "inputs/raw.out",
  });
  assert.equal(withRaw.codeCoverage.go.status, "collected");
  assert.deepEqual(withRaw.codeCoverage.go.metrics.statements, {
    covered: 9,
    total: 10,
    percent: 90,
  });

  const withMissingRaw = await buildCoverageReport({
    projectRoot: root,
    repository: REPOSITORY,
    generatedAt: GENERATED_AT,
    artifactPaths: [artifactPath],
    goCoverprofile: "inputs/missing.out",
  });
  assert.equal(withMissingRaw.codeCoverage.go.status, "collected");
  assert.equal(
    withMissingRaw.inputArtifacts.find((input) =>
      input.path.endsWith("missing.out"),
    ).status,
    "missing",
  );
});

test("CLI --write uses repository root, fixed ignored path and emits no absolute report data", async (t) => {
  const root = await temporaryDirectory(t, "plush-test-coverage-cli-");
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "qa@example.invalid"], {
    cwd: root,
  });
  execFileSync("git", ["config", "user.name", "QA"], { cwd: root });
  await writeFile(path.join(root, ".gitignore"), "output/\n", "utf8");
  await writeFile(path.join(root, "tracked.txt"), "fixture\n", "utf8");
  execFileSync("git", ["add", ".gitignore", "tracked.txt"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root });

  const stdout = execFileSync(
    process.execPath,
    [SCRIPT, "--write", "--generated-at", GENERATED_AT],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(stdout.trim(), OUTPUT_RELATIVE_PATH);
  const report = JSON.parse(
    await readFile(path.join(root, OUTPUT_RELATIVE_PATH), "utf8"),
  );
  assert.equal(report.schemaVersion, SCHEMA_VERSION);
  assert.equal(report.generatedAt, GENERATED_AT);
  assert.equal(report.repository.dirty, false);
  assert.equal(JSON.stringify(report).includes(root), false);

  const invalid = spawnSync(process.execPath, [SCRIPT, "--not-supported"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /unsupported argument/u);
});
