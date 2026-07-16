import assert from "node:assert/strict";
import test from "node:test";

import {
  buildManualAcceptanceReadinessPlan,
  evaluateManualAcceptanceDataset,
  MANUAL_ACCEPTANCE_ACCOUNT_STATE_EXPECTATIONS,
  parseManualAcceptanceReadinessArgs,
  renderManualAcceptanceReadinessMarkdown,
  runManualAcceptanceReadinessCli,
  verifyManualAcceptanceReadiness,
} from "./manual-acceptance-readiness.mjs";
import {
  MANUAL_ACCEPTANCE_GENERATOR_STAGE_KEYS,
  assertManualAcceptancePageDataContract,
  buildManualAcceptancePageDataContract,
} from "./manual-acceptance-page-data-contract.mjs";
import { TASK_COPY_REVISION } from "./manual-acceptance-task-data.mjs";

function sourceReport(overrides = {}) {
  return {
    mode: "apply",
    simulatedOnly: true,
    realCustomerImport: false,
    datasetKey: "yoyoosun-manual-acceptance",
    dataVersion: "2026.07.15-v1",
    runId: "20260715-V1",
    target: "local-dev",
    backendURL: "http://127.0.0.1:8300",
    semanticDigest: "source-semantic-digest-v1",
    prefix: "SIM-YOYOOSUN-UAT-20260715-V1",
    runtime: {
      environment: "local",
      customerKey: "yoyoosun",
      configRevision: "cfg-local-1",
      source: "active_customer_config_revision",
    },
    scale: {
      customers: 60,
      suppliers: 60,
      materials: 80,
      products: 20,
      skusPerProduct: 3,
      processes: 30,
      salesOrders: 45,
      purchaseOrders: 45,
      outsourcingOrders: 45,
      bomVersions: 45,
      ...(overrides.scale || {}),
    },
    ...Object.fromEntries(
      Object.entries(overrides).filter(([key]) => key !== "scale"),
    ),
  };
}

function referenceRecords(count, options) {
  const {
    idBase,
    numberKey,
    numberPrefix,
    statuses = [],
    secondaryKey,
    secondaryValues = [],
    sourceType,
  } = options;
  return Array.from({ length: count }, (_, index) => ({
    id: idBase + index,
    ...(numberKey
      ? { [numberKey]: `${numberPrefix}-${String(index + 1).padStart(3, "0")}` }
      : {}),
    ...(statuses.length > 0 ? { status: statuses[index % statuses.length] } : {}),
    ...(secondaryKey
      ? { [secondaryKey]: secondaryValues[index % secondaryValues.length] }
      : {}),
    ...(sourceType ? { sourceType, sourceID: idBase + 10_000 + index } : {}),
  }));
}

function factReferenceRecords(countOverrides = {}) {
  const count = (key, fallback) => countOverrides[key] ?? fallback;
  const productionFacts = referenceRecords(count("productionFacts", 45), {
    idBase: 10_000,
    numberKey: "factNo",
    numberPrefix: "SIM-SDF-PROD",
    statuses: ["DRAFT", "POSTED", "CANCELLED"],
    secondaryKey: "factType",
    secondaryValues: [
      "MATERIAL_ISSUE",
      "FINISHED_GOODS_RECEIPT",
      "REWORK",
    ],
    sourceType: "PRODUCTION_ORDER",
  });
  const financeFacts = [
    ["PAYABLE", ["DRAFT", "POSTED", "SETTLED", "CANCELLED"]],
    ["RECEIVABLE", ["DRAFT", "POSTED", "SETTLED", "CANCELLED"]],
    ["RECONCILIATION", ["DRAFT", "POSTED", "SETTLED", "CANCELLED"]],
    ["INVOICE", ["DRAFT", "POSTED", "CANCELLED"]],
  ].flatMap(([factType, statuses], typeIndex) =>
    referenceRecords(count(`finance:${factType}`, 45), {
      idBase: 90_000 + typeIndex * 1_000,
      numberKey: "factNo",
      numberPrefix: `SIM-SDF-${factType}`,
      statuses,
      secondaryKey: "factType",
      secondaryValues: [factType],
      sourceType: factType === "PAYABLE" ? "OUTSOURCING_FACT" : "SHIPMENT",
    }),
  );
  const records = {
    productionOrders: referenceRecords(count("productionOrders", 45), {
      idBase: 1_000,
      numberKey: "orderNo",
      numberPrefix: "SIM-SDF-PO",
      statuses: ["DRAFT", "RELEASED", "CLOSED", "CANCELLED"],
    }),
    productionFacts,
    purchaseReceipts: referenceRecords(count("purchaseReceipts", 54), {
      idBase: 20_000,
      numberKey: "receiptNo",
      numberPrefix: "SIM-SDF-PR",
      statuses: ["DRAFT", "POSTED", "CANCELLED"],
    }),
    purchaseReturns: referenceRecords(count("purchaseReturns", 6), {
      idBase: 30_000,
      numberKey: "returnNo",
      numberPrefix: "SIM-SDF-RET",
      statuses: ["DRAFT", "POSTED", "CANCELLED"],
    }),
    purchaseReceiptAdjustments: referenceRecords(
      count("purchaseReceiptAdjustments", 6),
      {
        idBase: 40_000,
        numberKey: "adjustmentNo",
        numberPrefix: "SIM-SDF-ADJ",
        statuses: ["DRAFT", "POSTED", "CANCELLED"],
        secondaryKey: "adjustType",
        secondaryValues: ["QUANTITY_INCREASE", "QUANTITY_DECREASE"],
      },
    ),
    qualityInspections: referenceRecords(count("qualityInspections", 54), {
      idBase: 50_000,
      numberKey: "inspectionNo",
      numberPrefix: "SIM-SDF-QI",
      statuses: ["DRAFT", "SUBMITTED", "PASSED", "REJECTED", "CANCELLED"],
      sourceType: "PURCHASE_RECEIPT",
    }),
    inventoryLots: referenceRecords(count("inventoryLots", 45), {
      idBase: 60_000,
      numberKey: "lotNo",
      numberPrefix: "SIM-SDF-LOT",
      statuses: ["HOLD", "ACTIVE", "REJECTED"],
    }).map((item, index) => ({
      ...item,
      subjectType: index % 2 === 0 ? "MATERIAL" : "PRODUCT",
      subjectID: 200 + index,
      productSkuID: index % 2 === 0 ? undefined : 2_000 + index,
    })),
    inventoryBalances: referenceRecords(count("inventoryBalances", 45), {
      idBase: 70_000,
    }).map((item, index) => ({
      ...item,
      subjectType: index % 2 === 0 ? "MATERIAL" : "PRODUCT",
      subjectID: 200 + index,
      productSkuID: index % 2 === 0 ? undefined : 2_000 + index,
      warehouseID: 300 + (index % 4),
      lotID: 60_000 + index,
      unitID: 400 + (index % 2),
      quantity: "10",
    })),
    inventoryTxns: referenceRecords(count("inventoryTxns", 45), {
      idBase: 80_000,
      secondaryKey: "txnType",
      secondaryValues: ["IN", "OUT", "REVERSAL"],
      sourceType: "PRODUCTION_FACT",
    }),
    stockReservations: referenceRecords(count("stockReservations", 45), {
      idBase: 110_000,
      numberKey: "reservationNo",
      numberPrefix: "SIM-SDF-RES",
      statuses: ["ACTIVE", "RELEASED"],
      sourceType: "SALES_ORDER",
    }),
    shipments: referenceRecords(count("shipments", 45), {
      idBase: 120_000,
      numberKey: "shipmentNo",
      numberPrefix: "SIM-SDF-SHIP",
      statuses: ["DRAFT", "SHIPPED", "CANCELLED"],
      sourceType: "SALES_ORDER",
    }),
    financeFacts,
  };
  records.attachmentOwners = {
    productionFactId: productionFacts.find((item) => item.status === "POSTED").id,
    financeFactId: financeFacts.find((item) => item.status === "POSTED").id,
  };
  return records;
}

