import assert from "node:assert/strict";
import test from "node:test";

import { PERSISTENT_SCENARIO_DATASET_TARGET } from "./manual-acceptance-dataset.mjs";
import {
  CUSTOMER_TRIAL_133_CONFIG_APPLY_PURPOSE,
  CUSTOMER_TRIAL_133_CONFIG_DATA_VERSION,
  CUSTOMER_TRIAL_133_CONFIG_PRODUCT_VERSION,
  CUSTOMER_TRIAL_133_CONFIG_REVISION,
  CUSTOMER_TRIAL_133_DATABASE,
  CUSTOMER_TRIAL_133_ORIGIN,
  CUSTOMER_TRIAL_133_TARGET,
  LOCAL_MANUAL_ACCEPTANCE_CONFIG_APPLY_PURPOSE,
  LOCAL_MANUAL_ACCEPTANCE_CONFIG_PRODUCT_VERSION,
  LOCAL_MANUAL_ACCEPTANCE_CONFIG_REVISION,
  SCENARIO_DEMO_ORIGIN,
} from "./manual-acceptance-target-policy.mjs";
import {
  SCENARIO_DEMO_READBACK_SCHEMA_VERSION,
  SCENARIO_DEMO_REPLAY_MODE,
  SCENARIO_DEMO_SCHEMA_VERSION,
  ScenarioDemoError,
  buildScenarioDemoCustomerConfigManifest,
  buildScenarioDemoPlan,
  buildScenarioDemoReadback,
  parseScenarioDemoArgs,
  resolveCustomerTrialScenarioDemoCredentials,
  resolveLocalScenarioDemoCredentials,
  runScenarioDemoCli,
  scenarioDemoDigest,
} from "./scenario-demo-data.mjs";

const REPOSITORY = Object.freeze({
  commit: "b".repeat(40),
  dirty: false,
  fingerprint: "c".repeat(64),
});
const LOCAL_DATABASE = Object.freeze({
  databaseName: "plush_erp",
  host: "192.168.0.106",
  port: 5432,
  safeTarget: "registered-development:plush_erp",
  targetFingerprint: "a".repeat(64),
});
const MIGRATION_VERSION = "20260729043852";

