import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  EXCEPTION_BROWSER_ACCOUNTS,
  FORMAL_BROWSER_ACCOUNTS,
  MANUAL_ACCEPTANCE_BROWSER_BOUNDARY,
  assertPDFRenderResponse,
  assertManualAcceptanceBrowserReadinessBinding,
  assertManualAcceptanceTaskGroupCoverage,
  assertManualAcceptanceBrowserReportPathBinding,
  assertBoundSimulatedPrintReports,
  buildManualAcceptanceBrowserPlan,
  buildManualAcceptanceCurrentBatchReadiness,
  normalizeLocalBrowserURL,
  partitionTargetRuntimeEvents,
  summarizeManualAcceptance,
  parseManualAcceptanceBrowserArgs,
  resolveManualAcceptanceBrowserReportPath,
  resolveManualAcceptanceBrowserInputReportPath,
  runManualAcceptanceBrowser,
  readBusinessSummaryTotal,
  readMobileLoadedTaskCount,
  resolveCurrentBatchListFilter,
  evaluateBusinessDashboardEvidence,
  evaluateBusinessDashboardCurrentBatchEvidence,
  evaluateDashboardTaskCurrentBatchEvidence,
  evaluateExceptionFlowEvidence,
  evaluateGlobalDashboardEvidence,
  evaluatePrintPreviewEvidence,
  evaluatePrintSourceMinimumEvidence,
  evaluateShipmentReleaseEvidence,
  evaluateCurrentBatchListEvidence,
  evaluateMobileCurrentBatchEvidence,
  buildPrintWorkspaceDataEvidence,
  getManualAcceptanceBrowserHelp,
  verifyManualAcceptanceBrowserDatasetBinding,
  verifyManualAcceptanceDatasetApplyReportBinding,
} from "./manual-acceptance-browser.mjs";
import {
  MANUAL_ACCEPTANCE_DATASET_APPLY_REPORT_CONTRACT,
  MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS,
} from "./manual-acceptance-dataset.mjs";
import {
  MANUAL_ACCEPTANCE_DATASET_RUNNER_REVISION,
  MANUAL_ACCEPTANCE_EMPTY_BASELINE_PROBES,
  digestManualAcceptanceDatasetComponentReport,
  manualAcceptanceDatasetStageReportPath,
} from "./manual-acceptance-dataset-runner.mjs";
import {
  TASK_SOURCE_TYPE,
  TASK_VISIBLE_CODE_PREFIX_BY_ROLE,
  buildManualAcceptanceTaskSchedule,
  manualAcceptanceTaskBatchIdentity,
} from "./manual-acceptance-task-data.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const scriptPath = path.resolve(
  repoRoot,
  "scripts/qa/manual-acceptance-browser.mjs",
);

const TASK_COVERAGE_ROLES = Object.freeze([
  "boss",
  "engineering",
  "finance",
  "pmc",
  "production",
  "purchase",
  "quality",
  "sales",
  "warehouse",
]);

function taskGroupCoverageFixture(catalogScenarioDigest = "c".repeat(64)) {
  const byRole = {};
  const probes = [];
  for (const roleKey of TASK_COVERAGE_ROLES) {
    const taskGroup = `${roleKey}_acceptance`;
    const scenarioKey = `${roleKey}_scenario`;
    const group = {
      requiredScenarios: [scenarioKey],
      scenarioCounts: { [scenarioKey]: 1 },
      missingScenarios: [],
      unknownScenarios: [],
      enoughScenarios: true,
    };
    byRole[roleKey] = {
      taskGroups: [taskGroup],
      groups: { [taskGroup]: group },
    };
    probes.push({
      id: `mobile-tasks:${roleKey}`,
      roleKey,
      exactTaskGroup: taskGroup,
      requiredTaskGroups: [taskGroup],
      taskGroupCounts: { [taskGroup]: 1 },
      missingTaskGroups: [],
      unknownTaskGroups: [],
      enoughTaskGroups: true,
      ...structuredClone(group),
    });
  }
  return {
    catalogScenarioDigest,
    summary: { catalogScenarioDigest, complete: true, byRole },
    probes,
  };
}

async function datasetApplyEvidenceFixture() {
  const outputRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "plush-browser-dataset-binding-"),
  );
  const dataVersion = "2026.07.16-v5";
  const targetAlias = "local";
  const datasetSemanticDigest = "e".repeat(64);
  const taskCoverage = taskGroupCoverageFixture();
  const taskSchedule = buildManualAcceptanceTaskSchedule(2_000_000_000);
  const printInput = {
    datasetKey: "yoyoosun-manual-acceptance",
    dataVersion,
    runId: "20260716-V5",
    sourceRunId: "20260716-V5",
    target: "local-dev",
    backendURL: "http://127.0.0.1:8310",
    databaseName: "plush_erp_acceptance_20260716_v5_dev",
    semanticDigest: "d".repeat(64),
    sourcePrefix: "YS5",
    configRevision: "local-config-v5",
    runtimeAttestation: null,
  };
  const baseReport = (stageKey) => ({
    mode: ["core", "baseline", "purchase-quality", "readiness"].includes(
      stageKey,
    )
      ? "verify"
      : "apply",
    scope: `fixture-${stageKey}`,
    simulatedOnly: true,
    datasetKey: printInput.datasetKey,
    dataVersion: printInput.dataVersion,
    runId: printInput.runId,
    target: printInput.target,
    backendURL: printInput.backendURL,
    databaseName: printInput.databaseName,
    summary: { records: 1 },
  });
  const reports = Object.fromEntries(
    MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS.map((stageKey) => [
      stageKey,
      baseReport(stageKey),
    ]),
  );
  Object.assign(reports.core, {
    configRevision: printInput.configRevision,
    configProductVersion: "local-customer-v5",
    configApplyPurpose: "local_test_apply",
    configDatasetVersion: printInput.dataVersion,
    configTarget: printInput.target,
  });
  const zeroCounts = Object.fromEntries(
    MANUAL_ACCEPTANCE_EMPTY_BASELINE_PROBES.map(({ key }) => [key, 0]),
  );
  Object.assign(reports.baseline, {
    contract: "manual-acceptance-empty-baseline-report-v1",
    runtimeIdentity: {
      scope: "database-v1",
      proof: "matched-v1",
      databaseName: printInput.databaseName,
      release: null,
      migration: null,
    },
    customerConfig: {
      configRevision: reports.core.configRevision,
      configProductVersion: reports.core.configProductVersion,
      configApplyPurpose: reports.core.configApplyPurpose,
      configDatasetVersion: reports.core.configDatasetVersion,
      configTarget: reports.core.configTarget,
    },
    core: {
      units: 1,
      warehouses: 4,
      unitCodes: ["YS5-DW-01"],
      warehouseCodes: ["YS5-CK-01", "YS5-CK-02", "YS5-CK-03", "YS5-CK-04"],
    },
    zeroCounts,
    summary: {
      exactEmptyBusinessBaseline: true,
      checkedBusinessObjectKinds:
        MANUAL_ACCEPTANCE_EMPTY_BASELINE_PROBES.length,
      zeroBusinessRecords: true,
      units: 1,
      warehouses: 4,
    },
  });
  reports.task.coverage = {
    catalogScenarioDigest: taskCoverage.catalogScenarioDigest,
    taskGroupsByRole: Object.fromEntries(
      Object.entries(taskCoverage.summary.byRole).map(([roleKey, role]) => [
        roleKey,
        role.taskGroups,
      ]),
    ),
    scenariosByRoleTaskGroup: Object.fromEntries(
      Object.entries(taskCoverage.summary.byRole).map(([roleKey, role]) => [
        roleKey,
        Object.fromEntries(
          Object.entries(role.groups).map(([taskGroup, group]) => [
            taskGroup,
            group.scenarioCounts,
          ]),
        ),
      ]),
    ),
  };
  reports.task.schedule = taskSchedule;
  reports.facts.referenceRecords = {
    shipments: Array.from({ length: 47 }, (_, index) => ({
      id: 120_000 + index,
      shipmentNo: `SIM-SDF-SHIP-${String(index + 1).padStart(3, "0")}`,
      items:
        index === 0
          ? Array.from({ length: 25 }, (_, itemIndex) => ({
              id: itemIndex + 1,
            }))
          : [],
    })),
  };
  reports.readiness.customerKey = "yoyoosun";
  reports.readiness.runtimePreflight = {
    target: printInput.target,
    customerKey: "yoyoosun",
    configRevision: printInput.configRevision,
  };
  reports.readiness.reportInputs = {
    taskReport: {
      taskGroupCoverageDigest: taskCoverage.catalogScenarioDigest,
    },
  };
  reports.readiness.probes = taskCoverage.probes;
  reports.readiness.summary = {
    ...reports.readiness.summary,
    taskGroupCoverage: taskCoverage.summary,
  };
  reports.attachments.summary = { attachments: 27, ownerObjects: 7 };

  const stages = [];
  for (const stageKey of MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS) {
    const reportPath = manualAcceptanceDatasetStageReportPath({
      outputRoot,
      dataVersion,
      targetAlias,
      stageKey,
    });
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(
      reportPath,
      `${JSON.stringify(reports[stageKey], null, 2)}\n`,
      "utf8",
    );
    stages.push({
      key: stageKey,
      stageKey,
      status: "completed",
      dataVersion,
      semanticDigest: datasetSemanticDigest,
      operation: ["core", "baseline", "purchase-quality", "readiness"].includes(
        stageKey,
      )
        ? "verified"
        : "applied",
      summary: reports[stageKey].summary,
      references: {
        runner: {
          revision: MANUAL_ACCEPTANCE_DATASET_RUNNER_REVISION,
          handlerId: `${MANUAL_ACCEPTANCE_DATASET_RUNNER_REVISION}:${stageKey}`,
          componentEntrypoint: `fixture/${stageKey}`,
          componentDigest: digestManualAcceptanceDatasetComponentReport(
            reports[stageKey],
          ),
          reportPath,
        },
      },
    });
  }
  const baselineStage = stages.find((stage) => stage.key === "baseline");
  const datasetReportPath = path.join(
    outputRoot,
    dataVersion,
    targetAlias,
    "dataset/apply-report.json",
  );
  const datasetReport = {
    contract: MANUAL_ACCEPTANCE_DATASET_APPLY_REPORT_CONTRACT,
    mode: "apply",
    scope: "manual-acceptance-dataset",
    ok: true,
    failedStage: null,
    datasetKey: printInput.datasetKey,
    dataVersion,
    runId: printInput.runId,
    semanticDigest: datasetSemanticDigest,
    taskSchedule,
    target: {
      alias: targetAlias,
      policyTarget: printInput.target,
      backendURL: printInput.backendURL,
      databaseName: printInput.databaseName,
    },
    freshEmptyBaseline: {
      origin: "fresh_empty_baseline",
      status: "completed",
      operation: "verified",
      reportPath: baselineStage.references.runner.reportPath,
      componentDigest: baselineStage.references.runner.componentDigest,
    },
    stages,
  };
  await fs.mkdir(path.dirname(datasetReportPath), { recursive: true });
  await fs.writeFile(
    datasetReportPath,
    `${JSON.stringify(datasetReport, null, 2)}\n`,
    "utf8",
  );
  return {
    outputRoot,
    printInput,
    reports,
    datasetReport,
    datasetSemanticDigest,
    datasetReportPath,
    sourceReportPath: stages.find((stage) => stage.key === "source").references
      .runner.reportPath,
    factReportPath: stages.find((stage) => stage.key === "facts").references
      .runner.reportPath,
    readinessReportPath: stages.find((stage) => stage.key === "readiness")
      .references.runner.reportPath,
  };
}