function factReport({ referenceCounts = {}, ...overrides } = {}) {
  return {
    reportContract: "source-driven-operational-facts-v1",
    mode: "apply",
    simulatedOnly: true,
    realCustomerImport: false,
    datasetKey: "yoyoosun-manual-acceptance",
    dataVersion: "2026.07.15-v1",
    runId: "20260715-V1",
    target: "local-dev",
    backendURL: "http://127.0.0.1:8300",
    semanticDigest: "fact-semantic-digest-v1",
    runtime: {
      environment: "local",
      customerKey: "yoyoosun",
      configRevision: "cfg-local-1",
      source: "active_customer_config_revision",
    },
    referenceRecords: factReferenceRecords(referenceCounts),
    ...overrides,
  };
}

test("readiness rejects legacy generic operational fact reports", () => {
  const report = factReport();
  delete report.reportContract;
  assert.throws(
    () => buildManualAcceptanceReadinessPlan({ factReport: report }),
    /业务记录报告不是有效的模拟试用写入报告/u,
  );
});

test("readiness fact contract requires bound identity, runtime, exact references, and in-batch attachment owners", () => {
  for (const key of [
    "datasetKey",
    "dataVersion",
    "target",
    "backendURL",
    "semanticDigest",
    "runtime",
    "referenceRecords",
  ]) {
    const report = factReport();
    delete report[key];
    assert.throws(
      () => buildManualAcceptanceReadinessPlan({ factReport: report }),
      /业务记录报告不是有效|缺少/u,
      key,
    );
  }
  const missingDataset = factReport();
  delete missingDataset.referenceRecords.inventoryTxns;
  assert.throws(
    () => buildManualAcceptanceReadinessPlan({ factReport: missingDataset }),
    /referenceRecords\.inventoryTxns/u,
  );
  const staleOwner = factReport();
  staleOwner.referenceRecords.attachmentOwners.productionFactId = 999_999;
  assert.throws(
    () => buildManualAcceptanceReadinessPlan({ factReport: staleOwner }),
    /attachmentOwners\.productionFactId/u,
  );
});

function taskReport(overrides = {}) {
  const runId = overrides.runId || "20260715-V1";
  return {
    mode: "apply",
    simulatedOnly: true,
    realCustomerImport: false,
    writesFacts: false,
    datasetKey: "yoyoosun-manual-acceptance",
    dataVersion: "2026.07.15-v1",
    runId,
    target: "local-dev",
    backendURL: "http://127.0.0.1:8300",
    copyRevision: TASK_COPY_REVISION,
    prefix:
      overrides.prefix ||
      `SIM-YOYOOSUN-UAT-TASK-${runId}-${TASK_COPY_REVISION}`,
    sourceType: "simulated-manual-acceptance-task-batch",
    sourceID: 123456,
    summary: {
      total: 180,
      persisted: 180,
      byRole: {
        boss: 20,
        sales: 20,
        purchase: 20,
        production: 20,
        warehouse: 20,
        finance: 20,
        pmc: 20,
        quality: 20,
        engineering: 20,
      },
      byStatus: {
        ready: 121,
        blocked: 27,
        done: 24,
        rejected: 8,
      },
    },
    ...overrides,
  };
}

function records(count, field, values, identityField, identityPrefix) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    ...(field ? { [field]: values[index % values.length] } : {}),
    ...(identityField
      ? {
          [identityField]: `${identityPrefix}-${String(index + 1).padStart(3, "0")}`,
        }
      : {}),
  }));
}

function taskStatusesForRole(roleKey) {
  const canReject = ["boss", "warehouse", "finance", "quality"].includes(
    roleKey,
  );
  return Object.freeze([
    ...Array(roleKey === "boss" ? 15 : canReject ? 12 : 14).fill("ready"),
    ...Array(3).fill("blocked"),
    ...Array(roleKey === "boss" ? 0 : 3).fill("done"),
    ...Array(canReject ? 2 : 0).fill("rejected"),
  ]);
}

const TASK_STATUSES = taskStatusesForRole("sales");

function okResponse(data) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      jsonrpc: "2.0",
      id: "test",
      result: { code: 0, message: "ok", data },
    }),
  };
}

