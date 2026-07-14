#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { yoyoosunTrialDataFixture } from "../../config/customers/yoyoosun/trialDataFixture.mjs";

const currentFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(currentFile), "..", "..");

export const TEST_DATA_ISOLATION_BUCKETS = Object.freeze([
  "product-core-demo-seed",
  "customer-trial-simulated-data",
  "real-import-prep",
]);

const NO_FORMAL_FACT_SQL_PATTERN =
  /INSERT\s+INTO\s+(customers|suppliers|contacts|sales_orders|business_records|inventory_txns|shipments?|finance_facts)\b/iu;
const NO_DIRECT_DB_PATTERN =
  /\b(sql\.Open|pgx|POSTGRES_DSN|INSERT\s+INTO|UPDATE\s+[A-Za-z_]+\s+SET|DELETE\s+FROM)\b/iu;

const TRIAL_FIXTURE_BEHAVIOR_RULES = Object.freeze([
  {
    message: "yoyoosun trial fixture must remain preview-only",
    verify: (fixture) => fixture?.status === "preview_only",
  },
  {
    message:
      "yoyoosun trial fixture must use one synthetic source identity for every top-level record",
    verify: (fixture) => {
      const fixtureKey = String(fixture?.fixtureKey || "").trim();
      if (!fixtureKey.startsWith("__synthetic_") || !fixtureKey.endsWith("__")) {
        return false;
      }
      return Object.values(fixture || {})
        .filter(Array.isArray)
        .flat()
        .every(
          (record) =>
            Array.isArray(record?.sourceIds) &&
            record.sourceIds.length === 1 &&
            record.sourceIds[0] === fixtureKey,
        );
    },
  },
  {
    message: "yoyoosun trial fixture must cover a cancelled sales order",
    verify: (fixture) =>
      fixture?.salesOrders?.some(
        (order) => order.lifecycleStatus === "cancelled",
      ) === true,
  },
  {
    message: "yoyoosun trial fixture must cover a rejected quality inspection",
    verify: (fixture) =>
      fixture?.qualityInspections?.some(
        (inspection) => inspection.result === "rejected",
      ) === true,
  },
  {
    message: "yoyoosun trial fixture must cover a cancelled shipment",
    verify: (fixture) =>
      fixture?.shipments?.some((shipment) => shipment.status === "cancelled") ===
      true,
  },
  {
    message: "yoyoosun trial fixture must cover a boss-owned workflow task",
    verify: (fixture) =>
      fixture?.workflowTasks?.some((task) => task.ownerRoleKey === "boss") ===
      true,
  },
]);

export function trialFixtureCoverageViolations(
  fixture = yoyoosunTrialDataFixture,
) {
  return TRIAL_FIXTURE_BEHAVIOR_RULES.filter(
    (rule) => !rule.verify(fixture),
  ).map((rule) => rule.message);
}

