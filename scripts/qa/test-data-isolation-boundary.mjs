#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(currentFile), "..", "..");

export const TEST_DATA_ISOLATION_BUCKETS = Object.freeze([
  "product-core-demo-seed",
  "customer-trial-simulated-data",
  "real-import-prep",
  "real-import-execute",
]);

const NO_FORMAL_FACT_SQL_PATTERN =
  /INSERT\s+INTO\s+(customers|suppliers|contacts|sales_orders|business_records|inventory_txns|shipments?|finance_facts)\b/iu;
const NO_DIRECT_DB_PATTERN =
  /\b(sql\.Open|pgx|POSTGRES_DSN|INSERT\s+INTO|UPDATE\s+[A-Za-z_]+\s+SET|DELETE\s+FROM)\b/iu;

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
        message: "core demo CLI output must declare simulated-only no-real-import boundary",
      },
    ]),
    forbidden: Object.freeze([
      {
        path: "server/internal/data/core_demo_seed.go",
        pattern: /SIM-YOYOOSUN|realCustomerImport|CUSTOMER_IMPORT_CONFIRM/u,
        message: "core demo dataset must not embed yoyoosun or real import gates",
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
        message: "trial masterdata seed must keep the SIM-YOYOOSUN-TRIAL prefix",
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
        message: "trial simulated data must mark reports/datasets as simulatedOnly",
      },
      {
        path: "scripts/qa/trial-simulated-data.mjs",
        pattern: /realCustomerImport:\s*false/u,
        message: "trial simulated data must mark realCustomerImport=false",
      },
      {
        path: "scripts/qa/trial-simulated-data.mjs",
        pattern: /TRIAL_SIM_CONFIRM=APPLY_SIMULATED_TRIAL_DATA/u,
        message: "trial simulated apply path must require the trial simulation confirmation",
      },
    ]),
    forbidden: Object.freeze([
      {
        path: "scripts/qa/trial-simulated-data.mjs",
        pattern: /realCustomerImport:\s*true|CUSTOMER_IMPORT_CONFIRM|realImportApproved/u,
        message: "trial simulated data must not reuse real import approval gates",
      },
      {
        path: "scripts/qa/trial-simulated-data.mjs",
        pattern: NO_DIRECT_DB_PATTERN,
        message: "trial simulated data must not connect to DB or write SQL directly",
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
        message: "operational fact simulation must mark reports as simulatedOnly",
      },
      {
        path: "scripts/qa/operational-fact-simulated-closure.mjs",
        pattern: /realCustomerImport:\s*false/u,
        message: "operational fact simulation must mark realCustomerImport=false",
      },
      {
        path: "scripts/qa/operational-fact-simulated-closure.mjs",
        pattern:
          /OPERATIONAL_FACT_SIM_CONFIRM=APPLY_SIMULATED_OPERATIONAL_FACTS/u,
        message:
          "operational fact apply path must require the simulation confirmation",
      },
    ]),
    forbidden: Object.freeze([
      {
        path: "scripts/qa/operational-fact-simulated-closure.mjs",
        pattern: /realCustomerImport:\s*true|CUSTOMER_IMPORT_CONFIRM|realImportApproved/u,
        message: "operational fact simulation must not reuse real import approval gates",
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
        message: "mobile workflow simulation must mark reports as simulatedOnly",
      },
      {
        path: "scripts/qa/mobile-workflow-simulated-closure.mjs",
        pattern: /realCustomerImport:\s*false/u,
        message: "mobile workflow simulation must mark realCustomerImport=false",
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
        pattern: /realCustomerImport:\s*true|CUSTOMER_IMPORT_CONFIRM|realImportApproved/u,
        message: "mobile workflow simulation must not reuse real import approval gates",
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
        pattern: /CUSTOMER_IMPORT_CONFIRM|--execute|fetch\(|POSTGRES_DSN|sql\.Open|pgx/u,
        message: "dry-run must not gain execution, backend, or DB entrypoints",
      },
      {
        path: "scripts/import/customerSourceSnapshotFreezeCheck.mjs",
        pattern: /CUSTOMER_IMPORT_CONFIRM|--execute|fetch\(|POSTGRES_DSN|sql\.Open|pgx/u,
        message: "source freeze must not gain execution, backend, or DB entrypoints",
      },
    ]),
  },
  {
    id: "real-import-execute-keeps-explicit-gates",
    bucket: "real-import-execute",
    description:
      "real import execution remains a separate, explicitly approved JSON-RPC loader.",
    required: Object.freeze([
      {
        path: "scripts/import/customerImportExecute.mjs",
        pattern: /const CONFIRM_PHRASE = "EXECUTE_YOYOOSUN_IMPORT"/u,
        message: "real import execution must keep its explicit confirmation phrase",
      },
      {
        path: "scripts/import/customerImportExecute.mjs",
        pattern: /approval\.realImportApproved !== true/u,
        message: "real import execution must require approved real import plan",
      },
      {
        path: "scripts/import/customerImportExecute.mjs",
        pattern: /assertExecutionBackupEvidence/u,
        message: "real import execution must require backup evidence",
      },
      {
        path: "scripts/import/customerImportExecute.mjs",
        pattern: /assertExecutionRecoveryPlan/u,
        message: "real import execution must require reviewed recovery plan",
      },
      {
        path: "scripts/import/customerImportExecute.mjs",
        pattern: /FORBIDDEN_TARGET_PATTERN/u,
        message: "real import execution must keep forbidden fact-domain guard",
      },
      {
        path: "scripts/import/customerImportExecute.mjs",
        pattern: /never writes database tables directly, never writes business_records/u,
        message: "real import execution must stay JSON-RPC only",
      },
    ]),
    forbidden: Object.freeze([
      {
        path: "scripts/import/customerImportExecute.mjs",
        pattern:
          /method:\s*["'](?:create_shipment|post_shipment|create_inventory|post_inventory|create_finance_fact|post_finance_fact)["']/u,
        message:
          "real import execution must not add shipment, inventory, or finance fact RPC operations",
      },
    ]),
  },
]);

function normalizePath(relativePath) {
  return String(relativePath || "").split(path.sep).join("/");
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

export async function buildTestDataIsolationReport({
  root = repoRoot,
  checks = DEFAULT_TEST_DATA_ISOLATION_CHECKS,
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

Checks Product Core demo seed, yoyoosun simulated test data, real import dry-run/freeze,
and real import execute gates. The check is read-only and never connects to backend or DB.`);
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
