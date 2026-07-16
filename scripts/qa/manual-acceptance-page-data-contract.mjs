import { buildManualAcceptanceCatalog } from "./manual-acceptance-catalog.mjs";

export const MANUAL_ACCEPTANCE_PAGE_DATA_CONTRACT =
  "manual-acceptance-page-data-ownership-v2";
export const MANUAL_ACCEPTANCE_PAGE_TARGET_COUNT = 51;

export const MANUAL_ACCEPTANCE_GENERATOR_STAGE_KEYS = Object.freeze([
  "role",
  "source",
  "task",
  "facts",
  "catalog",
]);

export const MANUAL_ACCEPTANCE_GENERATOR_STAGES = Object.freeze({
  role: Object.freeze({
    entrypoints: Object.freeze([
      "scripts/qa/manual-acceptance-account-scenarios.mjs",
    ]),
    writesBusinessData: true,
    purpose: "统一核对正式岗位账号，并调和异常账号场景和账号审计证据。",
  }),
  source: Object.freeze({
    entrypoints: Object.freeze([
      "scripts/qa/manual-acceptance-source-data.mjs",
    ]),
    writesBusinessData: true,
    purpose: "统一准备主数据、销售、采购、委外和 BOM 模拟源数据。",
  }),
  task: Object.freeze({
    entrypoints: Object.freeze(["scripts/qa/manual-acceptance-task-data.mjs"]),
    writesBusinessData: true,
    purpose: "统一准备九个岗位任务及其状态分布。",
  }),
  facts: Object.freeze({
    entrypoints: Object.freeze(["scripts/qa/manual-acceptance-fact-data.mjs"]),
    writesBusinessData: true,
    purpose: "统一通过正式来源驱动 API 准备采购、库存、生产、出货和财务事实。",
  }),
  catalog: Object.freeze({
    entrypoints: Object.freeze(["scripts/qa/manual-acceptance-catalog.mjs"]),
    writesBusinessData: false,
    purpose: "只读取正式打印模板目录，不为页面伪造业务记录。",
  }),
});

export const MANUAL_ACCEPTANCE_DESKTOP_DATASET_BY_PAGE = Object.freeze({
  customers: "customers",
  suppliers: "suppliers",
  products: "product-skus",
  materials: "materials",
  "sales-orders": "sales-orders",
  "material-bom": "bom-versions",
  processes: "processes",
  "accessories-purchase": "purchase-orders",
  "quality-inspections": "quality-inspections",
  inbound: "purchase-receipts",
  "processing-contracts": "outsourcing-orders",
  "production-orders": "production-orders",
  "production-progress": "production-facts",
  outbound: "stock-reservations",
  shipments: "shipments",
  reconciliation: "finance-reconciliation",
  payables: "finance-payables",
  receivables: "finance-receivables",
  invoices: "finance-invoices",
  "system-audit-logs": "audit-events",
});

const PRINT_SUPPORT_DATASET = Object.freeze({
  "material-purchase-contract": "purchase-orders",
  "processing-contract": "outsourcing-orders",
  "engineering-material-detail": "bom-versions",
  "engineering-color-card": "bom-versions",
  "engineering-work-instruction": "bom-versions",
});

export const MANUAL_ACCEPTANCE_DERIVED_PROBE_IDS = Object.freeze({
  validAccountLogins: "valid-account-logins",
  bossDashboardActiveTasks: "boss-dashboard-active-tasks",
  mobileTaskTotal: "mobile-task-total",
  catalogPrintTemplates: "catalog-print-templates",
});