test("manual acceptance browser plan covers all 51 catalog targets and ten formal accounts", () => {
  const plan = buildManualAcceptanceBrowserPlan({
    baseURL: "http://127.0.0.1:15200",
    backendURL: "http://localhost:8300",
  });

  assert.equal(plan.writesDatabase, false);
  assert.equal(plan.clicksBusinessWriteActions, false);
  assert.equal(plan.summary.totalTargets, 51);
  assert.deepEqual(plan.summary, {
    entryPages: 2,
    desktopPages: 30,
    mobileRolePages: 9,
    printPreviewPages: 5,
    printWorkspacePages: 5,
    totalTargets: 51,
  });
  assert.equal(plan.targets.length, 51);
  assert.equal(plan.formalAccounts.length, 10);
  assert.equal(FORMAL_BROWSER_ACCOUNTS.length, 10);
  assert.equal(EXCEPTION_BROWSER_ACCOUNTS.length, 3);
  assert.equal(
    plan.targets.filter((item) => item.group === "mobile").length,
    9,
  );
  assert.equal(
    plan.targets.filter((item) => item.group === "desktop").length,
    30,
  );
  const productionOrders = plan.targets.find(
    (item) => item.group === "desktop" && item.key === "production-orders",
  );
  assert.equal(productionOrders?.roleKey, "sales");
  assert.equal(productionOrders?.username, "demo_sales");
  assert.equal(
    plan.targets.filter((item) => item.username === "demo_admin").length,
    2,
  );
  assert.equal(
    plan.targets.find((item) => item.key === "business-dashboard")?.username,
    "demo_boss",
  );
  assert.equal(
    plan.targets.find((item) => item.key === "task-board")?.username,
    "demo_boss",
  );
  assert.equal(
    plan.targets.find((item) => item.key === "shipping-release")?.username,
    "demo_warehouse",
  );
  assert.equal(
    plan.targets.find((item) => item.key === "exception-flow")?.username,
    "demo_production",
  );
  assert.equal(
    plan.targets
      .filter((item) => item.group === "print-preview")
      .every((item) => item.requiresDataEvidence && item.minimumRecords === 1),
    true,
  );
  assert.equal(
    plan.targets
      .filter((item) => item.group === "print-workspace")
      .every((item) => item.requiresDataEvidence && item.minimumRecords === 5),
    true,
  );
  assert.equal(
    plan.targets.every(
      (item) => item.key === "admin-login" || (item.username && item.roleKey),
    ),
    true,
  );
});

test("manual acceptance browser boundary is explicitly read-only", () => {
  assert.deepEqual(MANUAL_ACCEPTANCE_BROWSER_BOUNDARY, {
    readOnly: true,
    writesDatabase: false,
    clicksBusinessWriteActions: false,
    callsBusinessMutationRPC: false,
    storesPasswordValue: false,
    storesAccessToken: false,
    storesAuthorizationHeader: false,
    allowedInteractions: [
      "login",
      "route_navigation",
      "read_only_tab_navigation",
    ],
  });
});

test("browser and backend URLs fail closed outside localhost", () => {
  for (const value of [
    "https://example.com",
    "http://192.168.0.106:15200",
    "http://user:secret@127.0.0.1:15200",
    "file:///tmp/index.html",
    "http://127.0.0.1:15200/erp",
    "http://127.0.0.1:15200/?next=prod",
  ]) {
    assert.throws(() => normalizeLocalBrowserURL(value, "target"));
  }
  assert.equal(
    normalizeLocalBrowserURL("http://127.0.0.1:15200", "target"),
    "http://127.0.0.1:15200",
  );
  assert.equal(
    normalizeLocalBrowserURL("http://localhost:8300", "target"),
    "http://localhost:8300",
  );
  assert.equal(
    normalizeLocalBrowserURL("http://[::1]:8300", "target"),
    "http://[::1]:8300",
  );
});

test("CLI requires explicit local frontend and backend origins", () => {
  assert.throws(
    () => parseManualAcceptanceBrowserArgs([]),
    /--base-url is required/,
  );
  assert.throws(
    () =>
      parseManualAcceptanceBrowserArgs([
        "--base-url",
        "https://erp.example.com",
        "--backend-url",
        "http://127.0.0.1:8300",
      ]),
    /must stay on this computer/,
  );
  const parsed = parseManualAcceptanceBrowserArgs([
    "--plan",
    "--base-url=http://127.0.0.1:15200",
    "--backend-url",
    "http://127.0.0.1:8300",
    "--source-report",
    "output/qa/manual-acceptance/datasets/v3/source/apply-report.json",
    "--fact-report",
    "output/qa/manual-acceptance/datasets/v3/facts/apply-report.json",
    "--dataset-report",
    "output/qa/manual-acceptance/datasets/v3/local/dataset/apply-report.json",
  ]);
  assert.equal(parsed.plan, true);
  assert.equal(parsed.baseURL, "http://127.0.0.1:15200");
  assert.equal(parsed.backendURL, "http://127.0.0.1:8300");
  assert.match(
    parsed.sourceReportPath,
    /datasets\/v3\/source\/apply-report\.json$/u,
  );
  assert.match(
    parsed.factReportPath,
    /datasets\/v3\/facts\/apply-report\.json$/u,
  );
  assert.match(
    parsed.datasetReportPath,
    /datasets\/v3\/local\/dataset\/apply-report\.json$/u,
  );
});