export const DEFAULT_TEST_DATA_ISOLATION_CHECKS = Object.freeze([
  {
    id: "product-core-demo-seed-stays-neutral",
    bucket: "product-core-demo-seed",
    description:
      "Product Core demo seed is local simulated master data, not yoyoosun trial data or real import.",
    required: Object.freeze([
      {
        path: "server/internal/data/core_demo_seed.go",
        pattern: /const CoreDemoSeedPrefix = "SIM-PLUSH-CORE"/u,
        message: "core demo seed must keep the neutral SIM-PLUSH-CORE prefix",
      },
      {
        path: "server/cmd/seed-core-demo-data/main.go",
        pattern: /DefaultCoreDemoSeedDataset/u,
        message: "core demo CLI must use the shared Product Core seed dataset",
      },
      {
        path: "server/cmd/seed-core-demo-data/main.go",
        pattern: /devdbguard\.RequireLocalDevDSN/u,
        message: "core demo CLI must keep local dev DSN guard",
      },
      {
        path: "server/cmd/seed-core-demo-data/main.go",
        pattern:
          /simulated_only=true real_customer_import=false no_business_records=true no_direct_fact_posting=true/u,
        message:
          "core demo CLI output must declare simulated-only no-real-import boundary",
      },
    ]),
    forbidden: Object.freeze([
      {
        path: "server/internal/data/core_demo_seed.go",
        pattern: /SIM-YOYOOSUN|realCustomerImport|CUSTOMER_IMPORT_CONFIRM/u,
        message:
          "core demo dataset must not embed yoyoosun or real import gates",
      },
      {
        path: "server/internal/data/core_demo_seed.go",
        pattern: NO_FORMAL_FACT_SQL_PATTERN,
        message:
          "core demo dataset must not write customers, sales orders, business_records, shipment, inventory, or finance facts",
      },
    ]),
  },
  {
    id: "yoyoosun-trial-masterdata-seed-stays-simulated",
    bucket: "customer-trial-simulated-data",
    description:
      "yoyoosun trial masterdata seed is explicitly simulated and limited to unit/product prerequisites.",
    required: Object.freeze([
      {
        path: "server/cmd/seed-trial-sim-masterdata/main.go",
        pattern: /simulationPrefix = "SIM-YOYOOSUN-TRIAL"/u,
        message:
          "trial masterdata seed must keep the SIM-YOYOOSUN-TRIAL prefix",
      },
      {
        path: "server/cmd/seed-trial-sim-masterdata/main.go",
        pattern: /devdbguard\.RequireLocalDevDSN/u,
        message: "trial masterdata seed must keep local dev DSN guard",
      },
      {
        path: "server/cmd/seed-trial-sim-masterdata/main.go",
        pattern:
          /simulated_only=true real_customer_import=false no_business_records=true no_shipment_inventory_finance_facts=true/u,
        message:
          "trial masterdata seed output must declare simulated-only and no real import boundary",
      },
    ]),
    forbidden: Object.freeze([
      {
        path: "server/cmd/seed-trial-sim-masterdata/main.go",
        pattern: NO_FORMAL_FACT_SQL_PATTERN,
        message:
          "trial masterdata seed must not write customers, sales orders, business_records, shipment, inventory, or finance facts",
      },
    ]),
  },
  {
    id: "trial-simulated-data-stays-out-of-real-import",
    bucket: "customer-trial-simulated-data",
    description:
      "trial simulated sales/customer data must stay flagged as simulated and require its own confirmation phrase.",
    required: Object.freeze([
      {
        path: "scripts/qa/trial-simulated-data.mjs",
        pattern: /const SIMULATION_PREFIX = "SIM-YOYOOSUN-TRIAL"/u,
        message: "trial simulated data must keep its simulation prefix",
      },
      {
        path: "scripts/qa/trial-simulated-data.mjs",
        pattern: /simulatedOnly:\s*true/u,
        message:
          "trial simulated data must mark reports/datasets as simulatedOnly",
      },
      {
        path: "scripts/qa/trial-simulated-data.mjs",
        pattern: /realCustomerImport:\s*false/u,
        message: "trial simulated data must mark realCustomerImport=false",
      },
      {
        path: "scripts/qa/trial-simulated-data.mjs",
        pattern: /TRIAL_SIM_CONFIRM=APPLY_SIMULATED_TRIAL_DATA/u,
        message:
          "trial simulated apply path must require the trial simulation confirmation",
      },
    ]),
    forbidden: Object.freeze([
      {
        path: "scripts/qa/trial-simulated-data.mjs",
        pattern:
          /realCustomerImport:\s*true|CUSTOMER_IMPORT_CONFIRM|realImportApproved/u,
        message:
          "trial simulated data must not reuse real import approval gates",
      },
      {
        path: "scripts/qa/trial-simulated-data.mjs",
        pattern: NO_DIRECT_DB_PATTERN,
        message:
          "trial simulated data must not connect to DB or write SQL directly",
      },
    ]),
  },
  {
    id: "yoyoosun-trial-fixture-covers-manual-regression",
    bucket: "customer-trial-simulated-data",
    description:
      "yoyoosun trial fixture remains preview-only while covering enough manual regression states.",
    required: Object.freeze([
      {
        path: "config/customers/yoyoosun/trialDataFixture.mjs",
        pattern: /must not be applied to customer production data/u,
        message:
          "yoyoosun trial fixture must keep the production-data boundary",
      },
    ]),
    behavior: Object.freeze(TRIAL_FIXTURE_BEHAVIOR_RULES),
    forbidden: Object.freeze([
      {
        path: "config/customers/yoyoosun/trialDataFixture.mjs",
        pattern:
          /realCustomerImport:\s*true|CUSTOMER_IMPORT_CONFIRM|EXECUTE_YOYOOSUN_IMPORT/u,
        message: "yoyoosun trial fixture must not become real import input",
      },
      {
        path: "config/customers/yoyoosun/trialDataFixture.mjs",
        pattern: NO_DIRECT_DB_PATTERN,
        message: "yoyoosun trial fixture must not contain direct DB writes",
      },
    ]),
  },
  {
    id: "purchase-quality-simulated-matrix-stays-out-of-real-import",
    bucket: "customer-trial-simulated-data",
    description:
      "purchase and quality manual-regression matrix uses formal JSON-RPC with a simulation prefix and an explicit confirmation gate.",
    required: Object.freeze([
      {
        path: "scripts/qa/purchase-quality-simulated-matrix.mjs",
        pattern: /const PREFIX = "SIM-YOYOOSUN-PQ"/u,
        message: "purchase/quality matrix must keep its simulation prefix",
      },
      {
        path: "scripts/qa/purchase-quality-simulated-matrix.mjs",
        pattern: /simulatedOnly:\s*true/u,
        message: "purchase/quality matrix must declare simulatedOnly=true",
      },
      {
        path: "scripts/qa/purchase-quality-simulated-matrix.mjs",
        pattern: /realCustomerImport:\s*false/u,
        message:
          "purchase/quality matrix must declare realCustomerImport=false",
      },
      {
        path: "scripts/qa/purchase-quality-simulated-matrix.mjs",
        pattern: /APPLY_SIMULATED_PURCHASE_QUALITY_MATRIX/u,
        message:
          "purchase/quality apply path must require an explicit simulation confirmation",
      },
      {
        path: "scripts/qa/purchase-quality-simulated-matrix.mjs",
        pattern:
          /const LOCAL_HOSTS = new Set\(\["127\.0\.0\.1", "localhost", "::1"\]\)/u,
        message:
          "purchase/quality matrix must keep an explicit loopback-only host allowlist",
      },
      {
        path: "scripts/qa/purchase-quality-simulated-matrix.mjs",
        pattern:
          /export async function applyPlan\(plan, password, deps = \{\}\)[\s\S]{0,700}normalizeBackendURL\(plan\?\.backendURL\)[\s\S]{0,1800}assertSafeRuntime\(\{/u,
        message:
          "purchase/quality exported apply must enforce URL and runtime guards itself",
      },
      {
        path: "scripts/qa/purchase-quality-simulated-matrix.mjs",
        pattern:
          /method: "capabilities"[\s\S]{0,1200}active_customer_config_revision/u,
        message:
          "purchase/quality matrix must verify local runtime and active customer revision before writes",
      },
      {
        path: "scripts/qa/purchase-quality-simulated-matrix.mjs",
        pattern:
          /REQUIRED_PURCHASE_QUALITY_MODULES[\s\S]{0,1800}required modules are not enabled/u,
        message:
          "purchase/quality matrix must require every downstream module before writes",
      },
      {
        path: "scripts/qa/purchase-quality-simulated-matrix.mjs",
        pattern: /assertPurchaseQualityRunIsEmpty\(\{/u,
        message:
          "purchase/quality matrix must reject a reused deterministic run before writes",
      },
    ]),
    forbidden: Object.freeze([
      {
        path: "scripts/qa/purchase-quality-simulated-matrix.mjs",
        pattern:
          /realCustomerImport:\s*true|CUSTOMER_IMPORT_CONFIRM|EXECUTE_YOYOOSUN_IMPORT/u,
        message:
          "purchase/quality matrix must not reuse real import approval gates",
      },
      {
        path: "scripts/qa/purchase-quality-simulated-matrix.mjs",
        pattern: NO_DIRECT_DB_PATTERN,
        message:
          "purchase/quality matrix must not connect to DB or write SQL directly",
      },
    ]),
  },
  {
    id: "manual-acceptance-source-data-stays-simulated-and-local",
    bucket: "customer-trial-simulated-data",
    description:
      "full-page manual acceptance source data keeps a stable simulation prefix, explicit confirmation, and local runtime guard.",
    required: Object.freeze([
      {
        path: "scripts/qa/manual-acceptance-source-data.mjs",
        pattern: /const SIMULATION_PREFIX = "SIM-YOYOOSUN-UAT"/u,
        message:
          "manual acceptance source data must keep its stable simulation prefix",
      },
      {
        path: "scripts/qa/manual-acceptance-source-data.mjs",
        pattern: /simulatedOnly:\s*true/u,
        message:
          "manual acceptance source data must declare simulatedOnly=true",
      },
      {
        path: "scripts/qa/manual-acceptance-source-data.mjs",
        pattern: /realCustomerImport:\s*false/u,
        message:
          "manual acceptance source data must keep realCustomerImport=false",
      },
      {
        path: "scripts/qa/manual-acceptance-source-data.mjs",
        pattern: /APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA/u,
        message:
          "manual acceptance source writes must require the exact confirmation phrase",
      },
      {
        path: "scripts/qa/manual-acceptance-source-data.mjs",
        pattern: /LOCAL_HOSTS/u,
        message:
          "manual acceptance source data must keep its local backend guard",
      },
      {
        path: "scripts/qa/manual-acceptance-source-data.mjs",
        pattern: /response missing lifecycle status/u,
        message:
          "source lifecycle writes must fail when a success payload omits its returned status",
      },
      {
        path: "scripts/qa/manual-acceptance-source-data.mjs",
        pattern:
          /export async function applyManualAcceptanceSourceData[\s\S]{0,350}assertLocalBackendURL\(/u,
        message:
          "source data exported apply must enforce its backend target guard itself",
      },
      {
        path: "scripts/qa/manual-acceptance-source-data.mjs",
        pattern: /active_customer_config_revision[\s\S]{0,120}!configRevision/u,
        message:
          "source data writes must require a non-empty active customer revision",
      },
      {
        path: "scripts/qa/manual-acceptance-source-data.mjs",
        pattern:
          /REQUIRED_SOURCE_MODULES[\s\S]{0,1900}required modules are not enabled/u,
        message:
          "source data writes must require every source module before reads or writes",
      },
    ]),
    forbidden: Object.freeze([
      {
        path: "scripts/qa/manual-acceptance-source-data.mjs",
        pattern:
          /realCustomerImport:\s*true|CUSTOMER_IMPORT_CONFIRM|EXECUTE_YOYOOSUN_IMPORT/u,
        message:
          "manual acceptance source data must not reuse real import approval gates",
      },
      {
        path: "scripts/qa/manual-acceptance-source-data.mjs",
        pattern: NO_DIRECT_DB_PATTERN,
        message:
          "manual acceptance source data must not connect to DB or write SQL directly",
      },
    ]),
  },
  {
    id: "manual-acceptance-task-data-stays-workflow-only-and-local",
    bucket: "customer-trial-simulated-data",
    description:
      "manual acceptance task data remains a loopback-only workflow fixture with current runtime, module, CAS, and confirmation guards.",
    required: Object.freeze([
      {
        path: "scripts/qa/manual-acceptance-task-data.mjs",
        pattern: /const SIMULATION_PREFIX = "SIM-YOYOOSUN-UAT-TASK"/u,
        message:
          "manual acceptance task data must keep its stable simulation prefix",
      },
      {
        path: "scripts/qa/manual-acceptance-task-data.mjs",
        pattern: /simulatedOnly:\s*true[\s\S]{0,120}writesFacts:\s*false/u,
        message:
          "manual acceptance task data must remain simulated workflow-only data",
      },
      {
        path: "scripts/qa/manual-acceptance-task-data.mjs",
        pattern: /APPLY_SIMULATED_MANUAL_ACCEPTANCE_TASKS/u,
        message:
          "manual acceptance task writes must require the exact confirmation phrase",
      },
      {
        path: "scripts/qa/manual-acceptance-task-data.mjs",
        pattern:
          /const LOCAL_HOSTS = new Set\(\["127\.0\.0\.1", "localhost", "::1"\]\)/u,
        message:
          "manual acceptance task data must keep an explicit loopback-only host allowlist",
      },
      {
        path: "scripts/qa/manual-acceptance-task-data.mjs",
        pattern:
          /export async function applyManualAcceptanceTaskData[\s\S]{0,500}normalizeLocalBackendURL\(plan\.backendURL\)/u,
        message:
          "manual acceptance task exported apply must enforce its backend target guard itself",
      },
      {
        path: "scripts/qa/manual-acceptance-task-data.mjs",
        pattern:
          /method: "capabilities"[\s\S]{0,1300}active_customer_config_revision[\s\S]{0,500}workflow_tasks/u,
        message:
          "manual acceptance task writes must require local runtime, active revision, and workflow task module",
      },
      {
        path: "scripts/qa/manual-acceptance-task-data.mjs",
        pattern:
          /task_id:[\s\S]{0,180}expected_version:[\s\S]{0,180}idempotency_key:/u,
        message:
          "manual acceptance task mutations must use returned task identity, expected version, and idempotency key",
      },
    ]),
    forbidden: Object.freeze([
      {
        path: "scripts/qa/manual-acceptance-task-data.mjs",
        pattern:
          /realCustomerImport:\s*true|CUSTOMER_IMPORT_CONFIRM|EXECUTE_YOYOOSUN_IMPORT/u,
        message:
          "manual acceptance task data must not reuse real import approval gates",
      },
      {
        path: "scripts/qa/manual-acceptance-task-data.mjs",
        pattern: NO_DIRECT_DB_PATTERN,
        message:
          "manual acceptance task data must not connect to DB or write SQL directly",
      },
    ]),
  },
  {
    id: "manual-acceptance-fact-data-stays-simulated-and-local",
    bucket: "customer-trial-simulated-data",
    description:
      "full-page manual acceptance fact data reuses formal business actions and remains local simulated data.",
    required: Object.freeze([
      {
        path: "scripts/qa/manual-acceptance-fact-data.mjs",
        pattern: /simulatedOnly:\s*true/u,
        message: "manual acceptance fact data must declare simulatedOnly=true",
      },
      {
        path: "scripts/qa/manual-acceptance-fact-data.mjs",
        pattern: /realCustomerImport:\s*false/u,
        message:
          "manual acceptance fact data must keep realCustomerImport=false",
      },
      {
        path: "scripts/qa/manual-acceptance-fact-data.mjs",
        pattern: /APPLY_SIMULATED_MANUAL_ACCEPTANCE_FACTS/u,
        message:
          "manual acceptance fact writes must require the exact confirmation phrase",
      },
      {
        path: "scripts/qa/manual-acceptance-fact-data.mjs",
        pattern: /fact bulk apply is local-only/u,
        message: "manual acceptance fact data must remain local-only",
      },
      {
        path: "scripts/qa/manual-acceptance-fact-data.mjs",
        pattern:
          /export async function applyManualAcceptanceFactPlan[\s\S]{0,500}source report backend does not match the fact apply backend/u,
        message:
          "manual acceptance fact apply must reject a source report from another backend before credentials are used",
      },
    ]),
    forbidden: Object.freeze([
      {
        path: "scripts/qa/manual-acceptance-fact-data.mjs",
        pattern:
          /realCustomerImport:\s*true|CUSTOMER_IMPORT_CONFIRM|EXECUTE_YOYOOSUN_IMPORT/u,
        message:
          "manual acceptance fact data must not reuse real import approval gates",
      },
      {
        path: "scripts/qa/manual-acceptance-fact-data.mjs",
        pattern: NO_DIRECT_DB_PATTERN,
        message:
          "manual acceptance fact data must not connect to DB or write SQL directly",
      },
    ]),
  },
  {
    id: "manual-acceptance-attachment-data-stays-local-and-role-scoped",
    bucket: "customer-trial-simulated-data",
    description:
      "manual acceptance attachments use loopback JSON-RPC, an active customer revision, explicit confirmation, and role-scoped actors.",
    required: Object.freeze([
      {
        path: "scripts/qa/manual-acceptance-attachment-data.mjs",
        pattern: /APPLY_SIMULATED_MANUAL_ACCEPTANCE_ATTACHMENTS/u,
        message: "attachment apply must require its exact confirmation phrase",
      },
      {
        path: "scripts/qa/manual-acceptance-attachment-data.mjs",
        pattern: /LOCAL_HOSTS[\s\S]{0,700}loopback HTTP backend/u,
        message: "attachment apply must remain loopback-only",
      },
      {
        path: "scripts/qa/manual-acceptance-attachment-data.mjs",
        pattern: /active_customer_config_revision[\s\S]{0,1300}actorUsers/u,
        message: "attachment apply must verify active revision before role actor writes",
      },
      {
        path: "scripts/qa/manual-acceptance-attachment-data.mjs",
        pattern: /workflow_task[\s\S]{0,900}expected_version/u,
        message: "workflow attachment writes must preserve expected_version",
      },
    ]),
    forbidden: Object.freeze([
      {
        path: "scripts/qa/manual-acceptance-attachment-data.mjs",
        pattern: NO_DIRECT_DB_PATTERN,
        message: "attachment fixture must not connect to DB or write SQL directly",
      },
    ]),
  },
  {
    id: "manual-acceptance-pressure-requires-disposable-database",
    bucket: "customer-trial-simulated-data",
    description:
      "capacity and stress execution only target a declared disposable capacity database and a loopback service.",
    required: Object.freeze([
      {
        path: "scripts/qa/manual-acceptance-capacity-pressure.mjs",
        pattern: /RUN_ISOLATED_MANUAL_ACCEPTANCE_PRESSURE/u,
        message: "pressure execution must require its exact confirmation phrase",
      },
      {
        path: "scripts/qa/manual-acceptance-capacity-pressure.mjs",
        pattern: /\^plush_erp_capacity_\[a-z0-9_\]\+\$/u,
        message: "pressure execution must require a disposable capacity database name",
      },
      {
        path: "scripts/qa/manual-acceptance-capacity-pressure.mjs",
        pattern: /parsedDatabaseURL\.pathname !== `\/\$\{databaseName\}`/u,
        message: "pressure database URL must match the declared disposable database",
      },
      {
        path: "scripts/qa/manual-acceptance-capacity-pressure.mjs",
        pattern: /concurrency:\s*100, requests:\s*5000/u,
        message: "stress level must retain the 100-concurrency profile",
      },
    ]),
    forbidden: Object.freeze([]),
  },
  {
    id: "manual-acceptance-retirement-keeps-history",
    bucket: "customer-trial-simulated-data",
    description:
      "manual acceptance source retirement is a separate dry-run-first lifecycle exit and never a physical delete shortcut.",
    required: Object.freeze([
      {
        path: "scripts/qa/manual-acceptance-source-retire.mjs",
        pattern: /RETIRE_SIMULATED_MANUAL_ACCEPTANCE_SOURCE_DATA/u,
        message:
          "manual acceptance retirement apply must require its exact confirmation phrase",
      },
      {
        path: "scripts/qa/manual-acceptance-source-retire.mjs",
        pattern: /physicalDelete:\s*false/u,
        message:
          "manual acceptance retirement must declare physicalDelete=false",
      },
      {
        path: "scripts/qa/manual-acceptance-source-retire.mjs",
        pattern: /source retirement is local-only/u,
        message: "manual acceptance retirement must remain local-only",
      },
      {
        path: "scripts/qa/manual-acceptance-source-retire.mjs",
        pattern:
          /export async function retireManualAcceptanceSourceData[\s\S]{0,350}normalizeBackendURL\(plan\?\.backendURL\)/u,
        message:
          "manual acceptance exported retirement must enforce its local backend guard itself",
      },
      {
        path: "scripts/qa/manual-acceptance-source-retire.mjs",
        pattern: /active_customer_config_revision[\s\S]{0,120}!configRevision/u,
        message:
          "manual acceptance retirement must require a non-empty active customer revision",
      },
      {
        path: "scripts/qa/manual-acceptance-source-retire.mjs",
        pattern:
          /REQUIRED_RETIREMENT_MODULES[\s\S]{0,1900}required modules are not enabled/u,
        message:
          "manual acceptance retirement must require every owned source module before reads",
      },
    ]),
    forbidden: Object.freeze([
      {
        path: "scripts/qa/manual-acceptance-source-retire.mjs",
        pattern: NO_DIRECT_DB_PATTERN,
        message:
          "manual acceptance retirement must not connect to DB or write SQL directly",
      },
      {
        path: "scripts/qa/manual-acceptance-source-retire.mjs",
        pattern: /method:\s*"(?:delete|truncate|clear)[^"]*"/iu,
        message:
          "manual acceptance retirement must not introduce physical deletion methods",
      },
    ]),
  },
  {
    id: "manual-acceptance-readiness-default-stays-no-write",
    bucket: "customer-trial-simulated-data",
    description:
      "manual acceptance readiness remains a no-write plan by default and reports browser gaps honestly.",
    required: Object.freeze([
      {
        path: "scripts/qa/manual-acceptance-readiness.mjs",
        pattern: /readOnly:\s*true/u,
        message: "manual acceptance readiness must stay read-only",
      },
      {
        path: "scripts/qa/manual-acceptance-readiness.mjs",
        pattern: /writesBusinessData:\s*false/u,
        message: "manual acceptance readiness must not write business data",
      },
      {
        path: "scripts/qa/manual-acceptance-readiness.mjs",
        pattern: /callsBackend:\s*false/u,
        message:
          "manual acceptance readiness default plan must not call the backend",
      },
      {
        path: "scripts/qa/manual-acceptance-readiness.mjs",
        pattern: /readyForManualAcceptance:\s*false/u,
        message:
          "readiness queries must not impersonate completed human acceptance",
      },
    ]),
    forbidden: Object.freeze([
      {
        path: "scripts/qa/manual-acceptance-readiness.mjs",
        pattern: NO_DIRECT_DB_PATTERN,
        message:
          "manual acceptance readiness must not connect to DB or write SQL directly",
      },
    ]),
  },
  {
    id: "manual-regression-data-plan-stays-read-only",
    bucket: "customer-trial-simulated-data",
    description:
      "manual regression data plan aggregates Product Core and yoyoosun simulated entries without becoming an import executor.",
    required: Object.freeze([
      {
        path: "scripts/qa/manual-regression-data-plan.mjs",
        pattern: /scope:\s*"manual-regression-data-plan"/u,
        message: "manual regression plan must keep a stable scope",
      },
      {
        path: "scripts/qa/manual-regression-data-plan.mjs",
        pattern: /readOnly:\s*true/u,
        message: "manual regression plan must remain read-only",
      },
      {
        path: "scripts/qa/manual-regression-data-plan.mjs",
        pattern: /writesDatabase:\s*false/u,
        message: "manual regression plan must not write database rows",
      },
      {
        path: "scripts/qa/manual-regression-data-plan.mjs",
        pattern: /realCustomerImport:\s*false/u,
        message: "manual regression plan must keep realCustomerImport=false",
      },
      {
        path: "scripts/qa/manual-regression-data-plan.mjs",
        pattern: /SIM-PLUSH-CORE/u,
        message:
          "manual regression plan must include Product Core neutral seed",
      },
      {
        path: "scripts/qa/manual-regression-data-plan.mjs",
        pattern: /SIM-YOYOOSUN-TRIAL/u,
        message:
          "manual regression plan must include yoyoosun simulated trial data",
      },
      {
        path: "scripts/qa/manual-regression-data-plan.mjs",
        pattern: /APPLY_SIMULATED_TRIAL_DATA/u,
        message:
          "manual regression plan must keep simulated trial apply confirmation",
      },
      {
        path: "scripts/qa/manual-regression-data-plan.mjs",
        pattern: /APPLY_SIMULATED_OPERATIONAL_FACTS/u,
        message:
          "manual regression plan must keep simulated operational fact confirmation",
      },
      {
        path: "scripts/qa/manual-regression-data-plan.mjs",
        pattern: /APPLY_SIMULATED_MOBILE_WORKFLOW_TASKS/u,
        message:
          "manual regression plan must keep simulated mobile workflow confirmation",
      },
    ]),
    forbidden: Object.freeze([
      {
        path: "scripts/qa/manual-regression-data-plan.mjs",
        pattern: /CUSTOMER_IMPORT_CONFIRM|EXECUTE_YOYOOSUN_IMPORT/u,
        message:
          "manual regression plan must not reuse real import approval gates",
      },
      {
        path: "scripts/qa/manual-regression-data-plan.mjs",
        pattern: NO_DIRECT_DB_PATTERN,
        message:
          "manual regression plan must not connect to DB or write SQL directly",
      },
    ]),
  },
  {
    id: "operational-fact-simulated-closure-stays-simulated",
    bucket: "customer-trial-simulated-data",
    description:
      "operational fact closure uses simulated facts only and keeps real customer import disabled.",
    required: Object.freeze([
      {
        path: "scripts/qa/operational-fact-simulated-closure.mjs",
        pattern: /const SIMULATION_PREFIX = "SIM-YOYOOSUN-OPFACT"/u,
        message: "operational fact simulation must keep its simulation prefix",
      },
      {
        path: "scripts/qa/operational-fact-simulated-closure.mjs",
        pattern: /simulatedOnly:\s*true/u,
        message:
          "operational fact simulation must mark reports as simulatedOnly",
      },
      {
        path: "scripts/qa/operational-fact-simulated-closure.mjs",
        pattern: /realCustomerImport:\s*false/u,
        message:
          "operational fact simulation must mark realCustomerImport=false",
      },
      {
        path: "scripts/qa/operational-fact-simulated-closure.mjs",
        pattern:
          /OPERATIONAL_FACT_SIM_CONFIRM=APPLY_SIMULATED_OPERATIONAL_FACTS/u,
        message:
          "operational fact apply path must require the simulation confirmation",
      },
      {
        path: "scripts/qa/operational-fact-simulated-closure.mjs",
        pattern:
          /const LOCAL_HOSTS = new Set\(\["127\.0\.0\.1", "localhost", "::1"\]\)/u,
        message:
          "operational fact simulation must keep an explicit loopback-only host allowlist",
      },
      {
        path: "scripts/qa/operational-fact-simulated-closure.mjs",
        pattern:
          /async function applyPlan\(plan, tokens,[\s\S]{0,1400}assertSafeRuntime\(\{/u,
        message:
          "operational fact exported apply must enforce the runtime guard itself",
      },
      {
        path: "scripts/qa/operational-fact-simulated-closure.mjs",
        pattern:
          /method: "capabilities"[\s\S]{0,1200}active_customer_config_revision/u,
        message:
          "operational fact simulation must verify local runtime and active customer revision before writes",
      },
      {
        path: "scripts/qa/operational-fact-simulated-closure.mjs",
        pattern:
          /REQUIRED_OPERATIONAL_MODULES[\s\S]{0,1800}required modules are not enabled/u,
        message:
          "operational fact simulation must require every downstream module before writes",
      },
      {
        path: "scripts/qa/operational-fact-simulated-closure.mjs",
        pattern: /assertOperationalRunIsEmpty\(\{/u,
        message:
          "operational fact simulation must reject a reused deterministic run before writes",
      },
    ]),
    forbidden: Object.freeze([
      {
        path: "scripts/qa/operational-fact-simulated-closure.mjs",
        pattern:
          /realCustomerImport:\s*true|CUSTOMER_IMPORT_CONFIRM|realImportApproved/u,
        message:
          "operational fact simulation must not reuse real import approval gates",
      },
      {
        path: "scripts/qa/operational-fact-simulated-closure.mjs",
        pattern: NO_DIRECT_DB_PATTERN,
        message:
          "operational fact simulation must not connect to DB or write SQL directly",
      },
    ]),
  },
  {
    id: "mobile-workflow-simulated-closure-stays-non-fact",
    bucket: "customer-trial-simulated-data",
    description:
      "mobile workflow closure remains simulated workflow data and does not post operational facts.",
    required: Object.freeze([
      {
        path: "scripts/qa/mobile-workflow-simulated-closure.mjs",
        pattern: /const SIMULATION_PREFIX = "SIM-YOYOOSUN-MOBILE-WORKFLOW"/u,
        message: "mobile workflow simulation must keep its simulation prefix",
      },
      {
        path: "scripts/qa/mobile-workflow-simulated-closure.mjs",
        pattern: /simulatedOnly:\s*true/u,
        message:
          "mobile workflow simulation must mark reports as simulatedOnly",
      },
      {
        path: "scripts/qa/mobile-workflow-simulated-closure.mjs",
        pattern: /realCustomerImport:\s*false/u,
        message:
          "mobile workflow simulation must mark realCustomerImport=false",
      },
      {
        path: "scripts/qa/mobile-workflow-simulated-closure.mjs",
        pattern: /factPosting:\s*false/u,
        message: "mobile workflow simulation must keep factPosting=false",
      },
      {
        path: "scripts/qa/mobile-workflow-simulated-closure.mjs",
        pattern:
          /MOBILE_WORKFLOW_SIM_CONFIRM=APPLY_SIMULATED_MOBILE_WORKFLOW_TASKS/u,
        message:
          "mobile workflow apply path must require the simulation confirmation",
      },
    ]),
    forbidden: Object.freeze([
      {
        path: "scripts/qa/mobile-workflow-simulated-closure.mjs",
        pattern:
          /realCustomerImport:\s*true|CUSTOMER_IMPORT_CONFIRM|realImportApproved/u,
        message:
          "mobile workflow simulation must not reuse real import approval gates",
      },
      {
        path: "scripts/qa/mobile-workflow-simulated-closure.mjs",
        pattern: NO_DIRECT_DB_PATTERN,
        message:
          "mobile workflow simulation must not connect to DB or write SQL directly",
      },
    ]),
  },
  {
    id: "real-import-prep-stays-no-write",
    bucket: "real-import-prep",
    description:
      "source freeze and dry-run tooling remain no-write import preparation, not execution.",
    required: Object.freeze([
      {
        path: "scripts/import/customerImportDryRun.mjs",
        pattern: /dry-run analysis only/u,
        message: "customer import dry-run must declare dry-run analysis only",
      },
      {
        path: "scripts/import/customerImportDryRun.mjs",
        pattern:
          /never connects to a database, reads server config, writes formal tables, writes business_records, or executes a real import/u,
        message: "customer import dry-run must keep no-write boundary text",
      },
      {
        path: "scripts/import/customerSourceSnapshotFreezeCheck.mjs",
        pattern: /noRealImport:\s*true/u,
        message: "source freeze metadata must mark noRealImport=true",
      },
      {
        path: "scripts/import/customerSourceSnapshotFreezeCheck.mjs",
        pattern: /canExecuteRealImport:\s*false/u,
        message: "source freeze metadata must mark canExecuteRealImport=false",
      },
    ]),
    forbidden: Object.freeze([
      {
        path: "scripts/import/customerImportDryRun.mjs",
        pattern:
          /CUSTOMER_IMPORT_CONFIRM|--execute|fetch\(|POSTGRES_DSN|sql\.Open|pgx/u,
        message: "dry-run must not gain execution, backend, or DB entrypoints",
      },
      {
        path: "scripts/import/customerSourceSnapshotFreezeCheck.mjs",
        pattern:
          /CUSTOMER_IMPORT_CONFIRM|--execute|fetch\(|POSTGRES_DSN|sql\.Open|pgx/u,
        message:
          "source freeze must not gain execution, backend, or DB entrypoints",
      },
    ]),
  },
]);

function normalizePath(relativePath) {
  return String(relativePath || "")
    .split(path.sep)
    .join("/");
}

async function readRuleFile(root, relativePath, cache) {
  const normalized = normalizePath(relativePath);
  if (!cache.has(normalized)) {
    const absolutePath = path.join(root, normalized);
    cache.set(normalized, await readFile(absolutePath, "utf8"));
  }
  return cache.get(normalized);
}

function buildViolation({ check, type, rule, reason }) {
  return {
    checkId: check.id,
    bucket: check.bucket,
    type,
    path: normalizePath(rule.path),
    message: rule.message,
    reason,
  };
}

async function evaluateRuleGroup({ root, check, type, rules, cache }) {
  const violations = [];
  for (const rule of rules || []) {
    try {
      const source = await readRuleFile(root, rule.path, cache);
      const matched = rule.pattern.test(source);
      if (type === "required" && !matched) {
        violations.push(
          buildViolation({
            check,
            type,
            rule,
            reason: "required pattern not found",
          }),
        );
      }
      if (type === "forbidden" && matched) {
        violations.push(
          buildViolation({
            check,
            type,
            rule,
            reason: "forbidden pattern found",
          }),
        );
      }
    } catch (error) {
      violations.push(
        buildViolation({
          check,
          type,
          rule,
          reason:
            error?.code === "ENOENT"
              ? "file not found"
              : `read failed: ${error.message}`,
        }),
      );
    }
  }
  return violations;
}

function evaluateBehaviorGroup({ check, rules, trialFixture }) {
  const violations = [];
  for (const rule of rules || []) {
    try {
      if (rule.verify(trialFixture)) continue;
      violations.push(
        buildViolation({
          check,
          type: "behavior",
          rule: {
            path: "config/customers/yoyoosun/trialDataFixture.mjs",
            message: rule.message,
          },
          reason: "fixture behavior not covered",
        }),
      );
    } catch (error) {
      violations.push(
        buildViolation({
          check,
          type: "behavior",
          rule: {
            path: "config/customers/yoyoosun/trialDataFixture.mjs",
            message: rule.message,
          },
          reason: `fixture behavior check failed: ${error.message}`,
        }),
      );
    }
  }
  return violations;
}

export async function buildTestDataIsolationReport({
  root = repoRoot,
  checks = DEFAULT_TEST_DATA_ISOLATION_CHECKS,
  trialFixture = yoyoosunTrialDataFixture,
} = {}) {
  const absoluteRoot = path.resolve(root);
  const cache = new Map();
  const checkReports = [];
  const violations = [];

  for (const check of checks) {
    const checkViolations = [
      ...(await evaluateRuleGroup({
        root: absoluteRoot,
        check,
        type: "required",
        rules: check.required,
        cache,
      })),
      ...(await evaluateRuleGroup({
        root: absoluteRoot,
        check,
        type: "forbidden",
        rules: check.forbidden,
        cache,
      })),
      ...evaluateBehaviorGroup({
        check,
        rules: check.behavior,
        trialFixture,
      }),
    ];
    violations.push(...checkViolations);
    checkReports.push({
      id: check.id,
      bucket: check.bucket,
      description: check.description,
      status: checkViolations.length === 0 ? "pass" : "fail",
      violationCount: checkViolations.length,
    });
  }

  const byBucket = Object.fromEntries(
    TEST_DATA_ISOLATION_BUCKETS.map((bucket) => [
      bucket,
      {
        checks: checkReports.filter((check) => check.bucket === bucket).length,
        violations: violations.filter((item) => item.bucket === bucket).length,
      },
    ]),
  );

  return {
    ok: violations.length === 0,
    scope: {
      readOnly: true,
      writesDatabase: false,
      executesImport: false,
      realCustomerImport: false,
    },
    root: absoluteRoot,
    buckets: TEST_DATA_ISOLATION_BUCKETS,
    checkCount: checkReports.length,
    violationCount: violations.length,
    byBucket,
    checks: checkReports,
    violations,
  };
}

export function formatTestDataIsolationReport(report) {
  const lines = [
    `test data isolation boundary ${report.ok ? "ok" : "failed"}`,
    `checks=${report.checkCount} violations=${report.violationCount}`,
  ];
  for (const bucket of report.buckets) {
    const summary = report.byBucket[bucket] || { checks: 0, violations: 0 };
    lines.push(
      `- ${bucket}: checks=${summary.checks} violations=${summary.violations}`,
    );
  }
  if (!report.ok) {
    lines.push("violations:");
    for (const violation of report.violations) {
      lines.push(
        `- [${violation.bucket}] ${violation.path}: ${violation.message} (${violation.reason})`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

function printHelp() {
  console.log(`Usage:
  node scripts/qa/test-data-isolation-boundary.mjs [--json]

Checks Product Core demo seed, yoyoosun simulated test data, and real import
preparation boundaries. No tracked script may execute real customer imports.`);
}

async function main(argv) {
  const args = new Set(argv);
  if (args.has("--help") || args.has("-h")) {
    printHelp();
    return;
  }
  const report = await buildTestDataIsolationReport();
  if (args.has("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    process.stdout.write(formatTestDataIsolationReport(report));
  }
  if (!report.ok) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}
