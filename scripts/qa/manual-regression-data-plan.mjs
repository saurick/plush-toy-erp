#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { yoyoosunTrialDataFixture } from "../../config/customers/yoyoosun/trialDataFixture.mjs";
import { buildInputTemplate as buildMobileWorkflowInputTemplate } from "./mobile-workflow-simulated-closure.mjs";
import { buildInputTemplate as buildOperationalFactInputTemplate } from "./operational-fact-simulated-closure.mjs";
import { buildInputTemplate as buildTrialSimulatedDataInputTemplate } from "./trial-simulated-data.mjs";

const currentFile = fileURLToPath(import.meta.url);
const DEFAULT_OUT_DIR = "output/qa/manual-regression-data-plan";
const TRIAL_SIM_CONFIRM = "APPLY_SIMULATED_TRIAL_DATA";
const OPERATIONAL_FACT_SIM_CONFIRM = "APPLY_SIMULATED_OPERATIONAL_FACTS";
const MOBILE_WORKFLOW_SIM_CONFIRM = "APPLY_SIMULATED_MOBILE_WORKFLOW_TASKS";

const COUNT_FIELDS = Object.freeze([
  "units",
  "customers",
  "suppliers",
  "materials",
  "products",
  "warehouses",
  "bomVersions",
  "salesOrders",
  "purchaseOrders",
  "outsourcingOrders",
  "purchaseReceipts",
  "qualityInspections",
  "inventoryLots",
  "shipments",
  "financeDrafts",
  "workflowTasks",
]);

function uniqueValues(items, field) {
  return [
    ...new Set(
      (items || [])
        .map((item) => String(item?.[field] ?? "").trim())
        .filter(Boolean),
    ),
  ].sort();
}

function countFixtureRecords(fixture) {
  return Object.fromEntries(
    COUNT_FIELDS.map((field) => [
      field,
      Array.isArray(fixture[field]) ? fixture[field].length : 0,
    ]),
  );
}

function buildYoyoosunStateCoverage(fixture) {
  return {
    salesOrderLifecycleStatuses: uniqueValues(
      fixture.salesOrders,
      "lifecycleStatus",
    ),
    purchaseReceiptStatuses: uniqueValues(fixture.purchaseReceipts, "status"),
    qualityInspectionResults: uniqueValues(
      fixture.qualityInspections,
      "result",
    ),
    inventoryLotStatuses: uniqueValues(fixture.inventoryLots, "status"),
    shipmentStatuses: uniqueValues(fixture.shipments, "status"),
    financeDraftStatuses: uniqueValues(fixture.financeDrafts, "status"),
    financeFactTypes: uniqueValues(fixture.financeDrafts, "factType"),
    workflowOwnerRoles: uniqueValues(fixture.workflowTasks, "ownerRoleKey"),
    workflowTaskStatuses: uniqueValues(fixture.workflowTasks, "taskStatusKey"),
    workflowTaskGroups: uniqueValues(fixture.workflowTasks, "taskGroup"),
  };
}

function collectFixtureSourceIds(fixture) {
  return [
    ...new Set(
      COUNT_FIELDS.flatMap((field) => fixture[field] || [])
        .flatMap((item) => item?.sourceIds || [])
        .map((sourceId) => String(sourceId).trim())
        .filter(Boolean),
    ),
  ].sort();
}

function buildProductCorePlan() {
  return {
    datasetKey: "default-core-demo-seed",
    prefix: "SIM-PLUSH-CORE",
    customerKey: "",
    simulatedOnly: true,
    realCustomerImport: false,
    writesBusinessRecords: false,
    writesCustomerRuntimeFacts: false,
    seedCommand:
      "PATH=/usr/local/bin:$PATH bash scripts/seed-core-demo-data.sh",
    expectedCoverage: {
      units: 4,
      materials: 7,
      products: 4,
      warehouses: 4,
      processes: 9,
      bomVersions: 2,
      bomItemsMinimum: 6,
    },
    domains: [
      "unit",
      "material",
      "product",
      "warehouse",
      "process",
      "bom",
    ],
    boundary:
      "Product Core demo seed is neutral local master data. It must not contain yoyoosun customer records, sales orders, inventory, shipment, finance, or real import approval.",
  };
}