test("CLI help and active docs use the complete V5 browser inputs", async () => {
  const help = getManualAcceptanceBrowserHelp();
  assert.match(help, /--backend-url http:\/\/127\.0\.0\.1:8310/u);
  assert.doesNotMatch(help, /--backend-url http:\/\/127\.0\.0\.1:8300/u);
  assert.match(help, /2026\.07\.16-v5\/local\/dataset\/apply-report\.json/u);
  assert.match(help, /--dataset-report/u);
  assert.match(help, /customer-trial-133/u);
  assert.match(help, /--target-attestation-json/u);

  const readme = await fs.readFile(
    path.resolve(repoRoot, "scripts/qa/README.md"),
    "utf8",
  );
  assert.doesNotMatch(
    readme,
    /manual-acceptance-browser\.mjs[\s\S]{0,900}--task-report/u,
  );
});

test("report output stays in the manual acceptance browser or dataset evidence roots", () => {
  assert.match(
    resolveManualAcceptanceBrowserReportPath(
      "output/qa/manual-acceptance/browser/custom.json",
    ),
    /output\/qa\/manual-acceptance\/browser\/custom\.json$/u,
  );
  assert.match(
    resolveManualAcceptanceBrowserReportPath(
      "output/qa/manual-acceptance/datasets/2026.07.15-v3/customer-trial-133/browser/report.json",
    ),
    /datasets\/2026\.07\.15-v3\/customer-trial-133\/browser\/report\.json$/u,
  );
  assert.throws(
    () => resolveManualAcceptanceBrowserReportPath("output/qa/other.json"),
    /must stay under/,
  );
  assert.throws(
    () =>
      resolveManualAcceptanceBrowserReportPath(
        "output/qa/manual-acceptance/browser/report.txt",
      ),
    /\.json file/,
  );
});

test("bound print inputs stay in the acceptance report root and match the current batch", () => {
  assert.match(
    resolveManualAcceptanceBrowserInputReportPath(
      "output/qa/manual-acceptance/datasets/v3/source/apply-report.json",
      "--source-report",
    ),
    /datasets\/v3\/source\/apply-report\.json$/u,
  );
  assert.throws(
    () =>
      resolveManualAcceptanceBrowserInputReportPath(
        "output/qa/other/apply-report.json",
        "--source-report",
      ),
    /must stay under/u,
  );

  const runtime = { configRevision: "customer-config-v5" };
  const source = {
    mode: "apply",
    simulatedOnly: true,
    realCustomerImport: false,
    datasetKey: "yoyoosun-manual-acceptance",
    dataVersion: "2026.07.16-v5",
    runId: "20260716-V5",
    target: "local-dev",
    backendURL: "http://127.0.0.1:8310",
    databaseName: "plush_erp_acceptance_20260716_v5_dev",
    semanticDigest: "digest-v5",
    prefix: "YS5",
    runtime,
    referenceRecords: {
      purchaseOrders: [
        {
          orderNo: "YS5-CG-013",
          items: Array.from({ length: 25 }, () => ({})),
        },
      ],
      outsourcingOrders: [
        {
          orderNo: "YS5-WW-013",
          items: Array.from({ length: 25 }, () => ({})),
        },
      ],
      bomVersions: [
        {
          version: "YS5-BOM-013-1",
          items: Array.from({ length: 25 }, () => ({})),
        },
      ],
    },
  };
  const fact = {
    ...source,
    reportContract: "source-driven-operational-facts-v1",
  };
  assert.deepEqual(assertBoundSimulatedPrintReports(source, fact), {
    datasetKey: "yoyoosun-manual-acceptance",
    dataVersion: "2026.07.16-v5",
    runId: "20260716-V5",
    sourceRunId: "20260716-V5",
    factRunId: "20260716-V5",
    target: "local-dev",
    backendURL: "http://127.0.0.1:8310",
    databaseName: "plush_erp_acceptance_20260716_v5_dev",
    semanticDigest: "digest-v5",
    sourcePrefix: "YS5",
    configRevision: "customer-config-v5",
    printRecords: {
      purchaseOrder: { recordQuery: "YS5-CG-013", lineCount: 25 },
      outsourcingOrder: { recordQuery: "YS5-WW-013", lineCount: 25 },
      bomVersion: { recordQuery: "YS5-BOM-013-1", lineCount: 25 },
    },
    runtimeAttestation: null,
  });
  const activeOnlyBOMSource = {
    ...source,
    referenceRecords: {
      ...source.referenceRecords,
      bomVersions: [
        { version: "YS5-BOM-001-2", items: Array.from({ length: 3 }) },
      ],
    },
    steps: [
      {
        target: "bom_version",
        key: "YS5-BOM-013-1",
        action: "reuse",
        id: 37,
        items: 25,
      },
    ],
  };
  assert.deepEqual(
    assertBoundSimulatedPrintReports(activeOnlyBOMSource, {
      ...activeOnlyBOMSource,
      reportContract: "source-driven-operational-facts-v1",
    }),
    assertBoundSimulatedPrintReports(source, fact),
  );
  assert.throws(
    () =>
      assertBoundSimulatedPrintReports(source, {
        ...fact,
        runId: "20260716-OLD",
        sourceRunId: source.runId,
      }),
    /同一批次/u,
  );
  assert.throws(
    () =>
      assertBoundSimulatedPrintReports(source, {
        ...fact,
        databaseName: "plush_erp_acceptance_wrong_dev",
      }),
    /同一批次/u,
  );
});

