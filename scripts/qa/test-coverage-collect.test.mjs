import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  BASELINE_STAGE_KEYS,
  BUSINESS_DOMAIN_KEYS,
  FIELD_LINKAGE_PRINT_CASE_IDS,
  GO_BUSINESS_SCENARIOS,
  adaptCurrentReceipts,
  assertProjectNodeRuntime,
  buildBaselineCommandPlan,
  buildCoverageEvidence,
  classifyGoBusinessDomains,
  fieldLinkageBusinessRecords,
  goCommandExecution,
  nodeCommandExecution,
  parseArgs,
  publishBaselineEvidence,
  resolveCoverageStaging,
  simpleCommandExecution,
} from "./test-coverage-collect.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const REPOSITORY = Object.freeze({
  commit: "a".repeat(40),
  dirty: true,
  fingerprint: "b".repeat(64),
});

function nodeSummary({
  tests = 2,
  pass = tests,
  fail = 0,
  cancelled = 0,
  skipped = 0,
  todo = 0,
} = {}) {
  return [
    `# tests ${tests}`,
    `# pass ${pass}`,
    `# fail ${fail}`,
    `# cancelled ${cancelled}`,
    `# skipped ${skipped}`,
    `# todo ${todo}`,
  ].join("\n");
}

function goEvents(events) {
  return events.map((event) => JSON.stringify(event)).join("\n");
}

function passedExecution(note = "") {
  return simpleCommandExecution({ error: "", status: 0 }, note);
}

function receipt(gate, { artifacts = [], status = "passed" } = {}) {
  return {
    gate,
    status,
    artifacts,
  };
}

test("coverage collector CLI only accepts the explicit baseline profile", () => {
  assert.deepEqual(parseArgs(["--profile", "baseline", "--write"]), {
    help: false,
    profile: "baseline",
    write: true,
  });
  assert.equal(parseArgs(["--help"]).help, true);
  assert.throws(() => parseArgs(["--profile", "full"]), /must be baseline/u);
  assert.throws(
    () => parseArgs(["--write", "--write"]),
    /only be specified once/u,
  );
  assert.throws(() => parseArgs(["--unknown"]), /unsupported argument/u);
});

test("coverage collector requires the repository-pinned Node runtime", async () => {
  assert.equal(await assertProjectNodeRuntime(ROOT, "v24.14.0"), "24.14.0");
  await assert.rejects(
    () => assertProjectNodeRuntime(ROOT, "v26.5.0"),
    /requires Node 24\.14\.0/u,
  );
});

test("baseline command plan uses the project-pinned pnpm and runs the web pretest", () => {
  const pnpmBin = "/opt/homebrew/bin/pnpm";
  const plan = buildBaselineCommandPlan({
    projectRoot: ROOT,
    goCoverprofile: "/tmp/plush-coverage.out",
    pnpmBin,
  });
  assert.deepEqual(
    plan.map(([key]) => key),
    BASELINE_STAGE_KEYS.slice(0, -1),
  );
  const commands = Object.fromEntries(plan);
  assert.equal(commands["web-lint"].command, pnpmBin);
  assert.equal(commands["web-css"].command, pnpmBin);
  assert.equal(commands.web.command, pnpmBin);
  assert.deepEqual(commands.web.args, [
    "test",
    "--experimental-test-coverage",
    "--test-reporter=tap",
  ]);
  assert.equal(commands.web.cwd, path.join(ROOT, "web"));
});