function buildYoyoosunPlan() {
  const trialTemplate = buildTrialSimulatedDataInputTemplate({
    productId: 1,
    unitId: 1,
  });
  const operationalTemplate = buildOperationalFactInputTemplate({
    productId: 1,
    unitId: 1,
    warehouseId: 1,
    runId: "DEV-TESTING-REPORT",
  });
  const mobileWorkflowTemplate = buildMobileWorkflowInputTemplate({
    runId: "DEV-TESTING-REPORT",
  });

  return {
    customerKey: yoyoosunTrialDataFixture.customerKey,
    fixtureKey: yoyoosunTrialDataFixture.fixtureKey,
    fixtureStatus: yoyoosunTrialDataFixture.status,
    simulatedOnly: true,
    realCustomerImport: false,
    writesBusinessRecordsDirectly: false,
    applyConfirmations: {
      trialMasterData: TRIAL_SIM_CONFIRM,
      operationalFacts: OPERATIONAL_FACT_SIM_CONFIRM,
      mobileWorkflow: MOBILE_WORKFLOW_SIM_CONFIRM,
    },
    simulationPrefixes: {
      trialMasterData: "SIM-YOYOOSUN-TRIAL",
      operationalFacts: "SIM-YOYOOSUN-OPFACT",
      mobileWorkflow: "SIM-YOYOOSUN-MOBILE-WORKFLOW",
    },
    fixtureBoundary: yoyoosunTrialDataFixture.boundary,
    fixtureCounts: countFixtureRecords(yoyoosunTrialDataFixture),
    fixtureStateCoverage: buildYoyoosunStateCoverage(yoyoosunTrialDataFixture),
    fixtureSourceIds: collectFixtureSourceIds(yoyoosunTrialDataFixture),
    manualRegressionFlows: [
      "customer and supplier master data",
      "sales order draft, active, and cancelled states",
      "material purchase and outsourcing contract print data",
      "purchase receipt draft and posted states",
      "quality pending, passed, and rejected states",
      "inventory pending, qc hold, and available lot states",
      "shipment draft, shipped, and cancelled states",
      "finance receivable/payable draft and posted preview states",
      "workflow sales, purchase, boss, quality, and warehouse task roles",
    ],
    commands: {
      fixtureBoundary:
        "PATH=/usr/local/bin:$PATH node --test scripts/qa/yoyoosun-customer-closure.test.mjs",
      trialReportOnly: trialTemplate.commands.reportOnly,
      trialApplySimulated: trialTemplate.commands.applySimulated,
      operationalReportOnly: operationalTemplate.commands.reportOnly,
      operationalApplySimulated: operationalTemplate.commands.applySimulated,
      mobileWorkflowReportOnly: mobileWorkflowTemplate.commands.reportOnly,
      mobileWorkflowApplySimulated:
        mobileWorkflowTemplate.commands.applySimulated,
    },
  };
}

export function buildManualRegressionDataPlan() {
  return {
    scope: "manual-regression-data-plan",
    generatedAt: new Date().toISOString(),
    readOnly: true,
    writesDatabase: false,
    callsBackend: false,
    simulatedOnly: true,
    realCustomerImport: false,
    productCore: buildProductCorePlan(),
    yoyoosun: buildYoyoosunPlan(),
    reviewPasses: [
      {
        id: "review-pass-1-runtime-contract-and-fixture-unit-tests",
        command:
          "PATH=/usr/local/bin:$PATH node --test web/src/erp/utils/adminProfileSync.test.mjs scripts/qa/formal-frontend-customer-config-boundary.test.mjs scripts/qa/yoyoosun-customer-closure.test.mjs scripts/qa/manual-regression-data-plan.test.mjs",
      },
      {
        id: "review-pass-2-data-isolation-and-browser-regression",
        command:
          "PATH=/usr/local/bin:$PATH node scripts/qa/test-data-isolation-boundary.mjs --json && STYLE_L1_PORT=5239 STYLE_L1_SCENARIOS=erp-effective-session-super-admin-product-core,erp-effective-session-action-projection-business-pages pnpm --dir web style:l1",
      },
    ],
    boundaries: [
      "This plan is read-only and does not write database rows.",
      "Product Core seed remains neutral SIM-PLUSH-CORE master data.",
      "yoyoosun fixture and simulation scripts remain simulated test data.",
      "Real customer import is not executed and requires the separate approved import executor.",
      "No tenant_id, SaaS tenant split, business_records write, shipment/inventory/finance direct SQL, or Product Core customer hard-code is introduced.",
    ],
  };
}

export function formatManualRegressionDataPlan(plan) {
  const lines = [
    "manual regression data plan",
    `scope=${plan.scope}`,
    `readOnly=${plan.readOnly}`,
    `writesDatabase=${plan.writesDatabase}`,
    `realCustomerImport=${plan.realCustomerImport}`,
    "",
    "Product Core",
    `- prefix: ${plan.productCore.prefix}`,
    `- seed: ${plan.productCore.seedCommand}`,
    `- coverage: ${Object.entries(plan.productCore.expectedCoverage)
      .map(([key, value]) => `${key}=${value}`)
      .join(", ")}`,
    "",
    "yoyoosun",
    `- fixture: ${plan.yoyoosun.fixtureKey} (${plan.yoyoosun.fixtureStatus})`,
    `- counts: ${Object.entries(plan.yoyoosun.fixtureCounts)
      .map(([key, value]) => `${key}=${value}`)
      .join(", ")}`,
    `- sales statuses: ${plan.yoyoosun.fixtureStateCoverage.salesOrderLifecycleStatuses.join(", ")}`,
    `- workflow roles: ${plan.yoyoosun.fixtureStateCoverage.workflowOwnerRoles.join(", ")}`,
    "",
    "review passes",
    ...plan.reviewPasses.map((pass) => `- ${pass.id}: ${pass.command}`),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

async function writePlan(outDir, plan) {
  await mkdir(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "manual-regression-data-plan.json");
  const markdownPath = path.join(outDir, "manual-regression-data-plan.md");
  await writeFile(jsonPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, formatManualRegressionDataPlan(plan), "utf8");
  return { jsonPath, markdownPath };
}

function parseArgs(argv) {
  const options = { json: false, out: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json") {
      options.json = true;
      continue;
    }
    if (token === "--out") {
      options.out = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/qa/manual-regression-data-plan.mjs [--json]
  node scripts/qa/manual-regression-data-plan.mjs --out ${DEFAULT_OUT_DIR}

Builds a read-only manual regression data plan for Product Core and yoyoosun simulated data.`);
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return;
  }
  const plan = buildManualRegressionDataPlan();
  if (options.out) {
    const output = await writePlan(options.out, plan);
    console.log(
      `manual regression data plan written: ${output.jsonPath} ${output.markdownPath}`,
    );
    return;
  }
  if (options.json) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  process.stdout.write(formatManualRegressionDataPlan(plan));
}

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}