test("remote browser evidence binds the exact readiness batch and canonical report path", () => {
  const taskBatch = manualAcceptanceTaskBatchIdentity("20260716-V5");
  const taskCoverage = taskGroupCoverageFixture();
  const runtimeAttestation = {
    source: "out-of-band",
    release: "a".repeat(40),
    migration: "20260714165115",
  };
  const printInput = {
    datasetKey: "yoyoosun-manual-acceptance",
    dataVersion: "2026.07.16-v5",
    runId: "20260716-V5",
    sourceRunId: "20260716-V5",
    target: "customer-trial-133",
    backendURL: "http://127.0.0.1:18375",
    databaseName: "plush_erp_uat_20260716_v5",
    semanticDigest: "digest-v5",
    sourcePrefix: "YS5",
    configRevision: "customer-trial-v5",
    runtimeAttestation,
  };
  const targets = [
    ...Array.from({ length: 41 }, (_, index) => ({
      id: `desktopPages:query-${index}`,
      catalogGroup: "desktopPages",
      dataStatus: "pass",
      browserRequired: true,
    })),
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `printPreviewPages:preview-${index}`,
      catalogGroup: "printPreviewPages",
      dataStatus: "not_proven",
      browserRequired: true,
      quantityNotProven: true,
    })),
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `printWorkspacePages:workspace-${index}`,
      catalogGroup: "printWorkspacePages",
      dataStatus: "not_proven",
      browserRequired: true,
      quantityNotProven: true,
    })),
  ];
  const readiness = {
    customerKey: "yoyoosun",
    datasetKey: printInput.datasetKey,
    dataVersion: printInput.dataVersion,
    runId: printInput.runId,
    target: printInput.target,
    backendURL: printInput.backendURL,
    databaseName: printInput.databaseName,
    runtimePreflight: {
      target: printInput.target,
      customerKey: "yoyoosun",
      configRevision: printInput.configRevision,
    },
    reportInputs: {
      sourceReport: {
        datasetKey: printInput.datasetKey,
        dataVersion: printInput.dataVersion,
        runId: printInput.runId,
        target: printInput.target,
        backendURL: printInput.backendURL,
        databaseName: printInput.databaseName,
        prefix: printInput.sourcePrefix,
      },
      factReport: {
        datasetKey: printInput.datasetKey,
        dataVersion: printInput.dataVersion,
        runId: printInput.runId,
        target: printInput.target,
        backendURL: printInput.backendURL,
        databaseName: printInput.databaseName,
        semanticDigest: printInput.semanticDigest,
        runtime: {
          configRevision: printInput.configRevision,
          targetAttestation: runtimeAttestation,
        },
      },
      taskReport: {
        datasetKey: printInput.datasetKey,
        dataVersion: printInput.dataVersion,
        runId: printInput.runId,
        target: printInput.target,
        backendURL: printInput.backendURL,
        databaseName: printInput.databaseName,
        prefix: taskBatch.prefix,
        sourceType: taskBatch.sourceType,
        sourceID: taskBatch.sourceID,
        taskGroupCoverageDigest: taskCoverage.catalogScenarioDigest,
      },
    },
    summary: {
      totalTargets: 51,
      passedTargetData: 41,
      failedTargetData: 0,
      notProvenTargetData: 10,
      queryChecksPassed: true,
      queryEvidenceComplete: false,
      manualAcceptanceCompleted: false,
      taskGroupCoverage: taskCoverage.summary,
    },
    probes: taskCoverage.probes,
    targets,
  };
  const binding = assertManualAcceptanceBrowserReadinessBinding(
    readiness,
    printInput,
  );
  assert.equal(binding.datasetSubstrateVerified, true);
  assert.equal(binding.browserOnlyNotProvenTargets, 10);
  assert.equal(binding.taskSourceID, taskBatch.sourceID);
  assert.equal(binding.taskGroupCoverage.complete, true);

  const canonical = resolveManualAcceptanceBrowserReportPath(
    "output/qa/manual-acceptance/datasets/2026.07.16-v5/customer-trial-133/browser/report.json",
  );
  assert.equal(
    assertManualAcceptanceBrowserReportPathBinding(canonical, printInput),
    canonical,
  );
  assert.throws(
    () =>
      assertManualAcceptanceBrowserReportPathBinding(
        resolveManualAcceptanceBrowserReportPath(
          "output/qa/manual-acceptance/browser/report.json",
        ),
        printInput,
      ),
    /customer-trial-133 browser report must use/u,
  );
  const wrongRuntime = structuredClone(readiness);
  wrongRuntime.runtimePreflight.configRevision = "other-revision";
  assert.throws(
    () =>
      assertManualAcceptanceBrowserReadinessBinding(wrongRuntime, printInput),
    /运行态身份不一致/u,
  );
  const staleTaskBatch = structuredClone(readiness);
  staleTaskBatch.reportInputs.taskReport.prefix =
    "SIM-YOYOOSUN-UAT-TASK-20260715-V3-PLAIN3";
  assert.throws(
    () =>
      assertManualAcceptanceBrowserReadinessBinding(staleTaskBatch, printInput),
    /批次或运行态身份不一致/u,
  );
  const mixedTaskSource = structuredClone(readiness);
  mixedTaskSource.reportInputs.taskReport.sourceType =
    "manual_acceptance_batch";
  assert.throws(
    () =>
      assertManualAcceptanceBrowserReadinessBinding(
        mixedTaskSource,
        printInput,
      ),
    /批次或运行态身份不一致/u,
  );
  const mixedDatabase = structuredClone(readiness);
  mixedDatabase.reportInputs.sourceReport.databaseName =
    "plush_erp_uat_20260715_v3";
  assert.throws(
    () =>
      assertManualAcceptanceBrowserReadinessBinding(mixedDatabase, printInput),
    /批次或运行态身份不一致/u,
  );
});

test("local browser requires the exact dataset batch before runtime probes", async () => {
  let fetchCalls = 0;
  await assert.rejects(
    verifyManualAcceptanceBrowserDatasetBinding({
      backendURL: "http://127.0.0.1:8310",
      printInput: {
        datasetKey: "yoyoosun-manual-acceptance",
        dataVersion: "2026.07.16-v5",
        sourceRunId: "20260716-V5",
        target: "local-dev",
        backendURL: "http://127.0.0.1:8310",
        databaseName: "plush_erp_acceptance_20260716_v5_dev",
        semanticDigest: "digest-v5",
        configRevision: "local-config-v5",
      },
      readinessReportPath: "",
      targetAttestation: "",
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error("runtime must not be probed without readiness");
      },
    }),
    /必须提供同批 --dataset-report/u,
  );
  assert.equal(fetchCalls, 0);
});

test("browser dataset binding requires the complete stage chain including baseline, attachments, and task coverage", async () => {
  const fixture = await datasetApplyEvidenceFixture();
  try {
    const binding = await verifyManualAcceptanceDatasetApplyReportBinding({
      datasetReportPath: fixture.datasetReportPath,
      sourceReportPath: fixture.sourceReportPath,
      factReportPath: fixture.factReportPath,
      readinessReportPath: fixture.readinessReportPath,
      printInput: fixture.printInput,
      datasetReportRoot: fixture.outputRoot,
    });
    assert.notEqual(
      fixture.datasetSemanticDigest,
      fixture.printInput.semanticDigest,
    );
    assert.equal(binding.datasetSemanticDigest, fixture.datasetSemanticDigest);
    assert.equal(binding.baseline.exactEmptyBusinessBaseline, true);
    assert.equal(binding.attachments.summary.attachments, 27);
    assert.match(binding.attachments.componentDigest, /^[0-9a-f]{64}$/u);
    assert.equal(binding.taskGroupCoverage.complete, true);
    assert.deepEqual(
      Object.keys(binding.componentDigests),
      MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS,
    );

    const attachment = JSON.parse(
      await fs.readFile(
        path.join(
          fixture.outputRoot,
          fixture.printInput.dataVersion,
          "local/attachments/apply-report.json",
        ),
        "utf8",
      ),
    );
    attachment.summary.attachments = 26;
    await fs.writeFile(
      path.join(
        fixture.outputRoot,
        fixture.printInput.dataVersion,
        "local/attachments/apply-report.json",
      ),
      `${JSON.stringify(attachment, null, 2)}\n`,
      "utf8",
    );
    await assert.rejects(
      () =>
        verifyManualAcceptanceDatasetApplyReportBinding({
          datasetReportPath: fixture.datasetReportPath,
          sourceReportPath: fixture.sourceReportPath,
          factReportPath: fixture.factReportPath,
          readinessReportPath: fixture.readinessReportPath,
          printInput: fixture.printInput,
          datasetReportRoot: fixture.outputRoot,
        }),
      /attachments stage component digest/u,
    );
  } finally {
    await fs.rm(fixture.outputRoot, { recursive: true, force: true });
  }
});

test("browser dataset binding rejects incomplete stages and task coverage digest drift", async () => {
  const incomplete = await datasetApplyEvidenceFixture();
  try {
    incomplete.datasetReport.stages.find(
      (stage) => stage.key === "attachments",
    ).status = "not_started";
    await fs.writeFile(
      incomplete.datasetReportPath,
      `${JSON.stringify(incomplete.datasetReport, null, 2)}\n`,
      "utf8",
    );
    await assert.rejects(
      () =>
        verifyManualAcceptanceDatasetApplyReportBinding({
          datasetReportPath: incomplete.datasetReportPath,
          sourceReportPath: incomplete.sourceReportPath,
          factReportPath: incomplete.factReportPath,
          readinessReportPath: incomplete.readinessReportPath,
          printInput: incomplete.printInput,
          datasetReportRoot: incomplete.outputRoot,
        }),
      /没有完整完成全部 canonical stages/u,
    );
  } finally {
    await fs.rm(incomplete.outputRoot, { recursive: true, force: true });
  }

  const drifted = await datasetApplyEvidenceFixture();
  try {
    drifted.reports.readiness.reportInputs.taskReport.taskGroupCoverageDigest =
      "e".repeat(64);
    await fs.writeFile(
      drifted.readinessReportPath,
      `${JSON.stringify(drifted.reports.readiness, null, 2)}\n`,
      "utf8",
    );
    const readinessStage = drifted.datasetReport.stages.find(
      (stage) => stage.key === "readiness",
    );
    readinessStage.references.runner.componentDigest =
      digestManualAcceptanceDatasetComponentReport(drifted.reports.readiness);
    await fs.writeFile(
      drifted.datasetReportPath,
      `${JSON.stringify(drifted.datasetReport, null, 2)}\n`,
      "utf8",
    );
    await assert.rejects(
      () =>
        verifyManualAcceptanceDatasetApplyReportBinding({
          datasetReportPath: drifted.datasetReportPath,
          sourceReportPath: drifted.sourceReportPath,
          factReportPath: drifted.factReportPath,
          readinessReportPath: drifted.readinessReportPath,
          printInput: drifted.printInput,
          datasetReportRoot: drifted.outputRoot,
        }),
      /taskGroup coverage digest/u,
    );
  } finally {
    await fs.rm(drifted.outputRoot, { recursive: true, force: true });
  }
});

