#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { yoyoosunTrialDataFixture } from "../../config/customers/yoyoosun/trialDataFixture.mjs";
import {
  DEFAULT_MANUAL_ACCEPTANCE_DATA_VERSION,
  deriveManualAcceptanceDatasetIdentity,
} from "./manual-acceptance-dataset.mjs";
import {
  CUSTOMER_TRIAL_133_ORIGIN,
  CUSTOMER_TRIAL_133_TARGET,
} from "./manual-acceptance-target-policy.mjs";

const currentFile = fileURLToPath(import.meta.url);
const DEFAULT_OUT_DIR = "output/qa/manual-regression-data-plan";

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
      "这批 Product Core 基础资料只供本地开发复用，不包含永绅客户记录、订单、库存、出货、财务或真实导入授权。",
  };
}

function buildYoyoosunPlan() {
  const identity = deriveManualAcceptanceDatasetIdentity(
    DEFAULT_MANUAL_ACCEPTANCE_DATA_VERSION,
  );

  return {
    customerKey: yoyoosunTrialDataFixture.customerKey,
    datasetKey: identity.datasetKey,
    dataVersion: identity.dataVersion,
    runId: identity.runId,
    fixtureKey: yoyoosunTrialDataFixture.fixtureKey,
    fixtureStatus: yoyoosunTrialDataFixture.status,
    simulatedOnly: true,
    realCustomerImport: false,
    writesBusinessRecordsDirectly: false,
    currentContract: {
      version: identity.dataVersion,
      runId: identity.runId,
      targets: ["local", CUSTOMER_TRIAL_133_TARGET],
      sameBusinessMeaning: true,
      sharedDatabaseIds: false,
      factsContract: "source-driven-operational-facts-v1",
      formalBusinessAPIsOnly: true,
      purchaseQualityHandledByFacts: true,
    },
    targetRules: {
      local: {
        backendURL: "http://127.0.0.1:8300",
        coreAndRole: "seed-or-verify",
      },
      [CUSTOMER_TRIAL_133_TARGET]: {
        backendURL: CUSTOMER_TRIAL_133_ORIGIN,
        coreAndRole: "verify-or-reuse-only",
        remoteSeedAllowed: false,
        releaseAndMigrationAttestationRequired: true,
      },
    },
    simulationPrefixes: { ...identity.prefixes },
    fixtureBoundary: yoyoosunTrialDataFixture.boundary,
    fixtureCounts: countFixtureRecords(yoyoosunTrialDataFixture),
    fixtureStateCoverage: buildYoyoosunStateCoverage(yoyoosunTrialDataFixture),
    fixtureSourceIds: collectFixtureSourceIds(yoyoosunTrialDataFixture),
    manualRegressionFlows: [
      "客户、供应商、材料和产品都能查到",
      "销售、采购和委外订单有常用状态可看",
      "收货、检验、库存和生产前后能连起来",
      "预留、出货和财务页面有同批业务记录",
      "九个岗位都有待办、已办和异常示例",
      "采购合同、加工合同和产品资料可以带值打印",
    ],
    commands: {
      fixtureBoundary:
        "PATH=/usr/local/bin:$PATH node --test scripts/qa/yoyoosun-customer-closure.test.mjs",
      datasetPlan:
        "PATH=/usr/local/bin:$PATH node scripts/qa/manual-acceptance-dataset.mjs",
      sourcePlan:
        `PATH=/usr/local/bin:$PATH node scripts/qa/manual-acceptance-source-data.mjs --target local-dev --data-version ${identity.dataVersion} --run-id ${identity.runId} --json`,
      factsEntrypoint: "scripts/qa/manual-acceptance-fact-data.mjs",
      factsHelper:
        "scripts/qa/manual-acceptance-source-driven-facts.mjs",
      readinessPlan:
        "PATH=/usr/local/bin:$PATH node scripts/qa/manual-acceptance-readiness.mjs",
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
      "本计划只整理验收范围，不连接系统，也不写数据库。",
      "SIM-PLUSH-CORE 只用于本地基础资料；133 只能核对或复用，不远程 seed。",
      "永绅数据全部是模拟测试数据，不代表客户已确认或真实发生。",
      "正式部署默认不造数据；133 试用写入必须绑定明确版本、迁移和带外证明。",
      "所有业务事实只走正式 API，不直接写 SQL，不把 Workflow 当成库存、出货或财务事实。",
    ],
  };
}

export function formatManualRegressionDataPlan(plan) {
  const lines = [
    "手工回归数据计划",
    `scope=${plan.scope}`,
    `readOnly=${plan.readOnly}`,
    `writesDatabase=${plan.writesDatabase}`,
    `realCustomerImport=${plan.realCustomerImport}`,
    "",
    "本地通用基础资料",
    `- 编号前缀: ${plan.productCore.prefix}`,
    `- 本地准备命令: ${plan.productCore.seedCommand}`,
    `- 覆盖数量: ${Object.entries(plan.productCore.expectedCoverage)
      .map(([key, value]) => `${key}=${value}`)
      .join(", ")}`,
    "",
    "永绅模拟验收数据",
    `- 当前版本: ${plan.yoyoosun.dataVersion} / ${plan.yoyoosun.runId}`,
    `- 参考样例: ${plan.yoyoosun.fixtureKey} (${plan.yoyoosun.fixtureStatus})`,
    `- 样例数量: ${Object.entries(plan.yoyoosun.fixtureCounts)
      .map(([key, value]) => `${key}=${value}`)
      .join(", ")}`,
    `- 销售订单状态: ${plan.yoyoosun.fixtureStateCoverage.salesOrderLifecycleStatuses.join(", ")}`,
    `- 待办岗位: ${plan.yoyoosun.fixtureStateCoverage.workflowOwnerRoles.join(", ")}`,
    "",
    "核对命令",
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