test("coverage publish stages candidates and exposes only canonical evidence paths", async (t) => {
  const projectRoot = await mkdtemp(
    path.join(os.tmpdir(), "plush-coverage-publish-"),
  );
  t.after(() => rm(projectRoot, { recursive: true, force: true }));
  const stagingId = "123e4567-e89b-42d3-a456-426614174000";
  const staging = resolveCoverageStaging(projectRoot, stagingId);
  await mkdir(staging.root, { recursive: true });
  await writeFile(
    staging.fieldLinkageEvidence,
    `${JSON.stringify({
      schemaVersion: "plush-field-linkage-coverage/v1",
      repository: REPOSITORY,
    })}\n`,
  );
  const evidence = {
    schemaVersion: "plush-test-coverage-evidence/v1",
    generatedAt: "2026-07-29T08:00:00.000Z",
    repository: REPOSITORY,
  };
  const stagedBaseline = path
    .relative(projectRoot, staging.baselineEvidence)
    .split(path.sep)
    .join("/");
  const stagedField = path
    .relative(projectRoot, staging.fieldLinkageEvidence)
    .split(path.sep)
    .join("/");
  const report = await publishBaselineEvidence({
    projectRoot,
    stagingId,
    evidence,
    repositoryReader: async () => REPOSITORY,
    reportBuilder: async ({ repository, artifactPaths }) => {
      assert(artifactPaths.includes(staging.baselineEvidence));
      assert(artifactPaths.includes(staging.fieldLinkageEvidence));
      return {
        schemaVersion: "plush-test-coverage-report/v1",
        repository,
        inputArtifacts: [
          { path: stagedBaseline },
          { path: stagedField },
        ],
      };
    },
    clock: () => new Date("2026-07-29T08:00:01.000Z"),
  });
  assert.deepEqual(
    report.inputArtifacts.map(({ path: evidencePath }) => evidencePath),
    [
      "output/qa/coverage/baseline.latest.json",
      "output/qa/coverage/field-linkage.latest.json",
    ],
  );
  assert.doesNotMatch(JSON.stringify(report), /\.staging/u);
  assert.deepEqual(
    JSON.parse(
      await readFile(
        path.join(projectRoot, "output/qa/coverage/latest.json"),
        "utf8",
      ),
    ),
    report,
  );
  assert.deepEqual(
    JSON.parse(
      await readFile(
        path.join(
          projectRoot,
          "output/qa/coverage/baseline.latest.json",
        ),
        "utf8",
      ),
    ),
    evidence,
  );
});

test("coverage publish restores the previous report when identity changes after report promotion", async (t) => {
  const projectRoot = await mkdtemp(
    path.join(os.tmpdir(), "plush-coverage-preserve-"),
  );
  t.after(() => rm(projectRoot, { recursive: true, force: true }));
  const stagingId = "223e4567-e89b-42d3-a456-426614174000";
  const staging = resolveCoverageStaging(projectRoot, stagingId);
  await mkdir(path.dirname(staging.root), { recursive: true });
  const canonicalReport = path.join(
    projectRoot,
    "output/qa/coverage/latest.json",
  );
  await mkdir(path.dirname(canonicalReport), { recursive: true });
  await writeFile(canonicalReport, '{"previous":true}\n');
  const repositories = [
    REPOSITORY,
    REPOSITORY,
    REPOSITORY,
    { ...REPOSITORY, fingerprint: "c".repeat(64) },
  ];
  await assert.rejects(
    () =>
      publishBaselineEvidence({
        projectRoot,
        stagingId,
        evidence: {
          schemaVersion: "plush-test-coverage-evidence/v1",
          repository: REPOSITORY,
        },
        repositoryReader: async () => repositories.shift(),
        reportBuilder: async ({ repository }) => ({
          schemaVersion: "plush-test-coverage-report/v1",
          repository,
        }),
      }),
    /repository identity changed/u,
  );
  assert.equal(await readFile(canonicalReport, "utf8"), '{"previous":true}\n');
});

test("collector command summaries reject zero, skip, failure, and malformed output", () => {
  assert.equal(
    nodeCommandExecution({
      error: "",
      status: 0,
      stdout: nodeSummary(),
      stderr: "",
    }).status,
    "passed",
  );
  assert.equal(
    nodeCommandExecution({
      error: "",
      status: 0,
      stdout: nodeSummary({ tests: 0, pass: 0 }),
      stderr: "",
    }).status,
    "missing",
  );
  assert.equal(
    nodeCommandExecution({
      error: "",
      status: 0,
      stdout: nodeSummary({ tests: 2, pass: 1, skipped: 1 }),
      stderr: "",
    }).status,
    "skipped",
  );
  assert.equal(
    nodeCommandExecution({
      error: "",
      status: 1,
      stdout: nodeSummary({ tests: 1, pass: 0, fail: 1 }),
      stderr: "",
    }).status,
    "failed",
  );
  assert.equal(
    nodeCommandExecution({
      error: "",
      status: 0,
      stdout: "not a test summary",
      stderr: "",
    }).status,
    "failed",
  );
  assert.equal(
    goCommandExecution({
      error: "",
      status: 0,
      stdout: goEvents([
        {
          Action: "run",
          Package: "server/internal/biz",
          Test: "TestOne",
        },
        {
          Action: "pass",
          Package: "server/internal/biz",
          Test: "TestOne",
        },
      ]),
      stderr: "",
    }).status,
    "passed",
  );
  assert.equal(
    simpleCommandExecution({ error: "", status: 1 }).status,
    "failed",
  );
});

