import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  EXCEPTION_BROWSER_ACCOUNTS,
  FORMAL_BROWSER_ACCOUNTS,
  MANUAL_ACCEPTANCE_BROWSER_BOUNDARY,
  awaitLoginSubmission,
  assertPDFRenderResponse,
  assertManualAcceptanceBrowserReadinessBinding,
  assertManualAcceptanceTaskGroupCoverage,
  assertManualAcceptanceBrowserReportPathBinding,
  assertBoundSimulatedPrintReports,
  assertScenarioDemoBrowserDataset,
  buildManualAcceptanceBrowserPlan,
  buildManualAcceptanceCurrentBatchReadiness,
  normalizeLocalBrowserURL,
  partitionTargetRuntimeEvents,
  isRetryableFormalLoginRateLimitFailure,
  isRetryableTargetRateLimitFailure,
  runFormalLoginWithRateLimitRetry,
  runTargetWithRateLimitRetry,
  summarizeManualAcceptance,
  parseManualAcceptanceBrowserArgs,
  resolveManualAcceptanceBrowserReportPath,
  resolveManualAcceptanceBrowserInputReportPath,
  resolveManualAcceptanceDatasetReportRoot,
  runManualAcceptanceBrowser,
  readScopedPageTotal,
  matchCanonicalDOMRows,
  buildCurrentBatchDOMRecords,
  collectCanonicalQuantity,
  readListDOMSnapshot,
  readMobileTaskTotal,
  resolveCurrentBatchListFilter,
  sourceDocumentSearchPrefix,
  shipmentListReady,
  evaluateBusinessDashboardEvidence,
  browserProjectionBaselineProven,
  evaluateBusinessDashboardCurrentBatchEvidence,
  evaluateDashboardTaskCurrentBatchEvidence,
  evaluateFinanceFieldBrowserEvidence,
  evaluateGlobalDashboardEvidence,
  evaluatePrintPreviewEvidence,
  evaluatePrintSourceMinimumEvidence,
  evaluateShipmentReleaseEvidence,
  evaluateCurrentBatchListEvidence,
  evaluateMobileCurrentBatchEvidence,
  buildPrintWorkspaceDataEvidence,
  currentBatchFactIdentifiers,
  getManualAcceptanceBrowserHelp,
  verifyManualAcceptanceBrowserDatasetBinding,
  verifyManualAcceptanceDatasetApplyReportBinding,
  verifyScenarioDemoBrowserRuntimeIdentity,
  verifyScenarioDemoBrowserSession,
} from "./manual-acceptance-browser.mjs";
import {
  MANUAL_ACCEPTANCE_DATASET_APPLY_REPORT_CONTRACT,
  MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS,
  buildManualAcceptanceDatasetTargetPlan,
  digestManualAcceptanceSemanticPlan,
} from "./manual-acceptance-dataset.mjs";
import {
  MANUAL_ACCEPTANCE_DATABASE_REBUILD_PROOF_CONTRACT,
  MANUAL_ACCEPTANCE_DATASET_RUNNER_CONTRACT,
  MANUAL_ACCEPTANCE_DATASET_STAGE_LOGIC_FINGERPRINT_CONTRACT,
  MANUAL_ACCEPTANCE_EMPTY_BASELINE_PROBES,
  PERSISTENT_BASELINE_REPORT_CONTRACT,
  digestManualAcceptanceDatasetComponentReport,
  manualAcceptanceDatasetStageReportPath,
  resolveManualAcceptanceDatasetStageLogicFingerprints,
} from "./manual-acceptance-dataset-runner.mjs";
import {
  LONG_LIVED_WORKBENCH_TASK_COPY_REVISION,
  TASK_SOURCE_TYPE,
  TASK_PROFILE_LONG_LIVED_WORKBENCH,
  TASK_VISIBLE_CODE_PREFIX_BY_ROLE,
  buildManualAcceptanceTaskSchedule,
  buildManualAcceptanceTaskDataPlan,
  manualAcceptanceTaskBatchIdentity,
} from "./manual-acceptance-task-data.mjs";
import { inspectFinanceFieldContract } from "./manual-acceptance-finance-field-contract.mjs";
import { formatUnixDate } from "../../web/src/erp/utils/masterDataOrderView.mjs";
import { MANUAL_ACCEPTANCE_CORE_UNITS } from "./manual-acceptance-core-contract.mjs";
import {
  CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
  CURRENT_MANUAL_ACCEPTANCE_RUN_ID,
  LOCAL_MANUAL_ACCEPTANCE_CONFIG_REVISION,
  LOCAL_MANUAL_ACCEPTANCE_CONFIG_PRODUCT_VERSION,
  LOCAL_MANUAL_ACCEPTANCE_CONFIG_APPLY_PURPOSE,
} from "./manual-acceptance-target-policy.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const scriptPath = path.resolve(
  repoRoot,
  "scripts/qa/manual-acceptance-browser.mjs",
);

test("login owns the legal-notice response wait while navigation is pending", async () => {
  const timeout = new Error("legal notice timeout");
  await assert.rejects(
    awaitLoginSubmission({
      navigation: new Promise(() => {}),
      submit: Promise.resolve(),
      legalNoticeStatus: Promise.reject(timeout),
    }),
    timeout,
  );
});

const CORE_UNIT_CODES = MANUAL_ACCEPTANCE_CORE_UNITS.map((item) => item.code);

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

function financeFieldFixture() {
  return [
    {
      id: 91_001,
      factNo: "AR-FIELD-001",
      factType: "RECEIVABLE",
      status: "POSTED",
      collectionType: "ACCOUNTS_RECEIVABLE",
      paymentTerm: "EOM_DAYS",
      paymentTermDays: 30,
      dueAt: 1_791_705_600,
    },
    {
      id: 92_001,
      factNo: "AP-FIELD-001",
      factType: "PAYABLE",
      status: "POSTED",
      paymentTerm: "DUE_ON_OCCURRENCE",
      paymentTermDays: 0,
      dueAt: 1_789_113_600,
    },
    {
      id: 93_001,
      factNo: "INV-FIELD-001",
      factType: "INVOICE",
      status: "POSTED",
      invoiceCategory: "VAT_SPECIAL_13",
    },
    {
      id: 94_001,
      factNo: "REC-FIELD-001",
      factType: "RECONCILIATION",
      status: "POSTED",
    },
  ];
}

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