test("taskGroup coverage fails closed for missing or unknown scenarios", () => {
  const taskCoverage = taskGroupCoverageFixture();
  const readiness = {
    reportInputs: {
      taskReport: {
        taskGroupCoverageDigest: taskCoverage.catalogScenarioDigest,
      },
    },
    summary: { taskGroupCoverage: taskCoverage.summary },
    probes: taskCoverage.probes,
  };
  assert.equal(
    assertManualAcceptanceTaskGroupCoverage(readiness).complete,
    true,
  );
  const missing = structuredClone(readiness);
  missing.probes[0].enoughScenarios = false;
  missing.probes[0].missingScenarios = [missing.probes[0].requiredScenarios[0]];
  assert.throws(
    () => assertManualAcceptanceTaskGroupCoverage(missing),
    /taskGroup 与场景覆盖/u,
  );
  const unknown = structuredClone(readiness);
  const roleKey = TASK_COVERAGE_ROLES[0];
  const taskGroup =
    unknown.summary.taskGroupCoverage.byRole[roleKey].taskGroups[0];
  unknown.summary.taskGroupCoverage.byRole[roleKey].groups[
    taskGroup
  ].unknownScenarios = ["unexpected"];
  assert.throws(
    () => assertManualAcceptanceTaskGroupCoverage(unknown),
    /taskGroup 与场景覆盖/u,
  );
});

test("fresh print workspaces never hide render-pdf failures by route or status", () => {
  const events = [
    {
      type: "response",
      message: "400 http://127.0.0.1:15200/templates/render-pdf",
    },
    {
      type: "console",
      message:
        "Failed to load resource: the server responded with a status of 400 (Bad Request)",
    },
  ];
  const fresh = partitionTargetRuntimeEvents(
    {
      group: "print-workspace",
      route: "/erp/print-workspace/processing-contract?draft=fresh",
    },
    events,
  );
  assert.equal(fresh.blocking.length, 2);
  assert.equal(fresh.expected.length, 0);

  const businessPage = partitionTargetRuntimeEvents(
    { group: "desktop", route: "/erp/sales/project-orders/sales-orders" },
    events,
  );
  assert.equal(businessPage.blocking.length, 2);
  assert.equal(businessPage.expected.length, 0);
});

test("business summary totals use the visible client-facing counters", () => {
  assert.equal(readBusinessSummaryTotal("task-board", "全部任务 20"), 20);
  assert.equal(
    readBusinessSummaryTotal(
      "task-board",
      "常规待办 6 阻塞 3 到期提醒 8 已结束 3",
    ),
    20,
  );
  assert.equal(
    readBusinessSummaryTotal("products", "总产品 34 当前结果 20"),
    34,
  );
  assert.equal(
    readBusinessSummaryTotal("accessories-purchase", "总订单 203"),
    203,
  );
  assert.equal(
    readBusinessSummaryTotal(
      "permission-center",
      "岗位设置 11 共 22 个员工账号",
    ),
    22,
  );
  assert.equal(
    readBusinessSummaryTotal(
      "permission-center",
      "岗位设置 22 共 5 个员工账号",
    ),
    5,
  );
  assert.equal(
    readBusinessSummaryTotal("production-orders", "符合条件 47 当前页 20"),
    47,
  );
});

test("shipment release browser evidence proves live due-soon and overdue categories", () => {
  const schedule = buildManualAcceptanceTaskSchedule(2_000_000_000);
  const rows = [
    { code: "YS-V5-CK-02", text: "YS-V5-CK-02 可执行 即将到期" },
    { code: "YS-V5-CK-13", text: "YS-V5-CK-13 阻塞 已超时" },
    { code: "YS-V5-CK-16", text: "YS-V5-CK-16 已完成" },
    { code: "YS-V5-CK-19", text: "YS-V5-CK-19 退回" },
  ];
  assert.equal(
    evaluateShipmentReleaseEvidence(rows, schedule, 2_000_000_100_000).passed,
    true,
  );
  assert.match(
    evaluateShipmentReleaseEvidence(
      rows,
      schedule,
      (schedule.dueSoonValidUntilUnix + 1) * 1000,
    ).reason,
    /已超出本批有效时间窗口/u,
  );
  assert.equal(
    evaluateShipmentReleaseEvidence(rows.slice(1), schedule, 2_000_000_100_000)
      .passed,
    false,
  );
  assert.equal(
    evaluateShipmentReleaseEvidence(
      [...rows, { code: "YS-V5-CK-20", text: "其他仓库任务" }],
      schedule,
      2_000_000_100_000,
    ).passed,
    false,
  );
  assert.equal(
    evaluateShipmentReleaseEvidence(
      [rows[0], rows[0], rows[2], rows[3]],
      schedule,
      2_000_000_100_000,
    ).passed,
    false,
  );
});

test("current-batch list evidence cannot be satisfied by an unrelated page total", () => {
  const currentBatch = {
    dataStatus: "pass",
    actual: 60,
    probes: [
      {
        id: "customers",
        status: "pass",
        batchEvidence: "prefix_filtered",
        batchPrefix: "YS5",
      },
    ],
  };
  assert.equal(
    evaluateCurrentBatchListEvidence({
      currentBatch,
      currentBatchDOM: {
        mode: "source_prefix",
        identifier: "YS5",
        visibleItems: 20,
        matchingCurrentBatchItems: 0,
        currentBatchVisible: false,
      },
      renderedItems: 20,
      pageReportedTotal: 999,
      minimumRecords: 60,
    }).minimumSatisfied,
    false,
  );
  assert.equal(
    evaluateCurrentBatchListEvidence({
      currentBatch,
      currentBatchDOM: {
        mode: "source_prefix",
        identifier: "YS5",
        visibleItems: 20,
        matchingCurrentBatchItems: 20,
        currentBatchVisible: true,
      },
      renderedItems: 20,
      pageReportedTotal: 60,
      minimumRecords: 60,
    }).minimumSatisfied,
    true,
  );
});

test("page-data contract and readiness expose current-batch list identifiers", () => {
  const customers = buildManualAcceptanceBrowserPlan({}).targets.find(
    (target) => target.key === "customers",
  );
  const readiness = {
    targets: [
      {
        id: customers.dataContractTargetId,
        dataStatus: "pass",
        actual: 60,
        supporting: [
          {
            id: "customers",
            status: "pass",
            actual: 60,
            batchEvidence: "prefix_filtered",
            batchPrefix: "YS5",
          },
        ],
      },
    ],
    probes: [],
  };
  const currentBatch =
    buildManualAcceptanceCurrentBatchReadiness(readiness)[
      customers.dataContractTargetId
    ];
  assert.equal(currentBatch.dataStatus, "pass");
  assert.equal(currentBatch.probes[0].batchPrefix, "YS5");
  assert.deepEqual(resolveCurrentBatchListFilter(customers, currentBatch, {}), {
    mode: "source_prefix",
    identifier: "YS5",
  });
  assert.throws(
    () =>
      resolveCurrentBatchListFilter(
        { ...customers, title: "客户" },
        { ...currentBatch, probes: [] },
        {},
      ),
    /没有可在页面核对的当前批次标识/u,
  );
});