function trialAttestation() {
  return {
    target: CUSTOMER_TRIAL_133_TARGET,
    origin: CUSTOMER_TRIAL_133_ORIGIN,
    customerKey: "yoyoosun",
    environment: "prod",
    release: "d".repeat(40),
    migration: MIGRATION_VERSION,
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

function localPlan() {
  return buildScenarioDemoPlan({
    repository: REPOSITORY,
    databaseTarget: LOCAL_DATABASE,
    migrationFingerprint: "e".repeat(64),
    migrationVersion: MIGRATION_VERSION,
  });
}

function remotePlan() {
  return buildScenarioDemoPlan({
    repository: REPOSITORY,
    targetAlias: CUSTOMER_TRIAL_133_TARGET,
    targetAttestation: trialAttestation(),
    migrationFingerprint: "f".repeat(64),
    migrationVersion: MIGRATION_VERSION,
  });
}

function completedDatasetReport(plan) {
  const summaries = {
    core: { units: 11, warehouses: 4 },
    baseline: { legacyDataPreserved: true },
    role: { accounts: 13 },
    source: {
      "sales_order.create": 1,
      "purchase_order.create": 1,
      "outsourcing_order.create": 1,
    },
    task: { byRole: { sales: 2, purchase: 2, production: 2 } },
    "purchase-quality": { purchaseReceipts: 1 },
    facts: { productionFacts: 2, inventoryTxns: 3, shipments: 1 },
    attachments: { attachments: 4 },
    readiness: {
      passedTargetData: 41,
      totalTargets: 51,
      notProvenTargetData: 10,
      queryChecksPassed: true,
      manualAcceptanceCompleted: false,
    },
  };
  return {
    ok: true,
    dataVersion: plan.dataVersion,
    runId: plan.runId,
    semanticDigest: plan.semanticDigest,
    target: { alias: plan.targetAlias, databaseName: plan.databaseName },
    stages: plan.canonicalRunner.stageOrder.map((key) => ({
      key,
      status: "completed",
      summary: summaries[key],
    })),
  };
}

test("local and 133 plans share one canonical semantic contract with independent identities", () => {
  const local = localPlan();
  const remote = remotePlan();

  assert.equal(local.schemaVersion, SCENARIO_DEMO_SCHEMA_VERSION);
  assert.equal(local.targetAlias, PERSISTENT_SCENARIO_DATASET_TARGET);
  assert.equal(local.targetEnvironment, "local-development");
  assert.equal(local.backendURL, SCENARIO_DEMO_ORIGIN);
  assert.equal(local.databaseName, "plush_erp");
  assert.equal(local.dataVersion, "2026.08.15-v6");
  assert.equal(local.runId, "20260815-V6");
  assert.equal(local.canonicalRunner.stageCount, 9);
  assert.equal(local.canonicalRunner.persistentBaseline, true);
  assert.equal(local.execution.replayMode, SCENARIO_DEMO_REPLAY_MODE);
  assert.equal(local.execution.dataRetention, "long-lived");
  assert.equal(local.execution.cleanupSupported, false);
  assert.equal(local.execution.directBusinessSQL, false);

  assert.equal(remote.targetAlias, CUSTOMER_TRIAL_133_TARGET);
  assert.equal(remote.targetEnvironment, "customer-trial-133");
  assert.equal(remote.backendURL, CUSTOMER_TRIAL_133_ORIGIN);
  assert.equal(remote.databaseName, CUSTOMER_TRIAL_133_DATABASE);
  assert.equal(remote.release, trialAttestation().release);
  assert.equal(local.semanticDigest, remote.semanticDigest);
  assert.deepEqual(
    local.canonicalPlan.semanticPlan,
    remote.canonicalPlan.semanticPlan,
  );
  assert.notEqual(
    local.target.targetFingerprint,
    remote.target.targetFingerprint,
  );
  assert.notEqual(local.planDigest, remote.planDigest);
  assert.match(local.planDigest, /^[0-9a-f]{64}$/u);
  assert.equal(JSON.stringify(local).includes("password"), false);
  assert.equal(JSON.stringify(remote).includes("token"), false);
});

test("target-specific runtime configuration stays outside the shared business definition", () => {
  const local = localPlan();
  const remote = remotePlan();
  assert.deepEqual(local.runtime, {
    customerKey: "yoyoosun",
    configRevision: LOCAL_MANUAL_ACCEPTANCE_CONFIG_REVISION,
    configProductVersion: LOCAL_MANUAL_ACCEPTANCE_CONFIG_PRODUCT_VERSION,
    configApplyPurpose: LOCAL_MANUAL_ACCEPTANCE_CONFIG_APPLY_PURPOSE,
    configDatasetVersion: null,
    configTarget: null,
  });
  assert.deepEqual(remote.runtime, {
    customerKey: "yoyoosun",
    configRevision: CUSTOMER_TRIAL_133_CONFIG_REVISION,
    configProductVersion: CUSTOMER_TRIAL_133_CONFIG_PRODUCT_VERSION,
    configApplyPurpose: CUSTOMER_TRIAL_133_CONFIG_APPLY_PURPOSE,
    configDatasetVersion: CUSTOMER_TRIAL_133_CONFIG_DATA_VERSION,
    configTarget: CUSTOMER_TRIAL_133_TARGET,
  });
  assert.equal(local.canonicalPlan.semanticPlan.customerKey, "yoyoosun");
  assert.equal(
    JSON.stringify(local.canonicalPlan.semanticPlan).includes(
      LOCAL_MANUAL_ACCEPTANCE_CONFIG_REVISION,
    ),
    false,
  );
});

test("local customer configuration manifest is the tracked runtime package", () => {
  const manifest = buildScenarioDemoCustomerConfigManifest();
  assert.equal(manifest.customer_key, "yoyoosun");
  assert.equal(manifest.revision, LOCAL_MANUAL_ACCEPTANCE_CONFIG_REVISION);
  assert.equal(
    manifest.product_version,
    LOCAL_MANUAL_ACCEPTANCE_CONFIG_PRODUCT_VERSION,
  );
  assert.equal(
    manifest.compiled_snapshot.applyPurpose,
    LOCAL_MANUAL_ACCEPTANCE_CONFIG_APPLY_PURPOSE,
  );
});

test("readback requires every canonical stage and reports target-bound evidence", () => {
  const plan = localPlan();
  const report = completedDatasetReport(plan);
  const readback = buildScenarioDemoReadback({ plan, datasetReport: report });

  assert.deepEqual(readback, {
    schemaVersion: SCENARIO_DEMO_READBACK_SCHEMA_VERSION,
    profileKey: "scenario-demo",
    targetKey: "local-development",
    targetEnvironment: "local-development",
    targetFingerprint: LOCAL_DATABASE.targetFingerprint,
    databaseName: "plush_erp",
    release: REPOSITORY.commit,
    migrationVersion: MIGRATION_VERSION,
    customerConfigRevision: LOCAL_MANUAL_ACCEPTANCE_CONFIG_REVISION,
    datasetKey: "yoyoosun-manual-acceptance",
    dataVersion: "2026.08.15-v6",
    runId: "20260815-V6",
    semanticDigest: plan.semanticDigest,
    stageCount: 9,
    sourceDocumentCount: 3,
    processRuntimeCount: 3,
    factCount: 6,
    catalogReadyCount: 41,
    catalogTargetCount: 51,
    browserChecksPending: 10,
    manualAcceptanceCompleted: false,
    cleanupSupported: false,
    replayMode: SCENARIO_DEMO_REPLAY_MODE,
  });

  const replayed = completedDatasetReport(plan);
  replayed.stages.find(({ key }) => key === "source").summary = {
    "sales_order.reuse": 1,
    "purchase_order.reuse": 1,
    "outsourcing_order.reuse": 1,
  };
  assert.equal(
    buildScenarioDemoReadback({ plan, datasetReport: replayed })
      .sourceDocumentCount,
    3,
  );

  const incomplete = completedDatasetReport(plan);
  incomplete.stages = incomplete.stages.filter(
    ({ key }) => key !== "attachments",
  );
  assert.throws(
    () => buildScenarioDemoReadback({ plan, datasetReport: incomplete }),
    /canonical dataset readback is incomplete/u,
  );

  const drifted = completedDatasetReport(plan);
  drifted.semanticDigest = "0".repeat(64);
  assert.throws(
    () => buildScenarioDemoReadback({ plan, datasetReport: drifted }),
    /canonical dataset readback is incomplete/u,
  );
});

test("plan validation fails closed for arbitrary target, database, migration, or attestation", () => {
  assert.throws(
    () =>
      buildScenarioDemoPlan({
        repository: REPOSITORY,
        targetAlias: "production",
        databaseTarget: LOCAL_DATABASE,
        migrationFingerprint: "e".repeat(64),
        migrationVersion: MIGRATION_VERSION,
      }),
    /target alias is invalid/u,
  );
  assert.throws(
    () =>
      buildScenarioDemoPlan({
        repository: REPOSITORY,
        databaseTarget: { ...LOCAL_DATABASE, host: "127.0.0.1" },
        migrationFingerprint: "e".repeat(64),
        migrationVersion: MIGRATION_VERSION,
      }),
    /database identity is incomplete/u,
  );
  assert.throws(
    () =>
      buildScenarioDemoPlan({
        repository: REPOSITORY,
        databaseTarget: LOCAL_DATABASE,
        migrationFingerprint: "bad",
        migrationVersion: MIGRATION_VERSION,
      }),
    /preflight identity is incomplete/u,
  );
  assert.throws(
    () =>
      buildScenarioDemoPlan({
        repository: REPOSITORY,
        targetAlias: CUSTOMER_TRIAL_133_TARGET,
        targetAttestation: {
          ...trialAttestation(),
          debug: { ...trialAttestation().debug, seedAllowed: true },
        },
        migrationFingerprint: "f".repeat(64),
        migrationVersion: MIGRATION_VERSION,
      }),
    /unsafe fields: seedAllowed/u,
  );
});

test("CLI accepts only registered persistent targets and binds apply to plan digest", () => {
  assert.deepEqual(parseScenarioDemoArgs([]), {
    apply: false,
    expectedPlanDigest: "",
    target: PERSISTENT_SCENARIO_DATASET_TARGET,
    targetAttestation: "",
    help: false,
  });
  assert.equal(
    parseScenarioDemoArgs(["--target", CUSTOMER_TRIAL_133_TARGET]).target,
    CUSTOMER_TRIAL_133_TARGET,
  );
  assert.throws(
    () => parseScenarioDemoArgs(["--target", "production"]),
    /not registered/u,
  );
  assert.throws(
    () => parseScenarioDemoArgs(["--apply"]),
    /requires --expected-plan-digest/u,
  );
  assert.throws(
    () => parseScenarioDemoArgs(["--host", "192.168.0.106"]),
    /unknown option/u,
  );
});

test("local CLI plan proves database, migration, runtime, and repository", async () => {
  const calls = [];
  const commandRunner = async (command, args) => {
    calls.push({ command, args });
    if (command === "go") {
      return {
        stdout:
          "postgres://user:redacted@192.168.0.106:5432/plush_erp?sslmode=disable\n",
        stderr: "",
      };
    }
    return {
      stdout: [
        "schema/migration 守卫通过",
        `migration 已是最新版本（${MIGRATION_VERSION}，42/42）`,
        "non-system-schema function=0 procedure=0 non-internal-trigger=0",
      ].join("\n"),
      stderr: "",
    };
  };
  const fetchImpl = async (url, init) => {
    assert.equal(url, `${SCENARIO_DEMO_ORIGIN}/readyz/runtime-identity`);
    assert.equal(init.method, "GET");
    return {
      ok: true,
      status: 200,
      redirected: false,
      headers: {
        get(name) {
          return name === "X-ERP-Runtime-Identity-Proof" ? "matched-v1" : null;
        },
      },
      async text() {
        return "runtime identity matched";
      },
    };
  };

  const result = await runScenarioDemoCli([], {
    projectRoot: "/workspace",
    environment: {},
    commandRunner,
    fetchImpl,
    readRepository: async () => REPOSITORY,
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.plan.targetAlias, PERSISTENT_SCENARIO_DATASET_TARGET);
  assert.equal(result.plan.databaseName, "plush_erp");
  assert.equal(result.plan.migrationVersion, MIGRATION_VERSION);
  assert.equal(result.readback, null);
  assert.equal(calls.length, 2);
  assert.equal(result.text.includes("postgres://"), false);
});

test("credential lookup is runtime-only and digesting is order-stable", () => {
  assert.deepEqual(
    resolveLocalScenarioDemoCredentials({
      MANUAL_ACCEPTANCE_PASSWORD: "role-secret",
      MANUAL_ACCEPTANCE_ADMIN_PASSWORD: "admin-secret",
    }),
    { rolePassword: "role-secret", adminPassword: "admin-secret" },
  );
  assert.deepEqual(
    resolveCustomerTrialScenarioDemoCredentials({
      MANUAL_ACCEPTANCE_PASSWORD: "trial-role-secret",
      MANUAL_ACCEPTANCE_ADMIN_PASSWORD: "trial-admin-secret",
      ERP_ROLE_DEMO_PASSWORD: "must-not-fallback",
      REAL_LOGIN_ADMIN_PASSWORD: "must-not-fallback",
    }),
    {
      rolePassword: "trial-role-secret",
      adminPassword: "trial-admin-secret",
    },
  );
  assert.throws(
    () =>
      resolveCustomerTrialScenarioDemoCredentials({
        ERP_ROLE_DEMO_PASSWORD: "local-only",
        REAL_LOGIN_ADMIN_PASSWORD: "local-only",
      }),
    /controlled runtime credentials/u,
  );
  assert.equal(
    scenarioDemoDigest({ b: 2, a: 1 }),
    scenarioDemoDigest({ a: 1, b: 2 }),
  );
  assert.ok(new ScenarioDemoError("blocked", 2) instanceof Error);
});
