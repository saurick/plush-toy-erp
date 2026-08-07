import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  LOCAL_MANUAL_ACCEPTANCE_CONFIG_APPLY_PURPOSE,
  LOCAL_MANUAL_ACCEPTANCE_CONFIG_PRODUCT_VERSION,
  LOCAL_MANUAL_ACCEPTANCE_CONFIG_REVISION,
  resolveManualAcceptanceTarget,
} from "./manual-acceptance-target-policy.mjs";
import {
  SCENARIO_DEMO_CATALOG_TARGET_COUNT,
  SCENARIO_DEMO_READBACK_SCHEMA_VERSION,
  SCENARIO_DEMO_REPLAY_MODE,
  buildScenarioDemoCustomerConfigManifest,
  buildScenarioDemoPlan,
  buildScenarioDemoReadback,
  parseScenarioDemoArgs,
  preflightScenarioDemoRuntime,
  resolveLocalScenarioDemoCredentials,
  runScenarioDemoCli,
} from "./scenario-demo-data.mjs";
import {
  LONG_LIVED_WORKBENCH_ACTIONABLE_PER_ROLE,
  LONG_LIVED_WORKBENCH_TASK_COPY_REVISION,
  TASK_COPY_REVISION,
  TASK_PROFILE_LONG_LIVED_WORKBENCH,
} from "./manual-acceptance-task-data.mjs";

const HASH = "a".repeat(64);
const REPOSITORY = Object.freeze({
  commit: "b".repeat(40),
  dirty: true,
  fingerprint: "c".repeat(64),
});
const DATABASE_TARGET = Object.freeze({
  databaseName: "plush_erp",
  host: "192.168.0.106",
  port: 5432,
  safeTarget: "host=192.168.0.106 port=5432 database=plush_erp",
  targetFingerprint: HASH,
});
const RUNTIME = Object.freeze({
  target: "scenario-demo",
  customerKey: "yoyoosun",
  configRevision: LOCAL_MANUAL_ACCEPTANCE_CONFIG_REVISION,
  configProductVersion: LOCAL_MANUAL_ACCEPTANCE_CONFIG_PRODUCT_VERSION,
  configApplyPurpose: LOCAL_MANUAL_ACCEPTANCE_CONFIG_APPLY_PURPOSE,
  source: "active_customer_config_revision",
  requiredModules: [
    "customers",
    "suppliers",
    "products",
    "materials",
    "processes",
    "sales_orders",
    "workflow_tasks",
    "purchase_orders",
    "outsourcing_orders",
    "material_bom",
    "production_orders",
    "production",
    "inventory",
    "shipments",
    "finance",
    "finance_payments",
    "purchase_receipts",
    "quality_inspections",
  ],
});

function scenarioPlan() {
  return buildScenarioDemoPlan({
    repository: REPOSITORY,
    databaseTarget: DATABASE_TARGET,
    migrationFingerprint: "d".repeat(64),
    runtime: RUNTIME,
  });
}

function jsonRPCResult(data) {
  return {
    ok: true,
    status: 200,
    redirected: false,
    async json() {
      return { result: { code: 0, data } };
    },
  };
}

function runtimeFetch(url, init) {
  if (String(url).endsWith("/readyz/runtime-identity")) {
    return Promise.resolve({
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
    });
  }
  const request = JSON.parse(init.body);
  if (request.method === "admin_login") {
    return Promise.resolve(
      jsonRPCResult({
        username: "admin",
        is_super_admin: true,
        access_token: "runtime-only-token",
      }),
    );
  }
  if (request.method === "capabilities") {
    return Promise.resolve(
      jsonRPCResult({
        databaseName: "plush_erp",
        environment: "dev",
      }),
    );
  }
  if (request.method === "get_effective_session") {
    return Promise.resolve(
      jsonRPCResult({
        session: {
          customer: { key: "yoyoosun" },
          source: "active_customer_config_revision",
          configRevision: LOCAL_MANUAL_ACCEPTANCE_CONFIG_REVISION,
          configProductVersion: LOCAL_MANUAL_ACCEPTANCE_CONFIG_PRODUCT_VERSION,
          configApplyPurpose: LOCAL_MANUAL_ACCEPTANCE_CONFIG_APPLY_PURPOSE,
          modules: Object.fromEntries(
            RUNTIME.requiredModules.map((key) => [key, "enabled"]),
          ),
        },
      }),
    );
  }
  throw new Error(`unexpected RPC method ${request.method}`);
}

