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
      if (
        !fixtureKey.startsWith("__synthetic_") ||
        !fixtureKey.endsWith("__")
      ) {
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
      fixture?.shipments?.some(
        (shipment) => shipment.status === "cancelled",
      ) === true,
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
    id: "manual-acceptance-target-policy-stays-exact-and-fail-closed",
    bucket: "customer-trial-simulated-data",
    description:
      "manual acceptance external writes use one exact 133 profile while loopback keeps the local/dev default guard.",
    required: Object.freeze([
      {
        path: "scripts/qa/manual-acceptance-target-policy.mjs",
        pattern:
          /const LOCAL_HOSTS = new Set\(\["127\.0\.0\.1", "localhost", "::1"\]\)/u,
        message: "manual acceptance target policy must preserve loopback hosts",
      },
      {
        path: "scripts/qa/manual-acceptance-target-policy.mjs",
        pattern:
          /CUSTOMER_TRIAL_133_TARGET = "customer-trial-133"[\s\S]{0,360}CUSTOMER_TRIAL_133_ORIGIN = "http:\/\/127\.0\.0\.1:18375"/u,
        message:
          "customer-trial-133 must keep its exact registered SSH tunnel origin",
      },
      {
        path: "scripts/qa/manual-acceptance-target-policy.mjs",
        pattern:
          /MANUAL_ACCEPTANCE_DATASET_KEY = "yoyoosun-manual-acceptance"/u,
        message: "manual acceptance data must keep one dataset identity",
      },
      {
        path: "scripts/qa/manual-acceptance-target-policy.mjs",
        pattern:
          /APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA:\$\{resolved\.target\}:\$\{resolved\.dataVersion\}:\$\{resolved\.runId\}/u,
        message:
          "external mutation confirmation must bind target, data version, and run id",
      },
      {
        path: "scripts/qa/manual-acceptance-target-policy.mjs",
        pattern:
          /REMOTE_DEBUG_FALSE_FIELDS[\s\S]{0,4000}attestation\.release[\s\S]{0,700}attestation\.migration/u,
        message:
          "out-of-band attestation must pin release, migration, and every debug mutation flag",
      },
      {
        path: "scripts/qa/manual-acceptance-target-policy.mjs",
        pattern:
          /active_customer_config_revision[\s\S]{0,900}required modules are not enabled/u,
        message:
          "target runtime policy must require active customer revision and enabled modules",
      },
    ]),
    forbidden: Object.freeze([
      {
        path: "scripts/qa/manual-acceptance-target-policy.mjs",
        pattern:
          /allowExternalBaseURL|allow-external-base-url|ALLOW_NON_PRODUCTION_TEST_ENV|allow[_-]?prod/iu,
        message:
          "manual acceptance target policy must not expose a generic external or production bypass",
      },
    ]),
  },
  {
    id: "manual-acceptance-dataset-keeps-one-current-v5-contract",
    bucket: "customer-trial-simulated-data",
    description:
      "the dataset coordinator accepts only the current v5 identity, keeps local and registered 133 semantics equal, and forbids remote core or role seed.",
    required: Object.freeze([
      {
        path: "scripts/qa/manual-acceptance-dataset.mjs",
        pattern:
          /DEFAULT_MANUAL_ACCEPTANCE_DATA_VERSION =\s*CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION/u,
        message:
          "manual acceptance dataset must keep v5 as the only current version",
      },
      {
        path: "scripts/qa/manual-acceptance-customer-config.mjs",
        pattern:
          /CUSTOMER_CONFIG_DATA_VERSION =\s*CUSTOMER_TRIAL_133_CONFIG_DATA_VERSION[\s\S]{0,320}CUSTOMER_CONFIG_PRODUCT_VERSION =\s*CUSTOMER_TRIAL_133_CONFIG_PRODUCT_VERSION/u,
        message:
          "customer-trial config helper must use the current v5 version and product identity",
      },
      {
        path: "server/internal/biz/customer_config.go",
        pattern:
          /CustomerConfigTrialDatasetVersion = "2026\.07\.16-v5"[\s\S]{0,100}CustomerConfigTrialProductVersion = "customer-trial-133-test-2026\.07\.16-v5"/u,
        message:
          "backend trial identity must use the same current v5 dataset and product version",
      },
      {
        path: "server/internal/customertrialconfig/guard.go",
        pattern: /DatasetVersion = biz\.CustomerConfigTrialDatasetVersion/u,
        message:
          "runtime trial gate must consume the backend dataset identity instead of duplicating a stale version",
      },
      {
        path: "scripts/qa/manual-acceptance-dataset.mjs",
        pattern:
          /normalized !== DEFAULT_MANUAL_ACCEPTANCE_DATA_VERSION[\s\S]{0,300}unsupported dataVersion/u,
        message:
          "manual acceptance dataset must reject every non-current version",
      },
      {
        path: "scripts/qa/manual-acceptance-dataset.mjs",
        pattern:
          /\[CUSTOMER_TRIAL_133_TARGET\]: \{[\s\S]{0,160}seedAllowed: false,[\s\S]{0,160}allowedOperations: \["verified", "reused"\]/u,
        message:
          "customer-trial-133 core and role stages must forbid remote seed",
      },
      {
        path: "scripts/qa/manual-acceptance-dataset.mjs",
        pattern:
          /key: "purchase-quality"[\s\S]{0,1000}delegatedTo: "facts"[\s\S]{0,220}genericWriterAllowed: false/u,
        message:
          "purchase and quality preparation must be delegated to unified facts",
      },
      {
        path: "scripts/qa/manual-acceptance-dataset.mjs",
        pattern:
          /key: "facts"[\s\S]{0,650}manual-acceptance-fact-data\.mjs[\s\S]{0,800}formalBusinessAPIsOnly: true/u,
        message:
          "facts stage must use the registered formal source-driven runner",
      },
      {
        path: "scripts/qa/manual-acceptance-dataset.mjs",
        pattern:
          /operation=\$\{operation\} is forbidden for target \$\{plan\.target\?\.alias\}/u,
        message: "stage receipts must enforce target-specific operation limits",
      },
    ]),
    forbidden: Object.freeze([
      {
        path: "scripts/qa/manual-acceptance-dataset.mjs",
        pattern: /2026\.07\.15-v1|20260715-V1/u,
        message:
          "the current dataset implementation must not retain a v1 alias",
      },
      {
        path: "scripts/qa/manual-acceptance-dataset.mjs",
        pattern:
          /purchase-quality-simulated-matrix|operational-fact-simulated-closure/u,
        message: "the current dataset must not call old generic fact writers",
      },
      {
        path: "scripts/qa/manual-acceptance-dataset.mjs",
        pattern: NO_DIRECT_DB_PATTERN,
        message:
          "dataset orchestration must not connect to DB or write SQL directly",
      },
    ]),
  },
  {
    id: "manual-acceptance-source-data-stays-simulated-and-target-guarded",
    bucket: "customer-trial-simulated-data",
    description:
      "full-page manual acceptance source data keeps a stable simulation prefix, exact confirmations, and the shared target/runtime policy.",
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
        pattern: /resolveManualAcceptanceTarget/u,
        message:
          "manual acceptance source data must use the shared target policy",
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
          /export async function applyManualAcceptanceSourceData[\s\S]{0,650}assertManualAcceptanceMutationTarget\(/u,
        message:
          "source data exported apply must enforce its backend target guard itself",
      },
      {
        path: "scripts/qa/manual-acceptance-source-data.mjs",
        pattern: /assertManualAcceptanceRuntimePolicy\(/u,
        message:
          "source data writes must require a non-empty active customer revision",
      },
      {
        path: "scripts/qa/manual-acceptance-source-data.mjs",
        pattern: /requiredModules: REQUIRED_SOURCE_MODULES/u,
        message:
          "source data writes must require every source module before reads or writes",
      },
      {
        path: "scripts/qa/manual-acceptance-source-data.mjs",
        pattern:
          /MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON[\s\S]{0,900}assertManualAcceptanceTargetAttestation/u,
        message:
          "source data must validate the exact out-of-band target attestation before remote writes",
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
      {
        path: "scripts/qa/manual-acceptance-source-data.mjs",
        pattern: /2026\.07\.15-v1|20260715-V1/u,
        message:
          "manual acceptance source data must not retain a v1 current alias",
      },
    ]),
  },
  {
    id: "manual-acceptance-task-data-stays-workflow-only-and-target-guarded",
    bucket: "customer-trial-simulated-data",
    description:
      "manual acceptance task data keeps simulated display tasks separate from formal ProcessRuntime evidence, with exact target, runtime, module, CAS, and confirmation guards.",
    required: Object.freeze([
      {
        path: "scripts/qa/manual-acceptance-task-data.mjs",
        pattern:
          /export const TASK_SIMULATION_PREFIX = "SIM-YOYOOSUN-UAT-TASK"[\s\S]{0,100}const SIMULATION_PREFIX = TASK_SIMULATION_PREFIX/u,
        message:
          "manual acceptance task data must keep its stable simulation prefix",
      },
      {
        path: "scripts/qa/manual-acceptance-task-data.mjs",
        pattern: /simulatedOnly:\s*true[\s\S]{0,120}writesFacts:\s*false/u,
        message:
          "manual acceptance task data must remain simulated-source evidence and never write Facts",
      },
      {
        path: "scripts/qa/manual-acceptance-task-data.mjs",
        pattern: /APPLY_SIMULATED_MANUAL_ACCEPTANCE_TASKS/u,
        message:
          "manual acceptance task writes must require the exact confirmation phrase",
      },
      {
        path: "scripts/qa/manual-acceptance-task-data.mjs",
        pattern: /resolveManualAcceptanceTarget/u,
        message:
          "manual acceptance task data must use the shared target policy",
      },
      {
        path: "scripts/qa/manual-acceptance-task-data.mjs",
        pattern:
          /export async function applyManualAcceptanceTaskData[\s\S]{0,650}assertManualAcceptanceMutationTarget\(/u,
        message:
          "manual acceptance task exported apply must enforce its backend target guard itself",
      },
      {
        path: "scripts/qa/manual-acceptance-task-data.mjs",
        pattern:
          /assertManualAcceptanceRuntimePolicy\([\s\S]{0,300}requiredModules: includeSalesRuntime[\s\S]{0,100}\? \["workflow_tasks", "sales_orders"\][\s\S]{0,80}: \["workflow_tasks"\]/u,
        message:
          "manual acceptance task writes must require approved runtime, active revision, workflow tasks, and sales orders when ProcessRuntime evidence is requested",
      },
      {
        path: "scripts/qa/manual-acceptance-task-data.mjs",
        pattern:
          /assertManualAcceptanceTaskTargetCompatibility[\s\S]{0,500}assertManualAcceptanceTargetAttestation/u,
        message:
          "manual acceptance task target compatibility must validate the exact attestation",
      },
      {
        path: "scripts/qa/manual-acceptance-task-data.mjs",
        pattern:
          /const parsedTargetAttestation\s*=\s*parseManualAcceptanceTargetAttestation[\s\S]{0,500}assertManualAcceptanceTaskTargetCompatibility[\s\S]{0,1800}await assertManualAcceptanceRuntimeIdentityPrecondition[\s\S]{0,500}const runtimeAdmin\s*=\s*await loginRuntimeAdmin/u,
        message:
          "manual acceptance task data must validate attestation and live runtime identity before debug admin login",
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
    id: "manual-acceptance-fact-data-stays-source-driven-and-target-bound",
    bucket: "customer-trial-simulated-data",
    description:
      "the unified fact runner uses the current source report, exact local or registered 133 guards, formal source-driven APIs, and exact readback references.",
    required: Object.freeze([
      {
        path: "scripts/qa/manual-acceptance-fact-data.mjs",
        pattern: /FACT_REPORT_CONTRACT = "source-driven-operational-facts-v1"/u,
        message:
          "manual acceptance fact reports must retain the source-driven contract",
      },
      {
        path: "scripts/qa/manual-acceptance-fact-data.mjs",
        pattern:
          /reportContract: FACT_REPORT_CONTRACT[\s\S]{0,220}simulatedOnly: true[\s\S]{0,120}realCustomerImport: false[\s\S]{0,120}directSQL: false/u,
        message:
          "manual acceptance fact reports must remain simulated-only and direct-SQL free",
      },
      {
        path: "scripts/qa/manual-acceptance-fact-data.mjs",
        pattern:
          /function validateSourceReport[\s\S]{0,700}referenceRecords\?\.sourceDrivenFacts[\s\S]{0,700}resolveManualAcceptanceTarget\(report\)[\s\S]{0,700}source report target identity is inconsistent/u,
        message:
          "manual acceptance fact plan must bind the exact simulated source report identity",
      },
      {
        path: "scripts/qa/manual-acceptance-fact-data.mjs",
        pattern:
          /export async function applyManualAcceptanceFactPlan[\s\S]{0,500}assertManualAcceptanceMutationTarget\(plan[\s\S]{0,900}MANUAL_ACCEPTANCE_SIM_CONFIRM=\$\{APPLY_CONFIRMATION\}[\s\S]{0,500}createExecutionContext/u,
        message:
          "fact apply must validate target and business confirmation before runtime or writes",
      },
      {
        path: "scripts/qa/manual-acceptance-fact-data.mjs",
        pattern:
          /if \(plan\.target === CUSTOMER_TRIAL_133_TARGET\)[\s\S]{0,260}assertManualAcceptanceTargetAttestation[\s\S]{0,260}else if \(attestation\)[\s\S]{0,160}attestation is forbidden for local fact runtime/u,
        message:
          "fact runtime must require 133 attestation and reject local attestation",
      },
      {
        path: "scripts/qa/manual-acceptance-fact-data.mjs",
        pattern:
          /assertManualAcceptanceRuntimePolicy\([\s\S]{0,360}requiredModules: REQUIRED_MODULES/u,
        message:
          "fact runtime must require active customer config and every downstream module",
      },
      {
        path: "scripts/qa/manual-acceptance-fact-data.mjs",
        pattern:
          /function assertReferenceRecords[\s\S]{0,900}contains duplicate ids[\s\S]{0,1000}exact references; need/u,
        message:
          "fact report must keep exact unique references and minimum counts",
      },
      {
        path: "scripts/qa/manual-acceptance-fact-data.mjs",
        pattern:
          /requireStatuses\("purchaseReceipts", \["DRAFT", "POSTED", "CANCELLED"\]\)/u,
        message: "fact report must keep the purchase receipt lifecycle matrix",
      },
      {
        path: "scripts/qa/manual-acceptance-fact-data.mjs",
        pattern:
          /requireStatuses\("qualityInspections", \[\s*"DRAFT",\s*"SUBMITTED",\s*"PASSED",\s*"REJECTED",\s*"CANCELLED",?\s*\]\)/u,
        message: "fact report must keep the quality lifecycle matrix",
      },
      {
        path: "scripts/qa/manual-acceptance-fact-data.mjs",
        pattern:
          /requireStatuses\("shipments", \["DRAFT", "SHIPPED", "CANCELLED"\]\)/u,
        message: "fact report must keep the shipment lifecycle matrix",
      },
      {
        path: "scripts/qa/manual-acceptance-fact-data.mjs",
        pattern:
          /records\.inventoryTxns\.map\([\s\S]{0,220}for \(const type of \["IN", "OUT", "REVERSAL"\]\)/u,
        message: "fact report must keep the inventory transaction matrix",
      },
      {
        path: "scripts/qa/manual-acceptance-fact-data.mjs",
        pattern:
          /for \(const type of \["PAYABLE", "RECEIVABLE", "RECONCILIATION"\]\)[\s\S]{0,700}\["DRAFT", "POSTED", "SETTLED", "CANCELLED"\][\s\S]{0,1000}fact_type === "INVOICE"[\s\S]{0,300}\["DRAFT", "POSTED", "CANCELLED"\]/u,
        message: "fact report must keep the finance lifecycle matrices",
      },
      {
        path: "scripts/qa/manual-acceptance-fact-data.mjs",
        pattern:
          /const productionOwner = records\.productionFacts\.find\([\s\S]{0,220}"POSTED"[\s\S]{0,260}const financeOwner = records\.financeFacts\.find\([\s\S]{0,220}"POSTED"[\s\S]{0,220}if \(!productionOwner \|\| !financeOwner\)[\s\S]{0,180}attachment owners require POSTED production and finance facts[\s\S]{0,220}productionFactId: productionOwner\.id,[\s\S]{0,100}financeFactId: financeOwner\.id/u,
        message:
          "fact report attachment owners must use posted production and finance facts",
      },
      {
        path: "scripts/qa/manual-acceptance-fact-data.mjs",
        pattern:
          /buildSourceDrivenFactPlan[\s\S]{0,140}applySourceDrivenFactPlan[\s\S]{0,160}sourceDrivenFactConfirmation/u,
        message:
          "fact runner must use the formal source-driven helper and its exact confirmation",
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
        pattern: /2026\.07\.15-v1|20260715-V1/u,
        message:
          "manual acceptance fact data must not retain a v1 current alias",
      },
      {
        path: "scripts/qa/manual-acceptance-fact-data.mjs",
        pattern:
          /applyOperationalPlan|loginOperationalRoles|applyPurchaseQualityPlan|operational-fact-simulated-closure|purchase-quality-simulated-matrix/u,
        message:
          "manual acceptance fact data must not call retired operational or purchase-quality writers",
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
    id: "manual-acceptance-source-driven-facts-stays-formal-and-confirmed",
    bucket: "customer-trial-simulated-data",
    description:
      "the source-driven Fact helper binds the current batch and enabled phases, preflights inventory, and invokes only formally allowlisted RPC parameters.",
    required: Object.freeze([
      {
        path: "scripts/qa/manual-acceptance-source-driven-facts.mjs",
        pattern:
          /SOURCE_DRIVEN_FACT_DATA_VERSION = "2026\.07\.16-v5"[\s\S]{0,100}SOURCE_DRIVEN_FACT_RUN_ID = "20260716-V5"/u,
        message: "source-driven Fact helper must keep the current v5 identity",
      },
      {
        path: "scripts/qa/manual-acceptance-source-driven-facts.mjs",
        pattern:
          /export const FORMAL_RPC_PARAM_ALLOWLIST = Object\.freeze\(\{/u,
        message:
          "source-driven Fact helper must keep the formal RPC parameter allowlist",
      },
      {
        path: "scripts/qa/manual-acceptance-source-driven-facts.mjs",
        pattern:
          /function assertAllowedParams[\s\S]{0,1000}async function invoke[\s\S]{0,240}assertAllowedParams\(domain, method, params\)[\s\S]{0,120}await rpc/u,
        message:
          "source-driven Fact helper must check method and exact params before every RPC",
      },
      {
        path: "scripts/qa/manual-acceptance-source-driven-facts.mjs",
        pattern:
          /export function sourceDrivenFactConfirmation[\s\S]{0,420}plan\.target[\s\S]{0,220}plan\.dataVersion[\s\S]{0,160}plan\.runId[\s\S]{0,160}plan\.instanceKey[\s\S]{0,180}plan\.enabledPhases/u,
        message:
          "source-driven Fact confirmation must bind target, version, run, instance, and phases",
      },
      {
        path: "scripts/qa/manual-acceptance-source-driven-facts.mjs",
        pattern:
          /export async function applySourceDrivenFactPlan[\s\S]{0,900}confirmation !== sourceDrivenFactConfirmation\(plan\)[\s\S]{0,1200}preflightSourceDrivenFactPlan\(plan, \{ rpc \}\)[\s\S]{0,500}if \(!preflight\.ok\)/u,
        message:
          "source-driven Fact apply must confirm and complete read-only preflight before writes",
      },
      {
        path: "scripts/qa/manual-acceptance-source-driven-facts.mjs",
        pattern:
          /applySupported:\s*true[\s\S]{0,180}simulatedOnly:\s*true[\s\S]{0,120}realCustomerImport:\s*false[\s\S]{0,120}directSQL:\s*false/u,
        message:
          "source-driven Fact plan must remain simulated-only and direct-SQL free",
      },
    ]),
    forbidden: Object.freeze([
      {
        path: "scripts/qa/manual-acceptance-source-driven-facts.mjs",
        pattern: /2026\.07\.15-v1|20260715-V1/u,
        message: "source-driven Fact helper must not retain a v1 current alias",
      },
      {
        path: "scripts/qa/manual-acceptance-source-driven-facts.mjs",
        pattern:
          /create_production_fact|create_outsourcing_fact|create_finance_fact/u,
        message:
          "source-driven Fact helper must not revive retired generic fact creation RPCs",
      },
      {
        path: "scripts/qa/manual-acceptance-source-driven-facts.mjs",
        pattern: NO_DIRECT_DB_PATTERN,
        message:
          "source-driven Fact helper must not connect to DB or write SQL directly",
      },
    ]),
  },
  {
    id: "manual-acceptance-attachment-data-stays-target-bound-and-role-scoped",
    bucket: "customer-trial-simulated-data",
    description:
      "manual acceptance attachments bind exact source, fact, and task reports to local or registered 133 target policy and use role-scoped actors.",
    required: Object.freeze([
      {
        path: "scripts/qa/manual-acceptance-attachment-data.mjs",
        pattern: /APPLY_SIMULATED_MANUAL_ACCEPTANCE_ATTACHMENTS/u,
        message: "attachment apply must require its exact confirmation phrase",
      },
      {
        path: "scripts/qa/manual-acceptance-attachment-data.mjs",
        pattern:
          /validateAttachmentReportBatch[\s\S]{0,1500}resolveManualAcceptanceTarget[\s\S]{0,550}assertManualAcceptanceMutationTarget/u,
        message:
          "attachment apply must bind the exact report batch to the shared target policy",
      },
      {
        path: "scripts/qa/manual-acceptance-attachment-data.mjs",
        pattern:
          /CUSTOMER_TRIAL_133_TARGET[\s\S]{0,750}assertManualAcceptanceTargetAttestation/u,
        message: "attachment apply must require remote target attestation",
      },
      {
        path: "scripts/qa/manual-acceptance-attachment-data.mjs",
        pattern:
          /assertManualAcceptanceRuntimePolicy\([\s\S]{0,380}requiredModules: ATTACHMENT_REQUIRED_MODULES/u,
        message:
          "attachment apply must verify active revision and required modules before role actor writes",
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
        message:
          "attachment fixture must not connect to DB or write SQL directly",
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
        message:
          "pressure execution must require its exact confirmation phrase",
      },
      {
        path: "scripts/qa/manual-acceptance-capacity-pressure.mjs",
        pattern: /\^plush_erp_capacity_\[a-z0-9_\]\+\$/u,
        message:
          "pressure execution must require a disposable capacity database name",
      },
      {
        path: "scripts/qa/manual-acceptance-capacity-pressure.mjs",
        pattern: /parsedDatabaseURL\.pathname !== `\/\$\{databaseName\}`/u,
        message:
          "pressure database URL must match the declared disposable database",
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
      "manual acceptance source retirement is a dry-run-first lifecycle exit for local and the exact registered 133 target, never a physical delete shortcut.",
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
        pattern: /--data-version 2026\.07\.16-v5 --run-id 20260716-V5/u,
        message:
          "manual acceptance retirement usage must show the current v5 batch",
      },
      {
        path: "scripts/qa/manual-acceptance-source-retire.mjs",
        pattern:
          /resolveRetirementTargetAttestation[\s\S]{0,260}CUSTOMER_TRIAL_133_TARGET[\s\S]{0,180}assertManualAcceptanceTargetAttestation/u,
        message:
          "manual acceptance retirement must require the exact attestation for customer-trial-133",
      },
      {
        path: "scripts/qa/manual-acceptance-source-retire.mjs",
        pattern:
          /export async function retireManualAcceptanceSourceData[\s\S]{0,700}resolveManualAcceptanceTarget\([\s\S]{0,500}assertManualAcceptanceMutationTarget\(/u,
        message:
          "manual acceptance exported retirement must enforce its target and confirmation guards itself",
      },
      {
        path: "scripts/qa/manual-acceptance-source-retire.mjs",
        pattern: /assertManualAcceptanceRuntimePolicy\(/u,
        message:
          "manual acceptance retirement must require a non-empty active customer revision",
      },
      {
        path: "scripts/qa/manual-acceptance-source-retire.mjs",
        pattern: /requiredModules: REQUIRED_RETIREMENT_MODULES/u,
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
      {
        path: "scripts/qa/manual-acceptance-source-retire.mjs",
        pattern: /2026\.07\.15-v1|20260715-V1/u,
        message:
          "manual acceptance retirement must not retain a v1 current alias",
      },
    ]),
  },
  {
    id: "manual-acceptance-readiness-stays-no-write-and-target-bound",
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
      {
        path: "scripts/qa/manual-acceptance-readiness.mjs",
        pattern:
          /resolveReadinessTarget[\s\S]{0,1000}resolveManualAcceptanceTarget[\s\S]{0,500}assertManualAcceptanceMutationTarget/u,
        message:
          "readiness verification must bind exact reports to the shared target policy",
      },
      {
        path: "scripts/qa/manual-acceptance-readiness.mjs",
        pattern:
          /CUSTOMER_TRIAL_133_TARGET[\s\S]{0,900}assertManualAcceptanceTargetAttestation/u,
        message:
          "readiness verification must require remote target attestation",
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
        pattern:
          /DEFAULT_MANUAL_ACCEPTANCE_DATA_VERSION[\s\S]{0,520}deriveManualAcceptanceDatasetIdentity/u,
        message:
          "manual regression plan must derive the current dataset identity from the coordinator",
      },
      {
        path: "scripts/qa/manual-regression-data-plan.mjs",
        pattern:
          /dataVersion: identity\.dataVersion[\s\S]{0,150}runId: identity\.runId/u,
        message:
          "manual regression plan must expose the exact current data version and run id",
      },
      {
        path: "scripts/qa/manual-regression-data-plan.mjs",
        pattern:
          /factsContract: "source-driven-operational-facts-v1"[\s\S]{0,180}formalBusinessAPIsOnly: true[\s\S]{0,180}purchaseQualityHandledByFacts: true/u,
        message:
          "manual regression plan must use one formal source-driven fact path",
      },
      {
        path: "scripts/qa/manual-regression-data-plan.mjs",
        pattern:
          /\[CUSTOMER_TRIAL_133_TARGET\]: \{[\s\S]{0,220}coreAndRole: "verify-or-reuse-only"[\s\S]{0,120}remoteSeedAllowed: false/u,
        message:
          "manual regression plan must forbid remote Product Core and role seed",
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
      {
        path: "scripts/qa/manual-regression-data-plan.mjs",
        pattern:
          /purchase-quality-simulated-matrix|operational-fact-simulated-closure/u,
        message:
          "manual regression plan must not route current acceptance through old fact writers",
      },
    ]),
  },
  {
    id: "operational-fact-simulated-closure-stays-simulated",
    bucket: "customer-trial-simulated-data",
    description:
      "operational fact closure remains a simulated report-only plan after its generic fact apply path is retired.",
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
        pattern: /applySupported:\s*false/u,
        message:
          "operational fact simulation must declare that apply is unsupported",
      },
      {
        path: "scripts/qa/operational-fact-simulated-closure.mjs",
        pattern: /requiredApplyInputs:\s*\[\]/u,
        message:
          "operational fact simulation must not advertise executable apply inputs",
      },
      {
        path: "scripts/qa/operational-fact-simulated-closure.mjs",
        pattern:
          /if \(token === "--apply"\) throw new CliError\(APPLY_RETIRED_MESSAGE, 2\)/u,
        message:
          "operational fact CLI must reject apply during argument parsing",
      },
      {
        path: "scripts/qa/operational-fact-simulated-closure.mjs",
        pattern:
          /async function applyPlan\(\) \{\s*throw new CliError\(APPLY_RETIRED_MESSAGE, 2\);\s*\}/u,
        message:
          "operational fact exported apply must fail without inspecting arguments or dependencies",
      },
      {
        path: "scripts/qa/operational-fact-simulated-closure.mjs",
        pattern: /mode: "report-only"/u,
        message:
          "operational fact simulation must only emit report-only output",
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
        pattern:
          /OPERATIONAL_FACT_SIM_CONFIRM|APPLY_SIMULATED_OPERATIONAL_FACTS/u,
        message:
          "operational fact simulation must not retain the retired apply confirmation contract",
      },
      {
        path: "scripts/qa/operational-fact-simulated-closure.mjs",
        pattern:
          /create_production_fact|create_outsourcing_fact|create_finance_fact/u,
        message:
          "operational fact simulation must not call retired generic fact creation RPCs",
      },
      {
        path: "scripts/qa/operational-fact-simulated-closure.mjs",
        pattern: /admin_login|assertSafeRuntime|loginRoles/u,
        message:
          "operational fact simulation must not retain a credentialed apply path",
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