function createReadinessFetch(runtimeOptions = {}) {
  const calls = [];
  const factRefs =
    runtimeOptions.referenceRecords || factReferenceRecords();
  const backendFactLists = {
    list_production_orders: [
      "production_orders",
      factRefs.productionOrders.map((item) => ({
        id: item.id,
        order_no: item.orderNo,
        status: item.status,
      })),
    ],
    list_production_facts: [
      "production_facts",
      factRefs.productionFacts.map((item) => ({
        id: item.id,
        fact_no: item.factNo,
        status: item.status,
        fact_type: item.factType,
        source_type: item.sourceType,
        source_id: item.sourceID,
      })),
    ],
    list_purchase_receipts: [
      "purchase_receipts",
      factRefs.purchaseReceipts.map((item) => ({
        id: item.id,
        receipt_no: item.receiptNo,
        status: item.status,
      })),
    ],
    list_purchase_returns: [
      "purchase_returns",
      factRefs.purchaseReturns.map((item) => ({
        id: item.id,
        return_no: item.returnNo,
        status: item.status,
      })),
    ],
    list_purchase_receipt_adjustments: [
      "purchase_receipt_adjustments",
      factRefs.purchaseReceiptAdjustments.map((item) => ({
        id: item.id,
        adjustment_no: item.adjustmentNo,
        status: item.status,
        items: [{ adjust_type: item.adjustType }],
      })),
    ],
    list_quality_inspections: [
      "quality_inspections",
      factRefs.qualityInspections.map((item) => ({
        id: item.id,
        inspection_no: item.inspectionNo,
        status: item.status,
        source_type: item.sourceType,
        source_id: item.sourceID,
      })),
    ],
    list_inventory_lots: [
      "inventory_lots",
      factRefs.inventoryLots.map((item) => ({
        id: item.id,
        lot_no: item.lotNo,
        status: item.status,
        subject_type: item.subjectType,
        subject_id: item.subjectID,
        product_sku_id: item.productSkuID,
      })),
    ],
    list_inventory_balances: [
      "inventory_balances",
      factRefs.inventoryBalances.map((item) => ({
        id: item.id,
        subject_type: item.subjectType,
        subject_id: item.subjectID,
        product_sku_id: item.productSkuID,
        warehouse_id: item.warehouseID,
        lot_id: item.lotID,
        unit_id: item.unitID,
        quantity: item.quantity,
      })),
    ],
    list_inventory_txns: [
      "inventory_txns",
      factRefs.inventoryTxns.map((item) => ({
        id: item.id,
        txn_type: item.txnType,
        source_type: item.sourceType,
        source_id: item.sourceID,
      })),
    ],
    list_stock_reservations: [
      "stock_reservations",
      factRefs.stockReservations.map((item) => ({
        id: item.id,
        reservation_no: item.reservationNo,
        status: item.status,
        sales_order_id: item.sourceID,
      })),
    ],
    list_shipments: [
      "shipments",
      factRefs.shipments.map((item) => ({
        id: item.id,
        shipment_no: item.shipmentNo,
        status: item.status,
      })),
    ],
    list_finance_facts: [
      "finance_facts",
      factRefs.financeFacts.map((item) => ({
        id: item.id,
        fact_no: item.factNo,
        status: item.status,
        fact_type: item.factType,
        source_type: item.sourceType,
        source_id: item.sourceID,
      })),
    ],
  };
  const listSpecs = {
    list_customers: ["customers", 60, "is_active", [true, false], "code"],
    list_suppliers: ["suppliers", 60, "is_active", [true, false], "code"],
    list_product_skus: [
      "product_skus",
      60,
      "is_active",
      [true, false],
      "sku_code",
    ],
    list_materials: ["materials", 80, "is_active", [true, false], "code"],
    list_sales_orders: [
      "sales_orders",
      54,
      "lifecycle_status",
      ["DRAFT", "SUBMITTED", "ACTIVE", "CLOSED", "CANCELED"],
      "order_no",
    ],
    list_bom_versions: [
      "bom_versions",
      45,
      "status",
      ["DRAFT", "ACTIVE", "ARCHIVED"],
      "version",
    ],
    list_processes: ["processes", 30, "is_active", [true, false], "code"],
    list_purchase_orders: [
      "purchase_orders",
      45,
      "lifecycle_status",
      ["DRAFT", "SUBMITTED", "APPROVED", "CLOSED", "CANCELED"],
      "purchase_order_no",
    ],
    list_outsourcing_orders: [
      "outsourcing_orders",
      45,
      "lifecycle_status",
      ["DRAFT", "SUBMITTED", "CONFIRMED", "CLOSED", "CANCELED"],
      "outsourcing_order_no",
    ],
  };
  const fetchImpl = async (url, requestOptions) => {
    const body = JSON.parse(requestOptions.body);
    calls.push({
      url: String(url),
      method: body.method,
      params: body.params,
      redirect: requestOptions.redirect,
      authorization: requestOptions.headers.Authorization,
    });
    if (requestOptions.redirect !== "error") {
      throw new Error("readiness requests must reject redirects");
    }
    if (body.method === "admin_login") {
      return okResponse({ access_token: `token-${body.params.username}` });
    }
    if (body.method === "capabilities") {
      return okResponse({
        environment: runtimeOptions.runtimeEnvironment || "local",
        seedEnabled: false,
        seedAllowed: false,
        cleanupEnabled: false,
        cleanupAllowed: false,
        businessDataClearEnabled: false,
        businessDataClearAllowed: false,
      });
    }
    if (body.method === "get_effective_session") {
      return okResponse({
        session: {
          customer: { key: runtimeOptions.customerKey || "yoyoosun" },
          source:
            runtimeOptions.sessionSource || "active_customer_config_revision",
          config_revision:
            runtimeOptions.configRevision === undefined
              ? "cfg-local-1"
              : runtimeOptions.configRevision,
          modules: Object.fromEntries(
            [
              "production_orders",
              "production",
              "inventory",
              "shipments",
              "finance",
              "purchase_receipts",
              "quality_inspections",
            ].map((key) => [key, "enabled"]),
          ),
        },
      });
    }
    if (body.method === "list") {
      return okResponse({
        admins: [
          ...MANUAL_ACCEPTANCE_ACCOUNT_STATE_EXPECTATIONS.map(
            (item, index) => ({
              id: index + 1,
              username: item.username,
              account_status: item.accountStatus,
              roles: item.roleKeys.map((roleKey) => ({ role_key: roleKey })),
            }),
          ),
          {
            id: 10_000,
            username: "admin",
            account_status: "active",
            roles: [],
          },
        ],
      });
    }
    if (body.method === "rbac_options") {
      return okResponse({ roles: records(10, null, []) });
    }
    if (body.method === "audit_logs") {
      return okResponse({
        events: records(30, "source", ["AUTH", "BUSINESS"]),
        total: 30,
      });
    }
    if (body.method === "list_tasks") {
      const statuses =
        runtimeOptions.taskStatuses ||
        taskStatusesForRole(body.params.owner_role_key);
      const count = runtimeOptions.taskCount ?? statuses.length;
      return okResponse({
        tasks: records(count, "task_status_key", statuses).map(
          (item, index) => ({
            ...item,
            task_code: `${runtimeOptions.taskPrefix || `SIM-YOYOOSUN-UAT-TASK-20260715-V1-${TASK_COPY_REVISION}`}-${String(index + 1).padStart(2, "0")}`,
            owner_role_key:
              runtimeOptions.taskOwnerRoleKey || body.params.owner_role_key,
            source_type:
              runtimeOptions.taskSourceType || body.params.source_type,
            source_id: runtimeOptions.taskSourceID || body.params.source_id,
          }),
        ),
        total: runtimeOptions.taskResponseTotal ?? count,
      });
    }
    if (backendFactLists[body.method]) {
      const [listKey, allItems] = backendFactLists[body.method];
      const keyword = String(body.params.keyword || "");
      const filtered = allItems.filter((item) => {
        if (
          keyword &&
          !Object.values(item).some((value) => String(value ?? "") === keyword)
        ) {
          return false;
        }
        for (const key of [
          "subject_type",
          "subject_id",
          "product_sku_id",
          "warehouse_id",
          "lot_id",
          "source_type",
          "source_id",
          "fact_type",
        ]) {
          if (
            body.params[key] != null &&
            String(item[key] ?? "") !== String(body.params[key])
          ) {
            return false;
          }
        }
        return true;
      });
      return okResponse({ [listKey]: filtered, total: filtered.length });
    }
    const spec = listSpecs[body.method];
    assert(spec, `unexpected read method ${body.method}`);
    const [
      listKey,
      count,
      field,
      values,
      identityField,
      secondaryField,
      secondaryValues,
    ] = spec;
    assert(body.params.keyword, `${body.method} must be batch filtered`);
    const items = records(
      count,
      field,
      values,
      identityField,
      body.params.keyword,
    ).map((item, index) => ({
      ...item,
      ...(secondaryField
        ? {
            [secondaryField]: secondaryValues[index % secondaryValues.length],
          }
        : {}),
    }));
    return okResponse({
      [listKey]: items,
      total: count,
    });
  };
  return { fetchImpl, calls };
}

