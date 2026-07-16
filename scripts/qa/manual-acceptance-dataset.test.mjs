import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DEFAULT_MANUAL_ACCEPTANCE_DATA_VERSION,
  LOCAL_DATASET_TARGET,
  MANUAL_ACCEPTANCE_DATASET_STAGE_CAPABILITIES,
  MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS,
  ManualAcceptanceDatasetError,
  applyManualAcceptanceDataset,
  buildManualAcceptanceDatasetBundle,
  buildManualAcceptanceDatasetTargetPlan,
  buildManualAcceptanceSemanticPlan,
  deriveManualAcceptanceDatasetIdentity,
  digestManualAcceptanceSemanticPlan,
  evaluateManualAcceptanceTargetCapabilities,
  normalizeManualAcceptanceDataVersion,
  normalizeManualAcceptanceStageResult,
  parseManualAcceptanceDatasetArgs,
  runManualAcceptanceDatasetCli,
} from "./manual-acceptance-dataset.mjs";
import {
  MANUAL_ACCEPTANCE_DATASET_RUNNER_REVISION,
  MANUAL_ACCEPTANCE_DATASET_STAGE_REGISTRY,
  MANUAL_ACCEPTANCE_TARGET_ADAPTER_KEYS,
  assertManualAcceptanceDatasetReadinessBoundary,
  verifyManualAcceptanceCoreReferences,
} from "./manual-acceptance-dataset-runner.mjs";
import {
  CUSTOMER_TRIAL_133_ORIGIN,
  CUSTOMER_TRIAL_133_TARGET,
} from "./manual-acceptance-target-policy.mjs";

const GENERATED_AT = "2026-07-15T01:02:03.000Z";
const LOCAL_APPLY_BACKEND = "http://127.0.0.1:18376";
const LOCAL_APPLY_DATABASE = "plush_erp_acceptance_20260715_v3_dev";

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
  return {
    mode: stageKey === "readiness" ? "verify" : "apply",
    scope: `fake-${stageKey}`,
    simulatedOnly: true,
    datasetKey: businessInput.datasetKey,
    dataVersion: businessInput.dataVersion,
    runId: businessInput.runId,
    target: targetAdapter.policyTarget,
    backendURL: targetAdapter.backendURL,
    semanticDigest: `${stageKey}-component-digest`,
    summary:
      stageKey === "facts"
        ? {
            purchaseReceipts: 54,
            qualityInspections: 54,
            records: 108,
          }
        : stageKey === "readiness"
          ? { queryEvidenceComplete: true, records: 48 }
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
          reportPath: path.join(
            os.tmpdir(),
            "plush-manual-acceptance-dataset-tests",
            invocation.targetAdapter.alias,
            `${stageKey}.json`,
          ),
          operation: ["core", "readiness"].includes(stageKey)
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
    outputRoot: path.join(os.tmpdir(), "plush-manual-acceptance-dataset-tests"),
    credentials: {
      rolePassword: "role-password",
      adminPassword: "admin-password",
    },
    components: fakeComponents(options),
  };
}