async function datasetApplyEvidenceFixture({
  remote = false,
  sourceScaleProfile = "acceptance",
} = {}) {
  const outputRoot = path.join(
    repoRoot,
    "output/qa/manual-acceptance/datasets/lifecycle",
    `binding_${randomBytes(8).toString("hex")}`,
  );
  await fs.mkdir(outputRoot, { recursive: true });
  const dataVersion = "2026.09.27-v8";
  const targetAlias = remote ? "customer-trial-133" : "local";
  const taskCoverage = taskGroupCoverageFixture();
  const taskSchedule = buildManualAcceptanceTaskSchedule(2_000_000_000);
  const financeFacts = financeFieldFixture();
  const financeFieldContract = inspectFinanceFieldContract(financeFacts);
  const runtimeAttestation = remote
    ? {
        target: "customer-trial-133",
        origin: "https://demo.yoyoosun.net",
        customerKey: "yoyoosun",
        environment: "prod",
        release: "f".repeat(40),
        migration: "20260812043327",
        debug: {
          seedEnabled: false,
          seedAllowed: false,
          cleanupEnabled: false,
          cleanupAllowed: false,
          businessDataClearEnabled: false,
          businessDataClearAllowed: false,
        },
      }
    : null;
  const printInput = {
    datasetKey: "yoyoosun-manual-acceptance",
    dataVersion,
    runId: "20260927-V8",
    sourceRunId: "20260927-V8",
    target: remote ? "customer-trial-133" : "local-dev",
    backendURL: remote ? "https://demo.yoyoosun.net" : "http://127.0.0.1:8310",
    databaseName: remote
      ? "plush_erp_demo_v1"
      : "plush_erp_acceptance_local_fixture_dev",
    semanticDigest: "d".repeat(64),
    sourcePrefix: "YS8",
    configRevision: remote ? "customer-trial-config-v8" : "local-config-v5",
    financeFieldDigest: financeFieldContract.digest,
    financeRepresentatives: financeFieldContract.representatives,
    runtimeAttestation,
  };
  const currentPlan = buildManualAcceptanceDatasetTargetPlan({
    targetAlias,
    sourceScaleProfile,
    dataVersion,
    runId: printInput.sourceRunId,
    backendURL: printInput.backendURL,
    databaseName: printInput.databaseName,
  });
  const datasetSemanticDigest = currentPlan.semanticDigest;
  const fingerprints = resolveManualAcceptanceDatasetStageLogicFingerprints();
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
  Object.assign(reports.source, {
    sourceScaleProfile,
    scale: currentPlan.semanticPlan.stages.find((stage) => stage.key === "source")
      .expected.scale,
  });
  Object.assign(reports.core, {
    configRevision: printInput.configRevision,
    configProductVersion: remote
      ? "customer-trial-133-test-2026.09.27-v8"
      : "local-customer-v5",
    configApplyPurpose: remote ? "customer_trial_apply" : "local_test_apply",
    configDatasetVersion: printInput.dataVersion,
    configTarget: printInput.target,
  });
  const zeroCounts = Object.fromEntries(
    MANUAL_ACCEPTANCE_EMPTY_BASELINE_PROBES.map(({ key }) => [key, 0]),
  );
  const databaseRebuildProof = remote
    ? {
        contract: MANUAL_ACCEPTANCE_DATABASE_REBUILD_PROOF_CONTRACT,
        status: "passed",
        databaseName: printInput.databaseName,
        release: runtimeAttestation.release,
        migration: runtimeAttestation.migration,
        systemIdentifierBefore: "7673878211904323625",
        systemIdentifierAfter: "7675963039852556329",
      }
    : null;
  Object.assign(reports.baseline, {
    contract: "manual-acceptance-empty-baseline-report-v1",
    runtimeIdentity: {
      scope: remote ? "release-v1" : "database-v1",
      proof: "matched-v1",
      databaseName: printInput.databaseName,
      release: runtimeAttestation?.release || null,
      migration: runtimeAttestation?.migration || null,
    },
    databaseRebuildProof,
    customerConfig: {
      configRevision: reports.core.configRevision,
      configProductVersion: reports.core.configProductVersion,
      configApplyPurpose: reports.core.configApplyPurpose,
      configDatasetVersion: reports.core.configDatasetVersion,
      configTarget: reports.core.configTarget,
    },
    core: {
      units: CORE_UNIT_CODES.length,
      warehouses: 4,
      unitCodes: CORE_UNIT_CODES,
      warehouseCodes: ["YS8-CK-01", "YS8-CK-02", "YS8-CK-03", "YS8-CK-04"],
    },
    zeroCounts,
    summary: {
      exactEmptyBusinessBaseline: true,
      checkedBusinessObjectKinds:
        MANUAL_ACCEPTANCE_EMPTY_BASELINE_PROBES.length,
      allTrackedCountsZero: true,
      units: CORE_UNIT_CODES.length,
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
  const taskPlan = buildManualAcceptanceTaskDataPlan({ ...printInput, nowSec: taskSchedule.anchorUnix });
  for (const key of ["sourceID", "sourceType", "prefix", "batchRunId", "copyRevision", "taskProfile"]) reports.task[key] = taskPlan[key];
  reports.task.summary.persisted = taskPlan.tasks.length;
  reports.facts.referenceRecords = {
    shipments: Array.from({ length: 47 }, (_, index) => ({
      id: 120_000 + index,
      shipmentNo: `SIM-SDF-SHIP-${String(index + 1).padStart(3, "0")}`,
      status: index < 45 ? "SHIPPED" : index === 45 ? "DRAFT" : "CANCELLED",
      financeReleaseStatus: index < 45 ? "APPROVED" : "PENDING",
      financeReleaseProcessInstanceID: index < 45 ? 210_000 + index : null,
      financeReleaseProcessNodeID: index < 45 ? 230_000 + index : null,
      financeApprovalTaskID: index < 45 ? 240_000 + index : null,
      financeApprovalProcessNodeID: index < 45 ? 220_000 + index : null,
      financeApprovalTaskCode:
        index < 45
          ? `PROC-${210_000 + index}-NODE-${220_000 + index}-A1`
          : null,
      items:
        index === 0
          ? Array.from({ length: 25 }, (_, itemIndex) => ({
              id: itemIndex + 1,
            }))
          : [],
    })),
    financeFacts,
  };
  reports.facts.financeFieldContract = financeFieldContract;
  reports.readiness.customerKey = "yoyoosun";
  reports.readiness.runtimePreflight = {
    target: printInput.target,
    customerKey: "yoyoosun",
    configRevision: printInput.configRevision,
  };
  reports.readiness.reportInputs = {
    factReport: {
      financeFieldContract,
    },
    taskReport: {
      taskGroupCoverageDigest: taskCoverage.catalogScenarioDigest,
    },
  };
  reports.readiness.probes = taskCoverage.probes;
  reports.readiness.summary = {
    ...reports.readiness.summary,
    taskGroupCoverage: taskCoverage.summary,
    financeFieldEvidenceComplete: true,
  };
  reports.readiness.financeFieldContract = financeFieldContract;
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
          revision: MANUAL_ACCEPTANCE_DATASET_RUNNER_CONTRACT,
          handlerId: `${MANUAL_ACCEPTANCE_DATASET_RUNNER_CONTRACT}:${stageKey}`,
          logicFingerprintContract:
            MANUAL_ACCEPTANCE_DATASET_STAGE_LOGIC_FINGERPRINT_CONTRACT,
          logicFingerprint: fingerprints.get(stageKey),
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
    sourceScaleProfile,
    chainDataDigest: currentPlan.chainDataDigest,
    chainVerificationDigest: currentPlan.chainVerificationDigest,
    taskSchedule,
    target: {
      alias: targetAlias,
      policyTarget: printInput.target,
      backendURL: printInput.backendURL,
      databaseName: printInput.databaseName,
    },
    databaseRebuildProof,
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
    currentPlan,
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

async function scenarioBrowserEvidenceFixture() {
  // Pure component checks use in-memory canonical identities; no shared report is created or renamed.
  const fixture = await datasetApplyEvidenceFixture();
  const { printInput, reports, datasetReport } = fixture;
  Object.assign(printInput, {
    target: "scenario-demo",
    backendURL: "http://127.0.0.1:8300",
    databaseName: "plush_erp",
    configRevision: LOCAL_MANUAL_ACCEPTANCE_CONFIG_REVISION,
  });
  const expected = buildManualAcceptanceDatasetTargetPlan({
    targetAlias: "scenario-demo",
    sourceScaleProfile: "volume",
    databaseName: printInput.databaseName,
  });
  for (const report of Object.values(reports)) {
    Object.assign(report, {
      target: printInput.target,
      backendURL: printInput.backendURL,
      databaseName: printInput.databaseName,
    });
  }
  Object.assign(reports.core, {
    configRevision: printInput.configRevision,
    configProductVersion: LOCAL_MANUAL_ACCEPTANCE_CONFIG_PRODUCT_VERSION,
    configApplyPurpose: LOCAL_MANUAL_ACCEPTANCE_CONFIG_APPLY_PURPOSE,
    configDatasetVersion: null,
    configTarget: null,
  });
  Object.assign(reports.source, {
    sourceScaleProfile: "volume",
    scale: expected.semanticPlan.stages.find((stage) => stage.key === "source")
      .expected.scale,
  });
  Object.assign(reports.baseline, {
    contract: PERSISTENT_BASELINE_REPORT_CONTRACT,
    scope: "manual-acceptance-persistent-target-baseline",
    runtimeIdentity: {
      databaseName: "plush_erp",
      proof: "matched-v1",
      release: null,
      migration: null,
    },
    customerConfig: Object.fromEntries(
      Object.entries(reports.core).filter(([key]) => key.startsWith("config")),
    ),
    summary: {
      exactEmptyBusinessBaseline: false,
      legacyDataPreserved: true,
      currentBatchGuard: "component-exact-create-or-readback",
    },
  });
  Object.assign(datasetReport, {
    sourceScaleProfile: "volume",
    semanticDigest: expected.semanticDigest,
    chainDataDigest: expected.chainDataDigest,
    chainVerificationDigest: expected.chainVerificationDigest,
    target: { ...expected.target },
  });
  const fingerprints = resolveManualAcceptanceDatasetStageLogicFingerprints();
  const components = {};
  const componentDigests = {};
  for (const stage of datasetReport.stages) {
    const reportPath = path.join(
      repoRoot,
      "output/qa/manual-acceptance/datasets",
      printInput.dataVersion,
      "scenario-demo",
      stage.key,
      ["baseline", "readiness"].includes(stage.key)
        ? "verify-report.json"
        : "apply-report.json",
    );
    components[stage.key] = { path: reportPath, report: reports[stage.key] };
    componentDigests[stage.key] = digestManualAcceptanceDatasetComponentReport(
      reports[stage.key],
    );
    stage.references.runner.logicFingerprint = fingerprints.get(stage.key);
    stage.semanticDigest = expected.semanticDigest;
  }
  Object.assign(datasetReport.freshEmptyBaseline, {
    origin: "persistent_target_baseline",
    lifecycle: "long-lived",
    reportPath: components.baseline.path,
    componentDigest: componentDigests.baseline,
  });
  return { ...fixture, dataset: datasetReport, components, componentDigests };
}

test("shared scenario browser is explicit, keeps 51 targets, and rejects other origins", () => {
  const options = parseManualAcceptanceBrowserArgs([
    "--plan",
    "--scenario-demo-shared-local",
    "--base-url",
    "http://127.0.0.1:15200",
    "--backend-url",
    "http://127.0.0.1:8300",
  ]);
  const plan = buildManualAcceptanceBrowserPlan(options);
  assert.equal(options.scenarioDemoSharedLocal, true);
  assert.equal(plan.target, "scenario-demo");
  assert.equal(plan.targets.length, 51);
  assert.equal(plan.writesBusinessData, false);
  assert.equal(plan.recordsLegalNoticeAcknowledgement, true);
  for (const backendURL of [
    "http://localhost:8300",
    "http://127.0.0.1:8310",
    "https://demo.yoyoosun.net",
  ]) {
    assert.throws(
      () => buildManualAcceptanceBrowserPlan({ ...options, backendURL }),
      /登记的 scenario-demo/u,
    );
  }
  assert.throws(
    () =>
      buildManualAcceptanceBrowserPlan({
        ...options,
        baseURL: "https://demo.yoyoosun.net",
      }),
    /登记的 scenario-demo/u,
  );
  assert.throws(
    () =>
      buildManualAcceptanceBrowserPlan({
        ...options,
        target: "customer-trial-133",
      }),
    /登记的 scenario-demo/u,
  );
  assert.throws(
    () =>
      buildManualAcceptanceBrowserPlan({
        ...options,
        scenarioDemoSharedLocal: false,
        target: "scenario-demo",
      }),
    /显式启用/u,
  );
  assert.throws(
    () =>
      buildManualAcceptanceBrowserPlan({
        ...options,
        scenarioDemoSharedLocal: "false",
      }),
    /显式布尔值/u,
  );
});

test("shared scenario browser only accepts its original canonical report paths", async () => {
  const root = path.join(repoRoot, "output/qa/manual-acceptance/datasets");
  const tail = `${CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION}/scenario-demo/dataset/apply-report.json`;
  assert.equal(
    resolveManualAcceptanceDatasetReportRoot({
      datasetReportPath: path.join(root, tail),
      dataVersion: CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
      targetAlias: "scenario-demo",
    }),
    root,
  );
  for (const reportPath of [
    path.join(root, "lifecycle/example", tail),
    path.join(root, tail.replace("scenario-demo", "local")),
    path.join(root, tail.replace("scenario-demo", "arbitrary")),
    path.join(root, tail.replace("apply-report", "copied-report")),
  ]) {
    assert.throws(
      () =>
        resolveManualAcceptanceDatasetReportRoot({
          datasetReportPath: reportPath,
          dataVersion: CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
          targetAlias: "scenario-demo",
        }),
      /canonical 或 lifecycle path/u,
    );
  }
  const printInput = {
    target: "scenario-demo",
    dataVersion: CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
  };
  const report = path.join(
    root,
    CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
    "scenario-demo/browser/report.json",
  );
  assert.equal(
    assertManualAcceptanceBrowserReportPathBinding(report, printInput),
    report,
  );
  assert.throws(
    () =>
      assertManualAcceptanceBrowserReportPathBinding(
        report.replace("scenario-demo", "local"),
        printInput,
      ),
    /scenario-demo browser report/u,
  );
  await assert.rejects(
    verifyManualAcceptanceDatasetApplyReportBinding({
      printInput: { ...printInput, backendURL: "http://127.0.0.1:8300" },
      datasetReportPath: path.join(root, tail),
    }),
    /显式启用/u,
  );
});

test("shared scenario evidence uses the real volume plan, current stage fingerprints and persistent baseline", async () => {
  const fixture = await scenarioBrowserEvidenceFixture();
  try {
    const binding = assertScenarioDemoBrowserDataset(fixture);
    assert.equal(binding.exactEmptyBusinessBaseline, false);
    assert.equal(binding.legacyDataPreserved, true);
    assert.equal(binding.currentStageLogicVerified, true);
    assert.equal(binding.lifecycle, "long-lived");
    const changes = [
      (value) => {
        value.printInput.target = "local-dev";
      },
      (value) => {
        value.printInput.databaseName = "arbitrary_database";
      },
      (value) => {
        value.printInput.sourceRunId = "OLD-BATCH";
      },
      (value) => {
        value.dataset.target.alias = "local";
      },
      (value) => {
        value.dataset.sourceScaleProfile = "acceptance";
      },
      (value) => {
        value.components.source.report.sourceScaleProfile = "acceptance";
      },
      (value) => {
        value.components.source.report.scale.salesOrders = 45;
      },
      (value) => {
        value.dataset.semanticDigest = "a".repeat(64);
      },
      (value) => {
        value.dataset.stages[0].references.runner.logicFingerprint = "a".repeat(
          64,
        );
      },
      (value) => {
        value.dataset.stages.pop();
      },
      (value) => {
        value.dataset.freshEmptyBaseline.lifecycle = "disposable";
      },
      (value) => {
        value.dataset.freshEmptyBaseline.origin = "fresh_empty_baseline";
      },
      (value) => {
        value.components.baseline.report.summary.exactEmptyBusinessBaseline = true;
      },
      (value) => {
        value.components.core.report.configRevision = "other";
      },
    ];
    for (const change of changes) {
      const value = structuredClone(fixture);
      change(value);
      assert.throws(() => assertScenarioDemoBrowserDataset(value));
    }
  } finally {
    await fs.rm(fixture.outputRoot, { recursive: true, force: true });
  }
});

test("shared runtime binds clean SHA separately from the official local version and never publishes private environment", async () => {
  const migrations = (
    await fs.readdir(path.join(repoRoot, "server/internal/data/model/migrate"))
  )
    .filter((file) => /^\d{14}_.+\.sql$/u.test(file))
    .sort();
  const migration = migrations.at(-1).slice(0, 14);
  const printInput = {
    target: "scenario-demo",
    backendURL: "http://127.0.0.1:8300",
    databaseName: "plush_erp",
    dataVersion: CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
    sourceRunId: CURRENT_MANUAL_ACCEPTANCE_RUN_ID,
  };
  const repository = {
    commit: "a".repeat(40),
    dirty: false,
    fingerprint: "b".repeat(64),
  };
  const bundle = {
    id: "11111111-1111-4111-8111-111111111111",
    migrationVersion: migration,
    sourceFingerprint: "c".repeat(64),
    backendSourceFingerprint: "d".repeat(64),
    artifactHash: "e".repeat(64),
  };
  const source = {
    fingerprint: "f".repeat(64),
    backendFingerprint: "d".repeat(64),
    environment: { secret: "never-publish" },
  };
  const requests = [];
  const runtime = {
    readRepository: async () => repository,
    readBundle: () => bundle,
    readSource: async () => source,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, headers: { get: () => "matched-v1" } };
    },
  };
  const result = await verifyScenarioDemoBrowserRuntimeIdentity(
    printInput,
    runtime,
  );
  const version = `local-${bundle.id}`;
  assert.equal(result.release, version);
  assert.equal(result.repository.commit, repository.commit);
  assert.equal(result.sourceFingerprint, source.fingerprint);
  assert.equal(JSON.stringify(result).includes("never-publish"), false);
  assert.equal(
    requests[0].options.headers["X-ERP-Expected-Runtime-Identity-SHA256"],
    createHash("sha256")
      .update(["release-v1", "plush_erp", version, migration].join("\n"))
      .digest("hex"),
  );
  for (const change of [
    { readRepository: async () => ({ ...repository, dirty: true }) },
    { readBundle: () => null },
    {
      readBundle: () => ({
        ...bundle,
        backendSourceFingerprint: "0".repeat(64),
      }),
    },
    { readBundle: () => ({ ...bundle, migrationVersion: "20200101000000" }) },
  ]) {
    let fetched = false;
    await assert.rejects(
      verifyScenarioDemoBrowserRuntimeIdentity(printInput, {
        ...runtime,
        ...change,
        fetchImpl: async () => {
          fetched = true;
          throw new Error("must not probe");
        },
      }),
      /clean SHA/u,
    );
    assert.equal(fetched, false);
  }
  await assert.rejects(
    verifyScenarioDemoBrowserRuntimeIdentity(printInput, {
      ...runtime,
      fetchImpl: async () => ({ ok: false, headers: { get: () => null } }),
    }),
    /后端运行身份/u,
  );
  let reads = 0;
  await assert.rejects(
    verifyScenarioDemoBrowserRuntimeIdentity(printInput, {
      ...runtime,
      readRepository: async () => ({
        ...repository,
        commit: ++reads === 1 ? repository.commit : "0".repeat(40),
      }),
    }),
    /repository.*changed/u,
  );
});

test("shared authenticated identity uses the permitted session read and rejects live config drift", async () => {
  const printInput = {
    target: "scenario-demo",
    backendURL: "http://127.0.0.1:8300",
    databaseName: "plush_erp",
    dataVersion: CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
    sourceRunId: CURRENT_MANUAL_ACCEPTANCE_RUN_ID,
    configRevision: LOCAL_MANUAL_ACCEPTANCE_CONFIG_REVISION,
  };
  const storageState = {
    origins: [
      {
        origin: "http://127.0.0.1:15200",
        localStorage: [
          { name: "admin_access_token", value: "memory-only-token" },
        ],
      },
    ],
  };
  const session = {
    source: "active_customer_config_revision",
    customer: { key: "yoyoosun" },
    configRevision: LOCAL_MANUAL_ACCEPTANCE_CONFIG_REVISION,
    configProductVersion: LOCAL_MANUAL_ACCEPTANCE_CONFIG_PRODUCT_VERSION,
    configApplyPurpose: LOCAL_MANUAL_ACCEPTANCE_CONFIG_APPLY_PURPOSE,
  };
  const requests = [];
  const run = (currentSession = session) =>
    verifyScenarioDemoBrowserSession({
      printInput,
      storageState,
      baseURL: "http://127.0.0.1:15200",
      fetchImpl: async (url, options) => {
        const body = JSON.parse(options.body);
        requests.push({ url, method: body.method });
        assert.deepEqual(body.params, { customer_key: "yoyoosun" });
        assert.equal(url, "http://127.0.0.1:8300/rpc/customer_config");
        assert.equal(body.method, "get_effective_session");
        const data = { session: currentSession };
        return { ok: true, json: async () => ({ result: { code: 0, data } }) };
      },
    });
  const result = await run();
  assert.equal(result.configRevision, session.configRevision);
  assert.equal(JSON.stringify(result).includes("memory-only-token"), false);
  assert.deepEqual(
    requests.map((request) => request.method),
    ["get_effective_session"],
  );
  await assert.rejects(
    run({ ...session, configRevision: "other" }),
    /当前 active 配置/u,
  );
  await assert.rejects(
    run({ ...session, source: "fallback" }),
    /当前 active 配置/u,
  );
});

test("manual acceptance browser plan covers all 51 catalog targets and ten formal accounts", () => {
  const plan = buildManualAcceptanceBrowserPlan({
    baseURL: "http://127.0.0.1:15200",
    backendURL: "http://localhost:8300",
  });

  assert.equal(plan.writesDatabase, true);
  assert.equal(plan.businessDataReadOnly, true);
  assert.equal(plan.writesBusinessData, false);
  assert.equal(plan.recordsLegalNoticeAcknowledgement, true);
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

  const uatPlan = buildManualAcceptanceBrowserPlan({
    baseURL: "http://127.0.0.1:15200",
    backendURL: "https://demo.yoyoosun.net",
    target: "customer-trial-133",
  });
  assert.equal(
    uatPlan.passwordEnvironmentVariable,
    "MANUAL_ACCEPTANCE_UAT_PASSWORD",
  );
  assert.ok(
    uatPlan.formalAccounts.every((account) => /^uat_/u.test(account.username)),
  );
  assert.ok(
    uatPlan.exceptionAccounts.every((account) =>
      /^uat_/u.test(account.username),
    ),
  );
  assert.equal(
    plan.targets.filter((item) => item.username === "demo_admin").length,
    2,
  );
  assert.equal(
    plan.targets.find((item) => item.key === "business-dashboard")?.username,
    "demo_boss",
  );
  assert.equal(
    plan.targets.find((item) => item.key === "global-dashboard")?.username,
    "demo_boss",
  );
  assert.equal(
    plan.targets.find((item) => item.key === "task-board")?.username,
    "demo_boss",
  );
  assert.equal(
    plan.targets.find((item) => item.key === "shipping-release")?.username,
    "demo_finance",
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

test("finance browser evidence binds page headers and representative values", () => {
  const financeFieldContract = inspectFinanceFieldContract(
    financeFieldFixture(),
  );
  const receivable = evaluateFinanceFieldBrowserEvidence({
    targetKey: "receivables",
    headers: ["单号", "收款分类", "账期", "到期日期", "取消记录"],
    rows: [
      [
        "AR-FIELD-001",
        "应收款",
        "月结 30 天",
        formatUnixDate(1_791_705_600),
        "-",
      ],
    ],
    representatives: financeFieldContract.representatives,
  });
  assert.equal(receivable.passed, true);

  const payable = evaluateFinanceFieldBrowserEvidence({
    targetKey: "payables",
    headers: ["单号", "账期", "到期日期", "取消记录"],
    rows: [["AP-FIELD-001", "发生即到期", formatUnixDate(1_789_113_600), "-"]],
    representatives: financeFieldContract.representatives,
  });
  assert.equal(payable.passed, true);
});

test("manual acceptance browser boundary isolates legal acknowledgement from business data", () => {
  assert.deepEqual(MANUAL_ACCEPTANCE_BROWSER_BOUNDARY, {
    readOnly: false,
    writesDatabase: true,
    businessDataReadOnly: true,
    writesBusinessData: false,
    recordsLegalNoticeAcknowledgement: true,
    clicksBusinessWriteActions: false,
    callsBusinessMutationRPC: false,
    storesPasswordValue: false,
    storesAccessToken: false,
    storesAuthorizationHeader: false,
    allowedInteractions: [
      "login",
      "legal_notice_acknowledgement",
      "route_navigation",
      "read_only_tab_navigation",
      "read_only_filter_changes",
      "read_only_pagination",
    ],
  });
});

test("browser and backend URLs fail closed outside localhost", () => {
  for (const value of [
    "https://example.com",
    "http://192.168.0.133:15200",
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

test("CLI requires explicit local or registered trial frontend and backend origins", () => {
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
    /must be local or the registered customer-trial TLS origin/,
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

test("CLI help and active docs keep isolated defaults and explicit shared browser inputs", async () => {
  const help = getManualAcceptanceBrowserHelp();
  assert.match(help, /--backend-url http:\/\/127\.0\.0\.1:8310/u);
  const [isolatedHelp, sharedHelp] = help.split(
    "  node scripts/qa/manual-acceptance-browser.mjs --plan --scenario-demo-shared-local",
  );
  assert.doesNotMatch(isolatedHelp, /--backend-url http:\/\/127\.0\.0\.1:8300/u);
  assert.match(sharedHelp, /--backend-url http:\/\/127\.0\.0\.1:8300/u);
  assert.match(help, /2026\.09\.27-v8\/local\/dataset\/apply-report\.json/u);
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
  for (const [, command] of readme.matchAll(/```bash\n([\s\S]*?)```/gu)) {
    if (command.includes("manual-acceptance-browser.mjs") &&
      command.includes("--backend-url http://127.0.0.1:8300")) {
      assert.match(command, /--scenario-demo-shared-local/u);
    }
  }
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
    dataVersion: "2026.09.27-v8",
    runId: "20260927-V8",
    target: "local-dev",
    backendURL: "http://127.0.0.1:8310",
    databaseName: "plush_erp_acceptance_local_fixture_dev",
    semanticDigest: "digest-v5",
    prefix: "YS8",
    runtime,
    referenceRecords: {
      purchaseOrders: [
        {
          orderNo: "YS8-CG-013",
          items: Array.from({ length: 25 }, () => ({})),
        },
      ],
      outsourcingOrders: [
        {
          orderNo: "YS8-WW-013",
          items: Array.from({ length: 25 }, () => ({})),
        },
      ],
      bomVersions: [
        {
          version: "YS8-BOM-013-1",
          items: Array.from({ length: 25 }, () => ({})),
        },
      ],
    },
  };
  const financeFacts = financeFieldFixture();
  const financeFieldContract = inspectFinanceFieldContract(financeFacts);
  const fact = {
    ...source,
    reportContract: "source-driven-operational-facts-v1",
    referenceRecords: {
      ...source.referenceRecords,
      financeFacts,
    },
    financeFieldContract,
  };
  assert.deepEqual(assertBoundSimulatedPrintReports(source, fact), {
    datasetKey: "yoyoosun-manual-acceptance",
    dataVersion: "2026.09.27-v8",
    runId: "20260927-V8",
    sourceRunId: "20260927-V8",
    factRunId: "20260927-V8",
    target: "local-dev",
    backendURL: "http://127.0.0.1:8310",
    databaseName: "plush_erp_acceptance_local_fixture_dev",
    semanticDigest: "digest-v5",
    sourcePrefix: "YS8",
    configRevision: "customer-config-v5",
    financeFieldDigest: financeFieldContract.digest,
    financeRepresentatives: financeFieldContract.representatives,
    printRecords: {
      purchaseOrder: { recordQuery: "YS8-CG-013", lineCount: 25 },
      outsourcingOrder: { recordQuery: "YS8-WW-013", lineCount: 25 },
      bomVersion: { recordQuery: "YS8-BOM-013-1", lineCount: 25 },
    },
    runtimeAttestation: null,
  });
  const activeOnlyBOMSource = {
    ...source,
    referenceRecords: {
      ...source.referenceRecords,
      bomVersions: [
        { version: "YS8-BOM-001-2", items: Array.from({ length: 3 }) },
      ],
    },
    steps: [
      {
        target: "bom_version",
        key: "YS8-BOM-013-1",
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
      referenceRecords: {
        ...activeOnlyBOMSource.referenceRecords,
        financeFacts,
      },
      financeFieldContract,
    }),
    assertBoundSimulatedPrintReports(source, fact),
  );
  const visibleBOMSource = {
    ...source,
    referenceRecords: {
      ...source.referenceRecords,
      bomVersions: [
        {
          version: "YS8-BOM-005-1",
          status: "ARCHIVED",
          items: Array.from({ length: 25 }),
        },
        {
          version: "YS8-BOM-005-3",
          status: "DRAFT",
          items: Array.from({ length: 25 }),
        },
      ],
    },
  };
  assert.equal(
    assertBoundSimulatedPrintReports(visibleBOMSource, {
      ...visibleBOMSource,
      reportContract: "source-driven-operational-facts-v1",
      referenceRecords: {
        ...visibleBOMSource.referenceRecords,
        financeFacts,
      },
      financeFieldContract,
    }).printRecords.bomVersion.recordQuery,
    "YS8-BOM-005-3",
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
  assert.throws(
    () =>
      assertBoundSimulatedPrintReports(source, {
        ...fact,
        semanticDigest: "previous-source-recipe",
      }),
    /同一批次/u,
  );
});

test("remote browser evidence binds the exact readiness batch and canonical report path", () => {
  const taskBatch = manualAcceptanceTaskBatchIdentity("20260927-V8", {
    taskProfile: TASK_PROFILE_LONG_LIVED_WORKBENCH,
  });
  const taskCoverage = taskGroupCoverageFixture();
  const runtimeAttestation = {
    source: "out-of-band",
    release: "a".repeat(40),
    migration: "20260927100348",
  };
  const financeFieldContract = inspectFinanceFieldContract(
    financeFieldFixture(),
  );
  const printInput = {
    datasetKey: "yoyoosun-manual-acceptance",
    dataVersion: "2026.09.27-v8",
    runId: "20260927-V8",
    sourceRunId: "20260927-V8",
    target: "customer-trial-133",
    backendURL: "https://demo.yoyoosun.net",
    databaseName: "plush_erp_demo_v1",
    semanticDigest: "digest-v5",
    sourcePrefix: "YS8",
    configRevision: "customer-trial-v5",
    financeFieldDigest: financeFieldContract.digest,
    financeRepresentatives: financeFieldContract.representatives,
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
        financeFieldContract,
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
        taskProfile: TASK_PROFILE_LONG_LIVED_WORKBENCH,
        copyRevision: LONG_LIVED_WORKBENCH_TASK_COPY_REVISION,
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
      financeFieldEvidenceComplete: true,
      manualAcceptanceCompleted: false,
      taskGroupCoverage: taskCoverage.summary,
    },
    probes: taskCoverage.probes,
    financeFieldContract,
    targets,
  };
  const binding = assertManualAcceptanceBrowserReadinessBinding(
    readiness,
    printInput,
  );
  assert.equal(binding.datasetSubstrateVerified, true);
  assert.equal(binding.browserOnlyNotProvenTargets, 10);
  assert.equal(binding.taskSourceID, taskBatch.sourceID);
  assert.equal(binding.taskProfile, TASK_PROFILE_LONG_LIVED_WORKBENCH);
  assert.equal(
    binding.taskCopyRevision,
    LONG_LIVED_WORKBENCH_TASK_COPY_REVISION,
  );
  assert.equal(binding.taskVisibleCodePrefixes.boss, "YS-WB3-LD");
  assert.equal(binding.taskGroupCoverage.complete, true);

  const canonical = resolveManualAcceptanceBrowserReportPath(
    "output/qa/manual-acceptance/datasets/2026.09.27-v8/customer-trial-133/browser/report.json",
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
  const mixedTaskProfile = structuredClone(readiness);
  mixedTaskProfile.reportInputs.taskReport.taskProfile = "acceptance-snapshot";
  assert.throws(
    () =>
      assertManualAcceptanceBrowserReadinessBinding(
        mixedTaskProfile,
        printInput,
      ),
    /批次或运行态身份不一致/u,
  );
  const mixedCopyRevision = structuredClone(readiness);
  mixedCopyRevision.reportInputs.taskReport.copyRevision = "WORKBENCH1";
  assert.throws(
    () =>
      assertManualAcceptanceBrowserReadinessBinding(
        mixedCopyRevision,
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
        dataVersion: "2026.09.27-v8",
        sourceRunId: "20260927-V8",
        target: "local-dev",
        backendURL: "http://127.0.0.1:8310",
        databaseName: "plush_erp_acceptance_local_fixture_dev",
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
        }),
      /attachments stage component digest/u,
    );
  } finally {
    await fs.rm(fixture.outputRoot, { recursive: true, force: true });
  }
});

test("default browser rejects stale recipes and unregistered profiles before runtime or login", async () => {
  const mutations = [
    (fixture) => {
      const previousRecipe = structuredClone(fixture.currentPlan.semanticPlan);
      delete previousRecipe.productionRecipe;
      fixture.datasetReport.semanticDigest =
        digestManualAcceptanceSemanticPlan(previousRecipe);
      assert.notEqual(
        fixture.datasetReport.semanticDigest,
        fixture.currentPlan.semanticDigest,
      );
      for (const stage of fixture.datasetReport.stages) {
        stage.semanticDigest = fixture.datasetReport.semanticDigest;
      }
    },
    (fixture) => {
      fixture.datasetReport.chainDataDigest = "a".repeat(64);
    },
    (fixture) => {
      fixture.datasetReport.chainVerificationDigest = "a".repeat(64);
    },
    (fixture) => {
      fixture.datasetReport.stages.find((stage) => stage.key === "facts")
        .references.runner.logicFingerprint = "a".repeat(64);
    },
    (fixture) => {
      delete fixture.datasetReport.sourceScaleProfile;
    },
    (fixture) => {
      fixture.datasetReport.sourceScaleProfile = "unknown";
    },
    (fixture) => {
      fixture.reports.source.sourceScaleProfile = "volume";
    },
    (fixture) => {
      delete fixture.reports.source.sourceScaleProfile;
    },
    (fixture) => {
      fixture.reports.source.scale.materials += 1;
    },
  ];
  for (const remote of [false, true]) {
    for (const mutate of mutations) {
      const fixture = await datasetApplyEvidenceFixture({ remote });
      let fetchCalls = 0;
      try {
        mutate(fixture);
        const stage = fixture.datasetReport.stages.find(
          (entry) => entry.key === "source",
        );
        await fs.writeFile(
          fixture.sourceReportPath,
          `${JSON.stringify(fixture.reports.source, null, 2)}\n`,
        );
        stage.references.runner.componentDigest =
          digestManualAcceptanceDatasetComponentReport(fixture.reports.source);
        await fs.writeFile(
          fixture.datasetReportPath,
          `${JSON.stringify(fixture.datasetReport, null, 2)}\n`,
        );
        await assert.rejects(
          verifyManualAcceptanceBrowserDatasetBinding({
            backendURL: fixture.printInput.backendURL,
            datasetReportPath: fixture.datasetReportPath,
            sourceReportPath: fixture.sourceReportPath,
            factReportPath: fixture.factReportPath,
            readinessReportPath: fixture.readinessReportPath,
            printInput: fixture.printInput,
            fetchImpl: async () => {
              fetchCalls += 1;
              throw new Error("must reject recipe before network access");
            },
          }),
          /当前.*配方|sourceScaleProfile/u,
        );
        assert.equal(fetchCalls, 0);
      } finally {
        await fs.rm(fixture.outputRoot, { recursive: true, force: true });
      }
    }
  }
});

test("default browser binds both registered source scales to the current plan independently of source semantic identity", async () => {
  for (const remote of [false, true]) {
    const fixture = await datasetApplyEvidenceFixture({
      remote,
      sourceScaleProfile: "volume",
    });
    try {
      const binding = await verifyManualAcceptanceDatasetApplyReportBinding({
        datasetReportPath: fixture.datasetReportPath,
        sourceReportPath: fixture.sourceReportPath,
        factReportPath: fixture.factReportPath,
        readinessReportPath: fixture.readinessReportPath,
        printInput: fixture.printInput,
      });
      assert.equal(binding.datasetSemanticDigest, fixture.datasetSemanticDigest);
      assert.notEqual(binding.datasetSemanticDigest, fixture.printInput.semanticDigest);
    } finally {
      await fs.rm(fixture.outputRoot, { recursive: true, force: true });
    }
  }
});

test("remote browser binding compares the database rebuild proof by canonical value", async () => {
  const fixture = await datasetApplyEvidenceFixture({ remote: true });
  try {
    const reorderedProof = Object.fromEntries(
      Object.entries(fixture.datasetReport.databaseRebuildProof).reverse(),
    );
    assert.notEqual(
      JSON.stringify(reorderedProof),
      JSON.stringify(fixture.reports.baseline.databaseRebuildProof),
    );
    const reorderedDatasetReport = {
      ...fixture.datasetReport,
      databaseRebuildProof: reorderedProof,
    };
    await fs.writeFile(
      fixture.datasetReportPath,
      `${JSON.stringify(reorderedDatasetReport, null, 2)}\n`,
      "utf8",
    );
    const binding = await verifyManualAcceptanceDatasetApplyReportBinding({
      datasetReportPath: fixture.datasetReportPath,
      sourceReportPath: fixture.sourceReportPath,
      factReportPath: fixture.factReportPath,
      readinessReportPath: fixture.readinessReportPath,
      printInput: fixture.printInput,
    });
    assert.equal(binding.baseline.exactEmptyBusinessBaseline, true);

    const tamperedRebuildProof = structuredClone(reorderedDatasetReport);
    tamperedRebuildProof.databaseRebuildProof.release = "e".repeat(40);
    await fs.writeFile(
      fixture.datasetReportPath,
      `${JSON.stringify(tamperedRebuildProof, null, 2)}\n`,
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
        }),
      /fresh empty baseline/u,
    );
  } finally {
    await fs.rm(fixture.outputRoot, { recursive: true, force: true });
  }
});

test("dataset report root only accepts canonical or one controlled lifecycle run", () => {
  const dataVersion = "2026.09.27-v8";
  const targetAlias = "local";
  const datasetRoot = path.join(
    repoRoot,
    "output/qa/manual-acceptance/datasets",
  );
  assert.equal(
    resolveManualAcceptanceDatasetReportRoot({
      datasetReportPath: path.join(
        datasetRoot,
        dataVersion,
        targetAlias,
        "dataset/apply-report.json",
      ),
      dataVersion,
      targetAlias,
    }),
    datasetRoot,
  );
  assert.equal(
    resolveManualAcceptanceDatasetReportRoot({
      datasetReportPath: path.join(
        datasetRoot,
        "lifecycle/final_run_1",
        dataVersion,
        targetAlias,
        "dataset/apply-report.json",
      ),
      dataVersion,
      targetAlias,
    }),
    path.join(datasetRoot, "lifecycle/final_run_1"),
  );
  for (const invalidPath of [
    path.join(
      datasetRoot,
      "scratch/final_run_1",
      dataVersion,
      targetAlias,
      "dataset/apply-report.json",
    ),
    path.join(
      datasetRoot,
      "lifecycle/final_run_1/nested",
      dataVersion,
      targetAlias,
      "dataset/apply-report.json",
    ),
    path.join(
      datasetRoot,
      "lifecycle/INVALID-RUN",
      dataVersion,
      targetAlias,
      "dataset/apply-report.json",
    ),
  ]) {
    assert.throws(
      () =>
        resolveManualAcceptanceDatasetReportRoot({
          datasetReportPath: invalidPath,
          dataVersion,
          targetAlias,
        }),
      /canonical 或 lifecycle path/u,
    );
  }
});

test("dataset binding rejects evidence redirected through an external symlink", async () => {
  const fixture = await datasetApplyEvidenceFixture();
  const externalRoot = await fs.mkdtemp(
    path.join("/tmp", "plush-browser-dataset-external-"),
  );
  try {
    const externalReportPath = path.join(externalRoot, "apply-report.json");
    await fs.copyFile(fixture.datasetReportPath, externalReportPath);
    await fs.unlink(fixture.datasetReportPath);
    await fs.symlink(externalReportPath, fixture.datasetReportPath);
    await assert.rejects(
      () =>
        verifyManualAcceptanceDatasetApplyReportBinding({
          datasetReportPath: fixture.datasetReportPath,
          sourceReportPath: fixture.sourceReportPath,
          factReportPath: fixture.factReportPath,
          readinessReportPath: fixture.readinessReportPath,
          printInput: fixture.printInput,
        }),
      /真实路径不是受控 canonical path/u,
    );
  } finally {
    await fs.rm(fixture.outputRoot, { recursive: true, force: true });
    await fs.rm(externalRoot, { recursive: true, force: true });
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
        }),
      /没有完整完成全部 canonical stages/u,
    );
  } finally {
    await fs.rm(incomplete.outputRoot, { recursive: true, force: true });
  }

  const invalidFingerprint = await datasetApplyEvidenceFixture();
  try {
    delete invalidFingerprint.datasetReport.stages.find(
      (stage) => stage.key === "facts",
    ).references.runner.logicFingerprint;
    await fs.writeFile(
      invalidFingerprint.datasetReportPath,
      `${JSON.stringify(invalidFingerprint.datasetReport, null, 2)}\n`,
      "utf8",
    );
    await assert.rejects(
      () =>
        verifyManualAcceptanceDatasetApplyReportBinding({
          datasetReportPath: invalidFingerprint.datasetReportPath,
          sourceReportPath: invalidFingerprint.sourceReportPath,
          factReportPath: invalidFingerprint.factReportPath,
          readinessReportPath: invalidFingerprint.readinessReportPath,
          printInput: invalidFingerprint.printInput,
        }),
      /没有完整完成全部 canonical stages/u,
    );
  } finally {
    await fs.rm(invalidFingerprint.outputRoot, {
      recursive: true,
      force: true,
    });
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

test("taskGroup coverage ignores source workflow probes without role scenarios", () => {
  const taskCoverage = taskGroupCoverageFixture();
  const readiness = {
    reportInputs: {
      taskReport: {
        taskGroupCoverageDigest: taskCoverage.catalogScenarioDigest,
      },
    },
    summary: { taskGroupCoverage: taskCoverage.summary },
    probes: [
      ...taskCoverage.probes,
      {
        id: "workflow-tasks:shipment_finance_approval",
        requiredScenarios: [],
        requiredTaskGroups: [],
        taskGroupCounts: {},
        missingTaskGroups: [],
        unknownTaskGroups: [],
        enoughTaskGroups: true,
        scenarioCounts: {},
        missingScenarios: [],
        unknownScenarios: [],
        enoughScenarios: true,
      },
    ],
  };

  assert.equal(
    assertManualAcceptanceTaskGroupCoverage(readiness).complete,
    true,
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

test("browser target retries only bounded pure HTTP 429 failures and retains evidence", async () => {
  const rateLimited = {
    passed: false,
    runtimeErrors: [
      {
        type: "response",
        message: "429 http://127.0.0.1:15200/rpc/quality",
      },
      {
        type: "console",
        message:
          "Failed to load resource: the server responded with a status of 429 (Too Many Requests)",
      },
    ],
    failureScreenshot: "output/qa/first-failure.png",
  };
  assert.equal(isRetryableTargetRateLimitFailure(rateLimited), true);
  assert.equal(
    isRetryableTargetRateLimitFailure({
      ...rateLimited,
      runtimeErrors: [
        ...rateLimited.runtimeErrors,
        { type: "response", message: "500 http://127.0.0.1:15200/rpc/quality" },
      ],
    }),
    false,
  );

  const waits = [];
  let attempts = 0;
  const recovered = await runTargetWithRateLimitRetry(
    async () => {
      attempts += 1;
      return attempts === 1
        ? rateLimited
        : { passed: true, runtimeErrors: [], dataEvidence: { proven: true } };
    },
    {
      waitImpl: async (milliseconds) => waits.push(milliseconds),
      retryDelayMs: 25,
    },
  );
  assert.equal(attempts, 2);
  assert.deepEqual(waits, [25]);
  assert.equal(recovered.passed, true);
  assert.equal(recovered.rateLimitRetryEvidence.length, 1);
  assert.equal(
    recovered.rateLimitRetryEvidence[0].failureScreenshot,
    "output/qa/first-failure.png",
  );

  attempts = 0;
  const defaultWaits = [];
  const recoveredAfterDefaultWindow = await runTargetWithRateLimitRetry(
    async () => {
      attempts += 1;
      return attempts < 4
        ? rateLimited
        : { passed: true, runtimeErrors: [], dataEvidence: { proven: true } };
    },
    {
      waitImpl: async (milliseconds) => defaultWaits.push(milliseconds),
    },
  );
  assert.equal(attempts, 4);
  assert.deepEqual(defaultWaits, [10_000, 20_000, 30_000]);
  assert.equal(recoveredAfterDefaultWindow.passed, true);
  assert.equal(recoveredAfterDefaultWindow.rateLimitRetryEvidence.length, 3);

  attempts = 0;
  const persistent = await runTargetWithRateLimitRetry(
    async () => {
      attempts += 1;
      return rateLimited;
    },
    { waitImpl: async () => {}, maxAttempts: 3, retryDelayMs: 0 },
  );
  assert.equal(attempts, 3);
  assert.equal(persistent.passed, false);
  assert.equal(persistent.rateLimitRetryEvidence.length, 3);
});

test("formal login retries only bounded pure HTTP 429 failures", async () => {
  const rateLimited = Object.assign(new Error("formal login rate limited"), {
    runtimeErrors: [
      {
        type: "response",
        message: "429 http://127.0.0.1:15200/rpc/admin",
      },
      {
        type: "console",
        message:
          "Failed to load resource: the server responded with a status of 429 (Too Many Requests)",
      },
    ],
  });
  assert.equal(isRetryableFormalLoginRateLimitFailure(rateLimited), true);

  const mixedFailure = Object.assign(new Error("formal login failed"), {
    runtimeErrors: [
      ...rateLimited.runtimeErrors,
      { type: "response", message: "500 http://127.0.0.1:15200/rpc/admin" },
    ],
  });
  assert.equal(isRetryableFormalLoginRateLimitFailure(mixedFailure), false);

  const waits = [];
  let attempts = 0;
  const recovered = await runFormalLoginWithRateLimitRetry(
    async () => {
      attempts += 1;
      if (attempts === 1) throw rateLimited;
      return { passed: true };
    },
    {
      waitImpl: async (milliseconds) => waits.push(milliseconds),
      retryDelayMs: 25,
    },
  );
  assert.deepEqual(recovered, { passed: true });
  assert.equal(attempts, 2);
  assert.deepEqual(waits, [25]);

  attempts = 0;
  await assert.rejects(
    runFormalLoginWithRateLimitRetry(
      async () => {
        attempts += 1;
        throw mixedFailure;
      },
      { waitImpl: async () => {}, retryDelayMs: 0 },
    ),
    mixedFailure,
  );
  assert.equal(attempts, 1);

  attempts = 0;
  await assert.rejects(
    runFormalLoginWithRateLimitRetry(
      async () => {
        attempts += 1;
        throw rateLimited;
      },
      { waitImpl: async () => {}, maxAttempts: 3, retryDelayMs: 0 },
    ),
    rateLimited,
  );
  assert.equal(attempts, 3);
});

test("scoped totals accept current pagination units and reject unrelated or contradictory counts", () => {
  for (const label of ["第 1–20 单，共 45 单", "第 1-10 条 / 共 45 条", "共 45 条", "不限状态，共 45 条"]) {
    assert.deepEqual(readScopedPageTotal([label]).total, 45);
  }
  assert.equal(readScopedPageTotal(["第 1–10 项，共 20 项"]).total, 20);
  assert.equal(readScopedPageTotal(["合同金额45 库存100 当前页20"]).total, null);
  assert.equal(readScopedPageTotal(["共45条", "不限状态，共44条"]).consistent, false);
  assert.equal(readScopedPageTotal([]).total, null);
});

test("shipment list readiness waits for its selected current status scope and rendered rows", () => {
  const originalDocument = globalThis.document;
  try {
    let label = "不限状态，共 47 条";
    let rows = [{}];
    globalThis.document = {
      querySelector: () => ({ querySelector: () => ({ getAttribute: () => label }) }),
      querySelectorAll: () => rows,
    };
    assert.equal(shipmentListReady(47), true);
    assert.equal(shipmentListReady(46), false);
    label = "不限状态，共 48 条";
    assert.equal(shipmentListReady(47), false);
    label = "不限状态，共 47 条";
    rows = [];
    assert.equal(shipmentListReady(47), false);
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

test("shipment release browser evidence proves live due-soon and overdue categories", () => {
  const schedule = buildManualAcceptanceTaskSchedule(2_000_000_000);
  const rows = [
    { code: "YS-V8-CK-02", text: "YS-V8-CK-02 可执行 即将到期" },
    { code: "YS-V8-CK-13", text: "YS-V8-CK-13 阻塞 已超时" },
    { code: "YS-V8-CK-16", text: "YS-V8-CK-16 已完成" },
    { code: "YS-V8-CK-19", text: "YS-V8-CK-19 退回" },
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
      [...rows, { code: "YS-V8-CK-20", text: "其他仓库任务" }],
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
        batchPrefix: "YS8",
      },
    ],
  };
  assert.equal(
    evaluateCurrentBatchListEvidence({
      currentBatch,
      currentBatchDOM: {
        mode: "source_prefix",
        identifier: "YS8",
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
        identifier: "YS8",
        visibleItems: 20,
        matchingCurrentBatchItems: 20,
        currentBatchVisible: true,
      },
      renderedItems: 20,
      pageReportedTotal: 60,
      minimumRecords: 60,
      quantityScope: { mode: "filtered_prefix", unit: "records", scopeVerified: true, total: 60, expectedTotal: 60, renderedRows: 20, matchingRows: 20, totalConsistent: true, scope: { search: "YS8" } },
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
            batchPrefix: "YS8",
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
  assert.equal(currentBatch.probes[0].batchPrefix, "YS8");
  assert.deepEqual(resolveCurrentBatchListFilter(customers, currentBatch, {}), {
    mode: "source_prefix",
    identifier: "YS8",
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

test("no-search current-batch pages use only their exact visible business number", () => {
  const plan = buildManualAcceptanceBrowserPlan({});
  for (const [targetKey, identifier] of [
    ["production-exceptions", "TEST-YS-260716V5-SCYC001"],
    ["finance-payments", "TEST-YS-260716V5-SK903"],
  ]) {
    const target = plan.targets.find((item) => item.key === targetKey);
    assert.ok(target);
    assert.deepEqual(
      resolveCurrentBatchListFilter(
        target,
        { dataStatus: "pass", actual: 1, probes: [] },
        {
          dataset: {
            currentBatchIdentifiers: { [targetKey]: identifier },
          },
        },
      ),
      { mode: "visible_exact_business_number", identifier },
    );
  }

  const customer = plan.targets.find((item) => item.key === "customers");
  assert.deepEqual(
    resolveCurrentBatchListFilter(
      customer,
      { dataStatus: "pass", actual: 1, probes: [] },
      {
        dataset: {
          currentBatchIdentifiers: { customers: "YS8-KH-001" },
        },
      },
    ),
    { mode: "exact_business_number", identifier: "YS8-KH-001" },
  );
});

test("source document searches exclude related generated orders and reject another batch", () => {
  assert.equal(sourceDocumentSearchPrefix("YS8", "YS8-CG-013"), "YS8-CG-");
  assert.equal(sourceDocumentSearchPrefix("YS8", "YS8-BOM-005-3"), "YS8-BOM-");
  assert.throws(
    () => sourceDocumentSearchPrefix("YS8", "YS7-CG-013"),
    /当前批次/u,
  );
  assert.throws(
    () => sourceDocumentSearchPrefix("YS8", "YS8-013"),
    /业务类别/u,
  );
  const result = resolveCurrentBatchListFilter(
    { key: "accessories-purchase" },
    { probes: [{ batchEvidence: "prefix_filtered", batchPrefix: "YS8" }] },
    { printRecords: { purchaseOrder: { recordQuery: "YS8-CG-013" } } },
  );
  assert.deepEqual(result, { mode: "source_prefix", identifier: "YS8-CG-" });
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
    quantityScope: { mode: "filtered_prefix", unit: "records", scopeVerified: true, total: 20, expectedTotal: 20, renderedRows: 20, matchingRows: 20, totalConsistent: true, scope: { search: prefix } },
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

test("task board waits for its loaded search control before current-batch filtering", async () => {
  const source = await fs.readFile(scriptPath, "utf8");
  const filterStart = source.indexOf(
    "async function filterVisibleListToCurrentBatch",
  );
  const filterEnd = source.indexOf(
    "export function evaluateCurrentBatchListEvidence",
    filterStart,
  );
  const filterSource = source.slice(filterStart, filterEnd);
  const taskBoardIndex = filterSource.indexOf('target.key === "task-board"');
  const exactSearchIndex = filterSource.indexOf(
    'getByPlaceholder("订单 / 产品 / 物料 / 款号", {',
  );
  const visibleWaitIndex = filterSource.indexOf(
    'state: "visible"',
    exactSearchIndex,
  );
  const fillIndex = filterSource.indexOf(
    "await search.fill(filter.identifier)",
  );
  assert.ok(filterStart >= 0);
  assert.ok(filterEnd > filterStart);
  assert.ok(taskBoardIndex >= 0);
  assert.ok(exactSearchIndex > taskBoardIndex);
  assert.ok(visibleWaitIndex > exactSearchIndex);
  assert.ok(fillIndex > visibleWaitIndex);
  assert.match(
    filterSource,
    /else \{[\s\S]*?input\[placeholder\*="搜"\],input\[placeholder\^="操作人"\]/u,
  );
  assert.match(filterSource, /没有可用于当前批次核对的搜索框/u);
});

test("mobile current-batch proof requires an exact role source and a visible current-batch task", () => {
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
    visibleCurrentBatchTaskCount: 1,
    minimumRecords: 20,
    currentBatch,
  });
  assert.equal(passing.minimumSatisfied, true);
  const longLivedPrefix = "YS-WB3-XS";
  assert.equal(
    evaluateMobileCurrentBatchEvidence({
      roleKey,
      todoCount: 14,
      doneCount: 6,
      visibleCurrentBatchTaskCount: 1,
      minimumRecords: 20,
      currentBatch: {
        ...currentBatch,
        probes: [
          {
            ...currentBatch.probes[0],
            exactTaskCodePrefix: longLivedPrefix,
          },
        ],
      },
      taskCodePrefix: longLivedPrefix,
    }).minimumSatisfied,
    true,
  );
  assert.equal(
    evaluateMobileCurrentBatchEvidence({
      roleKey,
      todoCount: 20,
      doneCount: 20,
      visibleCurrentBatchTaskCount: 1,
      minimumRecords: 20,
      currentBatch,
    }).minimumSatisfied,
    true,
  );
  assert.equal(
    evaluateMobileCurrentBatchEvidence({
      roleKey,
      todoCount: 20,
      doneCount: 20,
      visibleCurrentBatchTaskCount: 0,
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
      visibleCurrentBatchTaskCount: 1,
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

  const requirements = [
    { key: "customers", label: "客户", minimumRecords: 60 },
    { key: "shipping-release", label: "出货放行", minimumRecords: 45 },
  ];
  assert.equal(
    evaluateBusinessDashboardEvidence({ total: 60, ids: [1] }, requirements)
      .minimumSatisfied,
    true,
  );
  assert.equal(
    evaluateBusinessDashboardEvidence({ total: null, ids: [] }, requirements)
      .minimumSatisfied,
    false,
  );
  assert.equal(
    evaluateBusinessDashboardEvidence({ total: 3, ids: [1] }, requirements)
      .minimumSatisfied,
    false,
  );
});

test("dashboard task evidence binds the visible page to the exact current batch", () => {
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
    (_, index) => `YS-V8-LD-${String(index + 1).padStart(2, "0")}`,
  );
  const currentPageTaskCodes = exactTaskCodes.slice(0, 8);
  assert.equal(
    evaluateDashboardTaskCurrentBatchEvidence({
      evidence: base,
      currentBatch,
      roleKey: "boss",
      visibleTaskCodes: ["YS-V8-LD-01"],
      currentBatchTaskCodes: currentPageTaskCodes,
    }).minimumSatisfied,
    true,
  );
  const longLivedPrefix = "YS-WB3-LD";
  assert.equal(
    evaluateDashboardTaskCurrentBatchEvidence({
      evidence: base,
      currentBatch: {
        ...currentBatch,
        probes: [
          {
            ...currentBatch.probes[0],
            exactTaskCodePrefix: longLivedPrefix,
          },
        ],
      },
      roleKey: "boss",
      taskCodePrefix: longLivedPrefix,
      visibleTaskCodes: [`${longLivedPrefix}-01`],
      currentBatchTaskCodes: Array.from(
        { length: 18 },
        (_, index) =>
          `${longLivedPrefix}-${String(index + 1).padStart(2, "0")}`,
      ),
    }).minimumSatisfied,
    true,
  );
  assert.equal(
    evaluateDashboardTaskCurrentBatchEvidence({
      evidence: base,
      currentBatch,
      roleKey: "boss",
      visibleTaskCodes: ["OLD-LD-01"],
      currentBatchTaskCodes: currentPageTaskCodes,
    }).minimumSatisfied,
    false,
  );
  assert.equal(
    evaluateDashboardTaskCurrentBatchEvidence({
      evidence: base,
      currentBatch,
      roleKey: "boss",
      visibleTaskCodes: ["YS-V8-LD-01"],
      currentBatchTaskCodes: [],
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
    "YS-V8-SC-01",
    "YS-V8-SC-02",
    "YS-V8-SC-03",
    "YS-V8-SC-04",
  ];
  assert.equal(
    evaluateDashboardTaskCurrentBatchEvidence({
      evidence: base,
      currentBatch: exceptionBatch,
      roleKey: "production",
      taskGroup: "production_exception",
      visibleTaskCodes: ["YS-V8-SC-01"],
      currentBatchTaskCodes: exceptionCodes,
    }).minimumSatisfied,
    true,
  );
  for (const invalidCodes of [
    [],
    [...exceptionCodes, "YS-V8-SC-05"],
    [exceptionCodes[0], exceptionCodes[0], ...exceptionCodes.slice(2)],
  ]) {
    assert.equal(
      evaluateDashboardTaskCurrentBatchEvidence({
        evidence: base,
        currentBatch: exceptionBatch,
        roleKey: "production",
        taskGroup: "production_exception",
        visibleTaskCodes: ["YS-V8-SC-01"],
        currentBatchTaskCodes: invalidCodes,
      }).minimumSatisfied,
      false,
    );
  }
});

test("progress evidence binds counts and exact visible orders to current-batch sources", () => {
  const evidence = evaluateBusinessDashboardEvidence(
    { total: 45, ids: [1, 2] },
    [
      {
        key: "orders",
        label: "订单",
        minimumRecords: 20,
        probeId: "sales-orders",
      },
    ],
  );
  const currentBatch = buildManualAcceptanceCurrentBatchReadiness({
    targets: [
      { id: "desktopPages:business-dashboard", dataStatus: "pass", actual: 45 },
    ],
    probes: [
      {
        id: "sales-orders",
        status: "pass",
        actual: 45,
        batchEvidence: "prefix_filtered",
      },
      {
        id: "business-progress",
        status: "pass",
        batchEvidence: "fresh_dataset_projection",
        progressCounts: { total: 45 },
        sampleOrderIDs: [1, 2, 3],
      },
    ],
  })["desktopPages:business-dashboard"];
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
      currentBatch,
      baselineProven: false,
    }).minimumSatisfied,
    false,
  );
  const wrongID = { ...evidence, sampleOrderIDs: [99] };
  assert.equal(
    evaluateBusinessDashboardCurrentBatchEvidence({
      evidence: wrongID,
      currentBatch,
      baselineProven: true,
    }).minimumSatisfied,
    false,
  );
  const wrongCount = { ...evidence, observedTotal: 46 };
  assert.equal(
    evaluateBusinessDashboardCurrentBatchEvidence({
      evidence: wrongCount,
      currentBatch,
      baselineProven: true,
    }).minimumSatisfied,
    false,
  );
  currentBatch.probes[0].batchEvidence = "not_proven";
  assert.equal(
    evaluateBusinessDashboardCurrentBatchEvidence({
      evidence,
      currentBatch,
      baselineProven: true,
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
    sourcePrefix: "YS8",
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
      sourcePrefix: "YS8",
      visibleRows: 20,
      matchingCurrentBatchRows: 20,
      filteredTotal: 45,
      minimumRecords: 45,
    }).minimumSatisfied,
    true,
  );
  assert.equal(
    evaluatePrintSourceMinimumEvidence({
      sourcePrefix: "YS8",
      visibleRows: 20,
      matchingCurrentBatchRows: 20,
      filteredTotal: 45,
      paginationTexts: ["共 46 条"],
      minimumRecords: 45,
    }).minimumSatisfied,
    false,
  );
  assert.equal(
    evaluatePrintSourceMinimumEvidence({
      sourcePrefix: "YS8",
      visibleRows: 5,
      matchingCurrentBatchRows: 4,
      paginationTexts: ["共 45 条"],
      minimumRecords: 5,
    }).minimumSatisfied,
    false,
  );
  assert.equal(
    evaluatePrintSourceMinimumEvidence({
      sourcePrefix: "YS8",
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

test("mobile task totals use the current tab's canonical aria label", () => {
  assert.equal(readMobileTaskTotal("todo", "全部，共 18 条"), 18);
  assert.equal(
    readMobileTaskTotal("done", "已办任务共 23 条，当前已加载 20 条"),
    23,
  );
  assert.equal(readMobileTaskTotal("done", "全部，共 18 条"), null);
  assert.equal(readMobileTaskTotal("todo", "已加载 18 条待处理"), null);
});

test("mobile task evidence waits for each lazy-loaded tab before reading zero", async () => {
  const source = await fs.readFile(scriptPath, "utf8");
  assert.match(source, /mobile-role-scroll/u);
  assert.match(source, /getAttribute\("aria-busy"\) === "false"/u);
  const doneNavigationIndex = source.indexOf(
    '.getByText("已办", { exact: true })',
  );
  const doneLoadedIndex = source.indexOf(
    "await waitForActiveViewLoaded();",
    doneNavigationIndex,
  );
  const doneTotalIndex = source.indexOf(
    'readCurrentTotal("done")',
    doneLoadedIndex,
  );
  assert.ok(doneNavigationIndex >= 0);
  assert.ok(doneLoadedIndex > doneNavigationIndex);
  assert.ok(doneTotalIndex > doneLoadedIndex);
  assert.match(source, /mobile-role-filter-all/u);
  assert.match(source, /mobile-role-done-count/u);
  assert.match(source, /todoTotal \+ Number\(doneTotalMatch\[1\] \|\| 0\)/u);
  assert.doesNotMatch(source, /已加载\\s\*\(\\d\+\)\\s\*条已办/u);
});

test("production order identifier prefers current visible records", () => {
  const identifiers = currentBatchFactIdentifiers({
    referenceRecords: {
      shipments: [],
      productionOrders: [
        { order_no: "TEST-CLOSED", status: "CLOSED" },
        { order_no: "TEST-DRAFT", status: "DRAFT" },
        { order_no: "TEST-RELEASED", status: "RELEASED" },
        { order_no: "TEST-CANCELLED", status: "CANCELLED" },
      ],
    },
  });
  assert.equal(identifiers["production-orders"], "TEST-RELEASED");
  assert.equal(
    currentBatchFactIdentifiers({
      referenceRecords: {
        shipments: [],
        productionOrders: [
          { order_no: "TEST-CLOSED", status: "CLOSED" },
          { order_no: "TEST-DRAFT", status: "DRAFT" },
        ],
      },
    })["production-orders"],
    "TEST-DRAFT",
  );
  assert.equal(
    currentBatchFactIdentifiers({
      referenceRecords: {
        shipments: [],
        productionOrders: [
          { order_no: "TEST-CLOSED", status: "CLOSED" },
          { order_no: "TEST-CANCELLED", status: "CANCELLED" },
        ],
      },
    })["production-orders"],
    null,
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
  assert.doesNotMatch(source.slice(currentBatchMinimumIndex, exactRecordIndex + 60), /search\.press\("Enter"\)/u);
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
  assert.match(source, /getByTestId\("legal-notice-acknowledge"\)/u);
  assert.match(source, /gate\.waitFor\(\{ state: "hidden"/u);
  assert.match(source, /legalNoticeAcknowledged/u);
  assert.match(source, /filter\.mode !== "visible_exact_business_number"/u);
  assert.match(source, /decision\?\.decision_no \|\| decision\?\.decisionNo/u);
  assert.match(source, /records\.financePayments/u);
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
    /locator\("button:visible"\)[\s\S]{0,180}getByText\(actionLabel,\s*\{\s*exact:\s*true\s*\}\)/u,
  );
  assert.match(
    source,
    /button\.innerText[\s\S]*=== label[\s\S]*!button\.disabled/u,
  );
});

test("permission center evidence follows the current employee-account tab", async () => {
  const source = await fs.readFile(scriptPath, "utf8");
  assert.match(source, /getByRole\("tab", \{ name: \/员工账号\/u \}\)/u);
  assert.equal(readScopedPageTotal(["命中 11/15 个员工账号"]).total, 11);
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
  assert.match(
    source,
    /getByPlaceholder\(BUSINESS_SEARCH_SCOPES\.lots\.placeholder/u,
  );
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
    "for (const account of plan.formalAccounts)",
  );
  assert.ok(printIndex > 0);
  assert.ok(formalAccountIndex > printIndex);
});

test("data-bound pages prove current DOM data before reading the generic page summary", async () => {
  const source = await fs.readFile(scriptPath, "utf8");
  const verifyStart = source.indexOf("async function verifyTarget(");
  const verifyEnd = source.indexOf(
    "async function attemptRejectedLogin(",
    verifyStart,
  );
  assert.ok(verifyStart > 0);
  assert.ok(verifyEnd > verifyStart);
  const verifySource = source.slice(verifyStart, verifyEnd);
  const dataEvidenceIndex = verifySource.indexOf("const dataEvidence =");
  const visibleSummaryIndex = verifySource.indexOf(
    "const visible = await readVisibleTextSummary(page)",
  );
  assert.ok(dataEvidenceIndex > 0);
  assert.ok(visibleSummaryIndex > dataEvidenceIndex);
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

test("readiness binding cannot replace canonical DOM minimum proof", () => {
  const records = Array.from({ length: 45 }, (_, offset) => ({ key: String(offset + 1), identifier: `F-${offset + 1}` }));
  const rows = [{ key: "1", cells: ["F-1"] }, { key: "999", cells: ["F-2"] }, { key: "2", cells: ["OLD-F-2"] }];
  assert.deepEqual(matchCanonicalDOMRows(rows, records), ["F-1"]);
  assert.deepEqual(matchCanonicalDOMRows([{ key: "2", cells: ["任务：F-2（来源）"] }], records), ["F-2"]);
  assert.deepEqual(matchCanonicalDOMRows([{ key: "2", cells: ["F-20"] }], records), []);
  const base = { currentBatch: { dataStatus: "pass", actual: 45 }, currentBatchDOM: { mode: "exact_business_number", matchingCurrentBatchItems: 1 }, renderedItems: 20, pageReportedTotal: 999, minimumRecords: 45 };
  assert.equal(evaluateCurrentBatchListEvidence(base).minimumSatisfied, false);
  assert.equal(evaluateCurrentBatchListEvidence({ ...base, quantityScope: { mode: "canonical_records", unit: "records", scopeVerified: true, total: 999, totalConsistent: true, canonicalMembershipVerified: true, matchedIdentifiers: matchCanonicalDOMRows(rows, records) } }).minimumSatisfied, false);
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
    /缺少目标验收账号密码/,
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
  assert.equal(plan.writesDatabase, true);
  assert.equal(plan.formalAccounts.length, 10);
});

test("list minimum rejects a single matching row among historical records", () => {
  for (const pageReportedTotal of [60, 999])
    assert.equal(
      evaluateCurrentBatchListEvidence({
        currentBatch: { dataStatus: "pass", actual: 60 },
        currentBatchDOM: {
          mode: "source_prefix",
          matchingCurrentBatchItems: 1,
          currentBatchVisible: true,
        },
        renderedItems: 20,
        pageReportedTotal,
        minimumRecords: 60,
      }).minimumSatisfied,
      false,
    );
});

test("current status-scope labels replace retired shipment summary text", () => {
  assert.equal(readScopedPageTotal(["不限状态，共 47 条"]).total, 47);
  assert.equal(readScopedPageTotal(["符合条件 47"]).total, null);
  assert.equal(readScopedPageTotal(["已出货，共 45 条"]).total, null);
});

test("a current-batch scoped total uses its actual page size without treating a representative as the batch", () => {
  const scoped = {
    mode: "filtered_prefix",
    unit: "records",
    scopeVerified: true,
    total: 45,
    expectedTotal: 45,
    renderedRows: 10,
    matchingRows: 10,
    totalConsistent: true,
    scope: { search: "YS8" },
  };
  const base = {
    currentBatch: { dataStatus: "pass", actual: 45 },
    currentBatchDOM: {
      mode: "source_prefix",
      identifier: "YS8",
      matchingCurrentBatchItems: 10,
    },
    renderedItems: 10,
    pageReportedTotal: 45,
    minimumRecords: 45,
    quantityScope: scoped,
    expectedUnit: "records",
  };
  assert.equal(evaluateCurrentBatchListEvidence(base).minimumSatisfied, true);
  for (const change of [
    { scopeVerified: false },
    { unit: "skus" },
    { totalConsistent: false },
    { total: null },
    { total: 999 },
    { matchingRows: 1 },
    { scope: { search: "OLD" } },
    { mode: "representative", total: 45, matchingRows: 1 },
  ]) {
    assert.equal(
      evaluateCurrentBatchListEvidence({
        ...base,
        quantityScope: { ...scoped, ...change },
      }).minimumSatisfied,
      false,
      JSON.stringify(change),
    );
  }
});

test("canonical UI quantities require distinct exact records, never a representative plus a global total", () => {
  const records = Array.from({ length: 45 }, (_, index) => ({
    key: String(index + 1),
    identifier: `F-${index + 1}`,
  }));
  const rows = records.map((record) => ({
    key: record.key,
    cells: [record.identifier],
  }));
  const matched = matchCanonicalDOMRows([...rows, rows[0]], records);
  assert.equal(matched.length, 45);
  const scope = {
    mode: "canonical_records",
    unit: "production-orders",
    scopeVerified: true,
    total: 999,
    totalConsistent: true,
    matchedIdentifiers: matched,
    canonicalIdentifiers: records.map((row) => row.identifier),
    canonicalMembershipVerified: true,
  };
  const base = {
    currentBatch: { dataStatus: "pass", actual: 47 },
    renderedItems: 20,
    pageReportedTotal: 999,
    minimumRecords: 45,
    expectedUnit: "production-orders",
    quantityScope: scope,
  };
  assert.equal(evaluateCurrentBatchListEvidence(base).minimumSatisfied, true);
  assert.equal(evaluateCurrentBatchListEvidence(base).observedTotal, 45);
  for (const change of [
    { matchedIdentifiers: [matched[0]] },
    { matchedIdentifiers: [...matched.slice(0, 44), "OTHER"] },
    { matchedIdentifiers: [...matched.slice(0, 44), matched[0]] },
    { unit: "skus" },
    { totalConsistent: false },
    { total: null },
  ]) {
    assert.equal(
      evaluateCurrentBatchListEvidence({
        ...base,
        quantityScope: { ...scope, ...change },
      }).minimumSatisfied,
      false,
    );
  }
});

test("canonical quantity traversal reads actual DOM pagination and stops when the minimum is proven", async () => {
  const saved = { document: globalThis.document, window: globalThis.window };
  const records = Array.from({ length: 45 }, (_, index) => ({
    key: String(index + 1),
    identifier: `F-${index + 1}`,
  }));
  const pages = [
    records.slice(0, 10),
    records.slice(10, 30),
    records.slice(30),
    [{ key: "999", identifier: "unneeded" }],
  ];
  let position = 0;
  let clicks = 0;
  const node = (text, attributes = {}) => ({
    textContent: text,
    getAttribute: (key) => attributes[key] || null,
    getBoundingClientRect: () => ({ width: 100, height: 20 }),
  });
  globalThis.window = { getComputedStyle: () => ({ visibility: "visible" }) };
  globalThis.document = {
    querySelector: (selector) => {
      assert.equal(selector, ".ant-spin-spinning");
      return null;
    },
    querySelectorAll: (selector) => {
      if (selector.includes(".ant-pagination-total-text"))
        return [
          node(
            `第 ${position * 20 + 1}–${position * 20 + pages[position].length} 条 / 共 100 条`,
          ),
        ];
      if (selector.includes(".ant-table-tbody"))
        return pages[position].map((record) => ({
          ...node(record.identifier, { "data-row-key": record.key }),
          querySelectorAll: (key) => {
            assert.equal(key, "td");
            return [node(record.identifier)];
          },
        }));
      if (
        selector.includes(".ant-table-thead") ||
        selector.includes(".erp-business-status-filters") ||
        selector.includes(".ant-spin-spinning")
      )
        return [];
      throw new Error(`unexpected DOM query ${selector}`);
    },
  };
  const next = {
    filter() {
      return this;
    },
    last() {
      return this;
    },
    async count() {
      return position < pages.length - 1 ? 1 : 0;
    },
    async click() {
      position += 1;
      clicks += 1;
    },
  };
  const page = {
    async waitForFunction(fn, arg) {
      assert.equal(Boolean(fn(arg)), true);
    },
    async evaluate(fn) {
      assert.equal(fn, readListDOMSnapshot);
      return fn();
    },
    locator(selector) {
      assert.equal(
        selector,
        ".ant-pagination-next:not(.ant-pagination-disabled)",
      );
      return next;
    },
  };
  try {
    const proof = await collectCanonicalQuantity(
      page,
      { key: "production-orders", title: "生产订单", minimumRecords: 45 },
      records,
      { status: "unrestricted" },
    );
    assert.equal(clicks, 2);
    assert.equal(proof.matchedIdentifiers.length, 45);
    assert.deepEqual(
      proof.pages.map((item) => item.renderedRows),
      [10, 20, 15],
    );
    assert.equal(proof.total, 100);
  } finally {
    for (const [key, value] of Object.entries(saved))
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
  }
});

test("only the registered environment audit scope is exempt from batch event identity", () => {
  const quantityScope = {
    mode: "environment_audit_records",
    unit: "system-audit-logs",
    currentBatchApplicable: false,
    scopeVerified: true,
    total: 189,
    totalConsistent: true,
  };
  const base = {
    currentBatch: {
      dataStatus: "pass",
      actual: 189,
      probes: [
        { id: "audit-events", status: "pass", batchEvidence: "not_applicable" },
      ],
    },
    renderedItems: 20,
    pageReportedTotal: 189,
    minimumRecords: 30,
    expectedUnit: "system-audit-logs",
    quantityScope,
  };
  assert.equal(evaluateCurrentBatchListEvidence(base).minimumSatisfied, true);
  assert.equal(
    evaluateCurrentBatchListEvidence({ ...base, expectedUnit: "customers" })
      .minimumSatisfied,
    false,
  );
  assert.equal(
    evaluateCurrentBatchListEvidence({
      ...base,
      currentBatch: { ...base.currentBatch, probes: [] },
    }).minimumSatisfied,
    false,
  );
  assert.equal(
    evaluateCurrentBatchListEvidence({
      ...base,
      pageReportedTotal: 29,
      quantityScope: { ...quantityScope, total: 29 },
    }).minimumSatisfied,
    false,
  );
});

test("projection caller accepts only its validated persistent baseline and matched current runtime", async () => {
  const fixture = await scenarioBrowserEvidenceFixture();
  try {
    const baseline = assertScenarioDemoBrowserDataset(fixture);
    const binding = {
      target: "scenario-demo",
      dataset: { targetAlias: "scenario-demo", baseline },
      runtimeIdentity: {
        databaseName: fixture.printInput.databaseName,
        proof: "matched-v1",
      },
    };
    assert.equal(browserProjectionBaselineProven(binding), true);
    assert.equal(
      browserProjectionBaselineProven({
        dataset: { baseline: { exactEmptyBusinessBaseline: true } },
      }),
      true,
    );
    for (const change of [
      (value) => {
        value.dataset.targetAlias = "local";
      },
      (value) => {
        value.dataset.baseline.currentStageLogicVerified = false;
      },
      (value) => {
        delete value.dataset.baseline.legacyDataPreserved;
      },
      (value) => {
        value.runtimeIdentity.databaseName = "wrong";
      },
      (value) => {
        value.runtimeIdentity.proof = "unmatched";
      },
    ]) {
      const value = structuredClone(binding);
      change(value);
      assert.equal(browserProjectionBaselineProven(value), false);
    }
  } finally {
    await fs.rm(fixture.outputRoot, { recursive: true, force: true });
  }
});

test("DOM reference sets preserve fact units, formal accounts and same-plan task codes", () => {
  const taskPlan = buildManualAcceptanceTaskDataPlan({
    runId: CURRENT_MANUAL_ACCEPTANCE_RUN_ID,
  });
  const task = { ...taskPlan, summary: { persisted: taskPlan.tasks.length } };
  const input = {
    facts: {
      referenceRecords: {
        productionOrders: [{ id: 1, order_no: "SC1", status: "RELEASED" }],
        inventoryLots: [{ id: 7, lot_no: "LOT7" }],
        inventoryBalances: [{ id: 99 }],
        financeFacts: [
          { id: 11, fact_no: "YS1", fact_type: "RECEIVABLE" },
          { id: 12, fact_no: "YF1", fact_type: "PAYABLE" },
        ],
      },
    },
    role: {
      target: "local-dev",
      formalAccountBootstrap: {
        accounts: [
          { id: 20, username: "demo_boss" },
          { id: 21, username: "other_boss" },
        ],
      },
    },
    task,
  };
  const records = buildCurrentBatchDOMRecords(input);
  assert.deepEqual(records.inventory, [{ key: "lots-7", identifier: "LOT7" }]);
  assert.deepEqual(
    matchCanonicalDOMRows(
      [{ key: "balances-7", cells: ["LOT7"] }],
      records.inventory,
    ),
    [],
  );
  assert.deepEqual(records.receivables, [{ key: "11", identifier: "YS1" }]);
  assert.deepEqual(records.payables, [{ key: "12", identifier: "YF1" }]);
  assert.deepEqual(records["permission-center"], [
    { key: "20", identifier: "demo_boss" },
  ]);
  assert.equal(records["task-board"].length, 20);
  assert.equal(records["task-board"][0].identifier, "YS-V8-LD-01");
  for (const key of [
    "sourceID",
    "sourceType",
    "prefix",
    "batchRunId",
    "copyRevision",
    "taskProfile",
  ]) {
    assert.throws(() =>
      buildCurrentBatchDOMRecords({
        ...input,
        task: { ...task, [key]: "wrong" },
      }),
    );
  }
});

test("product quantity is not inferred from its independent SKU source unit", () => {
  const quantityScope = {
    mode: "filtered_prefix",
    unit: "products",
    scopeVerified: true,
    total: 20,
    expectedTotal: 20,
    renderedRows: 20,
    matchingRows: 20,
    totalConsistent: true,
    scope: { search: "YS8" },
  };
  const base = {
    currentBatch: { dataStatus: "pass", actual: 60 },
    currentBatchDOM: { mode: "source_prefix", identifier: "YS8" },
    renderedItems: 20,
    pageReportedTotal: 20,
    minimumRecords: 20,
    expectedUnit: "products",
    quantityScope,
  };
  assert.equal(evaluateCurrentBatchListEvidence(base).minimumSatisfied, true);
  assert.equal(evaluateCurrentBatchListEvidence(base).observedTotal, 20);
  assert.equal(
    evaluateCurrentBatchListEvidence({
      ...base,
      quantityScope: { ...quantityScope, unit: "sku" },
    }).minimumSatisfied,
    false,
  );
});

test("both registered task profiles derive the boss DOM code set from the formal pure planner", () => {
  for (const options of [
    { runId: CURRENT_MANUAL_ACCEPTANCE_RUN_ID },
    {
      runId: CURRENT_MANUAL_ACCEPTANCE_RUN_ID,
      taskProfile: TASK_PROFILE_LONG_LIVED_WORKBENCH,
      target: "scenario-demo",
      dataVersion: CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
      backendURL: "http://127.0.0.1:8300",
      databaseName: "plush_erp",
    },
  ]) {
    const plan = buildManualAcceptanceTaskDataPlan(options);
    const report = { ...plan, summary: { persisted: plan.tasks.length } };
    const records = buildCurrentBatchDOMRecords({ task: report });
    assert.deepEqual(
      records["task-board"].map((record) => record.identifier),
      plan.tasks
        .filter((task) => task.roleKey === "boss")
        .map((task) => task.createParams.task_code),
    );
    assert.equal(records["task-board"].length, 20);
    assert.throws(() =>
      buildCurrentBatchDOMRecords({
        task: { ...report, summary: { persisted: 179 } },
      }),
    );
  }
});