test("task board binds task-code metadata to the exact current-batch total", () => {
  const taskBoard = buildManualAcceptanceBrowserPlan({}).targets.find(
    (target) => target.key === "task-board",
  );
  const prefix = TASK_VISIBLE_CODE_PREFIX_BY_ROLE.boss;
  const currentBatch = {
    dataStatus: "pass",
    actual: 20,
    probes: [
      {
        id: "boss-dashboard-tasks",
        status: "pass",
        batchEvidence: "exact_source",
        exactTaskCodePrefix: prefix,
      },
    ],
  };
  assert.deepEqual(resolveCurrentBatchListFilter(taskBoard, currentBatch, {}), {
    mode: "exact_task_prefix",
    identifier: prefix,
  });
  const base = {
    currentBatch,
    currentBatchDOM: {
      mode: "exact_task_prefix",
      identifier: prefix,
      visibleItems: 20,
      matchingCurrentBatchItems: 20,
      currentBatchVisible: true,
    },
    renderedItems: 20,
    minimumRecords: 20,
  };
  assert.equal(
    evaluateCurrentBatchListEvidence({ ...base, pageReportedTotal: 20 })
      .minimumSatisfied,
    true,
  );
  assert.equal(
    evaluateCurrentBatchListEvidence({ ...base, pageReportedTotal: 19 })
      .minimumSatisfied,
    false,
  );
});

test("mobile current-batch proof requires exact role source and exact DOM total", () => {
  const roleKey = "sales";
  const currentBatch = {
    dataStatus: "pass",
    actual: 20,
    probes: [
      {
        id: `mobile-tasks:${roleKey}`,
        status: "pass",
        batchEvidence: "exact_source",
        exactSourceType: TASK_SOURCE_TYPE,
        exactSourceID: 202607165,
        exactTaskCodePrefix: TASK_VISIBLE_CODE_PREFIX_BY_ROLE[roleKey],
        exactOwnerRoleKey: roleKey,
      },
    ],
  };
  const passing = evaluateMobileCurrentBatchEvidence({
    roleKey,
    todoCount: 14,
    doneCount: 6,
    minimumRecords: 20,
    currentBatch,
  });
  assert.equal(passing.minimumSatisfied, true);
  assert.equal(
    evaluateMobileCurrentBatchEvidence({
      roleKey,
      todoCount: 20,
      doneCount: 20,
      minimumRecords: 20,
      currentBatch,
    }).minimumSatisfied,
    false,
  );
  assert.equal(
    evaluateMobileCurrentBatchEvidence({
      roleKey,
      todoCount: 14,
      doneCount: 6,
      minimumRecords: 20,
      currentBatch: {
        ...currentBatch,
        probes: [{ ...currentBatch.probes[0], exactOwnerRoleKey: "purchase" }],
      },
    }).minimumSatisfied,
    false,
  );
});

test("dashboard data evidence fails closed for empty or unavailable sources", () => {
  const global = evaluateGlobalDashboardEvidence(
    ["今天要办，12 项，先处理", "风险提醒，8 项，请关注"],
    5,
    20,
  );
  assert.equal(global.minimumSatisfied, true);

  const exception = evaluateExceptionFlowEvidence(
    "阻塞任务 3 今日/超时任务 2",
    3,
    3,
  );
  assert.equal(exception.minimumSatisfied, true);
  assert.equal(
    evaluateExceptionFlowEvidence(
      "阻塞任务 0 今日/超时任务 0 暂无阻塞任务",
      0,
      3,
    ).minimumSatisfied,
    false,
  );

  const requirements = [
    { key: "customers", label: "客户", minimumRecords: 60 },
    { key: "shipping-release", label: "出货放行", minimumRecords: 4 },
  ];
  assert.equal(
    evaluateBusinessDashboardEvidence(
      ["客户数量60", "出货放行数量4"],
      requirements,
    ).minimumSatisfied,
    true,
  );
  assert.equal(
    evaluateBusinessDashboardEvidence(
      ["客户数量60", "出货放行数量暂不可用"],
      requirements,
    ).minimumSatisfied,
    false,
  );
  assert.equal(
    evaluateBusinessDashboardEvidence(
      ["客户数量60", "出货放行数量3"],
      requirements,
    ).minimumSatisfied,
    false,
  );
});

test("dashboard task evidence requires a visible code from the exact current batch", () => {
  const currentBatch = {
    dataStatus: "pass",
    actual: 18,
    probes: [
      {
        id: "boss-dashboard-tasks",
        status: "pass",
        batchEvidence: "exact_source",
        exactSourceType: TASK_SOURCE_TYPE,
        exactSourceID: 202607165,
        exactTaskCodePrefix: TASK_VISIBLE_CODE_PREFIX_BY_ROLE.boss,
        exactOwnerRoleKey: "boss",
        exactTaskGroup: null,
      },
    ],
  };
  const base = {
    status: "minimum_proven",
    observedTotal: 79,
    minimumSatisfied: true,
  };
  const exactTaskCodes = Array.from(
    { length: 18 },
    (_, index) => `YS-V5-LD-${String(index + 1).padStart(2, "0")}`,
  );
  assert.equal(
    evaluateDashboardTaskCurrentBatchEvidence({
      evidence: base,
      currentBatch,
      roleKey: "boss",
      visibleTaskCodes: ["YS-V5-LD-01"],
      currentBatchTaskCodes: exactTaskCodes,
    }).minimumSatisfied,
    true,
  );
  assert.equal(
    evaluateDashboardTaskCurrentBatchEvidence({
      evidence: base,
      currentBatch,
      roleKey: "boss",
      visibleTaskCodes: ["OLD-LD-01"],
      currentBatchTaskCodes: exactTaskCodes,
    }).minimumSatisfied,
    false,
  );
  assert.equal(
    evaluateDashboardTaskCurrentBatchEvidence({
      evidence: base,
      currentBatch,
      roleKey: "boss",
      visibleTaskCodes: ["YS-V5-LD-01"],
      currentBatchTaskCodes: exactTaskCodes.slice(0, 17),
    }).minimumSatisfied,
    false,
  );

  const exceptionBatch = {
    dataStatus: "pass",
    actual: 4,
    probes: [
      {
        id: "production-exception-active-tasks",
        status: "pass",
        batchEvidence: "exact_source",
        exactSourceType: TASK_SOURCE_TYPE,
        exactSourceID: 202607165,
        exactTaskCodePrefix: TASK_VISIBLE_CODE_PREFIX_BY_ROLE.production,
        exactOwnerRoleKey: "production",
        exactTaskGroup: "production_exception",
      },
    ],
  };
  const exceptionCodes = [
    "YS-V5-SC-01",
    "YS-V5-SC-02",
    "YS-V5-SC-03",
    "YS-V5-SC-04",
  ];
  assert.equal(
    evaluateDashboardTaskCurrentBatchEvidence({
      evidence: base,
      currentBatch: exceptionBatch,
      roleKey: "production",
      taskGroup: "production_exception",
      visibleTaskCodes: ["YS-V5-SC-01"],
      currentBatchTaskCodes: exceptionCodes,
    }).minimumSatisfied,
    true,
  );
  for (const invalidCodes of [
    exceptionCodes.slice(0, 3),
    [...exceptionCodes, "YS-V5-SC-05"],
    [exceptionCodes[0], exceptionCodes[0], ...exceptionCodes.slice(2)],
  ]) {
    assert.equal(
      evaluateDashboardTaskCurrentBatchEvidence({
        evidence: base,
        currentBatch: exceptionBatch,
        roleKey: "production",
        taskGroup: "production_exception",
        visibleTaskCodes: ["YS-V5-SC-01"],
        currentBatchTaskCodes: invalidCodes,
      }).minimumSatisfied,
      false,
    );
  }
});