test("dataset identity separates report version from safe script runId", () => {
  assert.equal(
    DEFAULT_MANUAL_ACCEPTANCE_DATA_VERSION,
    "2026.07.15-v3",
  );
  assert.equal(
    normalizeManualAcceptanceDataVersion("2026.07.15-V3"),
    "2026.07.15-v3",
  );
  const identity = deriveManualAcceptanceDatasetIdentity();
  assert.deepEqual(identity, {
    datasetKey: "yoyoosun-manual-acceptance",
    dataVersion: "2026.07.15-v3",
    runId: "20260715-V3",
    dateAnchorUtc: "2026-07-15T12:00:00.000Z",
    dateAnchorUnix: Date.parse("2026-07-15T12:00:00.000Z") / 1000,
    prefixes: {
      core: "SIM-PLUSH-CORE",
      source: "SIM-YOYOOSUN-UAT-20260715-V3",
      task: "SIM-YOYOOSUN-UAT-TASK-20260715-V3",
      purchaseQuality: "SIM-YOYOOSUN-PQ-20260715-V3",
      facts: "SIM-YOYOOSUN-UAT-FACT-20260715-V3",
      attachments: "SIM-YOYOOSUN-UAT-ATT-20260715-V3",
    },
  });

  assert.throws(
    () => normalizeManualAcceptanceDataVersion("2026.07.15-v1"),
    /unsupported dataVersion 2026\.07\.15-v1.*current.*2026\.07\.15-v3/u,
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
  assert.equal(bundle.dataVersion, "2026.07.15-v3");
  assert.match(bundle.semanticDigest, /^[0-9a-f]{64}$/u);
  assert.equal(bundle.cleanup, "retire/forward-only");
  assert.deepEqual(
    bundle.targets.map((item) => item.target.alias),
    [LOCAL_DATASET_TARGET, CUSTOMER_TRIAL_133_TARGET],
  );
  assert.equal(bundle.targets[0].target.backendURL, LOCAL_APPLY_BACKEND);
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
  assert.deepEqual(bundle.targets[0].target.stageCapabilities.blockedStages, []);
  assert.equal(bundle.targets[1].target.bindingReady, true);
  assert.equal(bundle.targets[1].target.applyReady, true);
  assert.deepEqual(bundle.targets[1].target.stageCapabilities.blockedStages, []);

  const serializedSemanticPlan = JSON.stringify(
    bundle.targets[0].semanticPlan,
  );
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
    dataVersion: "2026.07.15-v3",
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
    dataVersion: "2026.07.15-V3",
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
  assert.deepEqual(first.targets[0].semanticPlan, second.targets[0].semanticPlan);
  assert.equal(first.targets[0].semanticPlan.runId, "20260715-V3");
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

test("semantic plan locks the eight narrow stage contracts", () => {
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
  assert.deepEqual(
    Object.keys(MANUAL_ACCEPTANCE_DATASET_STAGE_CAPABILITIES),
    [...MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS],
  );
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
  assert.deepEqual(core.commands[0].args, ["--prefix", "SIM-PLUSH-CORE"]);
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
    role.commands[1].environment.MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM,
    "APPLY_SIMULATED_ACCOUNT_SCENARIOS",
  );
  assert.deepEqual(role.commands[0].args, ["--reset-password"]);
  assert(!role.commands[0].args.includes("--reset-local-super-admin"));
  assert.deepEqual(role.commands[1].args, [
    "--apply",
    "--target",
    "${TARGET_POLICY_TARGET}",
    "--data-version",
    "2026.07.15-v3",
    "--run-id",
    "20260715-V3",
    "--backend-url",
    "${TARGET_BACKEND_URL}",
    "--audit-minimum",
    "30",
  ]);

  const source = plan.stages.find((stage) => stage.key === "source");
  assert.equal(source.expected.scale.customers, 60);
  assert.equal(source.expected.scale.products, 20);
  assert.equal(source.expected.scale.salesOrders, 45);
  assert.ok(source.commands[0].args.includes("20260715-V3"));
  assert.equal(
    source.commands[0].args[source.commands[0].args.indexOf("--target") + 1],
    "${TARGET_POLICY_TARGET}",
  );
  assert.equal(
    source.commands[0].args[
      source.commands[0].args.indexOf("--data-version") + 1
    ],
    "2026.07.15-v3",
  );

  const taskStage = plan.stages.find((stage) => stage.key === "task");
  assert.equal(taskStage.expected.tasks, 180);
  assert.equal(
    taskStage.expected.scheduleAnchorUnix,
    Date.parse("2026-07-15T12:00:00.000Z") / 1000,
  );
  assert.equal(
    taskStage.commands[0].execution,
    MANUAL_ACCEPTANCE_DATASET_RUNNER_REVISION,
  );
  assert.equal(
    taskStage.commands[0].args[
      taskStage.commands[0].args.indexOf("--data-version") + 1
    ],
    "2026.07.15-v3",
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
    taskStage.commands[0].environment
      .MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON,
    source.commands[0].environment
      .MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON,
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
  assert.ok(facts.commands[0].args.includes("2026.07.15-v3"));
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

  const attachments = plan.stages.find(
    (stage) => stage.key === "attachments",
  );
  assert.equal(attachments.expected.owners, 7);
  assert.equal(attachments.expected.attachments, 27);
  assert.equal(attachments.expected.fixtures.length, 5);
  assert.equal(
    attachments.commands[0].environment
      .MANUAL_ACCEPTANCE_ATTACHMENT_CONFIRM,
    "APPLY_SIMULATED_MANUAL_ACCEPTANCE_ATTACHMENTS",
  );

  const readiness = plan.stages.find((stage) => stage.key === "readiness");
  assert.equal(readiness.writesBusinessData, false);
  assert.deepEqual(readiness.expected, {
    componentDataVersion: "2026.07.15-v3",
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
    ...Array.from({ length: 38 }, (_, index) => ({
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
      totalTargets: 48,
      passedTargetData: 38,
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
  wrongGap.targets[38].catalogGroup = "desktopPages";
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
    dataVersion: "2026.07.15-v3",
    target: "",
    backendURL: "",
    databaseName: "",
    confirmation: "",
    targetAttestation: "",
  });
  assert.throws(
    () => parseManualAcceptanceDatasetArgs(["--apply"]),
    /requires explicit --target/u,
  );
  assert.throws(
    () =>
      parseManualAcceptanceDatasetArgs([
        "--apply",
        "--target",
        "production",
      ]),
    /unsupported target production/u,
  );
  assert.throws(
    () => parseManualAcceptanceDatasetArgs(["--target", "local"]),
    /only valid with --apply/u,
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
  assert.equal(JSON.parse(result.text).semanticDigest, result.plan.semanticDigest);
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
        assert.equal(invocation.businessInput.dataVersion, "2026.07.15-v3");
        assert.equal(
          invocation.businessInput.dateAnchorUtc,
          "2026-07-15T12:00:00.000Z",
        );
        calls.push(stageKey);
      },
    }),
  );

  assert.equal(report.ok, true);
  assert.equal(report.failedStage, null);
  assert.equal(report.generatedAt, "2026-07-15T03:04:05.000Z");
  assert.equal(report.cleanup, "retire/forward-only");
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
            reportPath: path.join(os.tmpdir(), "facts-incomplete.json"),
          };
        },
      },
    }),
  );

  assert.equal(report.ok, false);
  assert.equal(report.failedStage, "purchase-quality");
  assert.deepEqual(calls, ["core", "role", "source", "task", "facts"]);
  assert.deepEqual(
    report.stages.map((stage) => stage.status),
    [
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
  assert.match(report.stages[5].error, /does not meet.*minimums/u);
  assert.equal(
    report.stages[5].blockedReason.code,
    "delegated_fact_evidence_incomplete",
  );
});

