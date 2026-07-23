import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DEFAULT_MANUAL_ACCEPTANCE_DATA_VERSION,
  LOCAL_DATASET_TARGET,
  MANUAL_ACCEPTANCE_DATASET_STAGE_CAPABILITIES,
  MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS,
  MANUAL_ACCEPTANCE_DATASET_APPLY_LOCK_CONTRACT,
  MANUAL_ACCEPTANCE_DATASET_APPLY_REPORT_CONTRACT,
  ManualAcceptanceDatasetError,
  applyManualAcceptanceDataset,
  buildManualAcceptanceDatasetBundle,
  buildManualAcceptanceDatasetTargetPlan,
  buildManualAcceptanceSemanticPlan,
  deriveManualAcceptanceDatasetIdentity,
  digestManualAcceptanceSemanticPlan,
  evaluateManualAcceptanceTargetCapabilities,
  normalizeManualAcceptanceDataVersion,
  normalizeManualAcceptanceRunId,
  normalizeManualAcceptanceStageResult,
  manualAcceptanceDatasetApplyLockPath,
  manualAcceptanceDatasetApplyReportPath,
  parseManualAcceptanceDatasetArgs,
  runManualAcceptanceDatasetCli,
} from "./manual-acceptance-dataset.mjs";
import {
  MANUAL_ACCEPTANCE_DATASET_RUNNER_REVISION,
  MANUAL_ACCEPTANCE_DATASET_STAGE_REGISTRY,
  MANUAL_ACCEPTANCE_EMPTY_BASELINE_PROBES,
  MANUAL_ACCEPTANCE_TARGET_ADAPTER_KEYS,
  assertManualAcceptanceDatasetReadinessBoundary,
  digestManualAcceptanceDatasetComponentReport,
  verifyManualAcceptanceEmptyBaseline,
  verifyManualAcceptanceCoreReferences,
  manualAcceptanceDatasetStageReportPath,
} from "./manual-acceptance-dataset-runner.mjs";
import { evaluateManualAcceptanceOutsourcingInventoryCoverage } from "./manual-acceptance-fact-report-contract.mjs";
import {
  CUSTOMER_TRIAL_133_CONFIG_APPLY_PURPOSE,
  CUSTOMER_TRIAL_133_CONFIG_DATA_VERSION,
  CUSTOMER_TRIAL_133_CONFIG_PRODUCT_VERSION,
  CUSTOMER_TRIAL_133_CONFIG_REVISION,
  CUSTOMER_TRIAL_133_ORIGIN,
  CUSTOMER_TRIAL_133_TARGET,
} from "./manual-acceptance-target-policy.mjs";
import { buildManualAcceptanceTaskSchedule } from "./manual-acceptance-task-data.mjs";

const GENERATED_AT = "2026-07-15T01:02:03.000Z";
const LOCAL_APPLY_BACKEND = "http://127.0.0.1:18376";
const LOCAL_APPLY_DATABASE = "plush_erp_acceptance_20260716_v5_dev";
let runnerOutputSequence = 0;

test("component report digest treats undefined object fields as omitted JSON fields", () => {
  assert.equal(
    digestManualAcceptanceDatasetComponentReport({ ready: true }),
    digestManualAcceptanceDatasetComponentReport({
      ready: true,
      remoteOnly: undefined,
    }),
  );
  assert.throws(
    () =>
      digestManualAcceptanceDatasetComponentReport({
        items: [undefined],
      }),
    /unsupported JSON value undefined/u,
  );
});

function localApplyPlan(overrides = {}) {
  return buildManualAcceptanceDatasetTargetPlan({
    targetAlias: "local",
    backendURL: LOCAL_APPLY_BACKEND,
    databaseName: LOCAL_APPLY_DATABASE,
    generatedAt: GENERATED_AT,
    ...overrides,
  });
}

function localApplyBinding(plan) {
  return { confirmation: plan.target.expectedConfirmation };
}

function localApplyArgs() {
  const plan = localApplyPlan();
  return [
    "--apply",
    "--target",
    "local",
    "--backend-url",
    LOCAL_APPLY_BACKEND,
    "--database-name",
    LOCAL_APPLY_DATABASE,
    "--run-id",
    "20260716-V5",
    "--confirm",
    plan.target.expectedConfirmation,
  ];
}

function trialAttestation(
  release = "20c96d38a7b9e6d4f3c2b1a09876543210fedcba",
  migration = "20260714165115",
) {
  return {
    target: CUSTOMER_TRIAL_133_TARGET,
    origin: CUSTOMER_TRIAL_133_ORIGIN,
    customerKey: "yoyoosun",
    environment: "prod",
    release,
    migration,
    debug: {
      seedEnabled: false,
      seedAllowed: false,
      cleanupEnabled: false,
      cleanupAllowed: false,
      businessDataClearEnabled: false,
      businessDataClearAllowed: false,
    },
  };
}

function completedStageResult(
  context,
  { operation = "completed", summary = {}, references = {} } = {},
) {
  return {
    ok: true,
    status: "completed",
    stageKey: context.stage.key,
    dataVersion: context.dataVersion,
    semanticDigest: context.semanticDigest,
    operation,
    summary,
    references: {
      ...references,
      runner: {
        revision: MANUAL_ACCEPTANCE_DATASET_RUNNER_REVISION,
        handlerId: `${MANUAL_ACCEPTANCE_DATASET_RUNNER_REVISION}:${context.stage.key}`,
        componentEntrypoint: `fake/${context.stage.key}`,
        componentDigest: "a".repeat(64),
        reportPath: `/tmp/${context.stage.key}-report.json`,
      },
    },
  };
}

function fakeComponentReport({ stageKey, businessInput, targetAdapter }) {
  const factReferenceRecords =
    stageKey === "facts"
      ? {
          outsourcingFacts: Array.from({ length: 90 }, (_, index) => ({
            id: 10_000 + index,
            fact_no: `OUT-${index + 1}`,
            fact_type: index < 45 ? "MATERIAL_ISSUE" : "RETURN_RECEIPT",
            status: "POSTED",
            ...(index < 45 ? {} : { lot_id: 20_000 + index - 45 }),
          })),
          inventoryLots: Array.from({ length: 45 }, (_, index) => ({
            id: 20_000 + index,
          })),
          inventoryBalances: Array.from({ length: 45 }, (_, index) => ({
            id: 30_000 + index,
            lot_id: 20_000 + index,
            quantity: "1",
          })),
          inventoryTxns: Array.from({ length: 45 }, (_, index) => ({
            id: 40_000 + index,
            lot_id: 20_000 + index,
            txn_type: "IN",
            direction: 1,
            quantity: "1",
            source_type: "OUTSOURCING_FACT",
            source_id: 10_045 + index,
            source_line_id: 10_045 + index,
          })),
        }
      : null;
  const factCoverage = factReferenceRecords
    ? evaluateManualAcceptanceOutsourcingInventoryCoverage(factReferenceRecords)
    : null;
  return {
    mode: stageKey === "readiness" ? "verify" : "apply",
    scope: `fake-${stageKey}`,
    simulatedOnly: true,
    datasetKey: businessInput.datasetKey,
    dataVersion: businessInput.dataVersion,
    runId: businessInput.runId,
    target: targetAdapter.policyTarget,
    backendURL: targetAdapter.backendURL,
    databaseName: targetAdapter.databaseName,
    semanticDigest: `${stageKey}-component-digest`,
    ...(stageKey === "task"
      ? {
          schedule: buildManualAcceptanceTaskSchedule(
            Math.floor(Date.parse(businessInput.taskScheduleAnchorUtc) / 1000),
          ),
        }
      : {}),
    ...(factReferenceRecords ? { referenceRecords: factReferenceRecords } : {}),
    summary:
      stageKey === "facts"
        ? {
            purchaseReceipts: 54,
            qualityInspections: 54,
            businessDashboardInventoryTotal:
              factReferenceRecords.inventoryBalances.length,
            outsourcingReturnInventoryCoverage: factCoverage,
            records: 108,
          }
        : stageKey === "readiness"
          ? { queryEvidenceComplete: true, records: 50 }
          : { records: 1 },
  };
}

function fakeComponents({ onCall, override } = {}) {
  return Object.fromEntries(
    MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS.filter(
      (stageKey) => stageKey !== "purchase-quality",
    ).map((stageKey) => [
      stageKey,
      async (invocation) => {
        onCall?.(stageKey, invocation);
        if (override?.[stageKey]) {
          return override[stageKey](invocation);
        }
        const report = fakeComponentReport({ stageKey, ...invocation });
        return {
          report,
          operation: ["core", "baseline", "readiness"].includes(stageKey)
            ? "verified"
            : "applied",
        };
      },
    ]),
  );
}

function runnerDeps(options = {}) {
  return {
    now: options.now || (() => new Date(GENERATED_AT)),
    outputRoot:
      options.outputRoot ||
      path.join(
        os.tmpdir(),
        "plush-manual-acceptance-dataset-tests",
        `${process.pid}-${(runnerOutputSequence += 1)}`,
      ),
    credentials: {
      rolePassword: "role-password",
      adminPassword: "admin-password",
    },
    components: fakeComponents(options),
  };
}