const PROBE_GENERATOR_STAGE = Object.freeze({
  customers: "source",
  suppliers: "source",
  "product-skus": "source",
  materials: "source",
  "sales-orders": "source",
  "bom-versions": "source",
  processes: "source",
  "purchase-orders": "source",
  "outsourcing-orders": "source",
  "production-orders": "facts",
  "quality-inspections": "facts",
  "purchase-receipts": "facts",
  "purchase-returns": "facts",
  "purchase-receipt-adjustments": "facts",
  "inventory-balances": "facts",
  "inventory-lots": "facts",
  "inventory-txns": "facts",
  "production-facts": "facts",
  "stock-reservations": "facts",
  shipments: "facts",
  "finance-reconciliation": "facts",
  "finance-payables": "facts",
  "finance-receivables": "facts",
  "finance-invoices": "facts",
  "permission-accounts": "role",
  "permission-roles": "role",
  "audit-events": "role",
  "valid-account-logins": "role",
  "boss-dashboard-tasks": "task",
  "boss-dashboard-active-tasks": "task",
  "mobile-task-total": "task",
  "catalog-print-templates": "catalog",
});

const WORKFLOW_TASK_GROUP_PROBES = Object.freeze({
  "production-scheduling": "workflow-tasks:production_scheduling",
  "production-exceptions": "workflow-tasks:production_exception",
  "shipping-release": "workflow-tasks:shipment_release",
});

const FORBIDDEN_TARGET_ENTRYPOINT_KEY =
  /(?:builder|command|entrypoint|generatorScript|scriptPath)/iu;

export class ManualAcceptancePageDataContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "ManualAcceptancePageDataContractError";
  }
}

function assertContract(condition, message) {
  if (!condition) throw new ManualAcceptancePageDataContractError(message);
}

function flattenCatalog(catalog) {
  const manifest = catalog?.technicalManifest;
  assertContract(manifest, "验收目录缺少 technicalManifest");
  return [
    ...manifest.entries.map((item) => ({
      ...item,
      catalogGroup: "entries",
    })),
    ...manifest.desktopPages.map((item) => ({
      ...item,
      catalogGroup: "desktopPages",
    })),
    ...manifest.mobileRolePages.map((item) => ({
      ...item,
      catalogGroup: "mobileRolePages",
    })),
    ...manifest.printPreviewPages.map((item) => ({
      ...item,
      catalogGroup: "printPreviewPages",
    })),
    ...manifest.printWorkspacePages.map((item) => ({
      ...item,
      catalogGroup: "printWorkspacePages",
    })),
  ];
}

function targetId(item) {
  return `${item.catalogGroup}:${item.key}`;
}

function generatorStageForProbe(probeId, mobileRoleKeys) {
  const declared = PROBE_GENERATOR_STAGE[probeId];
  if (declared) return declared;
  const prefix = "mobile-tasks:";
  if (probeId.startsWith(prefix)) {
    const roleKey = probeId.slice(prefix.length);
    assertContract(
      mobileRoleKeys.has(roleKey),
      `数据核验 probe ${probeId} 使用了未知岗位`,
    );
    return "task";
  }
  const workflowPrefix = "workflow-tasks:";
  if (
    probeId.startsWith(workflowPrefix) &&
    Object.values(WORKFLOW_TASK_GROUP_PROBES).includes(probeId)
  ) {
    return "task";
  }
  throw new ManualAcceptancePageDataContractError(
    `数据核验 probe ${probeId} 没有共享生成阶段`,
  );
}