test("all 48 formal targets are owned by shared generator stages", () => {
  const contract = buildManualAcceptancePageDataContract();
  const plan = buildManualAcceptanceReadinessPlan();
  const ownershipByID = new Map(
    contract.targets.map((target) => [
      target.id,
      {
        probeIds: target.probeIds,
        generatorStageKeys: target.generatorStageKeys,
      },
    ]),
  );

  assert.equal(contract.targets.length, 48);
  assert.deepEqual(
    Object.keys(contract.generatorStages).sort(),
    [...MANUAL_ACCEPTANCE_GENERATOR_STAGE_KEYS].sort(),
  );
  assert(
    contract.targets.every(
      (target) =>
        target.probeIds.length > 0 && target.generatorStageKeys.length === 1,
    ),
  );
  assert(
    contract.targets.every((target) =>
      Object.keys(target).every(
        (key) => !/(?:builder|command|entrypoint|scriptPath)/iu.test(key),
      ),
    ),
  );
  assert.deepEqual(
    plan.targets.map((target) => [
      target.id,
      {
        probeIds: target.probeIds,
        generatorStageKeys: target.generatorStageKeys,
      },
    ]),
    [...ownershipByID.entries()],
  );
  assert.deepEqual(
    plan.targets.find((target) => target.id === "entries:admin-login")
      .generatorStageKeys,
    ["role"],
  );
  assert.deepEqual(
    plan.targets.find((target) => target.id === "desktopPages:customers")
      .generatorStageKeys,
    ["source"],
  );
  assert.deepEqual(
    plan.targets.find((target) => target.id === "desktopPages:global-dashboard")
      .generatorStageKeys,
    ["task"],
  );
  assert.deepEqual(
    plan.targets.find((target) => target.id === "desktopPages:inventory")
      .generatorStageKeys,
    ["facts"],
  );
  assert.deepEqual(
    plan.targets.find((target) => target.id === "desktopPages:print-center")
      .generatorStageKeys,
    ["catalog"],
  );
});

test("page data ownership fails closed for missing pages, unknown probes, and page builders", () => {
  const contract = buildManualAcceptancePageDataContract();
  const missingPage = structuredClone(contract);
  missingPage.targets.pop();
  assert.throws(
    () => assertManualAcceptancePageDataContract(missingPage),
    /必须恰好覆盖 48 个正式目标/u,
  );

  const unknownProbe = structuredClone(contract);
  unknownProbe.targets[0].probeIds = ["page-local-mock-data"];
  assert.throws(
    () => assertManualAcceptancePageDataContract(unknownProbe),
    /没有共享生成阶段/u,
  );

  const pageBuilder = structuredClone(contract);
  pageBuilder.targets[0].entrypoint = "web/src/pages/admin-login/mock.mjs";
  assert.throws(
    () => assertManualAcceptancePageDataContract(pageBuilder),
    /不得声明自有数据生成入口/u,
  );

  const stageFork = structuredClone(contract);
  stageFork.generatorStages.source.entrypoints = [
    "web/src/pages/customers/mock.mjs",
  ];
  assert.throws(
    () => assertManualAcceptancePageDataContract(stageFork),
    /偏离了唯一登记入口/u,
  );
});

test("default plan covers all 48 targets and never connects to a backend", async () => {
  let fetchCalls = 0;
  const result = await runManualAcceptanceReadinessCli([], {
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("unexpected backend call");
    },
  });

  assert.equal(result.exitCode, 0);
  assert.equal(fetchCalls, 0);
  assert.equal(result.plan.callsBackend, false);
  assert.equal(result.plan.writesBackend, false);
  assert.equal(result.plan.directSQL, false);
  assert.equal(result.plan.targets.length, 48);
  assert.equal(
    result.plan.targets.filter(
      (item) => item.catalogGroup === "mobileRolePages",
    ).length,
    9,
  );
  assert(
    result.plan.targets
      .filter((item) => item.catalogGroup === "mobileRolePages")
      .every((item) => item.expectedMinimum === 20),
  );
  assert.deepEqual(
    result.plan.targets.find(
      (item) => item.id === "desktopPages:production-scheduling",
    ).probeIds,
    ["mobile-tasks:pmc"],
  );
  assert.deepEqual(
    result.plan.targets.find(
      (item) => item.id === "desktopPages:production-exceptions",
    ).probeIds,
    ["mobile-tasks:production"],
  );
  const productionOrders = result.plan.targets.find(
    (item) => item.id === "desktopPages:production-orders",
  );
  assert.deepEqual(productionOrders.roleKeys, ["production"]);
  assert.equal(productionOrders.expectedMinimum, 45);
  assert.deepEqual(productionOrders.probeIds, ["production-orders"]);
  assert.equal(productionOrders.quantityNotProven, undefined);
  assert.equal(result.plan.expected.targets, 48);
  assert.equal(result.plan.expected.mobileTaskTotal, 180);
  const probesByID = new Map(
    result.plan.probes.map((probe) => [probe.id, probe]),
  );
  assert.equal(probesByID.get("purchase-returns").includeCustomerKey, false);
  assert.equal(
    probesByID.get("purchase-receipt-adjustments").includeCustomerKey,
    false,
  );
});

test("apply reports may raise expectations but cannot lower current catalog thresholds", () => {
  const plan = buildManualAcceptanceReadinessPlan({
    sourceReport: sourceReport({ scale: { customers: 75, salesOrders: 20 } }),
    factReport: factReport({
      referenceCounts: { shipments: 55, "finance:PAYABLE": 12 },
    }),
    taskReport: taskReport(),
  });
  const byId = new Map(plan.probes.map((probe) => [probe.id, probe]));

  assert.equal(byId.get("customers").expectedMinimum, 75);
  assert.equal(byId.get("sales-orders").expectedMinimum, 45);
  assert.equal(byId.get("shipments").expectedMinimum, 55);
  assert.equal(byId.get("finance-payables").expectedMinimum, 45);
  assert.equal(
    byId.get("customers").params.keyword,
    "SIM-YOYOOSUN-UAT-20260715-V1",
  );
  assert.equal(byId.get("shipments").params.keyword, undefined);
  assert.equal(byId.get("shipments").batchEvidence, "exact_references");
  assert.equal(byId.get("shipments").referenceQueries.length, 55);
  assert.equal(byId.get("purchase-receipts").batchEvidence, "exact_references");
  assert.equal(byId.get("quality-inspections").batchEvidence, "exact_references");
  assert.equal(byId.get("inventory-balances").batchEvidence, "exact_references");
  assert.equal(byId.get("inventory-lots").batchEvidence, "exact_references");
  assert.equal(byId.get("inventory-txns").batchEvidence, "exact_references");
  assert.equal(byId.get("production-orders").batchEvidence, "exact_references");
  assert(
    plan.probes
      .filter((probe) => probe.batchEvidence === "prefix_filtered")
      .every(
        (probe) =>
          probe.params.keyword === probe.batchPrefix &&
          Boolean(probe.batchMatchField),
      ),
  );
  assert.deepEqual(
    new Set(plan.inputWarnings.map((item) => item.datasetId)),
    new Set(["sales-orders", "finance-payables"]),
  );
  assert.throws(
    () =>
      buildManualAcceptanceReadinessPlan({
        sourceReport: { mode: "verify", simulatedOnly: true },
      }),
    /不是有效的模拟试用写入报告/u,
  );
  assert.throws(
    () =>
      buildManualAcceptanceReadinessPlan({
        sourceReport: sourceReport(),
        factReport: { ...factReport(), runId: "STALE-SOURCE" },
        taskReport: taskReport(),
      }),
    /不是同一批次/u,
  );
  assert.throws(
    () =>
      buildManualAcceptanceReadinessPlan({
        sourceReport: sourceReport(),
        taskReport: taskReport({ runId: "STALE-TASK" }),
      }),
    /不是同一批次/u,
  );
  assert.throws(
    () =>
      buildManualAcceptanceReadinessPlan({
        factReport: factReport(),
        taskReport: taskReport({ runId: "STALE-TASK" }),
      }),
    /不是同一批次/u,
  );
  assert.throws(
    () =>
      buildManualAcceptanceReadinessPlan({
        taskReport: taskReport({
          summary: {
            ...taskReport().summary,
            byRole: { ...taskReport().summary.byRole, sales: 19 },
          },
        }),
      }),
    /岗位任务报告不是有效/u,
  );
  assert.throws(
    () =>
      buildManualAcceptanceReadinessPlan({
        taskReport: taskReport({ sourceType: "another-task-source" }),
      }),
    /岗位任务报告不是有效/u,
  );
});