test("business dashboard binds every card to the fresh projection and same-batch source", () => {
  const requirements = [
    {
      key: "customers",
      label: "客户",
      minimumRecords: 60,
      probeId: "customers",
      exactCurrentBatchCount: true,
    },
    {
      key: "products",
      label: "产品",
      minimumRecords: 20,
      probeId: "products",
      exactCurrentBatchCount: true,
    },
    {
      key: "inventory",
      label: "库存台账",
      minimumRecords: 45,
      probeId: "inventory-balances",
      exactCurrentBatchCount: true,
    },
  ];
  const evidence = evaluateBusinessDashboardEvidence(
    ["客户数量60", "产品数量20", "库存台账数量193"],
    requirements,
  );
  const currentBatch = {
    dataStatus: "pass",
    actual: 20,
    probes: [
      {
        id: "customers",
        status: "pass",
        actual: 60,
        batchEvidence: "prefix_filtered",
      },
      {
        id: "products",
        status: "pass",
        actual: 20,
        batchEvidence: "prefix_filtered",
      },
      {
        id: "inventory-balances",
        status: "pass",
        actual: 193,
        batchEvidence: "exact_references",
      },
      {
        id: "business-dashboard-stats",
        status: "pass",
        actual: 20,
        batchEvidence: "fresh_dataset_projection",
        moduleTotals: { customers: 60, products: 20, inventory: 193 },
      },
    ],
  };
  assert.equal(
    evaluateBusinessDashboardCurrentBatchEvidence({
      evidence,
      currentBatch,
      baselineProven: true,
    }).minimumSatisfied,
    true,
  );
  assert.equal(
    evaluateBusinessDashboardCurrentBatchEvidence({
      evidence,
      currentBatch: {
        ...currentBatch,
        probes: [
          { ...currentBatch.probes[0], actual: 59 },
          currentBatch.probes[1],
          currentBatch.probes[2],
          currentBatch.probes[3],
        ],
      },
      baselineProven: true,
    }).minimumSatisfied,
    false,
  );
  assert.equal(
    evaluateBusinessDashboardCurrentBatchEvidence({
      evidence,
      currentBatch: {
        ...currentBatch,
        probes: [
          ...currentBatch.probes.slice(0, 3),
          {
            ...currentBatch.probes[3],
            moduleTotals: { customers: 60, products: 20, inventory: 192 },
          },
        ],
      },
      baselineProven: true,
    }).minimumSatisfied,
    false,
  );
  assert.equal(
    evaluateBusinessDashboardCurrentBatchEvidence({
      evidence,
      currentBatch,
      baselineProven: false,
    }).minimumSatisfied,
    false,
  );
});

test("print preview and current-batch source minimum evidence fail closed", () => {
  const preview = evaluatePrintPreviewEvidence(
    {
      entryVisible: true,
      rendererVisible: true,
      rendererTextLength: 120,
    },
    1,
  );
  assert.equal(preview.status, "minimum_proven");
  assert.equal(preview.observedTotal, 1);
  assert.equal(preview.minimumSatisfied, true);
  assert.equal(
    evaluatePrintPreviewEvidence(
      {
        entryVisible: true,
        rendererVisible: true,
        rendererTextLength: 12,
      },
      1,
    ).minimumSatisfied,
    false,
  );

  const sourceEvidence = evaluatePrintSourceMinimumEvidence({
    sourcePrefix: "YS5",
    visibleRows: 5,
    matchingCurrentBatchRows: 5,
    paginationTexts: ["1-20 / 共 45 条"],
    minimumRecords: 5,
  });
  assert.equal(sourceEvidence.status, "minimum_proven");
  assert.equal(sourceEvidence.observedTotal, 45);
  assert.equal(sourceEvidence.minimumSatisfied, true);
  assert.equal(
    evaluatePrintSourceMinimumEvidence({
      sourcePrefix: "YS5",
      visibleRows: 5,
      matchingCurrentBatchRows: 4,
      paginationTexts: ["共 45 条"],
      minimumRecords: 5,
    }).minimumSatisfied,
    false,
  );
  assert.equal(
    evaluatePrintSourceMinimumEvidence({
      sourcePrefix: "YS5",
      visibleRows: 4,
      matchingCurrentBatchRows: 4,
      paginationTexts: [],
      minimumRecords: 5,
    }).minimumSatisfied,
    false,
  );

  assert.deepEqual(
    buildPrintWorkspaceDataEvidence(
      {
        sourceDataEvidence: sourceEvidence,
      },
      5,
    ),
    sourceEvidence,
  );
  const mismatchedCatalogMinimum = buildPrintWorkspaceDataEvidence(
    { sourceDataEvidence: sourceEvidence },
    6,
  );
  assert.equal(
    mismatchedCatalogMinimum.status,
    "page_has_data_minimum_not_proven",
  );
  assert.equal(mismatchedCatalogMinimum.observedTotal, 45);
  assert.equal(mismatchedCatalogMinimum.minimumSatisfied, false);
});

test("mobile task totals use the active tab's loaded summary even without a collapse toggle", () => {
  assert.equal(readMobileLoadedTaskCount("todo", "已加载 18 条待处理"), 18);
  assert.equal(readMobileLoadedTaskCount("done", "已加载 2 条已办"), 2);
  assert.equal(readMobileLoadedTaskCount("done", "已加载 18 条待处理"), 0);
});

test("mobile task evidence waits for each lazy-loaded tab before reading zero", async () => {
  const source = await fs.readFile(scriptPath, "utf8");
  assert.match(source, /mobile-role-scroll/u);
  assert.match(source, /getAttribute\("aria-busy"\) === "false"/u);
  assert.match(
    source,
    /mobile-role-nav-done[\s\S]{0,900}waitForActiveViewLoaded\(\)[\s\S]{0,500}readCurrentTotal\("done"\)/u,
  );
  assert.match(
    source,
    /loadedTodoCount \+ Number\(match\[1\] \|\| 0\) >= requiredMinimum/u,
  );
});

test("PDF response failures surface before blob preview polling", async () => {
  await assert.rejects(
    () =>
      assertPDFRenderResponse(
        {
          headers: () => ({ "content-type": "application/json" }),
          status: () => 400,
          ok: () => false,
          json: async () => ({
            message: "html 样式包含不允许的外部资源或动态表达式",
          }),
        },
        "material-purchase-contract",
      ),
    /PDF HTTP 400.*html 样式/u,
  );
  assert.deepEqual(
    await assertPDFRenderResponse(
      {
        headers: () => ({
          "content-type": "application/pdf; charset=binary",
          "x-request-id": "req-print-1",
        }),
        status: () => 200,
        ok: () => true,
      },
      "material-purchase-contract",
    ),
    {
      status: 200,
      contentType: "application/pdf; charset=binary",
      requestID: "req-print-1",
    },
  );
});

test("disabled password login follows the precise inactive-account contract", async () => {
  const source = await fs.readFile(scriptPath, "utf8");
  assert.match(source, /expectedText:\s*"账号已停用"/u);
  assert.doesNotMatch(source, /expectedText:\s*"登录信息不正确或账号不可用"/u);
});

test("exception account probes use the current ordinary entry copy", async () => {
  const source = await fs.readFile(scriptPath, "utf8");
  assert.match(source, /\["\/entry", "电脑端"\]/u);
  assert.match(source, /\["\/entry", "手机待办"\]/u);
  assert.match(source, /text:\s*"当前账号暂无可用入口"/u);
  assert.match(source, /absentTexts:\s*\["电脑端", "手机待办"\]/u);
  assert.doesNotMatch(source, /\["\/entry", "后台管理"\]/u);
  assert.doesNotMatch(source, /text:\s*"当前账号暂无可用入口权限"/u);
});

