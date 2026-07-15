import assert from "node:assert/strict";
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
  CUSTOMER_TRIAL_133_ORIGIN,
  CUSTOMER_TRIAL_133_TARGET,
} from "./manual-acceptance-target-policy.mjs";

const GENERATED_AT = "2026-07-15T01:02:03.000Z";

function trialAttestation(release = "release-929ec0b3", migration = "atlas-head") {
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
    references,
  };
}

function makeSyntheticExecutablePlan(plan) {
  const semanticPlan = structuredClone(plan.semanticPlan);
  for (const stage of semanticPlan.stages) {
    stage.applyCapability = {
      mode: "synthetic-test-runner",
      supportedTargets: [plan.target.alias],
      reason: "unit test exercises the runner receipt contract",
    };
  }
  return {
    ...plan,
    semanticPlan,
    semanticDigest: digestManualAcceptanceSemanticPlan(semanticPlan),
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
        backendURL: "http://localhost:8300",
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
  assert.equal(bundle.targets[0].target.backendURL, "http://localhost:8300");
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
        targetAttestation: trialAttestation("release-a", "migration-a"),
      },
    },
  });
  const second = buildManualAcceptanceDatasetBundle({
    dataVersion: "2026.07.15-V3",
    generatedAt: "2030-01-01T00:00:00.000Z",
    targetOverrides: {
      local: { backendURL: "http://localhost:9999" },
      [CUSTOMER_TRIAL_133_TARGET]: {
        targetAttestation: trialAttestation("release-b", "migration-b"),
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
        mode: "target-specific",
        supportedTargets: ["local", CUSTOMER_TRIAL_133_TARGET],
      },
      role: {
        mode: "target-specific",
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
    placeholders: {
      "${TARGET_POLICY_TARGET}": "target.policyTarget",
      "${TARGET_BACKEND_URL}": "target.backendURL",
      "${TARGET_CONFIRMATION}": "targetConfirmation",
      "${TARGET_ATTESTATION_JSON}": "targetAttestation",
    },
  });
  assert.equal(plan.stages[0].commands[0].entrypoint, "scripts/seed-core-demo-data.sh");
  assert.deepEqual(plan.stages[0].commands[0].args, [
    "--prefix",
    "SIM-PLUSH-CORE",
  ]);
  assert.equal(
    plan.stages[0].targetExecution[CUSTOMER_TRIAL_133_TARGET].seedAllowed,
    false,
  );
  assert.deepEqual(
    plan.stages[0].targetExecution[CUSTOMER_TRIAL_133_TARGET]
      .allowedOperations,
    ["verified", "reused"],
  );
  assert.equal(plan.stages[0].commands[0].remoteSeedAllowed, false);

  const role = plan.stages.find((stage) => stage.key === "role");
  assert.equal(role.expected.formalAccounts.length, 10);
  assert.equal(role.expected.scenarioAccounts.length, 3);
  assert.equal(
    role.targetExecution[CUSTOMER_TRIAL_133_TARGET].seedAllowed,
    false,
  );
  assert.equal(role.commands.at(-1).operation, "verify-or-reuse");
  assert.equal(
    role.commands[1].environment.MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM,
    "APPLY_SIMULATED_ACCOUNT_SCENARIOS",
  );
  assert.deepEqual(role.commands[0].args, ["--reset-password"]);
  assert(!role.commands[0].args.includes("--reset-local-super-admin"));
  assert.deepEqual(role.commands[1].args, [
    "--apply",
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
    "injected-stage-runner-only",
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
  assert.equal(readiness.expected.componentDataVersion, "2026.07.15-v3");
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
  const plan = makeSyntheticExecutablePlan(
    buildManualAcceptanceDatasetTargetPlan({
      targetAlias: "local",
      generatedAt: GENERATED_AT,
    }),
  );
  const calls = [];
  const report = await applyManualAcceptanceDataset(plan, {}, {
    now: () => new Date("2026-07-15T03:04:05.000Z"),
    async runStage(context) {
      assert.equal(context.target.alias, "local");
      assert.equal(context.dataVersion, "2026.07.15-v3");
      assert.equal(context.dateAnchorUtc, "2026-07-15T12:00:00.000Z");
      assert.equal(context.targetConfirmation, null);
      assert.equal(context.targetAttestation, null);
      assert.equal(context.completedStages.length, calls.length);
      calls.push(context.stage.key);
      return completedStageResult(context, {
        operation: ["purchase-quality", "readiness"].includes(
          context.stage.key,
        )
          ? "verified"
          : "applied",
        summary: { records: calls.length },
        references: { environmentDatabaseId: calls.length * 100 },
      });
    },
  });

  assert.equal(report.ok, true);
  assert.equal(report.failedStage, null);
  assert.equal(report.generatedAt, "2026-07-15T03:04:05.000Z");
  assert.equal(report.cleanup, "retire/forward-only");
  assert.deepEqual(calls, [...MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS]);
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
  assert.equal(report.stages[0].references.environmentDatabaseId, 100);
  assert.equal(
    report.semanticDigest,
    digestManualAcceptanceSemanticPlan(plan.semanticPlan),
  );
});

test("apply stops at the first failed stage and leaves later stages not started", async () => {
  const plan = makeSyntheticExecutablePlan(
    buildManualAcceptanceDatasetTargetPlan({
      targetAlias: "local",
      generatedAt: GENERATED_AT,
    }),
  );
  const calls = [];
  const report = await applyManualAcceptanceDataset(plan, {}, {
    now: () => new Date(GENERATED_AT),
    async runStage(context) {
      const { stage } = context;
      calls.push(stage.key);
      if (stage.key === "purchase-quality") {
        throw new Error("partial batch collision");
      }
      return completedStageResult(context);
    },
  });

  assert.equal(report.ok, false);
  assert.equal(report.failedStage, "purchase-quality");
  assert.deepEqual(calls, [
    "core",
    "role",
    "source",
    "task",
    "purchase-quality",
  ]);
  assert.deepEqual(
    report.stages.map((stage) => stage.status),
    [
      "completed",
      "completed",
      "completed",
      "completed",
      "failed",
      "not_started",
      "not_started",
      "not_started",
    ],
  );
  assert.match(report.stages[4].error, /partial batch collision/u);
});

test("runner result mismatches fail closed before the next stage", async () => {
  const plan = makeSyntheticExecutablePlan(
    buildManualAcceptanceDatasetTargetPlan({
      targetAlias: "local",
      generatedAt: GENERATED_AT,
    }),
  );
  let calls = 0;
  const report = await applyManualAcceptanceDataset(plan, {}, {
    now: () => new Date(GENERATED_AT),
    async runStage(context) {
      calls += 1;
      return {
        ...completedStageResult(context),
        dataVersion: "2026.07.15-v99",
      };
    },
  });

  assert.equal(calls, 1);
  assert.equal(report.failedStage, "core");
  assert.match(report.stages[0].error, /different dataVersion/u);
  assert.ok(report.stages.slice(1).every((stage) => stage.status === "not_started"));
});

test("runner cannot turn skipped or unverifiable work into a completed stage", async () => {
  const plan = makeSyntheticExecutablePlan(
    buildManualAcceptanceDatasetTargetPlan({
      targetAlias: "local",
      generatedAt: GENERATED_AT,
    }),
  );
  const skipped = await applyManualAcceptanceDataset(plan, {}, {
    now: () => new Date(GENERATED_AT),
    async runStage(context) {
      return {
        ...completedStageResult(context),
        status: "skipped",
      };
    },
  });
  assert.equal(skipped.failedStage, "core");
  assert.match(skipped.stages[0].error, /non-complete status=skipped/u);

  const unverifiable = await applyManualAcceptanceDataset(plan, {}, {
    now: () => new Date(GENERATED_AT),
    async runStage() {
      return { operation: "completed" };
    },
  });
  assert.equal(unverifiable.failedStage, "core");
  assert.match(unverifiable.stages[0].error, /must return ok=true/u);
});

test("stage receipt requires exact identity and explicit report objects", () => {
  const plan = makeSyntheticExecutablePlan(
    buildManualAcceptanceDatasetTargetPlan({
      targetAlias: "local",
      generatedAt: GENERATED_AT,
    }),
  );
  const stage = plan.semanticPlan.stages[0];
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
    references: { unitId: 10 },
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
});

test("apply requires exact target binding and forbids remote core or role seed", async () => {
  const localPlan = buildManualAcceptanceDatasetTargetPlan({
    targetAlias: "local",
    generatedAt: GENERATED_AT,
  });
  assert.equal(localPlan.target.applyReady, true);
  await assert.rejects(
    () => applyManualAcceptanceDataset(localPlan),
    /requires an injected runStage/u,
  );

  const unboundTrial = buildManualAcceptanceDatasetTargetPlan({
    targetAlias: CUSTOMER_TRIAL_133_TARGET,
    generatedAt: GENERATED_AT,
  });
  await assert.rejects(
    () =>
      applyManualAcceptanceDataset(
        unboundTrial,
        { confirmation: unboundTrial.target.expectedConfirmation },
        { runStage: async () => undefined },
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
        { runStage: async () => undefined },
      ),
    /external apply requires/u,
  );

  const forbiddenSeed = await applyManualAcceptanceDataset(
    trialPlan,
    { confirmation: trialPlan.target.expectedConfirmation },
    {
      now: () => new Date(GENERATED_AT),
      async runStage(context) {
        return completedStageResult(context, { operation: "applied" });
      },
    },
  );
  assert.equal(forbiddenSeed.ok, false);
  assert.equal(forbiddenSeed.failedStage, "core");
  assert.match(
    forbiddenSeed.stages[0].error,
    /operation=applied is forbidden for target customer-trial-133/u,
  );
});

test("CLI apply executes both current targets through explicit injected stage receipts", async () => {
  let localCalls = 0;
  const local = await runManualAcceptanceDatasetCli(
    ["--apply", "--target", "local"],
    {
      now: () => new Date(GENERATED_AT),
      async runStage(context) {
        localCalls += 1;
        return completedStageResult(context, {
          operation: ["purchase-quality", "readiness"].includes(
            context.stage.key,
          )
            ? "verified"
            : "applied",
        });
      },
    },
  );
  assert.equal(local.exitCode, 0);
  assert.equal(local.report.ok, true);
  assert.equal(localCalls, MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS.length);

  const trialPlan = buildManualAcceptanceDatasetTargetPlan({
    targetAlias: CUSTOMER_TRIAL_133_TARGET,
    targetAttestation: trialAttestation(),
    generatedAt: GENERATED_AT,
  });
  let trialCalls = 0;
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
    {
      now: () => new Date(GENERATED_AT),
      async runStage(context) {
        trialCalls += 1;
        return completedStageResult(context, {
          operation: ["core", "role"].includes(context.stage.key)
            ? "reused"
            : ["purchase-quality", "readiness"].includes(context.stage.key)
              ? "verified"
              : "applied",
        });
      },
    },
  );
  assert.equal(trial.exitCode, 0);
  assert.equal(trial.report.ok, true);
  assert.equal(trialCalls, MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS.length);
  assert.deepEqual(
    trial.report.stages.slice(0, 2).map((stage) => stage.operation),
    ["reused", "reused"],
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