test("Go business coverage uses only registered package and test prefixes", () => {
  const registry = {
    workflow: [
      {
        id: "registered-workflow",
        package: "server/internal/biz",
        testPrefix: "TestRegisteredWorkflow",
      },
    ],
    print: [
      {
        id: "registered-print",
        package: "server/internal/server",
        testPrefix: "TestRegisteredPrint",
      },
    ],
  };
  const content = goEvents([
    {
      Action: "run",
      Package: "server/internal/biz",
      Test: "TestRegisteredWorkflow",
    },
    {
      Action: "run",
      Package: "server/internal/biz",
      Test: "TestRegisteredWorkflow/happy",
    },
    {
      Action: "pass",
      Package: "server/internal/biz",
      Test: "TestRegisteredWorkflow/happy",
    },
    {
      Action: "pass",
      Package: "server/internal/biz",
      Test: "TestRegisteredWorkflow",
    },
    {
      Action: "run",
      Package: "server/internal/server",
      Test: "TestPDFKeywordButNotRegistered",
    },
    {
      Action: "pass",
      Package: "server/internal/server",
      Test: "TestPDFKeywordButNotRegistered",
    },
  ]);
  const domains = classifyGoBusinessDomains(
    content,
    { status: "passed" },
    registry,
  );
  assert.equal(domains.workflow.status, "passed");
  assert.equal(domains.workflow.passed, 1);
  assert.deepEqual(domains.workflow.scenarios[0].matchedTests, [
    "TestRegisteredWorkflow/happy",
  ]);
  assert.equal(domains.print.status, "missing");
  assert.equal(domains.print.total, 1);
  assert.match(domains.print.note, /不按文件名、包名或测试名关键词/u);

  const failedGlobal = classifyGoBusinessDomains(
    content,
    { status: "failed" },
    registry,
  );
  assert.equal(failedGlobal.workflow.status, "failed");
  assert.match(failedGlobal.workflow.note, /不能标记为通过/u);
});

test("registered Go and field-linkage scenarios remain anchored to source", () => {
  const expectedGoDomains = BUSINESS_DOMAIN_KEYS.filter(
    (key) => !["frontend", "import"].includes(key),
  );
  assert.deepEqual(Object.keys(GO_BUSINESS_SCENARIOS), expectedGoDomains);

  const scenarioIds = new Set();
  for (const scenarios of Object.values(GO_BUSINESS_SCENARIOS)) {
    for (const scenario of scenarios) {
      assert.equal(scenarioIds.has(scenario.id), false, scenario.id);
      scenarioIds.add(scenario.id);
      const packageDir = path.join(ROOT, scenario.package);
      const source = readdirSync(packageDir)
        .filter((file) => file.endsWith("_test.go"))
        .map((file) => readFileSync(path.join(packageDir, file), "utf8"))
        .join("\n");
      assert.match(
        source,
        new RegExp(`func ${scenario.testPrefix}\\(`, "u"),
        `${scenario.id} must reference a current Go test`,
      );
    }
  }

  const fieldCatalog = readFileSync(
    path.join(ROOT, "web/src/erp/qa/fieldLinkageCatalog.mjs"),
    "utf8",
  );
  assert.equal(
    new Set(FIELD_LINKAGE_PRINT_CASE_IDS).size,
    FIELD_LINKAGE_PRINT_CASE_IDS.length,
  );
  for (const caseId of FIELD_LINKAGE_PRINT_CASE_IDS) {
    assert.match(fieldCatalog, new RegExp(`['"]${caseId}['"]`, "u"));
  }
});

test("field-linkage print coverage is keyed by explicit case IDs", () => {
  const cases = FIELD_LINKAGE_PRINT_CASE_IDS.map((caseId) => ({
    caseId,
    status: "pass",
  }));
  cases.push({
    caseId: "FL_unregistered__print_keyword",
    status: "fail",
    testFile: "printSomething.test.mjs",
    title: "打印关键词不能自动入表",
  });
  const result = fieldLinkageBusinessRecords({
    artifact: {
      repository: REPOSITORY,
      summary: {
        totalScenarios: 2,
        passedScenarios: 2,
        failedScenarios: 0,
        skippedScenarios: 0,
        missingScenarios: 0,
      },
      cases,
    },
    commandResult: { error: "", status: 0 },
    repository: REPOSITORY,
  });
  assert.equal(result.frontend.status, "passed");
  assert.equal(result.print.status, "passed");
  assert.equal(result.print.total, FIELD_LINKAGE_PRINT_CASE_IDS.length);

  const missing = fieldLinkageBusinessRecords({
    artifact: {
      repository: REPOSITORY,
      summary: {
        totalScenarios: 2,
        passedScenarios: 2,
        failedScenarios: 0,
        skippedScenarios: 0,
        missingScenarios: 0,
      },
      cases: cases.slice(1),
    },
    commandResult: { error: "", status: 0 },
    repository: REPOSITORY,
  });
  assert.equal(missing.print.status, "partial");
  assert.equal(missing.print.missing, 1);
});