test("component identity mismatches fail closed before the next stage", async () => {
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
          component.dataVersion = "2026.07.15-v99";
          return component;
        },
      },
    }),
  );

  assert.equal(calls, 2);
  assert.equal(report.failedStage, "role");
  assert.match(report.stages[1].error, /dataVersion does not match/u);
  assert.equal(
    report.stages[1].blockedReason.code,
    "component_identity_mismatch",
  );
  assert.ok(
    report.stages.slice(2).every((stage) => stage.status === "not_started"),
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
  assert.match(unverifiable.stages[1].error, /explicit summary/u);
  assert.equal(
    unverifiable.stages[1].blockedReason.code,
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
    () =>
      applyManualAcceptanceDataset(
        implicitSharedLocal,
        {},
        runnerDeps(),
      ),
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
    "APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA:customer-trial-133:2026.07.15-v3:20260715-V3",
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
                databaseName: "plush_erp_uat_20260715",
                seedEnabled: false,
                seedAllowed: false,
                cleanupEnabled: false,
                cleanupAllowed: false,
                businessDataClearEnabled: false,
                businessDataClearAllowed: false,
              }
          : request.method === "list_units"
            ? { units: [{ id: 11, code: "SIM-PLUSH-CORE-PCS" }] }
            : {
                warehouses: [
                  "SIM-PLUSH-CORE-RM-WH",
                  "SIM-PLUSH-CORE-FG-WH",
                  "SIM-PLUSH-CORE-QC-HOLD",
                  "SIM-PLUSH-CORE-WIP-WH",
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
    dataVersion: "2026.07.15-v3",
    runId: "20260715-V3",
    targetAttestation: trialAttestation(),
    adminPassword: "admin-password",
  };
  const verified = await verifyManualAcceptanceCoreReferences({
    ...binding,
    fetchImpl: makeFetch(),
  });
  assert.deepEqual(verified, {
    databaseName: "plush_erp_uat_20260715",
    unitCode: "SIM-PLUSH-CORE-PCS",
    warehouseCodes: [
      "SIM-PLUSH-CORE-RM-WH",
      "SIM-PLUSH-CORE-FG-WH",
      "SIM-PLUSH-CORE-QC-HOLD",
      "SIM-PLUSH-CORE-WIP-WH",
    ],
    summary: { units: 1, warehouses: 4 },
  });
  assert.deepEqual(
    requests.map((item) => item.method),
    [
      "readyz",
      "admin_login",
      "capabilities",
      "list_units",
      "list_warehouses",
    ],
  );
  assert.equal(requests[0].headers["X-ERP-Runtime-Identity-Scope"], "release-v1");
  const expectedIdentityDigest = createHash("sha256")
    .update(
      [
        "release-v1",
        "plush_erp_uat_20260715",
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
  assert.equal(JSON.stringify(verified).includes("secret-token"), false);
  assert.equal(JSON.stringify(verified).includes('"id"'), false);

  await assert.rejects(
    () =>
      verifyManualAcceptanceCoreReferences({
        ...binding,
        fetchImpl: makeFetch("SIM-PLUSH-CORE-WIP-WH"),
      }),
    /SIM-PLUSH-CORE-WIP-WH/u,
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
        dataVersion: "2026.07.15-v3",
        runId: "20260715-V3",
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
        dataVersion: "2026.07.15-v3",
        runId: "20260715-V3",
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
            databaseName: "plush_erp_uat_20260715",
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
        dataVersion: "2026.07.15-v3",
        runId: "20260715-V3",
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
      "2026.07.15-v3",
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
    trial.report.stages.slice(0, 2).map((stage) => stage.operation),
    ["verified", "applied"],
  );
});

test("help is read-only and describes the explicit apply boundary", async () => {
  const result = await runManualAcceptanceDatasetCli(["--help"]);
  assert.equal(result.exitCode, 0);
  assert.equal(result.plan, null);
  assert.match(result.text, /默认只生成/u);
  assert.match(result.text, /正式生产目标不在允许列表/u);
  assert.match(result.text, /fail-closed/u);
});