test("business print proof searches canonical current-batch records before exact actions", async () => {
  const source = await fs.readFile(scriptPath, "utf8");
  const currentBatchMinimumIndex = source.indexOf(
    "await search.fill(sourcePrefix)",
  );
  const exactRecordIndex = source.indexOf("await search.fill(recordQuery)");
  assert.ok(currentBatchMinimumIndex > 0);
  assert.ok(exactRecordIndex > currentBatchMinimumIndex);
  assert.match(source, /workspaceMinimumByTemplate/u);
  assert.match(source, /target\.minimumRecords/u);
  assert.match(source, /sourceDataEvidence/u);
  assert.match(source, /buildPrintWorkspaceDataEvidence/u);
  assert.match(source, /recordQuery/u);
  assert.match(source, /search\.fill\(recordQuery\)/u);
  assert.doesNotMatch(source, /search\.press\("Enter"\)/u);
  assert.match(
    source,
    /rows\.every\(\(candidate\) => candidate\.innerText\.includes\(query\)\)/u,
  );
  assert.match(source, /printInput\.printRecords\.purchaseOrder\.recordQuery/u);
  assert.match(
    source,
    /printInput\.printRecords\.outsourcingOrder\.recordQuery/u,
  );
  assert.match(source, /printInput\.printRecords\.bomVersion\.recordQuery/u);
  assert.match(source, /expectedLineCount/u);
  for (const label of [
    "采购明细行",
    "加工明细行",
    "物料行",
    "色卡块",
    "正文行",
  ]) {
    assert.match(source, new RegExp(label, "u"));
  }
  assert.match(source, /row\.getByText\(recordQuery, \{ exact: true \}\)/u);
  assert.match(source, /const selectionControl = row/u);
  assert.match(source, /\.ant-table-selection-column \.ant-radio-wrapper/u);
  assert.match(source, /await selectionControl\.click\(\)/u);
  assert.match(source, /selectionInput\.isChecked\(\)/u);
  assert.doesNotMatch(source, /force: true/u);
  assert.match(source, /attempt <= 3/u);
  assert.match(source, /search\.inputValue\(\)/u);
  assert.match(source, /const filteredRowsReady = await page/u);
  assert.match(source, /if \(!filteredRowsReady\)/u);
  assert.match(source, /timeout: 5_000/u);
  assert.match(source, /selectionStable/u);
  assert.match(source, /selected && enabledAction/u);
  assert.match(
    source,
    /templateKey === "processing-contract" \? "来自业务页面" : "业务记录带值"/u,
  );
  assert.match(
    source,
    /new URL\(page\.url\(\)\)\.pathname,[\s\S]{0,120}sourceRoute/u,
  );
  assert.match(source, /getByText\(COMPANY_NAME, \{ exact: true \}\)/u);
  assert.doesNotMatch(source, /__PLUSH_ERP_EFFECTIVE_SESSION_DIAGNOSTIC__/u);
  assert.match(
    source,
    /const login = await loginFormalAccount\(browser,[\s\S]{0,160}password,[\s\S]{0,240}storageState: login\.storageState/u,
  );
  assert.doesNotMatch(
    source,
    /verifyBusinessPrintEvidence\(browser,[\s\S]{0,120}desktopStorageStates/u,
  );
  assert.doesNotMatch(source, /await recordCell\.click\(\)/u);
  assert.match(source, /\.ant-table-row-selected/u);
  assert.doesNotMatch(
    source,
    /selector\.evaluate\(\(node\) => node\.click\(\)\)/u,
  );
  assert.match(
    source,
    /locator\("button"\)[\s\S]{0,180}getByText\(actionLabel,\s*\{\s*exact:\s*true\s*\}\)/u,
  );
  assert.match(
    source,
    /button\.innerText[\s\S]*=== label[\s\S]*!button\.disabled/u,
  );
});

test("permission center evidence follows the current employee-account tab", async () => {
  const source = await fs.readFile(scriptPath, "utf8");
  assert.match(source, /getByRole\("tab", \{ name: \/员工账号\/u \}\)/u);
  assert.match(source, /共\\s\*\(\\d\+\)\\s\*个员工账号/u);
  assert.doesNotMatch(
    source,
    /getByRole\("tab", \{ name: \/管理员账号\/u \}\)/u,
  );
});

test("inventory current-batch evidence switches to the lot-number view", async () => {
  const source = await fs.readFile(scriptPath, "utf8");
  assert.match(source, /target\.key === "inventory"/u);
  assert.match(
    source,
    /getByRole\("tab", \{ name: "库存批次", exact: true \}\)/u,
  );
  assert.match(source, /getByPlaceholder\("搜索批次"\)/u);
});

test("mobile role totals cannot overwrite a task board DOM minimum failure", () => {
  const taskBoard = {
    key: "task-board",
    passed: true,
    isList: true,
    dataEvidence: {
      observedTotal: 0,
      minimumRecords: 180,
      minimumSatisfied: false,
    },
  };
  const mobileTargets = [
    "boss",
    "sales",
    "purchase",
    "production",
    "warehouse",
    "quality",
    "finance",
    "pmc",
    "engineering",
  ].map((roleKey) => ({
    key: roleKey,
    group: "mobile",
    roleKey,
    passed: true,
    isList: true,
    dataEvidence: { observedTotal: 20, minimumSatisfied: true },
  }));
  const summary = summarizeManualAcceptance({
    formalAccounts: [{ passed: true }],
    exceptionAccounts: [{ passed: true }],
    targets: [taskBoard, ...mobileTargets],
  });
  assert.equal(taskBoard.dataEvidence.minimumSatisfied, false);
  assert.equal(summary.acceptancePassed, false);
  assert.deepEqual(summary.failedDataMinimums, [taskBoard]);
});

test("list minimums are part of acceptance while page runtime remains separately visible", () => {
  const summary = summarizeManualAcceptance({
    formalAccounts: [{ passed: true }],
    exceptionAccounts: [{ passed: true }],
    printEvidence: { passed: true },
    targets: [
      { passed: true, isList: false },
      { passed: true, isList: true, dataEvidence: { minimumSatisfied: false } },
    ],
  });
  assert.equal(summary.pageRuntimePassed, true);
  assert.equal(summary.acceptancePassed, false);
  assert.equal(summary.passed, false);
  assert.equal(summary.failedDataMinimums.length, 1);
});

test("five real business PDF proofs are required for final acceptance", () => {
  const summary = summarizeManualAcceptance({
    formalAccounts: [{ passed: true }],
    exceptionAccounts: [{ passed: true }],
    targets: [{ passed: true, isList: false }],
    printEvidence: { passed: false, templates: [] },
  });
  assert.equal(summary.pageRuntimePassed, true);
  assert.equal(summary.printEvidencePassed, false);
  assert.equal(summary.acceptancePassed, false);
});

test("fresh business print sessions run before the long page traversal", async () => {
  const source = await fs.readFile(scriptPath, "utf8");
  const printIndex = source.lastIndexOf(
    "printEvidence = await verifyBusinessPrintEvidence",
  );
  const formalAccountIndex = source.lastIndexOf(
    "for (const account of FORMAL_BROWSER_ACCOUNTS)",
  );
  assert.ok(printIndex > 0);
  assert.ok(formalAccountIndex > printIndex);
});

test("historical readiness evidence cannot override a current DOM minimum failure", () => {
  const summary = summarizeManualAcceptance({
    formalAccounts: [{ passed: true }],
    exceptionAccounts: [{ passed: true }],
    printEvidence: { passed: true },
    targets: [
      {
        key: "task-board",
        passed: true,
        isList: true,
        dataEvidence: {
          observedTotal: 0,
          minimumRecords: 180,
          minimumSatisfied: false,
        },
        historicalReadinessEvidence: {
          actual: 180,
          generatedAt: "2026-07-11T13:02:49.831Z",
        },
      },
    ],
  });
  assert.equal(summary.pageRuntimePassed, true);
  assert.equal(summary.acceptancePassed, false);
  assert.equal(summary.failedDataMinimums.length, 1);
});

test("readiness binding cannot replace current DOM list minimum proof", async () => {
  const source = await fs.readFile(
    path.resolve(repoRoot, "scripts/qa/manual-acceptance-browser.mjs"),
    "utf8",
  );
  assert.match(source, /\.erp-task-board-card/u);
  assert.match(source, /\.erp-audit-event/u);
  assert.match(source, /row\.querySelectorAll\("td strong"\)/u);
  assert.match(source, /name: \/打开可编辑打印窗口\/u/u);
  assert.match(source, /name: \/查看明细\/u/u);
  assert.match(source, /getByRole\("tab", \{ name: \/员工账号/u);
  assert.match(source, /readinessReportSHA256/u);
  assert.match(source, /failedDataMinimums = dataEvidenceTargets\.filter/u);
});

test("missing password starts zero browsers and performs zero probes", async () => {
  let chromiumLoads = 0;
  let fetchCalls = 0;
  await assert.rejects(
    runManualAcceptanceBrowser(
      {
        baseURL: "http://127.0.0.1:15200",
        backendURL: "http://127.0.0.1:8300",
        password: "",
      },
      {
        loadChromium: async () => {
          chromiumLoads += 1;
          throw new Error("browser must not load");
        },
        fetchImpl: async () => {
          fetchCalls += 1;
          throw new Error("network must not run");
        },
      },
    ),
    /缺少本地试用账号密码/,
  );
  assert.equal(chromiumLoads, 0);
  assert.equal(fetchCalls, 0);
});

test("plan mode needs no password and starts no browser", () => {
  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      "--plan",
      "--base-url",
      "http://127.0.0.1:15200",
      "--backend-url",
      "http://127.0.0.1:8300",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, MANUAL_ACCEPTANCE_PASSWORD: "" },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.summary.totalTargets, 51);
  assert.equal(plan.writesDatabase, false);
  assert.equal(plan.formalAccounts.length, 10);
});