function durableComponentReport({
  stageKey,
  businessInput,
  targetAdapter,
  configRevision = "local-config-v5",
}) {
  const report = fakeComponentReport({
    stageKey,
    businessInput,
    targetAdapter,
  });
  if (stageKey === "core") {
    Object.assign(report, {
      mode: "verify",
      configRevision,
      configProductVersion: "customer-trial-v5",
      configApplyPurpose: "customer_trial_apply",
      configDatasetVersion: businessInput.dataVersion,
      configTarget: targetAdapter.policyTarget,
      businessCodes: {
        unit: "YS5-DW-01",
        warehouses: ["YS5-CK-01", "YS5-CK-02", "YS5-CK-03", "YS5-CK-04"],
      },
    });
  }
  if (stageKey === "baseline") {
    const zeroCounts = Object.fromEntries(
      MANUAL_ACCEPTANCE_EMPTY_BASELINE_PROBES.map(({ key }) => [key, 0]),
    );
    Object.assign(report, {
      contract: "manual-acceptance-empty-baseline-report-v1",
      mode: "verify",
      runtimeIdentity: {
        scope: "database-v1",
        proof: "matched-v1",
        databaseName: targetAdapter.databaseName,
        release: null,
        migration: null,
      },
      customerConfig: {
        configRevision,
        configProductVersion: "customer-trial-v5",
        configApplyPurpose: "customer_trial_apply",
        configDatasetVersion: businessInput.dataVersion,
        configTarget: targetAdapter.policyTarget,
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
  }
  return report;
}

function durableRunnerDeps({
  outputRoot,
  onCall,
  override = {},
  configRevision = "local-config-v5",
  now = GENERATED_AT,
} = {}) {
  return {
    now: () => new Date(now),
    outputRoot,
    credentials: {
      rolePassword: "role-password",
      adminPassword: "admin-password",
    },
    components: Object.fromEntries(
      MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS.filter(
        (stageKey) => stageKey !== "purchase-quality",
      ).map((stageKey) => [
        stageKey,
        async (invocation) => {
          onCall?.(stageKey, invocation);
          if (override[stageKey]) return override[stageKey](invocation);
          return {
            operation: ["core", "baseline", "readiness"].includes(stageKey)
              ? "verified"
              : "applied",
            report: durableComponentReport({
              stageKey,
              configRevision,
              ...invocation,
            }),
          };
        },
      ]),
    ),
  };
}

test("dataset identity separates report version from safe script runId", () => {
  assert.equal(DEFAULT_MANUAL_ACCEPTANCE_DATA_VERSION, "2026.07.16-v5");
  assert.equal(
    normalizeManualAcceptanceDataVersion("2026.07.16-V5"),
    "2026.07.16-v5",
  );
  const identity = deriveManualAcceptanceDatasetIdentity();
  assert.deepEqual(identity, {
    datasetKey: "yoyoosun-manual-acceptance",
    dataVersion: "2026.07.16-v5",
    runId: "20260716-V5",
    dateAnchorUtc: "2026-07-16T12:00:00.000Z",
    dateAnchorUnix: Date.parse("2026-07-16T12:00:00.000Z") / 1000,
    prefixes: {
      core: "YS5",
      source: "YS5",
      task: "SIM-YOYOOSUN-UAT-TASK-20260716-V5",
      purchaseQuality: "SIM-YOYOOSUN-PQ-20260716-V5",
      facts: "SIM-YOYOOSUN-UAT-FACT-20260716-V5",
      attachments: "SIM-YOYOOSUN-UAT-ATT-20260716-V5",
    },
  });

  assert.throws(
    () => normalizeManualAcceptanceDataVersion("2026.07.15-v1"),
    /unsupported dataVersion 2026\.07\.15-v1.*current.*2026\.07\.16-v5/u,
  );

  assert.throws(
    () => normalizeManualAcceptanceDataVersion("UAT-20260715-V1"),
    /YYYY\.MM\.DD-vN/u,
  );
  assert.throws(
    () => normalizeManualAcceptanceDataVersion("2026.02.31-v1"),
    /invalid calendar date/u,
  );
  assert.throws(
    () => normalizeManualAcceptanceDataVersion("2026.07.15-v2"),
    /unsupported dataVersion/u,
  );
  assert.throws(
    () => normalizeManualAcceptanceDataVersion("2026.07.15-v0"),
    /YYYY\.MM\.DD-vN/u,
  );
  assert.equal(
    normalizeManualAcceptanceRunId("2026.07.16-v5", "20260716-V5"),
    "20260716-V5",
  );
  assert.throws(
    () => normalizeManualAcceptanceRunId("2026.07.16-v5", "20260716-V4"),
    /runId must be 20260716-V5/u,
  );
  assert.throws(
    () =>
      buildManualAcceptanceSemanticPlan({
        dataVersion: "2026.07.16-v5",
        runId: "20260716-V4",
      }),
    /runId must be 20260716-V5/u,
  );
});

test("bundle emits local and 133 plans with identical target-free semantics", () => {
  const bundle = buildManualAcceptanceDatasetBundle({
    generatedAt: GENERATED_AT,
    targetOverrides: {
      local: {
        backendURL: LOCAL_APPLY_BACKEND,
        databaseName: LOCAL_APPLY_DATABASE,
      },
      [CUSTOMER_TRIAL_133_TARGET]: {
        targetAttestation: trialAttestation(),
      },
    },
  });

  assert.equal(bundle.mode, "plan");
  assert.equal(bundle.dryRun, true);
  assert.equal(bundle.writesBackend, false);
  assert.equal(bundle.datasetKey, "yoyoosun-manual-acceptance");
  assert.equal(bundle.dataVersion, "2026.07.16-v5");
  assert.equal(bundle.runId, "20260716-V5");
  assert.match(bundle.semanticDigest, /^[0-9a-f]{64}$/u);
  assert.equal(bundle.cleanup, "retire/forward-only");
  assert.deepEqual(
    bundle.targets.map((item) => item.target.alias),
    [LOCAL_DATASET_TARGET, CUSTOMER_TRIAL_133_TARGET],
  );
  assert.equal(bundle.targets[0].target.backendURL, LOCAL_APPLY_BACKEND);
  assert.equal(bundle.targets[0].runId, "20260716-V5");
  assert.equal(bundle.targets[0].target.databaseName, LOCAL_APPLY_DATABASE);
  assert.equal(bundle.targets[1].target.backendURL, CUSTOMER_TRIAL_133_ORIGIN);
  assert.equal(bundle.targets[0].semanticDigest, bundle.semanticDigest);
  assert.equal(bundle.targets[1].semanticDigest, bundle.semanticDigest);
  assert.deepEqual(
    bundle.targets[0].semanticPlan,
    bundle.targets[1].semanticPlan,
  );
  assert.equal(bundle.parity.databaseIdsShared, false);
  assert.equal(bundle.targets[0].target.bindingReady, true);
  assert.equal(bundle.targets[0].target.applyReady, true);
  assert.deepEqual(
    bundle.targets[0].target.stageCapabilities.blockedStages,
    [],
  );
  assert.equal(bundle.targets[1].target.bindingReady, true);
  assert.equal(bundle.targets[1].target.applyReady, true);
  assert.deepEqual(
    bundle.targets[1].target.stageCapabilities.blockedStages,
    [],
  );

  const serializedSemanticPlan = JSON.stringify(bundle.targets[0].semanticPlan);
  for (const forbidden of [
    "http://",
    "https://",
    "generatedAt",
    "expectedConfigRevision",
    "releaseCommit",
    "databaseIds",
  ]) {
    assert.equal(
      serializedSemanticPlan.includes(forbidden),
      false,
      `semantic plan must exclude ${forbidden}`,
    );
  }
});

test("semantic digest is stable across targets and clocks and legacy versions fail closed", () => {
  const first = buildManualAcceptanceDatasetBundle({
    dataVersion: "2026.07.16-v5",
    generatedAt: "2026-07-15T00:00:00.000Z",
    targetOverrides: {
      local: { backendURL: "http://127.0.0.1:8300" },
      [CUSTOMER_TRIAL_133_TARGET]: {
        targetAttestation: trialAttestation(
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "20260714165115",
        ),
      },
    },
  });
  const second = buildManualAcceptanceDatasetBundle({
    dataVersion: "2026.07.16-V5",
    generatedAt: "2030-01-01T00:00:00.000Z",
    targetOverrides: {
      local: { backendURL: "http://localhost:9999" },
      [CUSTOMER_TRIAL_133_TARGET]: {
        targetAttestation: trialAttestation(
          "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          "20260715120000",
        ),
      },
    },
  });
  assert.equal(first.semanticDigest, second.semanticDigest);
  assert.deepEqual(
    first.targets[0].semanticPlan,
    second.targets[0].semanticPlan,
  );
  assert.equal(first.targets[0].semanticPlan.runId, "20260716-V5");
  assert.throws(
    () =>
      buildManualAcceptanceDatasetBundle({
        dataVersion: "2026.07.15-v1",
        generatedAt: GENERATED_AT,
      }),
    /unsupported dataVersion/u,
  );

  const reordered = {
    ...first.targets[0].semanticPlan,
    customerKey: first.targets[0].semanticPlan.customerKey,
  };
  assert.equal(
    digestManualAcceptanceSemanticPlan(reordered),
    first.semanticDigest,
  );
});

test("semantic plan locks the nine narrow stage contracts", () => {
  const plan = buildManualAcceptanceSemanticPlan();
  assert.deepEqual(plan.stageOrder, [...MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS]);
  assert.deepEqual(
    plan.stages.map((stage) => stage.key),
    [...MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS],
  );
  assert.equal(plan.cleanup, "retire/forward-only");
  assert.deepEqual(
    Object.fromEntries(
      plan.stages.map((stage) => [
        stage.key,
        {
          mode: stage.applyCapability.mode,
          supportedTargets: stage.applyCapability.supportedTargets,
        },
      ]),
    ),
    {
      core: {
        mode: "registered-targets-read-only",
        supportedTargets: ["local", CUSTOMER_TRIAL_133_TARGET],
      },
      baseline: {
        mode: "registered-targets-read-only",
        supportedTargets: ["local", CUSTOMER_TRIAL_133_TARGET],
      },
      role: {
        mode: "registered-targets",
        supportedTargets: ["local", CUSTOMER_TRIAL_133_TARGET],
      },
      source: {
        mode: "registered-targets",
        supportedTargets: ["local", CUSTOMER_TRIAL_133_TARGET],
      },
      task: {
        mode: "registered-targets",
        supportedTargets: ["local", CUSTOMER_TRIAL_133_TARGET],
      },
      "purchase-quality": {
        mode: "facts-integrated",
        supportedTargets: ["local", CUSTOMER_TRIAL_133_TARGET],
      },
      facts: {
        mode: "registered-targets",
        supportedTargets: ["local", CUSTOMER_TRIAL_133_TARGET],
      },
      attachments: {
        mode: "registered-targets",
        supportedTargets: ["local", CUSTOMER_TRIAL_133_TARGET],
      },
      readiness: {
        mode: "registered-targets-read-only",
        supportedTargets: ["local", CUSTOMER_TRIAL_133_TARGET],
      },
    },
  );
  assert.deepEqual(Object.keys(MANUAL_ACCEPTANCE_DATASET_STAGE_CAPABILITIES), [
    ...MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS,
  ]);
  assert.deepEqual(plan.runnerContract, {
    serial: true,
    failClosed: true,
    revision: MANUAL_ACCEPTANCE_DATASET_RUNNER_REVISION,
    handlerRegistry: "scripts/qa/manual-acceptance-dataset-runner.mjs",
    placeholders: {
      "${TARGET_POLICY_TARGET}": "target.policyTarget",
      "${TARGET_BACKEND_URL}": "target.backendURL",
      "${TARGET_CONFIRMATION}": "targetConfirmation",
      "${TARGET_ATTESTATION_JSON}": "targetAttestation",
    },
  });
  const core = plan.stages.find((stage) => stage.key === "core");
  assert.deepEqual(core.expected, { units: 1, warehouses: 4 });
  assert.equal(core.commands[0].entrypoint, "scripts/seed-core-demo-data.sh");
  assert.equal(core.commands[0].execution, "out-of-band-explicit-only");
  assert.equal(core.commands[0].defaultRunner, false);
  assert.deepEqual(core.commands[0].args, [
    "--references-only",
    "--expected-database",
    "plush_erp_acceptance_20260716_v5_dev",
    "--confirm",
    "SEED_MANUAL_ACCEPTANCE_CORE_REFERENCES:local-dev:plush_erp_acceptance_20260716_v5_dev:2026.07.16-v5:20260716-V5",
  ]);
  assert.equal(
    core.targetExecution[CUSTOMER_TRIAL_133_TARGET].seedAllowed,
    false,
  );
  assert.deepEqual(
    core.targetExecution[CUSTOMER_TRIAL_133_TARGET].allowedOperations,
    ["verified", "reused"],
  );
  assert.equal(core.commands[0].remoteSeedAllowed, false);
  assert.equal(core.commands[1].kind, "registered-read-only-verification");
  assert.deepEqual(core.commands[1].supportedTargets, [
    "local",
    CUSTOMER_TRIAL_133_TARGET,
  ]);

  const baseline = plan.stages.find((stage) => stage.key === "baseline");
  assert.equal(baseline.writesBusinessData, false);
  assert.equal(baseline.expected.exactEmptyBusinessBaseline, true);
  assert.equal(baseline.expected.units, 1);
  assert.equal(baseline.expected.warehouses, 4);
  assert.deepEqual(
    baseline.expected.businessObjectKinds,
    MANUAL_ACCEPTANCE_EMPTY_BASELINE_PROBES.map(({ key }) => key),
  );
  assert.equal(baseline.expected.exactCountPerBusinessObject, 0);
  assert.equal(baseline.commands[0].adminQueriesReadOnly, true);

  const role = plan.stages.find((stage) => stage.key === "role");
  assert.equal(role.expected.formalAccounts.length, 10);
  assert.equal(role.expected.scenarioAccounts.length, 3);
  assert.equal(
    role.targetExecution[CUSTOMER_TRIAL_133_TARGET].seedAllowed,
    false,
  );
  assert.equal(
    role.commands.at(-1).entrypoint,
    "scripts/qa/manual-acceptance-account-scenarios.mjs",
  );
  assert.deepEqual(role.commands.at(-1).supportedTargets, [
    "local",
    CUSTOMER_TRIAL_133_TARGET,
  ]);
  assert.equal(
    role.commands[0].environment.MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM,
    "APPLY_SIMULATED_ACCOUNT_SCENARIOS",
  );
  assert.equal(role.commands.length, 1);
  assert.equal(
    role.commands[0].entrypoint,
    "scripts/qa/manual-acceptance-account-scenarios.mjs",
  );
  assert.doesNotMatch(
    JSON.stringify(role),
    /seed-role-demo-admins|reset-password/u,
  );
  assert.deepEqual(role.commands[0].args, [
    "--apply",
    "--target",
    "${TARGET_POLICY_TARGET}",
    "--data-version",
    "2026.07.16-v5",
    "--run-id",
    "20260716-V5",
    "--backend-url",
    "${TARGET_BACKEND_URL}",
    "--audit-minimum",
    "30",
  ]);

  const source = plan.stages.find((stage) => stage.key === "source");
  assert.equal(source.expected.scale.customers, 60);
  assert.equal(source.expected.scale.products, 20);
  assert.equal(source.expected.scale.salesOrders, 45);
  assert.ok(source.commands[0].args.includes("20260716-V5"));
  assert.equal(
    source.commands[0].args[source.commands[0].args.indexOf("--target") + 1],
    "${TARGET_POLICY_TARGET}",
  );
  assert.equal(
    source.commands[0].args[
      source.commands[0].args.indexOf("--data-version") + 1
    ],
    "2026.07.16-v5",
  );
  assert.equal(source.commands[0].args.includes("--source-report"), false);

  const taskStage = plan.stages.find((stage) => stage.key === "task");
  assert.equal(taskStage.expected.tasks, 180);
  assert.equal(
    taskStage.expected.schedulePolicy.anchorSource,
    "fresh-dataset-apply-reused-on-resume",
  );
  assert.equal(
    taskStage.expected.schedulePolicy.dueSoonOffsetSeconds,
    23 * 60 * 60,
  );
  assert.equal(
    taskStage.commands[0].execution,
    MANUAL_ACCEPTANCE_DATASET_RUNNER_REVISION,
  );
  assert.equal(
    taskStage.commands[0].args[
      taskStage.commands[0].args.indexOf("--data-version") + 1
    ],
    "2026.07.16-v5",
  );
  assert.equal(
    taskStage.commands[0].args[
      taskStage.commands[0].args.indexOf("--source-report") + 1
    ],
    "output/qa/manual-acceptance/datasets/${DATA_VERSION}/${TARGET_ALIAS}/source/apply-report.json",
  );
  assert.equal(
    source.commands[0].environment.MANUAL_ACCEPTANCE_SIM_CONFIRM,
    "APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA",
  );
  assert.equal(
    taskStage.commands[0].environment.MANUAL_ACCEPTANCE_TASK_CONFIRM,
    "APPLY_SIMULATED_MANUAL_ACCEPTANCE_TASKS",
  );
  assert.equal(
    taskStage.commands[0].environment.MANUAL_ACCEPTANCE_TARGET_CONFIRM,
    source.commands[0].environment.MANUAL_ACCEPTANCE_TARGET_CONFIRM,
  );
  assert.equal(
    taskStage.commands[0].environment.MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON,
    source.commands[0].environment.MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON,
  );

  const purchaseQuality = plan.stages.find(
    (stage) => stage.key === "purchase-quality",
  );
  assert.equal(purchaseQuality.writesBusinessData, false);
  assert.equal(purchaseQuality.commands[0].delegatedTo, "facts");
  assert.equal(purchaseQuality.commands[0].genericWriterAllowed, false);
  assert.deepEqual(
    purchaseQuality.targetExecution[CUSTOMER_TRIAL_133_TARGET]
      .allowedOperations,
    ["verified", "reused"],
  );
  assert.equal(
    purchaseQuality.commands[0].entrypoint,
    "scripts/qa/manual-acceptance-fact-data.mjs",
  );

  const facts = plan.stages.find((stage) => stage.key === "facts");
  assert.equal(
    facts.commands[0].entrypoint,
    "scripts/qa/manual-acceptance-fact-data.mjs",
  );
  assert.ok(facts.commands[0].args.includes("--apply"));
  assert.ok(facts.commands[0].args.includes("2026.07.16-v5"));
  assert.match(
    facts.commands[0].args[facts.commands[0].args.indexOf("--out") + 1],
    /\/facts$/u,
  );
  assert.equal(facts.commands[0].formalBusinessAPIsOnly, true);
  assert.equal(
    facts.commands[0].environment.MANUAL_ACCEPTANCE_SIM_CONFIRM,
    "APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA",
  );
  assert.equal(facts.commands[1].kind, "source-driven-fact-contract");
  assert.equal(
    facts.commands[1].contract,
    "source-driven-operational-facts-v1",
  );
  assert.equal(facts.commands[1].genericApplyAllowed, false);
  assert.equal(facts.expected.inventoryBudgetRequired, true);

  const attachments = plan.stages.find((stage) => stage.key === "attachments");
  assert.equal(attachments.expected.owners, 7);
  assert.equal(attachments.expected.attachments, 27);
  assert.equal(attachments.expected.fixtures.length, 5);
  assert.equal(
    attachments.commands[0].environment.MANUAL_ACCEPTANCE_ATTACHMENT_CONFIRM,
    "APPLY_SIMULATED_MANUAL_ACCEPTANCE_ATTACHMENTS",
  );

  const readiness = plan.stages.find((stage) => stage.key === "readiness");
  assert.equal(readiness.writesBusinessData, false);
  assert.deepEqual(readiness.expected, {
    componentDataVersion: "2026.07.16-v5",
    componentSemanticDigest: "${SEMANTIC_DIGEST}",
    queryChecksPassed: true,
    queryEvidenceComplete: false,
    datasetSubstrateVerified: true,
    browserEvidencePending: true,
    browserOnlyNotProvenTargets: 10,
  });
});

test("dataset runner accepts only the exact ten browser-only print gaps", () => {
  const targets = [
    ...Array.from({ length: 40 }, (_, index) => ({
      id: `desktopPages:query-${index + 1}`,
      catalogGroup: "desktopPages",
      dataStatus: "pass",
      browserRequired: true,
    })),
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `printPreviewPages:print-${index + 1}`,
      catalogGroup: "printPreviewPages",
      dataStatus: "not_proven",
      browserRequired: true,
      quantityNotProven: true,
    })),
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `printWorkspacePages:print-${index + 1}`,
      catalogGroup: "printWorkspacePages",
      dataStatus: "not_proven",
      browserRequired: true,
      quantityNotProven: true,
    })),
  ];
  const report = {
    summary: {
      totalTargets: 50,
      passedTargetData: 40,
      failedTargetData: 0,
      notProvenTargetData: 10,
      queryChecksPassed: true,
      queryEvidenceComplete: false,
      manualAcceptanceCompleted: false,
    },
    targets,
  };
  assert.deepEqual(assertManualAcceptanceDatasetReadinessBoundary(report, 1), {
    datasetSubstrateVerified: true,
    browserEvidencePending: true,
    browserOnlyNotProvenTargets: 10,
  });

  const wrongGap = structuredClone(report);
  wrongGap.targets[40].catalogGroup = "desktopPages";
  assert.throws(
    () => assertManualAcceptanceDatasetReadinessBoundary(wrongGap, 1),
    (error) => error?.code === "readiness_component_failed",
  );
  const failedQuery = structuredClone(report);
  failedQuery.summary.failedTargetData = 1;
  assert.throws(
    () => assertManualAcceptanceDatasetReadinessBoundary(failedQuery, 1),
    (error) => error?.code === "readiness_component_failed",
  );
});