test("dataset evaluation requires the named state set and only counts this batch prefix", () => {
  const probe = {
    id: "sales-orders",
    listKey: "sales_orders",
    statusField: "lifecycle_status",
    expectedMinimum: 45,
    requiredStatuses: ["DRAFT", "SUBMITTED", "ACTIVE"],
    batchEvidence: "prefix_filtered",
    batchPrefix: "SIM-BATCH",
    batchMatchField: "order_no",
  };
  const insufficientStates = evaluateManualAcceptanceDataset(probe, {
    sales_orders: records(
      45,
      "lifecycle_status",
      ["DRAFT", "SUBMITTED", "CLOSED"],
      "order_no",
      "SIM-BATCH",
    ),
    total: 145,
  });
  const enough = evaluateManualAcceptanceDataset(probe, {
    sales_orders: [
      ...records(
        45,
        "lifecycle_status",
        ["DRAFT", "SUBMITTED", "ACTIVE"],
        "order_no",
        "SIM-BATCH",
      ),
      ...records(
        20,
        "lifecycle_status",
        ["DRAFT", "SUBMITTED", "ACTIVE"],
        "order_no",
        "OLD-BATCH",
      ),
    ],
    total: 145,
  });

  assert.equal(insufficientStates.status, "fail");
  assert.equal(insufficientStates.enoughRecords, true);
  assert.equal(insufficientStates.enoughStatuses, false);
  assert.deepEqual(insufficientStates.missingStatuses, ["ACTIVE"]);
  assert.equal(enough.status, "pass");
  assert.equal(enough.statusKinds, 3);
  assert.equal(enough.actual, 45);
  assert.equal(enough.responseTotal, 145);

  const wrongSecondaryKinds = evaluateManualAcceptanceDataset(
    {
      id: "production-facts",
      listKey: "production_facts",
      statusField: "status",
      requiredStatuses: ["DRAFT", "POSTED", "CANCELLED"],
      secondaryField: "fact_type",
      requiredSecondaryKinds: [
        "MATERIAL_ISSUE",
        "FINISHED_GOODS_RECEIPT",
        "REWORK",
      ],
      expectedMinimum: 45,
      batchEvidence: "prefix_filtered",
      batchPrefix: "SIM-FACT",
      batchMatchField: "fact_no",
    },
    {
      production_facts: records(
        45,
        "status",
        ["DRAFT", "POSTED", "CANCELLED"],
        "fact_no",
        "SIM-FACT",
      ).map((item, index) => ({
        ...item,
        fact_type: ["MATERIAL_ISSUE", "FINISHED_GOODS_RECEIPT", "OTHER"][
          index % 3
        ],
      })),
      total: 45,
    },
  );
  assert.equal(wrongSecondaryKinds.status, "fail");
  assert.deepEqual(wrongSecondaryKinds.missingSecondaryKinds, ["REWORK"]);
});

test("account status projection maps suspended to the user-facing disabled evidence", () => {
  const result = evaluateManualAcceptanceDataset(
    {
      id: "permission-accounts",
      listKey: "admins",
      statusField: "account_status",
      expectedMinimum: 3,
      requiredStatuses: ["ACTIVE", "DISABLED"],
    },
    {
      admins: [
        { id: 1, account_status: "active" },
        { id: 2, account_status: "suspended" },
        { id: 3, account_status: "revoked" },
      ],
    },
  );
  assert.equal(result.status, "pass");
  assert.deepEqual(result.statusCounts, {
    ACTIVE: 1,
    DISABLED: 1,
    REVOKED: 1,
  });
});

test("permission account evidence requires the exact thirteen acceptance account states", () => {
  const probe = buildManualAcceptanceReadinessPlan().probes.find(
    (item) => item.id === "permission-accounts",
  );
  const admins = MANUAL_ACCEPTANCE_ACCOUNT_STATE_EXPECTATIONS.map(
    (item, index) => ({
      id: index + 1,
      username: item.username,
      account_status: item.accountStatus,
      roles: item.roleKeys.map((roleKey) => ({ role_key: roleKey })),
    }),
  );
  assert.equal(
    evaluateManualAcceptanceDataset(probe, { admins }).status,
    "pass",
  );

  const revokedExpected = structuredClone(admins);
  revokedExpected.find(
    (item) => item.username === "demo_uat_disabled",
  ).account_status = "revoked";
  const revokedResult = evaluateManualAcceptanceDataset(probe, {
    admins: revokedExpected,
  });
  assert.equal(revokedResult.status, "fail");
  assert.equal(revokedResult.accountStateMismatches.length, 1);

  const unknownUnrelated = [
    ...admins,
    {
      id: 99,
      username: "historical_bad_state",
      account_status: "unknown",
      roles: [],
    },
  ];
  const unknownResult = evaluateManualAcceptanceDataset(probe, {
    admins: unknownUnrelated,
  });
  assert.equal(unknownResult.status, "fail");
  assert.equal(unknownResult.statusCounts.INVALID, 1);

  const unrelatedRevoked = [
    ...admins,
    {
      id: 100,
      username: "historical_revoked",
      account_status: "revoked",
      roles: [],
    },
  ];
  const unrelatedResult = evaluateManualAcceptanceDataset(probe, {
    admins: unrelatedRevoked,
  });
  assert.equal(unrelatedResult.status, "pass");
  assert.equal(unrelatedResult.statusCounts.REVOKED, 1);
});