function planCommandRunner(targetURL) {
  return async (command, args) => {
    if (command === "go" && args.includes("./cmd/dburl")) {
      return { stdout: `${targetURL}\n`, stderr: "" };
    }
    if (command === process.execPath && args.includes("--mode")) {
      return {
        stdout: [
          "schema/migration 守卫通过",
          "migration 已是最新版本（20260729043852，42/42）",
          "non-system-schema function=0 procedure=0 non-internal-trigger=0",
        ].join("\n"),
        stderr: "",
      };
    }
    throw new Error(`unexpected command ${command} ${args.join(" ")}`);
  };
}

test("scenario-demo plan is fixed, long-lived, forward-only, and repository-bound", () => {
  const plan = scenarioPlan();
  assert.equal(plan.profileKey, "scenario-demo");
  assert.equal(plan.datasetKey, "yoyoosun-manual-acceptance");
  assert.equal(plan.dataVersion, "2026.07.16-v5");
  assert.equal(plan.runId, "20260716-V5");
  assert.deepEqual(plan.repository, REPOSITORY);
  assert.equal(plan.target.disposable, false);
  assert.equal(plan.target.registeredDevelopmentPostgresOnly, true);
  assert.equal(plan.target.loopbackBackendOnly, true);
  assert.equal(plan.execution.cleanupSupported, false);
  assert.equal(plan.execution.cleanupMode, "forward-only");
  assert.equal(plan.execution.replayMode, SCENARIO_DEMO_REPLAY_MODE);
  assert.equal(plan.execution.directBusinessSQL, false);
  assert.equal(plan.execution.manualAcceptanceCompleted, false);
  assert.equal(plan.execution.auditMinimum, 30);
  assert.equal(plan.taskPolicy.profile, TASK_PROFILE_LONG_LIVED_WORKBENCH);
  assert.equal(
    plan.taskPolicy.copyRevision,
    LONG_LIVED_WORKBENCH_TASK_COPY_REVISION,
  );
  assert.equal(
    plan.taskPolicy.stableActionablePerRole,
    LONG_LIVED_WORKBENCH_ACTIONABLE_PER_ROLE,
  );
  assert.equal(
    plan.taskPolicy.supersededBatch.copyRevision,
    TASK_COPY_REVISION,
  );
  assert.equal(plan.taskPolicy.physicalDelete, false);
  assert.deepEqual(plan.execution.stageOrder.slice(0, 4), [
    "core-references",
    "role-accounts",
    "customer-config",
    "accounts",
  ]);
  assert.match(plan.componentDigests.customerConfig, /^[0-9a-f]{64}$/u);
  assert.match(plan.planDigest, /^[0-9a-f]{64}$/u);
  assert.equal(
    buildScenarioDemoPlan({
      repository: REPOSITORY,
      databaseTarget: DATABASE_TARGET,
      migrationFingerprint: "d".repeat(64),
      runtime: RUNTIME,
    }).planDigest,
    plan.planDigest,
  );
});