test("target capability evaluation accepts both exact targets without broadening target policy", () => {
  const semanticPlan = buildManualAcceptanceSemanticPlan();
  const local = evaluateManualAcceptanceTargetCapabilities(
    semanticPlan,
    LOCAL_DATASET_TARGET,
  );
  assert.equal(local.ready, true);
  assert.deepEqual(local.supportedStages, [
    ...MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS,
  ]);
  assert.deepEqual(local.blockedStages, []);

  const trial = evaluateManualAcceptanceTargetCapabilities(
    semanticPlan,
    CUSTOMER_TRIAL_133_TARGET,
  );
  assert.equal(trial.ready, true);
  assert.deepEqual(trial.supportedStages, [
    ...MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS,
  ]);
  assert.deepEqual(trial.blockedStages, []);
});

test("CLI defaults to a two-target dry-run and rejects implicit or production apply", async () => {
  assert.deepEqual(parseManualAcceptanceDatasetArgs([]), {
    apply: false,
    help: false,
    dataVersion: "2026.07.16-v5",
    runId: "20260716-V5",
    target: "",
    backendURL: "",
    databaseName: "",
    confirmation: "",
    targetAttestation: "",
    resumeReportPath: "",
  });
  assert.throws(
    () => parseManualAcceptanceDatasetArgs(["--apply"]),
    /requires explicit --target/u,
  );
  assert.throws(
    () =>
      parseManualAcceptanceDatasetArgs(["--apply", "--target", "production"]),
    /unsupported target production/u,
  );
  assert.throws(
    () => parseManualAcceptanceDatasetArgs(["--target", "local"]),
    /only valid with --apply/u,
  );
  assert.equal(
    parseManualAcceptanceDatasetArgs([
      "--data-version",
      "2026.07.16-v5",
      "--run-id",
      "20260716-V5",
    ]).runId,
    "20260716-V5",
  );
  assert.throws(
    () =>
      parseManualAcceptanceDatasetArgs([
        "--data-version",
        "2026.07.16-v5",
        "--run-id",
        "20260716-V4",
      ]),
    /runId must be 20260716-V5/u,
  );
  assert.throws(
    () => parseManualAcceptanceDatasetArgs(["--apply", "--target", "local"]),
    /requires explicit --backend-url and --database-name/u,
  );
  assert.throws(
    () =>
      parseManualAcceptanceDatasetArgs([
        "--apply",
        "--target",
        "local",
        "--backend-url",
        "http://127.0.0.1:8300",
        "--database-name",
        LOCAL_APPLY_DATABASE,
        "--confirm",
        "not-used",
      ]),
    /refuses port 8300/u,
  );

  let runnerCalls = 0;
  const result = await runManualAcceptanceDatasetCli([], {
    now: () => new Date(GENERATED_AT),
    runStage: async () => {
      runnerCalls += 1;
    },
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.plan.targets.length, 2);
  assert.equal(result.plan.writesBackend, false);
  assert.equal(runnerCalls, 0);
  assert.equal(
    JSON.parse(result.text).semanticDigest,
    result.plan.semanticDigest,
  );
});

test("an executable plan records strict stage receipts serially", async () => {
  const plan = localApplyPlan();
  const calls = [];
  const report = await applyManualAcceptanceDataset(
    plan,
    localApplyBinding(plan),
    runnerDeps({
      now: () => new Date("2026-07-15T03:04:05.000Z"),
      onCall(stageKey, invocation) {
        assert.equal(invocation.targetAdapter.alias, "local");
        assert.equal(invocation.businessInput.dataVersion, "2026.07.16-v5");
        assert.equal(
          invocation.businessInput.dateAnchorUtc,
          "2026-07-16T12:00:00.000Z",
        );
        calls.push(stageKey);
      },
    }),
  );

  assert.equal(report.ok, true);
  assert.equal(report.failedStage, null);
  assert.equal(report.generatedAt, "2026-07-15T03:04:05.000Z");
  assert.equal(report.cleanup, "retire/forward-only");
  assert.equal(report.freshEmptyBaseline.status, "completed");
  assert.equal(report.freshEmptyBaseline.operation, "verified");
  assert.equal(report.freshEmptyBaseline.summary.records, 1);
  assert.match(report.freshEmptyBaseline.componentDigest, /^[0-9a-f]{64}$/u);
  assert.deepEqual(
    calls,
    MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS.filter(
      (stageKey) => stageKey !== "purchase-quality",
    ),
  );
  assert.ok(report.stages.every((stage) => stage.status === "completed"));
  assert.ok(
    report.stages.every(
      (stage) =>
        stage.stageKey === stage.key &&
        stage.dataVersion === plan.dataVersion &&
        stage.semanticDigest === plan.semanticDigest,
    ),
  );
  assert.equal(report.stages.at(-1).operation, "verified");
  assert.ok(
    report.stages.every(
      (stage) =>
        stage.references.runner.revision ===
          MANUAL_ACCEPTANCE_DATASET_RUNNER_REVISION &&
        /^[0-9a-f]{64}$/u.test(stage.references.runner.componentDigest) &&
        Boolean(stage.references.runner.reportPath),
    ),
  );
  assert.equal(
    report.stages.findIndex((stage) => stage.key === "purchase-quality"),
    report.stages.findIndex((stage) => stage.key === "facts") + 1,
  );
  assert.equal(
    report.stages.find((stage) => stage.key === "purchase-quality").summary
      .purchaseReceipts,
    54,
  );
  assert.equal(
    report.semanticDigest,
    digestManualAcceptanceSemanticPlan(plan.semanticPlan),
  );
});

test("same target apply is atomically serialized before any runner and resumes after the owner releases", async () => {
  const outputRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "plush-dataset-apply-lock-concurrency-"),
  );
  let signalFirstRunner;
  const firstRunnerStarted = new Promise((resolve) => {
    signalFirstRunner = resolve;
  });
  let releaseFirstRunner;
  const firstRunnerRelease = new Promise((resolve) => {
    releaseFirstRunner = resolve;
  });
  let firstApply;
  try {
    const plan = localApplyPlan();
    firstApply = applyManualAcceptanceDataset(
      plan,
      localApplyBinding(plan),
      durableRunnerDeps({
        outputRoot,
        override: {
          async core(invocation) {
            signalFirstRunner();
            await firstRunnerRelease;
            return {
              operation: "verified",
              report: durableComponentReport({
                stageKey: "core",
                ...invocation,
              }),
            };
          },
        },
      }),
    );
    await firstRunnerStarted;

    const lockPath = manualAcceptanceDatasetApplyLockPath({
      outputRoot,
      dataVersion: plan.dataVersion,
      targetAlias: plan.target.alias,
    });
    assert.equal(path.basename(lockPath), ".apply.lock");
    const lockOwner = JSON.parse(await fs.readFile(lockPath, "utf8"));
    assert.deepEqual(Object.keys(lockOwner).sort(), [
      "acquiredAt",
      "contract",
      "dataVersion",
      "datasetKey",
      "lockId",
      "operation",
      "pid",
      "policyTarget",
      "runId",
      "targetAlias",
    ]);
    assert.equal(
      lockOwner.contract,
      MANUAL_ACCEPTANCE_DATASET_APPLY_LOCK_CONTRACT,
    );
    assert.equal(lockOwner.operation, "fresh");
    assert.equal(lockOwner.targetAlias, plan.target.alias);
    assert.equal(lockOwner.dataVersion, plan.dataVersion);
    assert.equal(lockOwner.runId, plan.runId);
    assert.equal((await fs.stat(lockPath)).mode & 0o777, 0o600);
    const serializedLock = JSON.stringify(lockOwner);
    for (const forbidden of [
      "role-password",
      "admin-password",
      "Authorization",
      "token",
      plan.target.backendURL,
      plan.target.databaseName,
    ]) {
      assert.equal(serializedLock.includes(forbidden), false);
    }

    let competingRunnerCalls = 0;
    await assert.rejects(
      () =>
        applyManualAcceptanceDataset(
          plan,
          localApplyBinding(plan),
          durableRunnerDeps({
            outputRoot,
            onCall() {
              competingRunnerCalls += 1;
            },
          }),
        ),
      (error) =>
        error?.code === "dataset_apply_lock_held" &&
        error?.details?.lockPath === lockPath &&
        error?.details?.owner?.lockId === lockOwner.lockId &&
        /no runner or RPC was started.*Do not delete.*renaming/su.test(
          error.message,
        ),
    );
    assert.equal(competingRunnerCalls, 0);

    releaseFirstRunner();
    const completed = await firstApply;
    assert.equal(completed.ok, true);
    await assert.rejects(() => fs.readFile(lockPath, "utf8"), {
      code: "ENOENT",
    });

    let resumedRunnerCalls = 0;
    const resumed = await applyManualAcceptanceDataset(
      plan,
      {
        ...localApplyBinding(plan),
        resumeReportPath: completed.applyReportPath,
      },
      durableRunnerDeps({
        outputRoot,
        onCall() {
          resumedRunnerCalls += 1;
        },
      }),
    );
    assert.equal(resumed.ok, true);
    assert.ok(resumedRunnerCalls > 0);
    await assert.rejects(() => fs.readFile(lockPath, "utf8"), {
      code: "ENOENT",
    });
  } finally {
    releaseFirstRunner?.();
    await firstApply?.catch(() => {});
    await fs.rm(outputRoot, { recursive: true, force: true });
  }
});