test("fact dataset evaluation proves only exact report references", () => {
  const expectedReferences = [
    {
      key: "101:SIM-SDF-SHIP-001",
      id: 101,
      businessField: "shipment_no",
      businessNo: "SIM-SDF-SHIP-001",
      expectedFields: { status: "SHIPPED" },
    },
    {
      key: "102:SIM-SDF-SHIP-002",
      id: 102,
      businessField: "shipment_no",
      businessNo: "SIM-SDF-SHIP-002",
      expectedFields: { status: "CANCELLED" },
    },
  ];
  const probe = {
    id: "shipments",
    listKey: "shipments",
    statusField: "status",
    requiredStatuses: ["SHIPPED", "CANCELLED"],
    expectedMinimum: 2,
    batchEvidence: "exact_references",
    expectedReferences,
  };
  const pass = evaluateManualAcceptanceDataset(probe, {
    shipments: [
      { id: 101, shipment_no: "SIM-SDF-SHIP-001", status: "SHIPPED" },
      { id: 102, shipment_no: "SIM-SDF-SHIP-002", status: "CANCELLED" },
      { id: 999, shipment_no: "OLD-SHIPMENT", status: "SHIPPED" },
    ],
    total: 300,
  });
  assert.equal(pass.status, "pass");
  assert.equal(pass.actual, 2);
  assert.deepEqual(pass.missingReferences, []);
  assert.deepEqual(pass.referenceMismatches, []);

  const stale = evaluateManualAcceptanceDataset(probe, {
    shipments: [
      { id: 101, shipment_no: "SIM-SDF-SHIP-001", status: "DRAFT" },
      { id: 102, shipment_no: "OTHER-NUMBER", status: "CANCELLED" },
    ],
    total: 300,
  });
  assert.equal(stale.status, "fail");
  assert.deepEqual(stale.missingReferences, ["102:SIM-SDF-SHIP-002"]);
  assert.deepEqual(stale.referenceMismatches, [
    {
      key: "101:SIM-SDF-SHIP-001",
      fields: { status: { expected: "SHIPPED", actual: "DRAFT" } },
    },
  ]);
});

test("task evidence requires exact source, role, prefix, count, and canonical status distribution", () => {
  const probe = {
    id: "mobile-tasks:sales",
    listKey: "tasks",
    statusField: "task_status_key",
    requiredStatuses: ["READY", "BLOCKED", "DONE"],
    requiredStatusCounts: {
      READY: 14,
      BLOCKED: 3,
      DONE: 3,
    },
    expectedMinimum: 20,
    expectedExact: 20,
    batchEvidence: "exact_source",
    exactSourceType: "simulated-manual-acceptance-task-batch",
    exactSourceID: 123456,
    exactTaskPrefix: "SIM-YOYOOSUN-UAT-TASK-LOCAL-UAT",
    exactOwnerRoleKey: "sales",
  };
  const batchTasks = TASK_STATUSES.map((status, index) => ({
    id: index + 1,
    task_code: `SIM-YOYOOSUN-UAT-TASK-LOCAL-UAT-SALES-${String(index + 1).padStart(2, "0")}`,
    source_type: "simulated-manual-acceptance-task-batch",
    source_id: 123456,
    owner_role_key: "sales",
    task_status_key: status,
  }));
  const ignoredOldTasks = [
    {
      ...batchTasks[0],
      id: 100,
      task_code: "SIM-YOYOOSUN-UAT-TASK-OLD-SALES-01",
    },
    {
      ...batchTasks[1],
      id: 101,
      owner_role_key: "purchase",
    },
    {
      ...batchTasks[2],
      id: 102,
      source_id: 999999,
    },
  ];
  const pass = evaluateManualAcceptanceDataset(probe, {
    tasks: [...batchTasks, ...ignoredOldTasks],
    total: 203,
  });
  assert.equal(pass.status, "pass");
  assert.equal(pass.actual, 20);
  assert.equal(pass.responseTotal, 203);
  assert.deepEqual(pass.mismatchedStatusCounts, {});

  const wrongDistribution = batchTasks.map((item, index) => ({
    ...item,
    task_status_key: index === 14 ? "ready" : item.task_status_key,
  }));
  const distributionFailure = evaluateManualAcceptanceDataset(probe, {
    tasks: wrongDistribution,
    total: 20,
  });
  assert.equal(distributionFailure.status, "fail");
  assert.deepEqual(distributionFailure.missingStatuses, []);
  assert.deepEqual(distributionFailure.mismatchedStatusCounts, {
    READY: { expected: 14, actual: 15 },
    BLOCKED: { expected: 3, actual: 2 },
  });

  const countFailure = evaluateManualAcceptanceDataset(probe, {
    tasks: [...batchTasks, { ...batchTasks[0], id: 200 }],
    total: 21,
  });
  assert.equal(countFailure.status, "fail");
  assert.equal(countFailure.actual, 21);
  assert.equal(countFailure.enoughRecords, false);
});

test("explicit verification reports page data, nine role totals, and honest manual gaps", async () => {
  const plan = buildManualAcceptanceReadinessPlan({
    sourceReport: sourceReport(),
    factReport: factReport(),
    taskReport: taskReport(),
  });
  const { fetchImpl, calls } = createReadinessFetch();
  const report = await verifyManualAcceptanceReadiness(plan, {
    backendURL: "http://127.0.0.1:8300",
    password: "local-demo-password",
    adminPassword: "local-admin-password",
    fetchImpl,
    now: () => new Date("2026-07-11T10:00:00.000Z"),
  });

  assert.equal(report.summary.totalTargets, 48);
  assert.equal(
    report.summary.passedTargetData,
    38,
    JSON.stringify(
      report.targets
        .filter((item) => item.dataStatus !== "pass")
        .map((item) => ({ id: item.id, status: item.dataStatus, supporting: item.supporting })),
    ),
  );
  assert.equal(report.summary.failedTargetData, 0);
  assert.equal(report.summary.notProvenTargetData, 10);
  assert.equal(report.summary.queryChecksPassed, true);
  assert.equal(report.summary.queryEvidenceComplete, false);
  assert.equal(report.summary.browserChecksCompleted, 0);
  assert.equal(report.summary.manualAcceptanceCompleted, false);
  assert.equal(report.summary.mobileRolePages, 9);
  assert.equal(report.summary.mobileTaskTotalActual, 180);
  assert.deepEqual(
    new Set(Object.values(report.summary.mobileActualByRole)),
    new Set([20]),
  );
  assert.equal(report.targets.length, 48);
  assert.equal(report.runtimePreflight.environment, "local");
  assert.equal(report.runtimePreflight.customerKey, "yoyoosun");
  assert.equal(report.runtimePreflight.configRevision, "cfg-local-1");
  assert.equal(
    report.targets.find((item) => item.id === "entries:admin-login").actual,
    14,
  );
  assert.equal(
    report.targets.find((item) => item.id === "desktopPages:reconciliation")
      .supporting[0].statusCounts.POSTED > 0,
    true,
  );
  const productionProbe = report.probes.find(
    (item) => item.id === "production-facts",
  );
  assert.equal(productionProbe.secondaryKinds, 3);
  assert.equal(productionProbe.enoughSecondaryKinds, true);
  assert.deepEqual(productionProbe.missingSecondaryKinds, []);
  const mobileProbes = report.probes.filter((item) =>
    item.id.startsWith("mobile-tasks:"),
  );
  assert.equal(mobileProbes.length, 9);
  assert(
    mobileProbes.every(
      (item) =>
        item.status === "pass" &&
        item.actual === 20 &&
        item.statusKinds ===
          (item.id === "mobile-tasks:boss" ||
          [
            "mobile-tasks:sales",
            "mobile-tasks:purchase",
            "mobile-tasks:production",
            "mobile-tasks:pmc",
            "mobile-tasks:engineering",
          ].includes(item.id)
            ? 3
            : 4) &&
        Object.keys(item.mismatchedStatusCounts).length === 0,
    ),
  );
  assert.equal(
    report.targets.find((item) => item.id === "desktopPages:global-dashboard")
      .actual,
    180,
  );
  assert.equal(
    report.targets.find((item) => item.id === "desktopPages:inventory")
      .dataStatus,
    "pass",
  );
  assert.equal(
    report.targets.find(
      (item) => item.id === "desktopPages:quality-inspections",
    ).dataStatus,
    "pass",
  );
  assert.equal(
    report.targets.find(
      (item) => item.id === "desktopPages:production-orders",
    ).dataStatus,
    "pass",
  );
  assert(
    report.targets
      .filter((item) => item.catalogGroup === "printWorkspacePages")
      .every((item) => item.dataStatus === "not_proven"),
  );
  assert.equal(report.readyForManualAcceptance, false);
  assert.deepEqual(report, JSON.parse(JSON.stringify(report)));
  assert(!JSON.stringify(report).includes("local-demo-password"));
  assert(!JSON.stringify(report).includes("local-admin-password"));
  assert.deepEqual(
    calls.slice(0, 4).map((item) => item.method),
    ["admin_login", "capabilities", "get_effective_session", "admin_login"],
  );
  assert.equal(calls[0].params.username, "admin");
  assert.equal(calls[0].params.password, "local-admin-password");
  assert(
    calls.some(
      (item) =>
        item.method === "admin_login" &&
        item.params.username === "demo_admin" &&
        item.params.password === "local-demo-password",
    ),
  );
  assert(calls.every((item) => item.redirect === "error"));
  assert(calls.some((item) => item.method === "list_quality_inspections"));
  assert(calls.some((item) => item.method === "list_inventory_balances"));
  assert(calls.some((item) => item.method === "list_inventory_txns"));
  assert(calls.some((item) => item.method === "list_production_orders"));
  assert(
    calls
      .filter((item) => item.method === "list_production_orders")
      .every((item) => !("customer_key" in item.params)),
  );
  assert(
    calls
      .filter((item) => item.method === "list_stock_reservations")
      .every((item) => item.params.customer_key === "yoyoosun"),
  );
  assert(
    calls
      .filter((item) =>
        [
          "list_quality_inspections",
          "list_inventory_balances",
          "list_inventory_txns",
          "list_production_orders",
          "list_production_facts",
          "list_stock_reservations",
          "list_shipments",
          "list_finance_facts",
        ].includes(item.method),
      )
      .every(
        (item) =>
          !String(item.params.keyword || "").startsWith(
            "SIM-YOYOOSUN-OPFACT-",
          ) &&
          !String(item.params.keyword || "").startsWith("SIM-YOYOOSUN-PQ-"),
      ),
  );
  assert(
    calls
      .filter((item) => item.method === "list_tasks")
      .every(
        (item) =>
          item.params.source_type ===
            "simulated-manual-acceptance-task-batch" &&
          item.params.source_id === 123456 &&
          Boolean(item.params.owner_role_key),
      ),
  );
  assert(
    calls.every(({ method }) =>
      /^(?:admin_login|capabilities|get_effective_session|list|list_|rbac_options|audit_logs)/u.test(
        method,
      ),
    ),
  );
});