test("generic aggregate receipts cannot fabricate runtime acceptance", () => {
  const ignored = adaptCurrentReceipts([
    { path: "full.json", receipt: receipt("full") },
    { path: "browser.json", receipt: receipt("browser") },
  ]);
  assert.equal(ignored.acceptance.postgres.status, "not_collected");
  assert.equal(ignored.acceptance.browser.status, "not_collected");
  assert.equal(ignored.gates.T8, null);
  assert.deepEqual(ignored.sourceReceipts, []);

  const dedicated = adaptCurrentReceipts([
    {
      path: "browser.json",
      receipt: receipt("browser", { artifacts: ["browser.json"] }),
    },
    {
      path: "rehearsal.json",
      receipt: receipt("release-rehearsal", {
        artifacts: ["rehearsal.json"],
      }),
    },
  ]);
  assert.equal(dedicated.acceptance.browser.status, "passed");
  assert.equal(dedicated.acceptance.readiness.status, "passed");
  assert.equal(dedicated.acceptance.postgres.status, "not_collected");
  assert.equal(dedicated.gates.T8.status, "partial");
  assert.deepEqual(dedicated.sourceReceipts, [
    "browser.json",
    "rehearsal.json",
  ]);
});

test("coverage evidence freezes affected levels and leaves unexecuted gates open", () => {
  const stageExecutions = Object.fromEntries(
    BASELINE_STAGE_KEYS.map((key) => [key, passedExecution(key)]),
  );
  const explicitDomain = passedExecution("explicit domain");
  const goDomains = Object.fromEntries(
    Object.keys(GO_BUSINESS_SCENARIOS).map((key) => [key, explicitDomain]),
  );
  const evidence = buildCoverageEvidence({
    generatedAt: "2026-07-29T01:00:00.000Z",
    repository: REPOSITORY,
    stageExecutions,
    goCoverage: {
      metrics: {
        statements: { covered: 9, total: 10, percent: 90 },
      },
    },
    webCoverage: {
      metrics: {
        lines: { percent: 91 },
        branches: { percent: 86 },
        functions: { percent: 88 },
      },
    },
    goDomains,
    fieldLinkage: {
      frontend: passedExecution("field linkage"),
      print: passedExecution("print linkage"),
    },
    receiptAdapter: {
      acceptance: Object.fromEntries(
        ["postgres", "browser", "readiness", "targetEnvironment", "uat"].map(
          (key) => [
            key,
            {
              passed: 0,
              failed: 0,
              skipped: 0,
              blocked: 0,
              executed: 0,
              missing: 0,
              total: 0,
              requiredCount: 0,
              status: "not_collected",
            },
          ],
        ),
      ),
      gates: { T8: null },
      sourceReceipts: [],
    },
    affectedPlan: {
      changedFiles: ["server/internal/example.go", "web/src/example.mjs"],
      levels: ["T0", "T2", "T5", "T7", "T8"],
      highestLevel: "T8",
      requiresFull: true,
      followUps: [{ id: "browser", level: "T7" }],
    },
  });

  assert.equal(evidence.gates.T0.required, true);
  assert.equal(evidence.gates.T2.status, "missing");
  assert.equal(evidence.gates.T2.required, true);
  assert.equal(evidence.gates.T3.status, "passed");
  assert.equal(evidence.gates.T3.required, false);
  assert.equal(evidence.gates.T7.status, "missing");
  assert.equal(evidence.gates.T8.status, "missing");
  assert.equal(evidence.collector.affectedPlan.changedFileCount, 2);
  assert.deepEqual(evidence.collector.affectedPlan.levels, [
    "T0",
    "T2",
    "T5",
    "T7",
    "T8",
  ]);
  const frontend = evidence.businessCoverage.domains.find(
    (domain) => domain.key === "frontend",
  );
  assert.equal(frontend.total, 1);
  assert.match(frontend.note, /field linkage/u);
});