function targetEvidence(item) {
  if (item.catalogGroup === "entries") {
    return {
      probeIds: [
        "permission-accounts",
        MANUAL_ACCEPTANCE_DERIVED_PROBE_IDS.validAccountLogins,
      ],
      actualProbeId: "permission-accounts",
      browserRequired: true,
      reason:
        "账号数量和正常登录可由系统查询核对；错误密码、停用账号提示及入口切换仍需页面操作确认。",
    };
  }
  if (item.catalogGroup === "mobileRolePages") {
    return {
      probeIds: [`mobile-tasks:${item.key}`],
      browserRequired: true,
      reason: "任务数量和状态可核对，页面操作与恢复状态仍需页面确认。",
    };
  }
  if (
    item.catalogGroup === "printPreviewPages" ||
    item.catalogGroup === "printWorkspacePages"
  ) {
    const probeId = PRINT_SUPPORT_DATASET[item.key];
    assertContract(probeId, `打印页面 ${item.key} 没有共享源数据口径`);
    return {
      probeIds: [probeId],
      browserRequired: true,
      quantityNotProven: true,
      reason:
        "业务来源记录可以核对，但纸面明细行数、分页和编辑恢复不能由清单查询证明。",
    };
  }
  if (item.key === "global-dashboard") {
    return {
      probeIds: [MANUAL_ACCEPTANCE_DERIVED_PROBE_IDS.bossDashboardActiveTasks],
      actualProbeId:
        MANUAL_ACCEPTANCE_DERIVED_PROBE_IDS.bossDashboardActiveTasks,
      browserRequired: true,
      reason:
        "工作台只显示老板账号当前可见且未结束的本批事项；不把九岗位合计或已办任务冒充首页可见数量，卡片跳转和页面显示仍需页面确认。",
    };
  }
  if (item.key === "task-board") {
    return {
      probeIds: [
        MANUAL_ACCEPTANCE_DERIVED_PROBE_IDS.mobileTaskTotal,
        "boss-dashboard-tasks",
      ],
      actualProbeId: "boss-dashboard-tasks",
      browserRequired: true,
      reason:
        "九个岗位合计数量与老板账号实际可见任务分别核对；页面数量只采用当前老板账号的本批任务，不把跨岗位总数冒充页面可见数量。",
    };
  }
  if (item.key === "business-dashboard") {
    return {
      probeIds: [
        "customers",
        "suppliers",
        "product-skus",
        "bom-versions",
        "sales-orders",
        "purchase-orders",
        "purchase-receipts",
        "quality-inspections",
        "inventory-balances",
        "workflow-tasks:shipment_release",
        "shipments",
        "production-orders",
        "workflow-tasks:production_scheduling",
        "production-facts",
        "workflow-tasks:production_exception",
        "outsourcing-orders",
        "finance-reconciliation",
        "finance-payables",
        "finance-receivables",
        "finance-invoices",
      ],
      combine: "minimum",
      browserRequired: true,
      reason:
        "基础资料、业务单据、办理结果和当前待办分别按共享批次核对；页面四类数字与跳转仍需页面确认。",
    };
  }
  if (item.key === "exception-flow") {
    return {
      probeIds: ["workflow-tasks:production_exception"],
      actualProbeId: "workflow-tasks:production_exception",
      browserRequired: true,
      reason:
        "当前账号可见任务的阻塞、今日或超时和可处理分布由同批岗位任务支撑；异常步骤和页面可见数量仍需页面确认。",
    };
  }
  const workflowProbeId = WORKFLOW_TASK_GROUP_PROBES[item.key];
  if (workflowProbeId) {
    return {
      probeIds: [workflowProbeId],
      actualProbeId: workflowProbeId,
      browserRequired: true,
      reason:
        "本批任务按精确 task_group、岗位、来源和状态矩阵核对；页面筛选、详情和处理动作仍需页面确认。",
    };
  }
  if (item.key === "inbound") {
    return {
      probeIds: [
        "purchase-receipts",
        "purchase-returns",
        "purchase-receipt-adjustments",
      ],
      actualProbeId: "purchase-receipts",
      browserRequired: true,
      reason:
        "本批入库、退货和调整记录分别按精确引用核对；页面筛选、详情及业务操作仍需页面确认。",
    };
  }
  if (item.key === "inventory") {
    return {
      probeIds: ["inventory-balances", "inventory-lots", "inventory-txns"],
      combine: "minimum",
      browserRequired: true,
      reason: "余额、批次和流水分别核对，页面切换与相互对照仍需页面确认。",
    };
  }
  if (item.key === "print-center") {
    return {
      probeIds: [MANUAL_ACCEPTANCE_DERIVED_PROBE_IDS.catalogPrintTemplates],
      browserRequired: true,
      reason: "模板数量来自当前正式目录，模板打开和纸面内容仍需页面确认。",
    };
  }
  if (item.key === "permission-center") {
    return {
      probeIds: ["permission-accounts", "permission-roles"],
      actualProbeId: "permission-accounts",
      browserRequired: true,
      reason: "账号和岗位模板数量可核对，筛选及权限调整仍需页面确认。",
    };
  }
  const probeId = MANUAL_ACCEPTANCE_DESKTOP_DATASET_BY_PAGE[item.key];
  assertContract(probeId, `页面 ${item.key} 没有共享数据核验口径`);
  return {
    probeIds: [probeId],
    browserRequired: true,
    reason: "数量和状态分布可核对，筛选、详情及业务操作仍需页面确认。",
  };
}