test("scenario-demo binds the current tracked local-test customer configuration", () => {
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

test("scenario-demo resolves local-only defaults and keeps explicit server-side credential overrides", () => {
  assert.deepEqual(resolveLocalScenarioDemoCredentials(), {
    rolePassword: "12345678",
    adminPassword: "adminadmin",
  });
  assert.deepEqual(
    resolveLocalScenarioDemoCredentials({
      ERP_ROLE_DEMO_PASSWORD: "role-pass-123",
      REAL_LOGIN_ADMIN_PASSWORD: "admin-pass-123",
    }),
    {
      rolePassword: "role-pass-123",
      adminPassword: "admin-pass-123",
    },
  );
});

test("scenario-demo plan proves target, migration, and unauthenticated runtime identity without credential input or login", async () => {
  const environment = {};
  let authenticatedRPCs = 0;
  const result = await runScenarioDemoCli([], {
    projectRoot: "/repo",
    environment,
    commandRunner: planCommandRunner(
      "postgres://dev:db-secret@192.168.0.106:5432/plush_erp?sslmode=disable",
    ),
    fetchImpl: async (url, init) => {
      if (!String(url).endsWith("/readyz/runtime-identity")) {
        authenticatedRPCs += 1;
      }
      return runtimeFetch(url, init);
    },
    readRepository: async () => REPOSITORY,
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.plan.databaseName, "plush_erp");
  assert.equal(
    result.plan.runtime.configRevision,
    LOCAL_MANUAL_ACCEPTANCE_CONFIG_REVISION,
  );
  assert.doesNotMatch(
    result.text,
    /12345678|adminadmin|db-secret|runtime-only-token/u,
  );
  assert.equal(
    authenticatedRPCs,
    0,
    "plan/summary preflight must not authenticate or append audit records",
  );

  await assert.rejects(
    () =>
      runScenarioDemoCli([], {
        projectRoot: "/repo",
        environment,
        commandRunner: planCommandRunner(
          "postgres://dev:db-secret@192.168.0.133:5435/plush_erp?sslmode=disable",
        ),
        fetchImpl: runtimeFetch,
        readRepository: async () => REPOSITORY,
      }),
    /registered development PostgreSQL|registered non-disposable/u,
  );
});

test("scenario-demo authenticated runtime and customer config checks are reserved for confirmed apply", async () => {
  const policy = resolveManualAcceptanceTarget({
    target: "scenario-demo",
    backendURL: "http://127.0.0.1:8300",
    dataVersion: "2026.07.16-v5",
    runId: "20260716-V5",
    databaseName: "plush_erp",
  });
  const runtime = await preflightScenarioDemoRuntime({
    policy,
    rolePassword: "role-pass-123",
    adminPassword: "admin-pass-123",
    fetchImpl: runtimeFetch,
  });
  assert.equal(runtime.configRevision, LOCAL_MANUAL_ACCEPTANCE_CONFIG_REVISION);
  await assert.rejects(
    () =>
      preflightScenarioDemoRuntime({
        policy,
        rolePassword: "role-pass-123",
        adminPassword: "admin-pass-123",
        fetchImpl: async (url, init) => {
          const request = init?.body ? JSON.parse(init.body) : null;
          if (request?.method === "get_effective_session") {
            const response = await runtimeFetch(url, init);
            const payload = await response.json();
            payload.result.data.session.configRevision = "stale";
            return jsonRPCResult(payload.result.data);
          }
          return runtimeFetch(url, init);
        },
      }),
    /active local-test configuration identity/u,
  );
});

test("scenario-demo apply parser requires the prepared plan digest", () => {
  assert.deepEqual(parseScenarioDemoArgs([]), {
    apply: false,
    expectedPlanDigest: "",
    help: false,
  });
  assert.throws(
    () => parseScenarioDemoArgs(["--apply"]),
    /expected-plan-digest/u,
  );
  assert.deepEqual(
    parseScenarioDemoArgs([
      "--apply",
      "--expected-plan-digest",
      "e".repeat(64),
    ]),
    {
      apply: true,
      expectedPlanDigest: "e".repeat(64),
      help: false,
    },
  );
});

function batchIdentity(plan) {
  return {
    mode: "apply",
    datasetKey: plan.datasetKey,
    dataVersion: plan.dataVersion,
    runId: plan.runId,
    target: plan.profileKey,
    backendURL: plan.backendURL,
    databaseName: plan.databaseName,
  };
}

test("scenario-demo readback counts only formal source, ProcessRuntime, and Fact evidence", () => {
  const plan = scenarioPlan();
  const sourceReport = {
    ...batchIdentity(plan),
    semanticDigest: plan.componentDigests.source,
    prefix: "SIM-YOYOOSUN-UAT-V5",
    referenceRecords: {
      salesOrders: [{ id: 1 }, { id: 2 }],
      purchaseOrders: [{ id: 3 }],
      outsourcingOrders: [{ id: 4 }],
    },
  };
  const taskReport = {
    ...batchIdentity(plan),
    taskProfile: TASK_PROFILE_LONG_LIVED_WORKBENCH,
    copyRevision: LONG_LIVED_WORKBENCH_TASK_COPY_REVISION,
    provesProcessRuntime: true,
    runtimeEvidence: [{ caseKey: "active" }, { caseKey: "completed" }],
    displayOnlyTasks: { total: 180, provesProcessRuntime: false },
    prefix: "SIM-YOYOOSUN-UAT-TASK-V5",
    sourceType: "simulated-manual-acceptance-task-batch",
    sourceID: 2026071605,
    coverage: { catalogScenarioDigest: "1".repeat(64) },
    summary: {
      workbenchBuckets: { actionable: 108, risk: 40, history: 32 },
      workbenchBucketsByRole: Object.fromEntries(
        [
          "boss",
          "sales",
          "purchase",
          "production",
          "warehouse",
          "finance",
          "pmc",
          "quality",
          "engineering",
        ].map((roleKey) => [roleKey, { actionable: 12 }]),
      ),
    },
  };
  const taskRetireReport = {
    ...batchIdentity(plan),
    mode: "retire",
    keepBatch: {
      copyRevision: LONG_LIVED_WORKBENCH_TASK_COPY_REVISION,
    },
    retiredBatch: {
      copyRevision: TASK_COPY_REVISION,
      sourceID: plan.taskPolicy.supersededBatch.sourceID,
    },
    cleanup: { physicalDelete: false },
    summary: {
      total: 180,
      absent: false,
      activeBefore: 148,
      activeAfter: 0,
      actionsApplied: 175,
    },
  };
  const factReport = {
    ...batchIdentity(plan),
    reportContract: "source-driven-operational-facts-v1",
    semanticDigest: plan.componentDigests.source,
    financeFieldContract: { digest: "2".repeat(64) },
    referenceRecords: Object.fromEntries(
      [
        "productionFacts",
        "purchaseReceipts",
        "purchaseReturns",
        "purchaseReceiptAdjustments",
        "qualityInspections",
        "inventoryLots",
        "inventoryTxns",
        "outsourcingFacts",
        "stockReservations",
        "shipments",
        "financeFacts",
        "reworkIntakes",
        "financePayments",
        "financeCreditNotes",
      ].map((key, index) => [key, [{ id: index + 1 }]]),
    ),
  };
  const readinessReport = {
    ...batchIdentity(plan),
    mode: "verify",
    runtimePreflight: {
      configRevision: plan.runtime.configRevision,
      source: plan.runtime.source,
    },
    reportInputs: {
      sourceReport: {
        ...batchIdentity(plan),
        prefix: sourceReport.prefix,
      },
      taskReport: {
        ...batchIdentity(plan),
        prefix: taskReport.prefix,
        sourceType: taskReport.sourceType,
        sourceID: taskReport.sourceID,
        taskGroupCoverageDigest: taskReport.coverage.catalogScenarioDigest,
      },
      factReport: {
        ...batchIdentity(plan),
        reportContract: factReport.reportContract,
        semanticDigest: factReport.semanticDigest,
        financeFieldContract: factReport.financeFieldContract,
      },
    },
    summary: {
      totalTargets: SCENARIO_DEMO_CATALOG_TARGET_COUNT,
      passedTargetData: 42,
      failedTargetData: 0,
      notProvenTargetData: 10,
      queryChecksPassed: true,
      queryEvidenceComplete: false,
      browserChecksCompleted: 0,
      browserChecksPending: 52,
      manualAcceptanceCompleted: false,
    },
  };
  const readback = buildScenarioDemoReadback({
    plan,
    sourceReport,
    taskReport,
    taskRetireReport,
    factReport,
    readinessReport,
  });
  assert.deepEqual(readback, {
    schemaVersion: SCENARIO_DEMO_READBACK_SCHEMA_VERSION,
    profileKey: "scenario-demo",
    targetFingerprint: HASH,
    datasetKey: "yoyoosun-manual-acceptance",
    dataVersion: "2026.07.16-v5",
    runId: "20260716-V5",
    sourceDocumentCount: 4,
    processRuntimeCount: 2,
    taskProfile: TASK_PROFILE_LONG_LIVED_WORKBENCH,
    stableActionablePerRole: 12,
    stableActionableTaskCount: 108,
    supersededTaskBatch: {
      copyRevision: TASK_COPY_REVISION,
      total: 180,
      absent: false,
      activeBefore: 148,
      activeAfter: 0,
      actionsApplied: 175,
      physicalDelete: false,
    },
    factCount: 14,
    catalogReadyCount: 42,
    catalogTargetCount: 52,
    browserChecksPending: 10,
    manualAcceptanceCompleted: false,
    cleanupSupported: false,
    replayMode: "exact-create-or-readback",
  });
  assert.notEqual(readback.processRuntimeCount, 180);
  assert.throws(
    () =>
      buildScenarioDemoReadback({
        plan,
        sourceReport,
        taskReport,
        taskRetireReport,
        factReport,
        readinessReport: {
          ...readinessReport,
          summary: {
            ...readinessReport.summary,
            notProvenTargetData: 9,
          },
        },
      }),
    /incomplete or drifted/u,
  );
  assert.throws(
    () =>
      buildScenarioDemoReadback({
        plan,
        sourceReport,
        taskReport,
        taskRetireReport,
        factReport,
        readinessReport: {
          ...readinessReport,
          reportInputs: {
            ...readinessReport.reportInputs,
            factReport: {
              ...readinessReport.reportInputs.factReport,
              semanticDigest: "f".repeat(64),
            },
          },
        },
      }),
    /upstream semantic identity/u,
  );
});

test("scenario controller never routes business writes through legacy debug, mobile, dataset, or generic fact helpers", async () => {
  const source = await readFile(
    path.join(import.meta.dirname, "scenario-demo-data.mjs"),
    "utf8",
  );
  for (const forbidden of [
    "manual-acceptance-dataset.mjs",
    "mobile-workflow-simulated-closure.mjs",
    "operational-fact-simulated-closure.mjs",
    "trial-simulated-data.mjs",
  ]) {
    assert.doesNotMatch(
      source,
      new RegExp(forbidden.replaceAll(".", "\\."), "u"),
    );
  }
  assert.match(source, /applyManualAcceptanceSourceData/u);
  assert.match(source, /applyManualAcceptanceTaskData/u);
  assert.match(source, /retireLegacyManualAcceptanceTaskBatch/u);
  assert.match(source, /applyManualAcceptanceFactPlan/u);
  assert.match(source, /applyManualAcceptanceCustomerConfig/u);
  assert.match(source, /seed-role-demo-admins\.sh/u);
  assert.match(
    source,
    /assertReportIdentity\(accountReport, plan, "account"\)/u,
  );
  assert.match(source, /assertReadinessReportCoupling/u);
});