test("a crash-stale lock stays fail-closed until an operator archives the exact lock", async () => {
  const outputRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "plush-dataset-apply-lock-stale-"),
  );
  try {
    const plan = localApplyPlan();
    const lockPath = manualAcceptanceDatasetApplyLockPath({
      outputRoot,
      dataVersion: plan.dataVersion,
      targetAlias: plan.target.alias,
    });
    const staleOwner = {
      contract: MANUAL_ACCEPTANCE_DATASET_APPLY_LOCK_CONTRACT,
      lockId: "11111111-1111-4111-8111-111111111111",
      pid: 999999,
      acquiredAt: "2026-07-16T01:02:03.000Z",
      datasetKey: plan.datasetKey,
      dataVersion: plan.dataVersion,
      runId: plan.runId,
      targetAlias: plan.target.alias,
      policyTarget: plan.target.policyTarget,
      operation: "fresh",
    };
    await fs.mkdir(path.dirname(lockPath), { recursive: true });
    await fs.writeFile(lockPath, `${JSON.stringify(staleOwner, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    const original = await fs.readFile(lockPath, "utf8");
    let runnerCalls = 0;
    let recoveryPath = "";
    await assert.rejects(
      () =>
        applyManualAcceptanceDataset(
          plan,
          localApplyBinding(plan),
          durableRunnerDeps({
            outputRoot,
            onCall() {
              runnerCalls += 1;
            },
          }),
        ),
      (error) => {
        recoveryPath = error?.details?.recoveryArchivePath || "";
        return (
          error?.code === "dataset_apply_lock_held" &&
          error?.details?.owner?.lockId === staleOwner.lockId &&
          recoveryPath === `${lockPath}.stale-${staleOwner.lockId}`
        );
      },
    );
    assert.equal(runnerCalls, 0);
    assert.equal(await fs.readFile(lockPath, "utf8"), original);

    await fs.rename(lockPath, recoveryPath);
    const recovered = await applyManualAcceptanceDataset(
      plan,
      localApplyBinding(plan),
      durableRunnerDeps({ outputRoot }),
    );
    assert.equal(recovered.ok, true);
    assert.equal(await fs.readFile(recoveryPath, "utf8"), original);
    await assert.rejects(() => fs.readFile(lockPath, "utf8"), {
      code: "ENOENT",
    });
  } finally {
    await fs.rm(outputRoot, { recursive: true, force: true });
  }
});

test("finally never removes a lock whose owner token was replaced", async () => {
  const outputRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "plush-dataset-apply-lock-owner-"),
  );
  try {
    const plan = localApplyPlan();
    const lockPath = manualAcceptanceDatasetApplyLockPath({
      outputRoot,
      dataVersion: plan.dataVersion,
      targetAlias: plan.target.alias,
    });
    const replacementOwner = {
      contract: MANUAL_ACCEPTANCE_DATASET_APPLY_LOCK_CONTRACT,
      lockId: "22222222-2222-4222-8222-222222222222",
      pid: process.pid,
      acquiredAt: "2026-07-16T02:03:04.000Z",
      datasetKey: plan.datasetKey,
      dataVersion: plan.dataVersion,
      runId: plan.runId,
      targetAlias: plan.target.alias,
      policyTarget: plan.target.policyTarget,
      operation: "resume",
    };
    const report = await applyManualAcceptanceDataset(
      plan,
      localApplyBinding(plan),
      durableRunnerDeps({
        outputRoot,
        override: {
          async readiness(invocation) {
            await fs.writeFile(
              lockPath,
              `${JSON.stringify(replacementOwner, null, 2)}\n`,
              "utf8",
            );
            return {
              operation: "verified",
              report: durableComponentReport({
                stageKey: "readiness",
                ...invocation,
              }),
            };
          },
        },
      }),
    );
    assert.equal(report.ok, true);
    assert.deepEqual(
      JSON.parse(await fs.readFile(lockPath, "utf8")),
      replacementOwner,
    );
  } finally {
    await fs.rm(outputRoot, { recursive: true, force: true });
  }
});

test("canonical apply report persists and a complete same-batch replay safely reuses mutations", async () => {
  const outputRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "plush-dataset-resume-success-"),
  );
  try {
    const plan = localApplyPlan();
    const firstCalls = [];
    const first = await applyManualAcceptanceDataset(
      plan,
      localApplyBinding(plan),
      durableRunnerDeps({
        outputRoot,
        onCall(stageKey) {
          firstCalls.push(stageKey);
        },
      }),
    );
    const expectedApplyReportPath = manualAcceptanceDatasetApplyReportPath({
      outputRoot,
      dataVersion: plan.dataVersion,
      targetAlias: plan.target.alias,
    });
    assert.equal(
      first.contract,
      MANUAL_ACCEPTANCE_DATASET_APPLY_REPORT_CONTRACT,
    );
    assert.equal(first.applyReportPath, expectedApplyReportPath);
    assert.equal(first.resume.requested, false);
    assert.equal(first.taskSchedule.anchorUtc, GENERATED_AT);
    assert.equal(first.freshEmptyBaseline.origin, "fresh_empty_baseline");
    assert.deepEqual(
      JSON.parse(await fs.readFile(expectedApplyReportPath, "utf8")),
      first,
    );
    assert.deepEqual(
      firstCalls,
      MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS.filter(
        (stageKey) => stageKey !== "purchase-quality",
      ),
    );

    const replayCalls = [];
    const replay = await applyManualAcceptanceDataset(
      plan,
      {
        ...localApplyBinding(plan),
        resumeReportPath: expectedApplyReportPath,
      },
      durableRunnerDeps({
        outputRoot,
        now: "2026-07-20T01:02:03.000Z",
        onCall(stageKey) {
          replayCalls.push(stageKey);
        },
      }),
    );
    assert.equal(replay.ok, true);
    assert.equal(replay.generatedAt, "2026-07-20T01:02:03.000Z");
    assert.deepEqual(replay.taskSchedule, first.taskSchedule);
    assert.equal(replay.resume.requested, true);
    assert.equal(replay.resume.priorSucceeded, true);
    assert.deepEqual(replayCalls, ["core", "readiness"]);
    assert.equal(
      replay.stages.find((stage) => stage.key === "core").operation,
      "verified",
    );
    assert.ok(
      replay.stages
        .filter((stage) => !["core", "readiness"].includes(stage.key))
        .every((stage) => stage.operation === "reused"),
    );
    assert.equal(replay.freshEmptyBaseline.origin, "validated_resume_receipt");
    assert.equal(replay.freshEmptyBaseline.operation, "reused");
    assert.equal(replay.stages.at(-1).operation, "verified");

    const tampered = structuredClone(replay);
    tampered.taskSchedule.anchorUnix += 1;
    await fs.writeFile(
      expectedApplyReportPath,
      `${JSON.stringify(tampered, null, 2)}\n`,
      "utf8",
    );
    let tamperCalls = 0;
    await assert.rejects(
      () =>
        applyManualAcceptanceDataset(
          plan,
          {
            ...localApplyBinding(plan),
            resumeReportPath: expectedApplyReportPath,
          },
          durableRunnerDeps({
            outputRoot,
            onCall() {
              tamperCalls += 1;
            },
          }),
        ),
      /task schedule does not match its controlled anchor/u,
    );
    assert.equal(tamperCalls, 0);
  } finally {
    await fs.rm(outputRoot, { recursive: true, force: true });
  }
});

test("failed apply report resumes only after its completed contiguous prefix", async () => {
  const outputRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "plush-dataset-resume-failed-"),
  );
  try {
    const plan = localApplyPlan();
    const failed = await applyManualAcceptanceDataset(
      plan,
      localApplyBinding(plan),
      durableRunnerDeps({
        outputRoot,
        override: {
          task() {
            throw new Error("simulated task interruption");
          },
        },
      }),
    );
    assert.equal(failed.ok, false);
    assert.equal(failed.failedStage, "task");
    const applyReportPath = failed.applyReportPath;
    assert.deepEqual(
      JSON.parse(await fs.readFile(applyReportPath, "utf8")),
      failed,
    );

    const resumedCalls = [];
    const resumed = await applyManualAcceptanceDataset(
      plan,
      { ...localApplyBinding(plan), resumeReportPath: applyReportPath },
      durableRunnerDeps({
        outputRoot,
        onCall(stageKey) {
          resumedCalls.push(stageKey);
        },
      }),
    );
    assert.equal(resumed.ok, true);
    assert.equal(resumed.resume.priorFailedStage, "task");
    assert.deepEqual(resumed.resume.reusedStages, [
      "baseline",
      "role",
      "source",
    ]);
    assert.deepEqual(resumedCalls, [
      "core",
      "task",
      "facts",
      "attachments",
      "readiness",
    ]);
    assert.deepEqual(
      resumed.stages.slice(1, 4).map((stage) => stage.operation),
      ["reused", "reused", "reused"],
    );
  } finally {
    await fs.rm(outputRoot, { recursive: true, force: true });
  }
});

test("resume fails closed for tampered component digests and current config drift", async () => {
  const outputRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "plush-dataset-resume-tamper-"),
  );
  try {
    const plan = localApplyPlan();
    const first = await applyManualAcceptanceDataset(
      plan,
      localApplyBinding(plan),
      durableRunnerDeps({ outputRoot }),
    );
    const attachmentPath = manualAcceptanceDatasetStageReportPath({
      outputRoot,
      dataVersion: plan.dataVersion,
      targetAlias: plan.target.alias,
      stageKey: "attachments",
    });
    const attachment = JSON.parse(await fs.readFile(attachmentPath, "utf8"));
    attachment.summary.records += 1;
    await fs.writeFile(
      attachmentPath,
      `${JSON.stringify(attachment, null, 2)}\n`,
      "utf8",
    );
    let calls = 0;
    await assert.rejects(
      () =>
        applyManualAcceptanceDataset(
          plan,
          {
            ...localApplyBinding(plan),
            resumeReportPath: first.applyReportPath,
          },
          durableRunnerDeps({
            outputRoot,
            onCall() {
              calls += 1;
            },
          }),
        ),
      /attachments component digest mismatch/u,
    );
    assert.equal(calls, 0);

    await assert.rejects(
      () =>
        applyManualAcceptanceDataset(
          plan,
          localApplyBinding(plan),
          durableRunnerDeps({ outputRoot }),
        ),
      /already exists.*--resume-report/u,
    );

    await fs.rm(outputRoot, { recursive: true, force: true });
    await fs.mkdir(outputRoot, { recursive: true });
    const clean = await applyManualAcceptanceDataset(
      plan,
      localApplyBinding(plan),
      durableRunnerDeps({ outputRoot }),
    );
    const drifted = await applyManualAcceptanceDataset(
      plan,
      {
        ...localApplyBinding(plan),
        resumeReportPath: clean.applyReportPath,
      },
      durableRunnerDeps({ outputRoot, configRevision: "other-config-v5" }),
    );
    assert.equal(drifted.ok, false);
    assert.equal(drifted.failedStage, "baseline");
    assert.equal(
      drifted.stages[1].blockedReason.code,
      "resume_baseline_config_mismatch",
    );
    assert.ok(
      drifted.stages.slice(2).every((stage) => stage.status === "not_started"),
    );
  } finally {
    await fs.rm(outputRoot, { recursive: true, force: true });
  }
});

test("resume regenerates the read-only readiness snapshot after verifier changes", async () => {
  const outputRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "plush-dataset-resume-readiness-refresh-"),
  );
  try {
    const plan = localApplyPlan();
    const first = await applyManualAcceptanceDataset(
      plan,
      localApplyBinding(plan),
      durableRunnerDeps({ outputRoot }),
    );
    const readinessPath = manualAcceptanceDatasetStageReportPath({
      outputRoot,
      dataVersion: plan.dataVersion,
      targetAlias: plan.target.alias,
      stageKey: "readiness",
    });
    const staleReadiness = JSON.parse(await fs.readFile(readinessPath, "utf8"));
    staleReadiness.verifierRevision = "new-read-only-contract";
    await fs.writeFile(
      readinessPath,
      `${JSON.stringify(staleReadiness, null, 2)}\n`,
      "utf8",
    );

    const calls = [];
    const resumed = await applyManualAcceptanceDataset(
      plan,
      {
        ...localApplyBinding(plan),
        resumeReportPath: first.applyReportPath,
      },
      durableRunnerDeps({
        outputRoot,
        onCall(stageKey) {
          calls.push(stageKey);
        },
      }),
    );
    assert.equal(resumed.ok, true);
    assert.deepEqual(calls, ["core", "readiness"]);
    assert.equal(resumed.resume.reusedStages.includes("readiness"), false);
    const refreshedReadiness = JSON.parse(
      await fs.readFile(readinessPath, "utf8"),
    );
    assert.equal("verifierRevision" in refreshedReadiness, false);
  } finally {
    await fs.rm(outputRoot, { recursive: true, force: true });
  }
});

test("resume refreshes legacy fact evidence without weakening digest checks", async () => {
  const outputRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "plush-dataset-resume-fact-refresh-"),
  );
  try {
    const plan = localApplyPlan();
    const first = await applyManualAcceptanceDataset(
      plan,
      localApplyBinding(plan),
      durableRunnerDeps({ outputRoot }),
    );
    const factsPath = manualAcceptanceDatasetStageReportPath({
      outputRoot,
      dataVersion: plan.dataVersion,
      targetAlias: plan.target.alias,
      stageKey: "facts",
    });
    const legacyFacts = JSON.parse(await fs.readFile(factsPath, "utf8"));
    legacyFacts.summary.businessDashboardInventoryTotal = 148;
    await fs.writeFile(
      factsPath,
      `${JSON.stringify(legacyFacts, null, 2)}\n`,
      "utf8",
    );
    const prior = structuredClone(first);
    prior.stages.find(
      (stage) => stage.key === "facts",
    ).references.runner.componentDigest =
      digestManualAcceptanceDatasetComponentReport(legacyFacts);
    await fs.writeFile(
      first.applyReportPath,
      `${JSON.stringify(prior, null, 2)}\n`,
      "utf8",
    );

    const calls = [];
    const resumed = await applyManualAcceptanceDataset(
      plan,
      {
        ...localApplyBinding(plan),
        resumeReportPath: first.applyReportPath,
      },
      durableRunnerDeps({
        outputRoot,
        onCall(stageKey) {
          calls.push(stageKey);
        },
      }),
    );
    assert.equal(resumed.ok, true);
    assert.deepEqual(resumed.resume.reusedStages, [
      "baseline",
      "role",
      "source",
      "task",
    ]);
    assert.deepEqual(resumed.resume.refreshedStages, [
      "facts",
      "purchase-quality",
      "attachments",
      "readiness",
    ]);
    assert.deepEqual(calls, ["core", "facts", "attachments", "readiness"]);
    const refreshedFacts = JSON.parse(await fs.readFile(factsPath, "utf8"));
    assert.equal(refreshedFacts.summary.businessDashboardInventoryTotal, 45);
  } finally {
    await fs.rm(outputRoot, { recursive: true, force: true });
  }
});

test("apply stops at the first failed stage and leaves later stages not started", async () => {
  const plan = localApplyPlan();
  const calls = [];
  const report = await applyManualAcceptanceDataset(
    plan,
    localApplyBinding(plan),
    runnerDeps({
      onCall(stageKey) {
        calls.push(stageKey);
      },
      override: {
        facts(invocation) {
          const report = fakeComponentReport({
            stageKey: "facts",
            ...invocation,
          });
          report.summary.purchaseReceipts = 53;
          return {
            operation: "applied",
            report,
          };
        },
      },
    }),
  );

  assert.equal(report.ok, false);
  assert.equal(report.failedStage, "purchase-quality");
  assert.deepEqual(calls, [
    "core",
    "baseline",
    "role",
    "source",
    "task",
    "facts",
  ]);
  assert.deepEqual(
    report.stages.map((stage) => stage.status),
    [
      "completed",
      "completed",
      "completed",
      "completed",
      "completed",
      "completed",
      "failed",
      "not_started",
      "not_started",
    ],
  );
  assert.match(report.stages[6].error, /does not meet.*minimums/u);
  assert.equal(
    report.stages[6].blockedReason.code,
    "delegated_fact_evidence_incomplete",
  );
});

test("empty baseline failure stops before every mutating dataset stage", async () => {
  const plan = localApplyPlan();
  const calls = [];
  const report = await applyManualAcceptanceDataset(
    plan,
    localApplyBinding(plan),
    runnerDeps({
      onCall(stageKey) {
        calls.push(stageKey);
      },
      override: {
        baseline(invocation) {
          const report = fakeComponentReport({
            stageKey: "baseline",
            ...invocation,
          });
          delete report.summary;
          return report;
        },
      },
    }),
  );
  assert.equal(report.ok, false);
  assert.equal(report.failedStage, "baseline");
  assert.deepEqual(calls, ["core", "baseline"]);
  assert.equal(report.freshEmptyBaseline, null);
  assert.equal(report.stages[0].status, "completed");
  assert.equal(report.stages[1].status, "failed");
  assert.ok(
    report.stages.slice(2).every((stage) => stage.status === "not_started"),
  );
});

test("component database identity mismatches fail closed before the next stage", async () => {
  const plan = localApplyPlan();
  let calls = 0;
  const report = await applyManualAcceptanceDataset(
    plan,
    localApplyBinding(plan),
    runnerDeps({
      onCall() {
        calls += 1;
      },
      override: {
        role(invocation) {
          const component = fakeComponentReport({
            stageKey: "role",
            ...invocation,
          });
          component.databaseName = "plush_erp_acceptance_20260716_other_dev";
          return component;
        },
      },
    }),
  );

  assert.equal(calls, 3);
  assert.equal(report.failedStage, "role");
  assert.match(report.stages[2].error, /databaseName does not match/u);
  assert.equal(
    report.stages[2].blockedReason.code,
    "component_identity_mismatch",
  );
  assert.ok(
    report.stages.slice(3).every((stage) => stage.status === "not_started"),
  );
});

test("runner cannot turn a component without explicit evidence into completion", async () => {
  const plan = localApplyPlan();
  const unverifiable = await applyManualAcceptanceDataset(
    plan,
    localApplyBinding(plan),
    runnerDeps({
      override: {
        role(invocation) {
          const report = fakeComponentReport({
            stageKey: "role",
            ...invocation,
          });
          delete report.summary;
          return report;
        },
      },
    }),
  );
  assert.equal(unverifiable.failedStage, "role");
  assert.match(unverifiable.stages[2].error, /explicit summary/u);
  assert.equal(
    unverifiable.stages[2].blockedReason.code,
    "component_summary_missing",
  );
});

test("stage receipt requires exact identity and explicit report objects", () => {
  const plan = localApplyPlan();
  const stage = plan.semanticPlan.stages.find((item) => item.key === "core");
  const context = {
    stage,
    dataVersion: plan.dataVersion,
    semanticDigest: plan.semanticDigest,
  };
  const valid = completedStageResult(context, {
    operation: "reused",
    summary: { records: 4 },
    references: { unitId: 10 },
  });
  assert.deepEqual(normalizeManualAcceptanceStageResult(valid, stage, plan), {
    status: "completed",
    stageKey: "core",
    dataVersion: plan.dataVersion,
    semanticDigest: plan.semanticDigest,
    operation: "reused",
    summary: { records: 4 },
    references: valid.references,
  });

  for (const field of [
    "status",
    "stageKey",
    "dataVersion",
    "semanticDigest",
    "summary",
    "references",
  ]) {
    const incomplete = { ...valid };
    delete incomplete[field];
    assert.throws(
      () => normalizeManualAcceptanceStageResult(incomplete, stage, plan),
      new RegExp(
        field === "status"
          ? "non-complete status"
          : field === "stageKey"
            ? "returned stageKey"
            : field === "dataVersion"
              ? "different dataVersion"
              : field === "semanticDigest"
                ? "different semanticDigest"
                : `${field} must be an explicit object`,
        "u",
      ),
    );
  }
  assert.throws(
    () =>
      normalizeManualAcceptanceStageResult(
        { ...valid, summary: [] },
        stage,
        plan,
      ),
    /summary must be an explicit object/u,
  );
  assert.throws(
    () =>
      normalizeManualAcceptanceStageResult(
        { ...valid, references: null },
        stage,
        plan,
      ),
    /references must be an explicit object/u,
  );
  assert.throws(
    () =>
      normalizeManualAcceptanceStageResult(
        {
          ...valid,
          references: {
            ...valid.references,
            runner: {
              ...valid.references.runner,
              componentDigest: "not-a-digest",
            },
          },
        },
        stage,
        plan,
      ),
    /invalid componentDigest/u,
  );
});

test("apply requires exact target binding and forbids remote core or role seed", async () => {
  const implicitSharedLocal = buildManualAcceptanceDatasetTargetPlan({
    targetAlias: "local",
    generatedAt: GENERATED_AT,
  });
  assert.equal(implicitSharedLocal.target.applyReady, false);
  await assert.rejects(
    () => applyManualAcceptanceDataset(implicitSharedLocal, {}, runnerDeps()),
    /dedicated acceptance backend and databaseName/u,
  );

  const localPlan = localApplyPlan();
  assert.equal(localPlan.target.applyReady, true);
  const local = await applyManualAcceptanceDataset(
    localPlan,
    localApplyBinding(localPlan),
    runnerDeps(),
  );
  assert.equal(local.ok, true);

  const unboundTrial = buildManualAcceptanceDatasetTargetPlan({
    targetAlias: CUSTOMER_TRIAL_133_TARGET,
    generatedAt: GENERATED_AT,
  });
  await assert.rejects(
    () =>
      applyManualAcceptanceDataset(
        unboundTrial,
        { confirmation: unboundTrial.target.expectedConfirmation },
        runnerDeps(),
      ),
    /target attestation is required/u,
  );

  const trialPlan = buildManualAcceptanceDatasetTargetPlan({
    targetAlias: CUSTOMER_TRIAL_133_TARGET,
    targetAttestation: trialAttestation(),
    generatedAt: GENERATED_AT,
  });
  assert.equal(trialPlan.target.bindingReady, true);
  assert.equal(trialPlan.target.applyReady, true);
  assert.equal(
    trialPlan.target.expectedConfirmation,
    "APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA:customer-trial-133:2026.07.16-v5:20260716-V5",
  );
  await assert.rejects(
    () =>
      applyManualAcceptanceDataset(
        trialPlan,
        { confirmation: "wrong" },
        runnerDeps(),
      ),
    /apply requires/u,
  );
});

test("core RPC verifier uses one admin read-only preflight and returns only stable business codes", async () => {
  const requests = [];
  const makeFetch =
    (omitWarehouse = "") =>
    async (url, init) => {
      if (!init.body) {
        requests.push({
          method: "readyz",
          headers: init.headers,
          url,
          hasAuthorization: Boolean(init.headers.Authorization),
        });
        return {
          ok: true,
          status: 200,
          redirected: false,
          headers: {
            get(name) {
              return name === "X-ERP-Runtime-Identity-Proof"
                ? "matched-v1"
                : null;
            },
          },
          async text() {
            return "runtime identity matched";
          },
        };
      }
      const request = JSON.parse(init.body);
      requests.push({
        method: request.method,
        params: request.params,
        hasAuthorization: Boolean(init.headers.Authorization),
      });
      const data =
        request.method === "admin_login"
          ? { access_token: "secret-token" }
          : request.method === "capabilities"
            ? {
                environment: "remote",
                databaseName: "plush_erp_uat_20260716_v5",
                seedEnabled: false,
                seedAllowed: false,
                cleanupEnabled: false,
                cleanupAllowed: false,
                businessDataClearEnabled: false,
                businessDataClearAllowed: false,
              }
            : request.method === "get_effective_session"
              ? {
                  session: {
                    customer: { key: "yoyoosun" },
                    source: "active_customer_config_revision",
                    configRevision: CUSTOMER_TRIAL_133_CONFIG_REVISION,
                    configProductVersion:
                      CUSTOMER_TRIAL_133_CONFIG_PRODUCT_VERSION,
                    configApplyPurpose: CUSTOMER_TRIAL_133_CONFIG_APPLY_PURPOSE,
                    configDatasetVersion:
                      CUSTOMER_TRIAL_133_CONFIG_DATA_VERSION,
                    configTarget: CUSTOMER_TRIAL_133_TARGET,
                    modules: {},
                  },
                }
              : request.method === "list_units"
                ? { units: [{ id: 11, code: "YS5-DW-01" }] }
                : {
                    warehouses: [
                      "YS5-CK-01",
                      "YS5-CK-02",
                      "YS5-CK-03",
                      "YS5-CK-04",
                    ]
                      .filter((code) => code !== omitWarehouse)
                      .map((code, index) => ({ id: index + 20, code })),
                  };
      return {
        ok: true,
        status: 200,
        redirected: false,
        async json() {
          return { result: { code: 0, data } };
        },
      };
    };
  const binding = {
    backendURL: CUSTOMER_TRIAL_133_ORIGIN,
    policyTarget: CUSTOMER_TRIAL_133_TARGET,
    datasetKey: "yoyoosun-manual-acceptance",
    dataVersion: "2026.07.16-v5",
    runId: "20260716-V5",
    targetAttestation: trialAttestation(),
    adminPassword: "admin-password",
  };
  const verified = await verifyManualAcceptanceCoreReferences({
    ...binding,
    fetchImpl: makeFetch(),
  });
  assert.deepEqual(verified, {
    databaseName: "plush_erp_uat_20260716_v5",
    configRevision: CUSTOMER_TRIAL_133_CONFIG_REVISION,
    configProductVersion: CUSTOMER_TRIAL_133_CONFIG_PRODUCT_VERSION,
    configApplyPurpose: CUSTOMER_TRIAL_133_CONFIG_APPLY_PURPOSE,
    configDatasetVersion: CUSTOMER_TRIAL_133_CONFIG_DATA_VERSION,
    configTarget: CUSTOMER_TRIAL_133_TARGET,
    unitCode: "YS5-DW-01",
    warehouseCodes: ["YS5-CK-01", "YS5-CK-02", "YS5-CK-03", "YS5-CK-04"],
    summary: { units: 1, warehouses: 4 },
  });
  assert.deepEqual(
    requests.map((item) => item.method),
    [
      "readyz",
      "admin_login",
      "capabilities",
      "get_effective_session",
      "list_units",
      "list_warehouses",
    ],
  );
  assert.equal(
    requests[0].headers["X-ERP-Runtime-Identity-Scope"],
    "release-v1",
  );
  const expectedIdentityDigest = createHash("sha256")
    .update(
      [
        "release-v1",
        "plush_erp_uat_20260716_v5",
        binding.targetAttestation.release,
        binding.targetAttestation.migration,
      ].join("\n"),
    )
    .digest("hex");
  assert.equal(
    requests[0].headers["X-ERP-Expected-Runtime-Identity-SHA256"],
    expectedIdentityDigest,
  );
  assert.deepEqual(requests[1].params, {
    username: "admin",
    password: "admin-password",
  });
  assert.equal(requests[0].hasAuthorization, false);
  assert.equal(requests[1].hasAuthorization, false);
  assert.equal(requests[2].hasAuthorization, true);
  assert.equal(requests[3].hasAuthorization, true);
  assert.equal(requests[4].hasAuthorization, true);
  assert.equal(JSON.stringify(verified).includes("secret-token"), false);
  assert.equal(JSON.stringify(verified).includes('"id"'), false);

  await assert.rejects(
    () =>
      verifyManualAcceptanceCoreReferences({
        ...binding,
        fetchImpl: makeFetch("YS5-CK-04"),
      }),
    /YS5-CK-04/u,
  );
});

test("empty baseline verifier binds runtime and config, proves exact core, and rejects any pre-existing business record", async () => {
  const binding = {
    backendURL: CUSTOMER_TRIAL_133_ORIGIN,
    policyTarget: CUSTOMER_TRIAL_133_TARGET,
    databaseName: "plush_erp_uat_20260716_v5",
    datasetKey: "yoyoosun-manual-acceptance",
    dataVersion: "2026.07.16-v5",
    runId: "20260716-V5",
    targetAttestation: trialAttestation(),
    adminPassword: "admin-password",
    coreReport: {
      databaseName: "plush_erp_uat_20260716_v5",
      configRevision: CUSTOMER_TRIAL_133_CONFIG_REVISION,
      configProductVersion: CUSTOMER_TRIAL_133_CONFIG_PRODUCT_VERSION,
      configApplyPurpose: CUSTOMER_TRIAL_133_CONFIG_APPLY_PURPOSE,
      configDatasetVersion: CUSTOMER_TRIAL_133_CONFIG_DATA_VERSION,
      configTarget: CUSTOMER_TRIAL_133_TARGET,
    },
  };
  const makeFetch = ({ nonEmptyKey = "", omitTotalKey = "" } = {}) => {
    const requests = [];
    const fetchImpl = async (_url, init) => {
      if (!init.body) {
        requests.push({ method: "runtime_identity", params: null });
        return {
          ok: true,
          status: 200,
          redirected: false,
          headers: {
            get: (name) =>
              name === "X-ERP-Runtime-Identity-Proof" ? "matched-v1" : null,
          },
          async text() {
            return "runtime identity matched";
          },
        };
      }
      const request = JSON.parse(init.body);
      requests.push({ method: request.method, params: request.params });
      let data;
      if (request.method === "admin_login") {
        data = { access_token: "baseline-secret-token" };
      } else if (request.method === "capabilities") {
        data = {
          environment: "remote",
          databaseName: "plush_erp_uat_20260716_v5",
          seedEnabled: false,
          seedAllowed: false,
          cleanupEnabled: false,
          cleanupAllowed: false,
          businessDataClearEnabled: false,
          businessDataClearAllowed: false,
        };
      } else if (request.method === "get_effective_session") {
        data = {
          session: {
            customer: { key: "yoyoosun" },
            source: "active_customer_config_revision",
            configRevision: CUSTOMER_TRIAL_133_CONFIG_REVISION,
            configProductVersion: CUSTOMER_TRIAL_133_CONFIG_PRODUCT_VERSION,
            configApplyPurpose: CUSTOMER_TRIAL_133_CONFIG_APPLY_PURPOSE,
            configDatasetVersion: CUSTOMER_TRIAL_133_CONFIG_DATA_VERSION,
            configTarget: CUSTOMER_TRIAL_133_TARGET,
            modules: {},
          },
        };
      } else if (request.method === "list_units") {
        data = { units: [{ code: "YS5-DW-01" }], total: 1 };
      } else if (request.method === "list_warehouses") {
        data = {
          warehouses: ["YS5-CK-01", "YS5-CK-02", "YS5-CK-03", "YS5-CK-04"].map(
            (code) => ({ code }),
          ),
          total: 4,
        };
      } else {
        const probe = MANUAL_ACCEPTANCE_EMPTY_BASELINE_PROBES.find(
          (item) => item.method === request.method,
        );
        assert.ok(probe, `unexpected baseline method ${request.method}`);
        const nonEmpty = probe.key === nonEmptyKey;
        data = {
          [probe.listKey]: nonEmpty ? [{ id: 1 }] : [],
          ...(probe.key === omitTotalKey ? {} : { total: nonEmpty ? 1 : 0 }),
        };
      }
      return {
        ok: true,
        status: 200,
        redirected: false,
        async json() {
          return { result: { code: 0, data } };
        },
      };
    };
    return { fetchImpl, requests };
  };

  const passing = makeFetch();
  const verified = await verifyManualAcceptanceEmptyBaseline({
    ...binding,
    fetchImpl: passing.fetchImpl,
  });
  assert.equal(verified.databaseName, binding.databaseName);
  assert.deepEqual(verified.core, {
    units: 1,
    warehouses: 4,
    unitCodes: ["YS5-DW-01"],
    warehouseCodes: ["YS5-CK-01", "YS5-CK-02", "YS5-CK-03", "YS5-CK-04"],
  });
  assert.equal(
    Object.keys(verified.zeroCounts).length,
    MANUAL_ACCEPTANCE_EMPTY_BASELINE_PROBES.length,
  );
  assert.ok(Object.values(verified.zeroCounts).every((count) => count === 0));
  assert.deepEqual(verified.runtimeIdentity, {
    scope: "release-v1",
    proof: "matched-v1",
    databaseName: binding.databaseName,
    release: binding.targetAttestation.release,
    migration: binding.targetAttestation.migration,
  });
  assert.equal(
    passing.requests.filter(({ method }) => method === "list_products").length,
    1,
  );
  assert.equal(
    passing.requests.filter(({ method }) => method === "list_outsourcing_facts")
      .length,
    1,
  );
  assert.equal(JSON.stringify(verified).includes("admin-password"), false);
  assert.equal(
    JSON.stringify(verified).includes("baseline-secret-token"),
    false,
  );

  const dirty = makeFetch({ nonEmptyKey: "shipments" });
  await assert.rejects(
    () =>
      verifyManualAcceptanceEmptyBaseline({
        ...binding,
        fetchImpl: dirty.fetchImpl,
      }),
    (error) =>
      error?.code === "empty_baseline_not_empty" &&
      error?.details?.objectKey === "shipments",
  );
  const missingTotal = makeFetch({ omitTotalKey: "products" });
  await assert.rejects(
    () =>
      verifyManualAcceptanceEmptyBaseline({
        ...binding,
        fetchImpl: missingTotal.fetchImpl,
      }),
    (error) =>
      error?.code === "empty_baseline_total_missing" &&
      error?.details?.objectKey === "products",
  );
  const configMismatch = makeFetch();
  await assert.rejects(
    () =>
      verifyManualAcceptanceEmptyBaseline({
        ...binding,
        coreReport: { ...binding.coreReport, configRevision: "wrong" },
        fetchImpl: configMismatch.fetchImpl,
      }),
    (error) => error?.code === "empty_baseline_customer_config_mismatch",
  );
  assert.equal(
    configMismatch.requests.some(({ method }) => method === "list_customers"),
    false,
  );
});

test("core preflight rejects a shared local database before authentication", async () => {
  const methods = [];
  const fetchImpl = async (_url, init) => {
    if (!init.body) {
      methods.push("readyz");
      return {
        ok: false,
        status: 412,
        redirected: false,
        async text() {
          return "runtime identity mismatch";
        },
      };
    }
    const request = JSON.parse(init.body);
    methods.push(request.method);
    const data =
      request.method === "admin_login"
        ? { access_token: "admin-token" }
        : { databaseName: "plush_erp_simon_dev" };
    return {
      ok: true,
      status: 200,
      redirected: false,
      async json() {
        return { result: { code: 0, data } };
      },
    };
  };
  await assert.rejects(
    () =>
      verifyManualAcceptanceCoreReferences({
        backendURL: LOCAL_APPLY_BACKEND,
        policyTarget: "local-dev",
        databaseName: LOCAL_APPLY_DATABASE,
        datasetKey: "yoyoosun-manual-acceptance",
        dataVersion: "2026.07.16-v5",
        runId: "20260716-V5",
        adminPassword: "admin-password",
        fetchImpl,
      }),
    /identity precondition failed before authentication/u,
  );
  assert.deepEqual(methods, ["readyz"]);
});

test("core preflight rejects an old readyz-style 200 without the identity proof marker", async () => {
  const requests = [];
  await assert.rejects(
    () =>
      verifyManualAcceptanceCoreReferences({
        backendURL: CUSTOMER_TRIAL_133_ORIGIN,
        policyTarget: CUSTOMER_TRIAL_133_TARGET,
        datasetKey: "yoyoosun-manual-acceptance",
        dataVersion: "2026.07.16-v5",
        runId: "20260716-V5",
        targetAttestation: trialAttestation(),
        adminPassword: "admin-password",
        fetchImpl: async (_url, init) => {
          requests.push(init.body ? "rpc" : "runtime_identity");
          return {
            ok: true,
            status: 200,
            redirected: false,
            headers: { get: () => null },
            async text() {
              return "ready";
            },
          };
        },
      }),
    /identity precondition failed before authentication/u,
  );
  assert.deepEqual(requests, ["runtime_identity"]);
});

test("core preflight uses live debug capabilities and stops before business-code reads", async () => {
  const methods = [];
  const fetchImpl = async (_url, init) => {
    if (!init.body) {
      methods.push("runtime_identity");
      return {
        ok: true,
        status: 200,
        redirected: false,
        headers: {
          get: (name) =>
            name === "X-ERP-Runtime-Identity-Proof" ? "matched-v1" : null,
        },
        async text() {
          return "runtime identity matched";
        },
      };
    }
    const request = JSON.parse(init.body);
    methods.push(request.method);
    const data =
      request.method === "admin_login"
        ? { access_token: "admin-token" }
        : {
            environment: "remote",
            databaseName: "plush_erp_uat_20260716_v5",
            seedEnabled: false,
            seedAllowed: false,
            cleanupEnabled: false,
            cleanupAllowed: true,
            businessDataClearEnabled: false,
            businessDataClearAllowed: false,
          };
    return {
      ok: true,
      status: 200,
      redirected: false,
      async json() {
        return { result: { code: 0, data } };
      },
    };
  };
  await assert.rejects(
    () =>
      verifyManualAcceptanceCoreReferences({
        backendURL: CUSTOMER_TRIAL_133_ORIGIN,
        policyTarget: CUSTOMER_TRIAL_133_TARGET,
        datasetKey: "yoyoosun-manual-acceptance",
        dataVersion: "2026.07.16-v5",
        runId: "20260716-V5",
        targetAttestation: trialAttestation(),
        adminPassword: "admin-password",
        fetchImpl,
      }),
    /unsafe fields: cleanupAllowed/u,
  );
  assert.deepEqual(methods, [
    "runtime_identity",
    "admin_login",
    "capabilities",
  ]);
});

test("CLI apply uses one registry and target-free business inputs for both targets", async () => {
  let localCalls = 0;
  const localInputs = [];
  const localAdapters = [];
  const local = await runManualAcceptanceDatasetCli(
    localApplyArgs(),
    runnerDeps({
      onCall(_stageKey, invocation) {
        localCalls += 1;
        localInputs.push(invocation.businessInput);
        localAdapters.push(invocation.targetAdapter);
      },
    }),
  );
  assert.equal(local.exitCode, 0);
  assert.equal(local.report.ok, true);
  assert.equal(localCalls, MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS.length - 1);

  const trialPlan = buildManualAcceptanceDatasetTargetPlan({
    targetAlias: CUSTOMER_TRIAL_133_TARGET,
    targetAttestation: trialAttestation(),
    generatedAt: GENERATED_AT,
  });
  let trialCalls = 0;
  const trialInputs = [];
  const trialAdapters = [];
  const trial = await runManualAcceptanceDatasetCli(
    [
      "--apply",
      "--target",
      CUSTOMER_TRIAL_133_TARGET,
      "--backend-url",
      CUSTOMER_TRIAL_133_ORIGIN,
      "--data-version",
      "2026.07.16-v5",
      "--confirm",
      trialPlan.target.expectedConfirmation,
      "--target-attestation-json",
      JSON.stringify(trialAttestation()),
    ],
    runnerDeps({
      onCall(_stageKey, invocation) {
        trialCalls += 1;
        trialInputs.push(invocation.businessInput);
        trialAdapters.push(invocation.targetAdapter);
      },
    }),
  );
  assert.equal(trial.exitCode, 0);
  assert.equal(trial.report.ok, true);
  assert.equal(trialCalls, MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS.length - 1);
  assert.deepEqual(trialInputs, localInputs);
  assert.ok(
    localAdapters.every(
      (adapter) =>
        JSON.stringify(Object.keys(adapter)) ===
        JSON.stringify(MANUAL_ACCEPTANCE_TARGET_ADAPTER_KEYS),
    ),
  );
  assert.ok(
    trialAdapters.every(
      (adapter) =>
        JSON.stringify(Object.keys(adapter)) ===
        JSON.stringify(MANUAL_ACCEPTANCE_TARGET_ADAPTER_KEYS),
    ),
  );
  assert.ok(localAdapters.every((adapter) => adapter.alias === "local"));
  assert.ok(
    trialAdapters.every(
      (adapter) => adapter.alias === CUSTOMER_TRIAL_133_TARGET,
    ),
  );
  assert.deepEqual(Object.keys(MANUAL_ACCEPTANCE_DATASET_STAGE_REGISTRY), [
    ...MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS,
  ]);
  for (const stageKey of MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS) {
    assert.equal(
      local.report.stages.find((stage) => stage.key === stageKey).references
        .runner.handlerId,
      trial.report.stages.find((stage) => stage.key === stageKey).references
        .runner.handlerId,
    );
  }
  assert.deepEqual(
    trial.report.stages.slice(0, 3).map((stage) => stage.operation),
    ["verified", "verified", "applied"],
  );
});

test("help is read-only and describes the explicit apply boundary", async () => {
  const result = await runManualAcceptanceDatasetCli(["--help"]);
  assert.equal(result.exitCode, 0);
  assert.equal(result.plan, null);
  assert.match(result.text, /默认只生成/u);
  assert.match(result.text, /正式生产目标不在允许列表/u);
  assert.match(result.text, /fail-closed/u);
  assert.match(result.text, /--resume-report/u);
  assert.match(result.text, /不得删除回执/u);
  assert.match(result.text, /\.apply\.lock.*runner\/RPC 前阻断/u);
  assert.match(result.text, /不会自动删除.*重命名归档/u);
});