test("CLI requires an explicit backend for verification and stays read-only", async () => {
  assert.deepEqual(parseManualAcceptanceReadinessArgs([]), {
    verify: false,
    backendURL: "",
    sourceReport: "",
    factReport: "",
    taskReport: "",
    out: "",
    format: "json",
    help: false,
  });
  assert.throws(
    () => parseManualAcceptanceReadinessArgs(["--verify"]),
    /必须同时提供 --backend-url/u,
  );
  const parsed = parseManualAcceptanceReadinessArgs([
    "--verify",
    "--backend-url",
    "http://127.0.0.1:8300",
    "--task-report",
    "output/task-report.json",
    "--format",
    "markdown",
  ]);
  assert.equal(parsed.verify, true);
  assert.equal(parsed.taskReport, "output/task-report.json");
  assert.equal(parsed.format, "markdown");
  const help = await runManualAcceptanceReadinessCli(["--help"]);
  assert.match(help.text, /MANUAL_ACCEPTANCE_ADMIN_PASSWORD/u);
  assert.match(help.text, /超级管理员 admin/u);
  assert.match(help.text, /demo_admin 仍按试用账号权限核对/u);
});

test("CLI verification uses strict non-green exit codes for not-proven and wrong-batch evidence", async () => {
  const normalRuntime = createReadinessFetch();
  const normal = await runManualAcceptanceReadinessCli(
    ["--verify", "--backend-url", "http://127.0.0.1:8300"],
    {
      sourceReport: sourceReport(),
      factReport: factReport(),
      taskReport: taskReport(),
      password: "local-demo-password",
      adminPassword: "local-admin-password",
      fetchImpl: normalRuntime.fetchImpl,
    },
  );
  assert.equal(normal.report.summary.failedTargetData, 0);
  assert(normal.report.summary.notProvenTargetData > 0);
  assert.equal(normal.report.summary.queryEvidenceComplete, false);
  assert.equal(normal.exitCode, 1);

  const wrongBatchRuntime = createReadinessFetch({ taskSourceID: 999999 });
  const wrongBatch = await runManualAcceptanceReadinessCli(
    ["--verify", "--backend-url", "http://127.0.0.1:8300"],
    {
      sourceReport: sourceReport(),
      factReport: factReport(),
      taskReport: taskReport(),
      password: "local-demo-password",
      adminPassword: "local-admin-password",
      fetchImpl: wrongBatchRuntime.fetchImpl,
    },
  );
  assert(wrongBatch.report.summary.failedTargetData > 0);
  assert.equal(wrongBatch.exitCode, 1);

  const noTaskRuntime = createReadinessFetch();
  const noTask = await runManualAcceptanceReadinessCli(
    ["--verify", "--backend-url", "http://127.0.0.1:8300"],
    {
      sourceReport: sourceReport(),
      factReport: factReport(),
      password: "local-demo-password",
      adminPassword: "local-admin-password",
      fetchImpl: noTaskRuntime.fetchImpl,
    },
  );
  assert.equal(noTask.exitCode, 1);
  assert.equal(noTask.report.summary.mobileTaskTotalActual, null);
  assert(!noTaskRuntime.calls.some((item) => item.method === "list_tasks"));
});

test("CLI and exported verification reject external backends before the first fetch", async () => {
  const plan = buildManualAcceptanceReadinessPlan({
    sourceReport: sourceReport(),
    factReport: factReport(),
    taskReport: taskReport(),
  });
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    throw new Error("external backend must not be called");
  };

  await assert.rejects(
    () =>
      verifyManualAcceptanceReadiness(plan, {
        backendURL: "https://example.com",
        password: "local-demo-password",
        adminPassword: "local-admin-password",
        fetchImpl,
      }),
    /registered SSH tunnel|完全一致/u,
  );
  await assert.rejects(
    () =>
      runManualAcceptanceReadinessCli(
        ["--verify", "--backend-url", "http://127.0.0.1.example.com:8300"],
        {
          sourceReport: sourceReport(),
          factReport: factReport(),
          taskReport: taskReport(),
          password: "local-demo-password",
          adminPassword: "local-admin-password",
          fetchImpl,
        },
      ),
    /registered SSH tunnel|完全一致/u,
  );
  assert.equal(fetchCalls, 0);
});