function expectedCatalogTargetIds(catalog) {
  return flattenCatalog(catalog).map((item) => targetId(item));
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

export function assertManualAcceptancePageDataContract(contract, options = {}) {
  assertContract(
    contract?.contract === MANUAL_ACCEPTANCE_PAGE_DATA_CONTRACT,
    `页面数据合同必须为 ${MANUAL_ACCEPTANCE_PAGE_DATA_CONTRACT}`,
  );
  assertContract(
    contract.customerKey === "yoyoosun",
    "页面数据合同必须绑定 customerKey=yoyoosun",
  );
  assertContract(
    contract.targetCount === MANUAL_ACCEPTANCE_PAGE_TARGET_COUNT,
    `页面数据合同 targetCount 必须为 ${MANUAL_ACCEPTANCE_PAGE_TARGET_COUNT}`,
  );
  assertContract(Array.isArray(contract.targets), "页面数据合同缺少 targets");
  assertContract(
    contract.targets.length === MANUAL_ACCEPTANCE_PAGE_TARGET_COUNT,
    `页面数据合同必须恰好覆盖 ${MANUAL_ACCEPTANCE_PAGE_TARGET_COUNT} 个正式目标，实际为 ${contract.targets.length} 个`,
  );

  const generatorStageKeys = Object.keys(contract.generatorStages || {}).sort();
  assertContract(
    JSON.stringify(generatorStageKeys) ===
      JSON.stringify([...MANUAL_ACCEPTANCE_GENERATOR_STAGE_KEYS].sort()),
    "页面数据合同的共享生成阶段不完整",
  );
  for (const stageKey of MANUAL_ACCEPTANCE_GENERATOR_STAGE_KEYS) {
    const actual = contract.generatorStages[stageKey];
    const expected = MANUAL_ACCEPTANCE_GENERATOR_STAGES[stageKey];
    assertContract(
      JSON.stringify(actual) === JSON.stringify(expected),
      `共享生成阶段 ${stageKey} 偏离了唯一登记入口`,
    );
  }

  const mobileRoleKeys = new Set(
    contract.targets
      .filter((target) => target.catalogGroup === "mobileRolePages")
      .map((target) => target.key),
  );
  const ids = contract.targets.map((target) => target.id);
  assertContract(
    new Set(ids).size === ids.length,
    "页面数据合同存在重复 target id",
  );

  if (options.catalog) {
    const expectedIds = expectedCatalogTargetIds(options.catalog);
    assertContract(
      JSON.stringify(ids) === JSON.stringify(expectedIds),
      "页面数据合同与当前正式验收目录不一致",
    );
  }

  const usedProbeIds = new Set();
  for (const target of contract.targets) {
    const forbiddenKey = Object.keys(target).find((key) =>
      FORBIDDEN_TARGET_ENTRYPOINT_KEY.test(key),
    );
    assertContract(
      !forbiddenKey,
      `页面 ${target.id} 不得声明自有数据生成入口 ${forbiddenKey}`,
    );
    assertContract(
      Array.isArray(target.probeIds) && target.probeIds.length > 0,
      `页面 ${target.id} 没有数据核验 probe`,
    );
    assertContract(
      new Set(target.probeIds).size === target.probeIds.length,
      `页面 ${target.id} 存在重复数据核验 probe`,
    );
    if (
      target.catalogGroup === "mobileRolePages" ||
      (target.probeIds.length === 1 &&
        target.probeIds[0].startsWith("workflow-tasks:"))
    ) {
      assertContract(
        Array.isArray(target.requiredTaskScenarios) &&
          target.requiredTaskScenarios.length > 0 &&
          new Set(target.requiredTaskScenarios).size ===
            target.requiredTaskScenarios.length,
        `任务页面 ${target.id} 缺少唯一的任务场景目录`,
      );
    }
    const expectedStageKeys = sortedUnique(
      target.probeIds.map((probeId) => {
        usedProbeIds.add(probeId);
        return generatorStageForProbe(probeId, mobileRoleKeys);
      }),
    );
    assertContract(
      JSON.stringify(target.generatorStageKeys) ===
        JSON.stringify(expectedStageKeys),
      `页面 ${target.id} 的共享生成阶段与 probe 归属不一致`,
    );
    if (target.actualProbeId) {
      assertContract(
        target.probeIds.includes(target.actualProbeId),
        `页面 ${target.id} 的 actualProbeId 不在 probeIds 中`,
      );
    }
  }

  if (options.knownProbeIds) {
    const knownProbeIds = new Set(options.knownProbeIds);
    for (const probeId of knownProbeIds) {
      generatorStageForProbe(probeId, mobileRoleKeys);
      assertContract(
        usedProbeIds.has(probeId),
        `数据核验 probe ${probeId} 没有归属任何正式页面`,
      );
    }
    for (const probeId of usedProbeIds) {
      assertContract(
        knownProbeIds.has(probeId),
        `页面数据合同使用了 readiness 未提供的 probe ${probeId}`,
      );
    }
  }

  return contract;
}

export function buildManualAcceptancePageDataContract(options = {}) {
  const catalog = options.catalog || buildManualAcceptanceCatalog();
  assertContract(
    catalog?.meta?.customerKey === "yoyoosun",
    "页面数据合同只允许使用 yoyoosun 正式验收目录",
  );
  const catalogTargets = flattenCatalog(catalog);
  assertContract(
    catalogTargets.length === MANUAL_ACCEPTANCE_PAGE_TARGET_COUNT,
    `当前正式验收目录应为 ${MANUAL_ACCEPTANCE_PAGE_TARGET_COUNT} 个目标，实际为 ${catalogTargets.length} 个`,
  );
  const mobileRoleKeys = new Set(
    catalogTargets
      .filter((item) => item.catalogGroup === "mobileRolePages")
      .map((item) => item.key),
  );
  const targets = catalogTargets.map((item) => {
    const evidence = targetEvidence(item);
    const generatorStageKeys = sortedUnique(
      evidence.probeIds.map((probeId) =>
        generatorStageForProbe(probeId, mobileRoleKeys),
      ),
    );
    return {
      id: targetId(item),
      key: item.key,
      title: item.title,
      route: item.route,
      catalogGroup: item.catalogGroup,
      roleKeys: [...item.roleKeys],
      expectedMinimum: item.minimumRecords,
      expectedUnit: item.minimumRecordUnit,
      ...(Array.isArray(item.requiredTaskScenarios)
        ? { requiredTaskScenarios: [...item.requiredTaskScenarios] }
        : {}),
      ...evidence,
      generatorStageKeys,
    };
  });
  const contract = {
    contract: MANUAL_ACCEPTANCE_PAGE_DATA_CONTRACT,
    customerKey: "yoyoosun",
    targetCount: MANUAL_ACCEPTANCE_PAGE_TARGET_COUNT,
    generatorStages: Object.fromEntries(
      MANUAL_ACCEPTANCE_GENERATOR_STAGE_KEYS.map((stageKey) => [
        stageKey,
        MANUAL_ACCEPTANCE_GENERATOR_STAGES[stageKey],
      ]),
    ),
    targets,
    boundary:
      "正式页面只能消费 role/source/task/facts/catalog 共享阶段及其 readback probe；页面不得声明自有 builder、脚本或数据库写入入口。",
  };
  return assertManualAcceptancePageDataContract(contract, { catalog });
}