test("registered customer-trial-133 verification requires explicit confirmation and attestation", async () => {
  const backendURL = "http://127.0.0.1:18375";
  const target = "customer-trial-133";
  const remoteRuntime = {
    environment: "remote",
    customerKey: "yoyoosun",
    configRevision: "cfg-trial-133-v1",
    source: "active_customer_config_revision",
    targetAttestation: {
      source: "out-of-band",
      release: "929ec0b3a563bec0796274d033a97277519bcb51",
      migration: "20260715120000",
    },
  };
  const plan = buildManualAcceptanceReadinessPlan({
    sourceReport: sourceReport({ target, backendURL, runtime: remoteRuntime }),
    factReport: factReport({ target, backendURL, runtime: remoteRuntime }),
    taskReport: taskReport({ target, backendURL }),
  });
  const targetConfirmation =
    "APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA:customer-trial-133:2026.07.15-v1:20260715-V1";
  const targetAttestation = {
    target,
    origin: backendURL,
    customerKey: "yoyoosun",
    environment: "prod",
    release: "929ec0b3a563bec0796274d033a97277519bcb51",
    migration: "20260715120000",
    debug: {
      seedEnabled: false,
      seedAllowed: false,
      cleanupEnabled: false,
      cleanupAllowed: false,
      businessDataClearEnabled: false,
      businessDataClearAllowed: false,
    },
  };
  let fetchCalls = 0;
  await assert.rejects(
    () =>
      verifyManualAcceptanceReadiness(plan, {
        backendURL,
        password: "trial-demo-password",
        fetchImpl: async () => {
          fetchCalls += 1;
          throw new Error("missing target confirmation must fail before fetch");
        },
      }),
    /MANUAL_ACCEPTANCE_TARGET_CONFIRM/u,
  );
  assert.equal(fetchCalls, 0);

  await assert.rejects(
    () =>
      verifyManualAcceptanceReadiness(plan, {
        backendURL,
        password: "trial-demo-password",
        targetConfirmation,
        fetchImpl: async () => {
          fetchCalls += 1;
          throw new Error("missing attestation must fail before fetch");
        },
      }),
    /attestation is required/u,
  );
  assert.equal(fetchCalls, 0);

  const remote = createReadinessFetch({
    runtimeEnvironment: "remote",
    configRevision: "cfg-trial-133-v1",
  });
  const report = await verifyManualAcceptanceReadiness(plan, {
    backendURL,
    password: "trial-demo-password",
    targetConfirmation,
    targetAttestation,
    fetchImpl: remote.fetchImpl,
  });
  assert.equal(report.runtimePreflight.target, target);
  assert.equal(report.runtimePreflight.environment, "remote");
  assert.equal(report.runtimePreflight.configRevision, "cfg-trial-133-v1");
  assert.equal(
    remote.calls.some((item) => item.method === "capabilities"),
    false,
  );
  assert.equal(
    remote.calls.some(
      (item) => item.method === "admin_login" && item.params.username === "admin",
    ),
    false,
  );
});

test("verification requires the local super-admin credential before any fetch", async () => {
  const plan = buildManualAcceptanceReadinessPlan({
    sourceReport: sourceReport(),
    factReport: factReport(),
    taskReport: taskReport(),
  });
  const previous = process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD;
  delete process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD;
  let fetchCalls = 0;
  try {
    await assert.rejects(
      () =>
        verifyManualAcceptanceReadiness(plan, {
          backendURL: "http://127.0.0.1:8300",
          password: "local-demo-password",
          fetchImpl: async () => {
            fetchCalls += 1;
            throw new Error("missing admin credential must fail before fetch");
          },
        }),
      /MANUAL_ACCEPTANCE_ADMIN_PASSWORD/u,
    );
  } finally {
    if (previous === undefined) {
      delete process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD;
    } else {
      process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD = previous;
    }
  }
  assert.equal(fetchCalls, 0);
});

test("runtime preflight rejects unsafe environment or missing active revision before other account logins", async () => {
  const plan = buildManualAcceptanceReadinessPlan({
    sourceReport: sourceReport(),
    factReport: factReport(),
    taskReport: taskReport(),
  });
  const production = createReadinessFetch({ runtimeEnvironment: "production" });
  await assert.rejects(
    () =>
      verifyManualAcceptanceReadiness(plan, {
        backendURL: "http://127.0.0.1:8300",
        password: "local-demo-password",
        adminPassword: "local-admin-password",
        fetchImpl: production.fetchImpl,
      }),
    /environment=production/u,
  );
  assert.deepEqual(
    production.calls.map((item) => item.method),
    ["admin_login", "capabilities"],
  );

  const missingRevision = createReadinessFetch({ configRevision: "" });
  const localhostBackendURL = "http://localhost:8300";
  const localhostPlan = buildManualAcceptanceReadinessPlan({
    sourceReport: sourceReport({ backendURL: localhostBackendURL }),
    factReport: factReport({ backendURL: localhostBackendURL }),
    taskReport: taskReport({ backendURL: localhostBackendURL }),
  });
  await assert.rejects(
    () =>
      verifyManualAcceptanceReadiness(localhostPlan, {
        backendURL: localhostBackendURL,
        password: "local-demo-password",
        adminPassword: "local-admin-password",
        fetchImpl: missingRevision.fetchImpl,
      }),
    /active customer configuration|已激活配置版本/u,
  );
  assert.deepEqual(
    missingRevision.calls.map((item) => item.method),
    ["admin_login", "capabilities", "get_effective_session"],
  );
});

test("verification rejects a redirected response even with a custom fetch", async () => {
  const backendURL = "http://[::1]:8300";
  const plan = buildManualAcceptanceReadinessPlan({
    sourceReport: sourceReport({ backendURL }),
    factReport: factReport({ backendURL }),
    taskReport: taskReport({ backendURL }),
  });
  let fetchCalls = 0;
  await assert.rejects(
    () =>
      verifyManualAcceptanceReadiness(plan, {
        backendURL,
        password: "local-demo-password",
        adminPassword: "local-admin-password",
        fetchImpl: async () => {
          fetchCalls += 1;
          return {
            ...okResponse({ access_token: "token-admin" }),
            redirected: true,
          };
        },
      }),
    /拒绝重定向响应/u,
  );
  assert.equal(fetchCalls, 1);
});

test("customer-facing report uses ordinary business wording", async () => {
  const plan = buildManualAcceptanceReadinessPlan({
    sourceReport: sourceReport(),
    factReport: factReport(),
    taskReport: taskReport(),
  });
  const { fetchImpl } = createReadinessFetch();
  const report = await verifyManualAcceptanceReadiness(plan, {
    backendURL: "http://127.0.0.1:8300",
    password: "local-demo-password",
    adminPassword: "local-admin-password",
    fetchImpl,
  });
  const markdown = renderManualAcceptanceReadinessMarkdown(report);

  assert.match(markdown, /# 全页面手动验收就绪核验/u);
  assert.match(markdown, /九个岗位任务合计：180 \/ 180/u);
  assert.match(markdown, /尚未证明/u);
  assert.match(markdown, /人工验收：未完成/u);
  assert.match(markdown, /页面操作已完成：0 \/ 48/u);
  assert.doesNotMatch(
    markdown,
    /Workflow|Fact|JSON-RPC|RBAC|schema|raw\s*id|甲方/iu,
  );
});
