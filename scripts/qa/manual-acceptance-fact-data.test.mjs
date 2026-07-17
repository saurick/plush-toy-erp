import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MANUAL_ACCEPTANCE_FACT_REQUIRED_MODULES,
  MANUAL_ACCEPTANCE_FACT_CONFIRM_PHRASE,
  SOURCE_DRIVEN_FACT_REPORT_CONTRACT,
  assertManualAcceptanceAdminProfile,
  applyManualAcceptanceFinanceLifecycle,
  applyManualAcceptanceFactPlan,
  buildManualAcceptanceFactPlan,
  ensureReceiptQualities,
  manualAcceptanceFactRPCCall,
  manualAcceptanceFactRole,
  manualAcceptanceFactRPCParams,
  mergeManualAcceptanceFactReferences,
  readManualAcceptanceFinalInventoryReferences,
  parseManualAcceptanceFactArgs,
  readPurchaseReceiptQualities,
  reuseOrApplyManualAcceptanceFactPhase,
  sourceDrivenPhaseIdentitySpecs,
  validatePurchaseCorrectionRecord,
  validateProductionPhasePartialRecords,
  validateSalesPhaseRecords,
  validateSalesPhasePartialRecords,
  verifyReceiptQualities,
  verifyManualAcceptanceFactPlan,
} from "./manual-acceptance-fact-data.mjs";
import { MANUAL_ACCEPTANCE_CORE_WAREHOUSE_CODES } from "./manual-acceptance-source-data.mjs";
import { buildSourceDrivenFactPlan } from "./manual-acceptance-source-driven-facts.mjs";
import { evaluateManualAcceptanceOutsourcingInventoryCoverage } from "./manual-acceptance-fact-report-contract.mjs";
import {
  CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
  CURRENT_MANUAL_ACCEPTANCE_RUN_ID,
  CUSTOMER_TRIAL_133_DATABASE,
  manualAcceptanceTargetConfirmation,
} from "./manual-acceptance-target-policy.mjs";

const DATA_VERSION = CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION;
const RUN_ID = CURRENT_MANUAL_ACCEPTANCE_RUN_ID;
const DATASET_KEY = "yoyoosun-manual-acceptance";
const LOCAL_BACKEND_URL = "http://127.0.0.1:8310";
const LOCAL_DATABASE_NAME = "plush_erp_acceptance_20260716_v5_dev";

test("runtime admin guard consumes the formal top-level auth.me profile", () => {
  assert.deepEqual(
    assertManualAcceptanceAdminProfile({
      id: 1,
      username: "admin",
      is_super_admin: true,
      disabled: false,
    }),
    {
      id: 1,
      username: "admin",
      is_super_admin: true,
      disabled: false,
    },
  );
  for (const profile of [
    { username: "admin", is_super_admin: false, disabled: false },
    { username: "admin", is_super_admin: true, disabled: true },
    { admin: { username: "admin", is_super_admin: true, disabled: false } },
  ]) {
    assert.throws(
      () => assertManualAcceptanceAdminProfile(profile),
      /enabled local super admin/u,
    );
  }
});

test("RPC retries only bounded HTTP 429 responses and honors Retry-After", async () => {
  let calls = 0;
  const waits = [];
  const result = await manualAcceptanceFactRPCCall({
    backendURL: "http://127.0.0.1:8300",
    domain: "operational_fact",
    method: "list_production_facts",
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return {
          status: 429,
          ok: false,
          redirected: false,
          headers: { get: () => "0.1" },
        };
      }
      if (calls === 2) {
        return {
          status: 429,
          ok: false,
          redirected: false,
          headers: { get: () => null },
        };
      }
      return {
        status: 200,
        ok: true,
        redirected: false,
        headers: { get: () => null },
        json: async () => ({ result: { code: 0, data: { total: 0 } } }),
      };
    },
    sleep: async (milliseconds) => {
      waits.push(milliseconds);
    },
  });
  assert.deepEqual(result, { total: 0 });
  assert.equal(calls, 3);
  assert.deepEqual(waits, [100, 500]);
});

test("RPC does not retry non-throttle HTTP failures", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      manualAcceptanceFactRPCCall({
        backendURL: "http://127.0.0.1:8300",
        domain: "operational_fact",
        method: "list_production_facts",
        fetchImpl: async () => {
          calls += 1;
          return {
            status: 500,
            ok: false,
            redirected: false,
            headers: { get: () => null },
          };
        },
        sleep: async () => {
          throw new Error("non-throttle failures must not sleep");
        },
      }),
    /HTTP 500/u,
  );
  assert.equal(calls, 1);
});

function sourceReport({ remote = false } = {}) {
  const material = { id: 101, code: "MAT-101", name: "米白短毛绒" };
  const productionCandidate = {
    salesOrder: {
      id: 501,
      orderNo: "SO-501",
      status: "ACTIVE",
      customerId: 601,
      customerSnapshot: "东莞美悦礼品",
    },
    item: {
      id: 701,
      productId: 801,
      productSkuId: 901,
      unitId: 1001,
      orderedQuantity: "300",
    },
    bom: {
      id: 1101,
      version: "BOM-01",
      status: "ACTIVE",
      items: [
        {
          id: 1201,
          materialId: material.id,
          unitId: 1001,
          quantity: "1",
          lossRate: "0",
        },
      ],
    },
  };
  const outsourcingMaterialCandidate = {
    order: { id: 1301, orderNo: "OS-1301", status: "CONFIRMED" },
    item: {
      outsourcingOrderItemId: 1401,
      subjectType: "MATERIAL",
      subjectId: material.id,
      materialId: material.id,
      unitId: 1001,
      quantity: "300",
    },
  };
  const outsourcingProductCandidate = {
    order: { id: 1301, orderNo: "OS-1301", status: "CONFIRMED" },
    item: {
      outsourcingOrderItemId: 1402,
      subjectType: "PRODUCT",
      subjectId: productionCandidate.item.productId,
      productId: productionCandidate.item.productId,
      productSkuId: productionCandidate.item.productSkuId,
      unitId: 1001,
      quantity: "300",
    },
  };
  return {
    mode: "apply",
    simulatedOnly: true,
    realCustomerImport: false,
    datasetKey: DATASET_KEY,
    dataVersion: DATA_VERSION,
    runId: RUN_ID,
    target: remote ? "customer-trial-133" : "local-dev",
    backendURL: remote ? "http://127.0.0.1:18375" : LOCAL_BACKEND_URL,
    databaseName: remote ? CUSTOMER_TRIAL_133_DATABASE : LOCAL_DATABASE_NAME,
    semanticDigest: "digest-v2",
    prefix: "YS5",
    anchorDate: "2026-07-15",
    runtime: {
      target: remote ? "customer-trial-133" : "local-dev",
      environment: remote ? "prod" : "dev",
      customerKey: "yoyoosun",
      configRevision: "runtime-v2",
      ...(remote
        ? {
            targetAttestation: {
              source: "out-of-band",
              release: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              migration: "20260714165115",
            },
          }
        : {}),
    },
    referenceRecords: {
      materials: [material],
      suppliers: [{ id: 201, code: "SUP-201", name: "嘉顺布行" }],
      warehouses: [
        {
          id: 301,
          code: MANUAL_ACCEPTANCE_CORE_WAREHOUSE_CODES.material,
          name: "材料仓",
        },
        {
          id: 302,
          code: MANUAL_ACCEPTANCE_CORE_WAREHOUSE_CODES.product,
          name: "成品仓",
        },
      ],
      purchaseOrders: Array.from({ length: 9 }, (_, offset) => ({
        id: 400 + offset,
        orderNo: `PO-${offset + 1}`,
        status: "APPROVED",
        supplierId: 201,
        supplierName: "嘉顺布行",
        items: [
          {
            purchaseOrderItemId: 500 + offset,
            materialId: material.id,
            unitId: 1001,
            quantity: "100",
          },
        ],
      })),
      sourceDrivenFacts: {
        datasetKey: DATASET_KEY,
        dataVersion: DATA_VERSION,
        runId: RUN_ID,
        sourceCandidates: {
          productionCandidates: [productionCandidate],
          outsourcingCandidates: [
            outsourcingMaterialCandidate,
            outsourcingProductCandidate,
          ],
          salesCandidates: Array.from({ length: 25 }, (_, offset) => ({
            order: productionCandidate.salesOrder,
            item: {
              ...productionCandidate.item,
              id: productionCandidate.item.id + offset,
            },
          })),
          purchaseCandidates: [],
          warehouses: [
            {
              id: 301,
              code: MANUAL_ACCEPTANCE_CORE_WAREHOUSE_CODES.material,
              name: "材料仓",
            },
            {
              id: 302,
              code: MANUAL_ACCEPTANCE_CORE_WAREHOUSE_CODES.product,
              name: "成品仓",
            },
          ],
        },
        phaseReadiness: {
          production: {
            status: "blocked",
            reason: "awaiting posted material lot",
          },
          outsourcing: {
            status: "blocked",
            reason: "awaiting posted material lot",
          },
          sales: { status: "blocked", reason: "awaiting completion lot" },
          purchase: {
            status: "unsupported",
            reason: "awaiting posted receipt",
          },
        },
      },
    },
  };
}

function fakeRecords(count, start, fields = {}) {
  return Array.from({ length: count }, (_, offset) => ({
    id: start + offset,
    ...fields,
  }));
}

function purchaseStage() {
  const receiptStatuses = ["DRAFT", "POSTED", "CANCELLED"];
  const qualityStatuses = [
    "DRAFT",
    "SUBMITTED",
    "PASSED",
    "REJECTED",
    "CANCELLED",
  ];
  const correctionStatuses = ["DRAFT", "POSTED", "CANCELLED"];
  return {
    purchaseReceipts: fakeRecords(54, 1000).map((item, offset) => ({
      ...item,
      receipt_no: `PR-${offset}`,
      status: receiptStatuses[offset % receiptStatuses.length],
    })),
    purchaseReturns: fakeRecords(12, 2000).map((item, offset) => ({
      ...item,
      return_no: `RET-${offset}`,
      status: correctionStatuses[offset % correctionStatuses.length],
    })),
    purchaseReceiptAdjustments: fakeRecords(12, 3000).map((item, offset) => ({
      ...item,
      adjustment_no: `ADJ-${offset}`,
      status: correctionStatuses[offset % correctionStatuses.length],
      items: [
        {
          adjust_type:
            offset % 2 === 0 ? "QUANTITY_INCREASE" : "QUANTITY_DECREASE",
        },
      ],
    })),
    qualityInspections: fakeRecords(60, 4000).map((item, offset) => ({
      ...item,
      inspection_no: `QI-${offset}`,
      status: qualityStatuses[offset % qualityStatuses.length],
      source_type: "PURCHASE_RECEIPT",
      source_id: 1000 + (offset % 54),
    })),
    inventoryLots: fakeRecords(45, 5000).map((item, offset) => ({
      ...item,
      lot_no: `LOT-${offset}`,
      status: ["HOLD", "ACTIVE", "REJECTED"][offset % 3],
      subject_type: "MATERIAL",
      subject_id: 101,
    })),
    inventoryBalances: fakeRecords(45, 6000, {
      subject_type: "MATERIAL",
      subject_id: 101,
      warehouse_id: 301,
      unit_id: 1001,
      quantity: "500",
    }),
    inventoryTxns: fakeRecords(45, 7000).map((item, offset) => ({
      ...item,
      txn_type: ["IN", "OUT", "REVERSAL"][offset % 3],
      source_type: "PURCHASE_RECEIPT",
      source_id: 1000,
    })),
    materialStock: new Map([
      [
        "101:1001",
        { materialId: 101, unitId: 1001, warehouseId: 301, lotId: 5000 },
      ],
    ]),
  };
}

function factStage() {
  const productionOrderStatuses = ["DRAFT", "RELEASED", "CLOSED", "CANCELLED"];
  const productionStatuses = ["DRAFT", "POSTED", "CANCELLED"];
  const productionTypes = [
    "MATERIAL_ISSUE",
    "FINISHED_GOODS_RECEIPT",
    "REWORK",
  ];
  const shipmentStatuses = ["DRAFT", "SHIPPED", "CANCELLED"];
  const reservationStatuses = ["ACTIVE", "RELEASED"];
  const finance = [];
  let id = 20000;
  for (const type of ["PAYABLE", "RECEIVABLE", "RECONCILIATION"]) {
    for (let offset = 0; offset < 48; offset += 1) {
      finance.push({
        id: id++,
        fact_no: `${type}-${offset}`,
        fact_type: type,
        status: ["DRAFT", "POSTED", "SETTLED", "CANCELLED"][offset % 4],
        source_type: type === "RECONCILIATION" ? "FINANCE_FACT" : "SHIPMENT",
        source_id: 9000 + offset,
      });
    }
  }
  for (let offset = 0; offset < 48; offset += 1) {
    finance.push({
      id: id++,
      fact_no: `INVOICE-${offset}`,
      fact_type: "INVOICE",
      status: ["DRAFT", "POSTED", "CANCELLED"][offset % 3],
      source_type: "SHIPMENT",
      source_id: 10000 + offset,
    });
  }
  return {
    productionOrders: fakeRecords(48, 8000).map((item, offset) => ({
      ...item,
      order_no: `MO-${offset}`,
      status: productionOrderStatuses[offset % productionOrderStatuses.length],
    })),
    productionFacts: fakeRecords(90, 9000).map((item, offset) => ({
      ...item,
      fact_no: `PF-${offset}`,
      status: productionStatuses[offset % productionStatuses.length],
      fact_type: productionTypes[offset % productionTypes.length],
      source_type: "PRODUCTION_ORDER",
      source_id: 8000 + (offset % 48),
    })),
    outsourcingFacts: fakeRecords(90, 11000).map((item, offset) => ({
      ...item,
      fact_no: `OF-${offset + 1}`,
      status: "POSTED",
      fact_type: offset < 45 ? "MATERIAL_ISSUE" : "RETURN_RECEIPT",
      source_type: "OUTSOURCING_ORDER",
      source_id: 1301 + (offset % 45),
      ...(offset < 45 ? {} : { lot_id: 13045 + offset - 45 }),
    })),
    qualityInspections: fakeRecords(45, 12000, {
      inspection_no: "OQI",
      status: "PASSED",
      source_type: "OUTSOURCING_FACT",
      source_id: 11000,
    }),
    inventoryLots: fakeRecords(90, 13000).map((item, offset) => ({
      ...item,
      lot_no: `FG-${offset + 1}`,
      status: "ACTIVE",
      subject_type: "PRODUCT",
      subject_id: 801,
    })),
    inventoryBalances: fakeRecords(90, 14000).map((item, offset) => ({
      ...item,
      subject_type: "PRODUCT",
      subject_id: 801,
      product_sku_id: 901,
      warehouse_id: 302,
      lot_id: 13000 + offset,
      unit_id: 1001,
      quantity: "2",
    })),
    inventoryTxns: fakeRecords(90, 15000).map((item, offset) => ({
      ...item,
      txn_type:
        offset < 45 ? (offset % 2 === 0 ? "IN" : "OUT") : "IN",
      direction: offset < 45 && offset % 2 !== 0 ? -1 : 1,
      quantity: "1",
      source_type:
        offset < 45 ? "PRODUCTION_FACT" : "OUTSOURCING_FACT",
      source_id: offset < 45 ? 9000 + offset : 11000 + offset,
      ...(offset < 45 ? {} : { source_line_id: 11000 + offset }),
      lot_id: 13000 + offset,
    })),
    stockReservations: fakeRecords(47, 17000).map((item, offset) => ({
      ...item,
      reservation_no: `RSV-${offset}`,
      status: reservationStatuses[offset % reservationStatuses.length],
      source_type: "SALES_ORDER",
      source_id: 501,
    })),
    shipments: fakeRecords(47, 18000).map((item, offset) => ({
      ...item,
      shipment_no: `SHP-${offset}`,
      status: shipmentStatuses[offset % shipmentStatuses.length],
      items:
        offset === 0
          ? Array.from({ length: 25 }, (_, lineOffset) => ({
              id: 19000 + lineOffset,
              sales_order_item_id: 701 + lineOffset,
            }))
          : [{ id: 19000 + offset, sales_order_item_id: 701 }],
    })),
    financeFacts: finance,
  };
}

const runtime = Object.freeze({
  target: "local-dev",
  environment: "dev",
  customerKey: "yoyoosun",
  configRevision: "runtime-v2",
  source: "active_customer_config_revision",
});

function localMutationGuards(report) {
  return {
    targetConfirmation: manualAcceptanceTargetConfirmation(report),
    fetchImpl: async () => runtimeIdentityResponse(),
  };
}

test("plan is target-bound, source-driven, and prepares 54 receipts plus 45 fact runs", () => {
  const plan = buildManualAcceptanceFactPlan(sourceReport());
  assert.equal(plan.datasetKey, DATASET_KEY);
  assert.equal(plan.dataVersion, DATA_VERSION);
  assert.equal(plan.runId, RUN_ID);
  assert.equal(plan.target, "local-dev");
  assert.equal(plan.semanticDigest, "digest-v2");
  assert.equal(plan.directSQL, false);
  assert.equal(plan.retiredGenericFactWriter, false);
  assert.equal(plan.receipts.length, 54);
  assert.equal(plan.corrections.length, 12);
  assert.ok(
    plan.corrections.every((correction) => {
      const receipt = plan.receipts[correction.receiptIndex];
      return (
        receipt?.status === "POSTED" &&
        receipt.linkedPurchaseOrder === undefined
      );
    }),
  );
  assert.equal(plan.productionCandidates.length, 45);
  assert.equal(plan.outsourcingCandidates.length, 45);
  assert.equal(plan.expectedMinimums.shipments, 47);
  assert.equal(plan.shipmentLineSample.items.length, 25);
  assert.ok(
    plan.outsourcingCandidates.every(
      (candidate) =>
        candidate.issue.order.id === candidate.return.order.id &&
        candidate.issue.item.subjectType === "MATERIAL" &&
        candidate.return.item.subjectType === "PRODUCT",
    ),
  );
  assert.ok(
    MANUAL_ACCEPTANCE_FACT_REQUIRED_MODULES.includes("purchase_orders"),
  );
  assert.ok(
    MANUAL_ACCEPTANCE_FACT_REQUIRED_MODULES.includes("outsourcing_orders"),
  );
  assert.deepEqual(
    [...new Set(plan.receipts.map((item) => item.status))].sort(),
    ["CANCELLED", "DRAFT", "POSTED"],
  );
  assert.equal(plan.receipts[9].items[0].materialName, "米白短毛绒");
  assert.doesNotMatch(
    JSON.stringify(plan),
    /【试用】|workflow|generic operational/iu,
  );
});

test("CLI supports mutually exclusive apply/verify and staged execution", () => {
  assert.deepEqual(
    parseManualAcceptanceFactArgs([
      "--apply",
      "--source-report",
      "source.json",
      "--phase",
      "facts",
    ]).phase,
    "facts",
  );
  assert.throws(
    () => parseManualAcceptanceFactArgs(["--apply", "--verify"]),
    /mutually exclusive/u,
  );
  assert.throws(
    () => parseManualAcceptanceFactArgs(["--phase", "unknown"]),
    /--phase must be/u,
  );
});

test("strict RPC params follow endpoint allowlists without broad customer injection", () => {
  assert.deepEqual(
    manualAcceptanceFactRPCParams(
      "production_order",
      "create_production_order",
      { order_no: "MO-1" },
    ),
    { order_no: "MO-1" },
  );
  assert.deepEqual(
    manualAcceptanceFactRPCParams("operational_fact", "cancel_finance_fact", {
      id: 1,
      reason: "本笔取消",
    }),
    { id: 1, reason: "本笔取消" },
  );
  assert.deepEqual(
    manualAcceptanceFactRPCParams("operational_fact", "post_finance_fact", {
      id: 1,
    }),
    { customer_key: "yoyoosun", id: 1 },
  );
  for (const method of [
    "list_purchase_returns",
    "list_purchase_receipt_adjustments",
  ]) {
    assert.deepEqual(
      manualAcceptanceFactRPCParams("purchase", method, { keyword: "SIM" }),
      { keyword: "SIM" },
    );
  }
  for (const method of [
    "list_purchase_returns",
    "create_purchase_return_from_receipt",
    "post_purchase_return",
    "cancel_purchase_return",
    "list_purchase_receipt_adjustments",
    "create_purchase_receipt_adjustment_from_receipt",
    "post_purchase_receipt_adjustment",
    "cancel_purchase_receipt_adjustment",
  ]) {
    assert.equal(manualAcceptanceFactRole("purchase", method), "admin");
  }
  assert.equal(
    manualAcceptanceFactRole("purchase", "list_purchase_receipts"),
    "purchase",
  );
  assert.equal(
    manualAcceptanceFactRole("production_order", "create_production_order"),
    "admin",
  );
  assert.equal(
    manualAcceptanceFactRole("operational_fact", "list_production_facts"),
    "admin",
  );
  assert.equal(
    manualAcceptanceFactRole(
      "operational_fact",
      "create_receivable_from_shipment",
    ),
    "admin",
  );
});

test("receipt quality readback uses the formal quality list instead of an empty receipt embed", async () => {
  const receipt = { id: 41, items: [{ id: 51 }] };
  const inspection = {
    id: 61,
    inspection_no: "IQC-PR-41-ITEM-51",
    purchase_receipt_id: 41,
    purchase_receipt_item_id: 51,
    source_type: "PURCHASE_RECEIPT",
    inspection_type: "INCOMING",
    status: "SUBMITTED",
  };
  const result = await readPurchaseReceiptQualities(async (request) => {
    assert.deepEqual(request, {
      domain: "quality",
      method: "list_quality_inspections",
      params: {
        purchase_receipt_id: 41,
        source_type: "PURCHASE_RECEIPT",
        inspection_type: "INCOMING",
        limit: 200,
        offset: 0,
      },
    });
    return { quality_inspections: [inspection], total: 1 };
  }, receipt);
  assert.deepEqual(result.generated, [inspection]);
  assert.deepEqual(result.inspections, [inspection]);
});

test("DRAFT quality sample cancels the generated inspection and reuses one replacement", async () => {
  const receipt = { id: 41, items: [{ id: 51 }] };
  const generated = {
    id: 61,
    inspection_no: "IQC-PR-41-ITEM-51",
    purchase_receipt_id: 41,
    purchase_receipt_item_id: 51,
    source_type: "PURCHASE_RECEIPT",
    inspection_type: "INCOMING",
    status: "SUBMITTED",
  };
  const inspections = [generated];
  let mutations = 0;
  const rpc = async ({ domain, method, params }) => {
    assert.equal(domain, "quality");
    if (
      method === "list_quality_inspections" &&
      params.purchase_receipt_id === 41
    ) {
      return {
        quality_inspections: structuredClone(inspections),
        total: inspections.length,
      };
    }
    if (method === "list_quality_inspections") {
      return {
        quality_inspections: inspections.filter(
          (item) => item.inspection_no === params.keyword,
        ),
      };
    }
    if (method === "cancel_quality_inspection") {
      mutations += 1;
      generated.status = "CANCELLED";
      return { quality_inspection: structuredClone(generated) };
    }
    if (method === "create_quality_inspection_draft") {
      mutations += 1;
      inspections.push({
        id: 62,
        inspection_no: params.inspection_no,
        purchase_receipt_id: params.purchase_receipt_id,
        purchase_receipt_item_id: params.purchase_receipt_item_id,
        source_type: "PURCHASE_RECEIPT",
        inspection_type: "INCOMING",
        status: "DRAFT",
      });
      return { quality_inspection: structuredClone(inspections.at(-1)) };
    }
    throw new Error(`unexpected RPC ${domain}.${method}`);
  };
  const receiptPlan = {
    receiptNo: "PR-001",
    status: "DRAFT",
    qualityTarget: "DRAFT",
    qualityDraftNo: "TEST-YS-260715V3-ZJ901",
  };
  const first = await ensureReceiptQualities(rpc, receipt, receiptPlan, {
    anchorDate: "2026-07-15",
  });
  assert.deepEqual(first.map((item) => item.status).sort(), [
    "CANCELLED",
    "DRAFT",
  ]);
  assert.equal(mutations, 2);
  const second = await ensureReceiptQualities(rpc, receipt, receiptPlan, {
    anchorDate: "2026-07-15",
  });
  assert.deepEqual(second.map((item) => item.status).sort(), [
    "CANCELLED",
    "DRAFT",
  ]);
  assert.equal(mutations, 2);
});

test("quality decision fixtures send approximate percentages as required string pairs", async () => {
  const cases = [
    {
      target: "PASSED",
      method: "pass_quality_inspection",
      result: "PASS",
      operator: "APPROX",
      percent: "5",
    },
    {
      target: "REJECTED",
      method: "reject_quality_inspection",
      result: "REJECT",
      operator: "GT",
      percent: "50",
    },
  ];

  for (const scenario of cases) {
    const receipt = { id: 41, items: [{ id: 51 }] };
    const inspection = {
      id: 61,
      inspection_no: "IQC-PR-41-ITEM-51",
      purchase_receipt_id: 41,
      purchase_receipt_item_id: 51,
      source_type: "PURCHASE_RECEIPT",
      inspection_type: "INCOMING",
      status: "SUBMITTED",
    };
    let decision;
    const result = await ensureReceiptQualities(
      async ({ domain, method, params }) => {
        assert.equal(domain, "quality");
        if (method === "list_quality_inspections") {
          return { quality_inspections: [structuredClone(inspection)], total: 1 };
        }
        assert.equal(method, scenario.method);
        decision = structuredClone(params);
        return {
          quality_inspection: {
            ...inspection,
            status: scenario.target,
            result: scenario.result,
            defect_rate_operator: params.defect_rate_operator,
            defect_rate_percent: params.defect_rate_percent,
          },
        };
      },
      receipt,
      {
        receiptNo: "PR-001",
        status: "DRAFT",
        qualityTarget: scenario.target,
      },
      { anchorDate: "2026-07-15" },
    );

    assert.equal(result[0].status, scenario.target);
    assert.equal(decision.defect_rate_operator, scenario.operator);
    assert.equal(decision.defect_rate_percent, scenario.percent);
    assert.equal(typeof decision.defect_rate_percent, "string");
  }
});

test("receipt quality verification reads exact persisted states without mutation", async () => {
  const receipt = { id: 41, items: [{ id: 51 }] };
  const inspections = [
    {
      id: 61,
      inspection_no: "IQC-PR-41-ITEM-51",
      purchase_receipt_id: 41,
      purchase_receipt_item_id: 51,
      source_type: "PURCHASE_RECEIPT",
      inspection_type: "INCOMING",
      status: "CANCELLED",
    },
    {
      id: 62,
      inspection_no: "TEST-YS-260715V3-ZJ901",
      purchase_receipt_id: 41,
      purchase_receipt_item_id: 51,
      source_type: "PURCHASE_RECEIPT",
      inspection_type: "INCOMING",
      status: "DRAFT",
    },
  ];
  let calls = 0;
  const result = await verifyReceiptQualities(
    async ({ method, params }) => {
      calls += 1;
      assert.equal(method, "list_quality_inspections");
      assert.equal(params.purchase_receipt_id, 41);
      return {
        quality_inspections: structuredClone(inspections),
        total: inspections.length,
      };
    },
    receipt,
    {
      receiptNo: "PR-001",
      status: "DRAFT",
      qualityTarget: "DRAFT",
      qualityDraftNo: "TEST-YS-260715V3-ZJ901",
    },
  );
  assert.deepEqual(result, inspections);
  assert.equal(calls, 1);
});

test("authoritative lifecycle records win over stale source readback", () => {
  assert.deepEqual(
    mergeManualAcceptanceFactReferences(
      [{ id: 1, order_no: "MO-1", status: "RELEASED" }],
      [{ id: 1, order_no: "MO-1", status: "CLOSED" }],
    ),
    [{ id: 1, order_no: "MO-1", status: "CLOSED" }],
  );
});

test("final inventory readback runs after all facts and rejects truncated pages", async () => {
  const calls = [];
  const rpc = async ({ method, params }) => {
    calls.push({ method, params });
    if (method === "list_inventory_balances") {
      return {
        inventory_balances: [{ id: params.lot_id * 10, lot_id: params.lot_id }],
        total: 1,
      };
    }
    if (method === "list_inventory_txns") {
      return {
        inventory_txns: [{ id: params.lot_id * 100, lot_id: params.lot_id }],
        total: 1,
      };
    }
    throw new Error(`unexpected method ${method}`);
  };
  const result = await readManualAcceptanceFinalInventoryReferences(rpc, [
    { id: 2, lot_no: "LOT-2" },
    { id: 1, lot_no: "LOT-1" },
    { id: 2, lot_no: "LOT-2" },
  ]);
  assert.deepEqual(
    result.inventoryLots.map((item) => item.id),
    [2, 1],
  );
  assert.deepEqual(
    result.inventoryBalances.map((item) => item.id),
    [20, 10],
  );
  assert.deepEqual(
    result.inventoryTxns.map((item) => item.id),
    [200, 100],
  );
  assert.equal(calls.length, 4);

  await assert.rejects(
    readManualAcceptanceFinalInventoryReferences(
      async ({ method }) => {
        if (method === "list_inventory_balances") {
          return { inventory_balances: [{ id: 10 }], total: 2 };
        }
        return { inventory_txns: [], total: 0 };
      },
      [{ id: 1 }],
    ),
    /balance readback was truncated/u,
  );
});

test("partial source-driven phase fails before replay mutation", async () => {
  let mutations = 0;
  let reads = 0;
  const rows = new Map([["ONE", { id: 1, fact_no: "ONE", status: "POSTED" }]]);
  await assert.rejects(
    () =>
      reuseOrApplyManualAcceptanceFactPhase({
        phase: "production PROD-001",
        apply: true,
        rpc: async ({ params }) => ({
          records: rows.has(params.keyword) ? [rows.get(params.keyword)] : [],
        }),
        specs: ["ONE", "TWO"].map((businessNo) => ({
          domain: "test",
          method: "list",
          listKey: "records",
          businessField: "fact_no",
          businessNo,
          statuses: new Set(["POSTED"]),
        })),
        mutate: async () => {
          mutations += 1;
        },
        readComplete: async () => {
          reads += 1;
        },
      }),
    /phase is partial/u,
  );
  assert.equal(mutations, 0);
  assert.equal(reads, 0);
});

test("verified contiguous partial phase resumes and reaches an exact complete readback", async () => {
  let mutations = 0;
  let reads = 0;
  let partialValidations = 0;
  const rows = new Map([["ONE", { id: 1, fact_no: "ONE", status: "POSTED" }]]);
  const specs = ["ONE", "TWO"].map((businessNo) => ({
    domain: "test",
    method: "list",
    listKey: "records",
    businessField: "fact_no",
    businessNo,
    statuses: new Set(["POSTED"]),
  }));
  const result = await reuseOrApplyManualAcceptanceFactPhase({
    phase: "outsourcing OUT-RECOVER",
    apply: true,
    rpc: async ({ params }) => ({
      records: rows.has(params.keyword) ? [rows.get(params.keyword)] : [],
    }),
    specs,
    allowVerifiedPartialResume: true,
    validatePartialRecords: async (records) => {
      partialValidations += 1;
      assert.deepEqual(
        records.map((record) => record.fact_no),
        ["ONE"],
      );
    },
    mutate: async () => {
      mutations += 1;
      rows.set("TWO", { id: 2, fact_no: "TWO", status: "POSTED" });
    },
    readComplete: async () => {
      reads += 1;
      return { complete: true };
    },
  });
  assert.deepEqual(result, { complete: true });
  assert.equal(partialValidations, 1);
  assert.equal(mutations, 1);
  assert.equal(reads, 1);
});

function productionResumeFixture() {
  const report = sourceReport();
  const candidate =
    buildManualAcceptanceFactPlan(report).productionCandidates[0];
  const sourcePlan = buildSourceDrivenFactPlan(report, {
    instanceKey: "PROD-RESUME",
    enabledPhases: ["production"],
    production: {
      salesOrder: candidate.salesOrder,
      item: candidate.item,
      bom: { id: candidate.bom.id, status: candidate.bom.status },
      plannedQuantity: "3",
      materialIssues: candidate.bom.items.map((item) => ({
        materialId: item.materialId,
        unitId: item.unitId,
        warehouseId: 301,
        lotId: 5000,
        quantity: "3",
      })),
      completion: {
        warehouseId: 302,
        newLotNo: "YS-V5-CP-RESUME",
        quantity: "3",
      },
    },
  });
  const specs = sourceDrivenPhaseIdentitySpecs(sourcePlan, "production");
  const identity = sourcePlan.identities.production;
  const source = sourcePlan.phases.production.source;
  const order = {
    id: 10_001,
    order_no: specs[0].businessNo,
    status: "RELEASED",
  };
  const orderItem = {
    id: 11_001,
    production_order_id: order.id,
    line_no: 1,
    product_id: source.item.productId,
    product_sku_id: source.item.productSkuId ?? null,
    unit_id: source.item.unitId,
    planned_quantity: source.plannedQuantity,
    sales_order_item_id: source.item.id,
    bom_header_id: source.bom.id,
  };
  const requirements = source.materialIssues.map((item, index) => ({
    id: 12_001 + index,
    material_id: item.materialId,
    unit_id: item.unitId,
  }));
  const records = [
    order,
    ...source.materialIssues.map((item, index) => ({
      id: 13_001 + index,
      fact_no: identity.materialIssues[index].businessNo,
      status: "POSTED",
      fact_type: "MATERIAL_ISSUE",
      subject_type: "MATERIAL",
      subject_id: item.materialId,
      warehouse_id: item.warehouseId,
      unit_id: item.unitId,
      lot_id: item.lotId,
      quantity: item.quantity,
      source_type: "PRODUCTION_ORDER",
      source_id: order.id,
      source_line_id: requirements[index].id,
      idempotency_key: identity.materialIssues[index].idempotencyKey,
    })),
    {
      id: 14_001,
      fact_no: identity.completion.businessNo,
      status: "POSTED",
      fact_type: "FINISHED_GOODS_RECEIPT",
      subject_type: "PRODUCT",
      subject_id: source.item.productId,
      product_sku_id: source.item.productSkuId ?? null,
      warehouse_id: source.completion.warehouseId,
      unit_id: source.item.unitId,
      quantity: source.completion.quantity,
      source_type: "PRODUCTION_ORDER",
      source_id: order.id,
      source_line_id: orderItem.id,
      idempotency_key: identity.completion.idempotencyKey,
    },
  ];
  return {
    sourcePlan,
    specs,
    records,
    detail: {
      production_order_items: [orderItem],
      production_material_requirements: requirements,
    },
  };
}

function salesResumeFixture() {
  const report = sourceReport();
  const candidate =
    buildManualAcceptanceFactPlan(report).productionCandidates[0];
  const sourcePlan = buildSourceDrivenFactPlan(report, {
    instanceKey: "SALE-RESUME",
    enabledPhases: ["sales"],
    sales: {
      order: candidate.salesOrder,
      item: candidate.item,
      inventory: { warehouseId: 302, lotId: 13_000, quantity: "1" },
    },
  });
  const specs = sourceDrivenPhaseIdentitySpecs(sourcePlan, "sales");
  const identity = sourcePlan.identities.sales;
  const source = sourcePlan.phases.sales.source;
  const reservation = {
    id: 20_001,
    reservation_no: identity.reservation.businessNo,
    status: "ACTIVE",
    sales_order_id: source.order.id,
    sales_order_item_id: source.item.id,
    product_id: source.item.productId,
    product_sku_id: source.item.productSkuId ?? null,
    warehouse_id: source.inventory.warehouseId,
    unit_id: source.item.unitId,
    lot_id: source.inventory.lotId,
    quantity: source.inventory.quantity,
    idempotency_key: identity.reservation.idempotencyKey,
  };
  const shipment = {
    id: 20_002,
    shipment_no: identity.shipment.businessNo,
    status: "SHIPPED",
    sales_order_id: source.order.id,
    customer_id: source.order.customerId,
    customer_snapshot: source.order.customerSnapshot,
    idempotency_key: identity.shipment.idempotencyKey,
    items: [
      {
        sales_order_item_id: source.item.id,
        product_id: source.item.productId,
        product_sku_id: source.item.productSkuId ?? null,
        warehouse_id: source.inventory.warehouseId,
        unit_id: source.item.unitId,
        lot_id: source.inventory.lotId,
        quantity: source.inventory.quantity,
      },
    ],
  };
  const receivable = {
    id: 20_003,
    fact_no: identity.receivable.businessNo,
    status: "POSTED",
    fact_type: "RECEIVABLE",
    source_type: "SHIPMENT",
    source_id: shipment.id,
    idempotency_key: identity.receivable.idempotencyKey,
  };
  const receivableReconciliation = {
    id: 20_004,
    fact_no: identity.receivableReconciliation.businessNo,
    status: "POSTED",
    fact_type: "RECONCILIATION",
    source_type: "FINANCE_FACT",
    source_id: receivable.id,
    idempotency_key: identity.receivableReconciliation.idempotencyKey,
  };
  const invoice = {
    id: 20_005,
    fact_no: identity.invoice.businessNo,
    status: "POSTED",
    fact_type: "INVOICE",
    source_type: "SHIPMENT",
    source_id: shipment.id,
    idempotency_key: identity.invoice.idempotencyKey,
  };
  const invoiceReconciliation = {
    id: 20_006,
    fact_no: identity.invoiceReconciliation.businessNo,
    status: "POSTED",
    fact_type: "RECONCILIATION",
    source_type: "FINANCE_FACT",
    source_id: invoice.id,
    idempotency_key: identity.invoiceReconciliation.idempotencyKey,
  };
  return {
    sourcePlan,
    specs,
    records: [
      reservation,
      shipment,
      receivable,
      receivableReconciliation,
      invoice,
      invoiceReconciliation,
    ],
  };
}

function phaseLookupRPC(specs, rows, productionDetail) {
  return async ({ method, params }) => {
    if (method === "get_production_order") return productionDetail;
    const spec = specs.find((item) => item.businessNo === params.keyword);
    if (!spec) throw new Error(`unexpected phase lookup ${method}`);
    const record = rows.get(spec.businessNo);
    return { [spec.listKey]: record ? [structuredClone(record)] : [] };
  };
}

test("verified production and sales prefixes resume and reach exact complete readback", async () => {
  const production = productionResumeFixture();
  const productionRows = new Map(
    production.records
      .slice(0, 2)
      .map((record, index) => [production.specs[index].businessNo, record]),
  );
  let productionMutations = 0;
  const productionResult = await reuseOrApplyManualAcceptanceFactPhase({
    phase: "production PROD-RESUME",
    apply: true,
    specs: production.specs,
    rpc: phaseLookupRPC(production.specs, productionRows, production.detail),
    allowVerifiedPartialResume: true,
    validatePartialRecords: (records) =>
      validateProductionPhasePartialRecords(
        phaseLookupRPC(production.specs, productionRows, production.detail),
        production.sourcePlan,
        records,
      ),
    validateRecords: (records) =>
      validateProductionPhasePartialRecords(
        phaseLookupRPC(production.specs, productionRows, production.detail),
        production.sourcePlan,
        records,
      ),
    mutate: async () => {
      productionMutations += 1;
      production.records.slice(2).forEach((record, index) => {
        productionRows.set(production.specs[index + 2].businessNo, record);
      });
    },
    readComplete: async () => ({ phase: "production", complete: true }),
  });
  assert.deepEqual(productionResult, {
    phase: "production",
    complete: true,
  });
  assert.equal(productionMutations, 1);

  const sales = salesResumeFixture();
  const salesRows = new Map(
    sales.records
      .slice(0, 3)
      .map((record, index) => [sales.specs[index].businessNo, record]),
  );
  let salesMutations = 0;
  const salesResult = await reuseOrApplyManualAcceptanceFactPhase({
    phase: "sales SALE-RESUME",
    apply: true,
    specs: sales.specs,
    rpc: phaseLookupRPC(sales.specs, salesRows),
    allowVerifiedPartialResume: true,
    validatePartialRecords: (records) =>
      validateSalesPhasePartialRecords(sales.sourcePlan, records),
    validateRecords: (records) =>
      validateSalesPhaseRecords(sales.sourcePlan, records),
    mutate: async () => {
      salesMutations += 1;
      sales.records.slice(3).forEach((record, index) => {
        salesRows.set(sales.specs[index + 3].businessNo, record);
      });
    },
    readComplete: async () => ({ phase: "sales", complete: true }),
  });
  assert.deepEqual(salesResult, { phase: "sales", complete: true });
  assert.equal(salesMutations, 1);
});

test("partial replay rejects gaps, status or source drift, and records beyond the plan", async () => {
  const sales = salesResumeFixture();
  let mutations = 0;
  const gapRows = new Map([
    [sales.specs[0].businessNo, sales.records[0]],
    [sales.specs[2].businessNo, sales.records[2]],
  ]);
  await assert.rejects(
    () =>
      reuseOrApplyManualAcceptanceFactPhase({
        phase: "sales SALE-GAP",
        apply: true,
        specs: sales.specs,
        rpc: phaseLookupRPC(sales.specs, gapRows),
        allowVerifiedPartialResume: true,
        validatePartialRecords: (records) =>
          validateSalesPhasePartialRecords(sales.sourcePlan, records),
        mutate: async () => {
          mutations += 1;
        },
        readComplete: async () => ({ complete: true }),
      }),
    /non-contiguous/u,
  );

  const statusRows = new Map([
    [sales.specs[0].businessNo, { ...sales.records[0], status: "CANCELLED" }],
  ]);
  await assert.rejects(
    () =>
      reuseOrApplyManualAcceptanceFactPhase({
        phase: "sales SALE-STATUS",
        apply: true,
        specs: sales.specs,
        rpc: phaseLookupRPC(sales.specs, statusRows),
        allowVerifiedPartialResume: true,
        validatePartialRecords: (records) =>
          validateSalesPhasePartialRecords(sales.sourcePlan, records),
        mutate: async () => {
          mutations += 1;
        },
        readComplete: async () => ({ complete: true }),
      }),
    /conflicting status CANCELLED/u,
  );

  const sourceRows = new Map([
    [
      sales.specs[0].businessNo,
      {
        ...sales.records[0],
        sales_order_id: sales.records[0].sales_order_id + 1,
      },
    ],
  ]);
  await assert.rejects(
    () =>
      reuseOrApplyManualAcceptanceFactPhase({
        phase: "sales SALE-SOURCE",
        apply: true,
        specs: sales.specs,
        rpc: phaseLookupRPC(sales.specs, sourceRows),
        allowVerifiedPartialResume: true,
        validatePartialRecords: (records) =>
          validateSalesPhasePartialRecords(sales.sourcePlan, records),
        mutate: async () => {
          mutations += 1;
        },
        readComplete: async () => ({ complete: true }),
      }),
    /conflicting sales_order_id/u,
  );
  assert.throws(
    () =>
      validateSalesPhasePartialRecords(sales.sourcePlan, [
        ...sales.records,
        { id: 99_999 },
      ]),
    /1-6 record prefix/u,
  );

  const production = productionResumeFixture();
  const productionRows = new Map([
    [production.specs[0].businessNo, production.records[0]],
    [
      production.specs[1].businessNo,
      {
        ...production.records[1],
        source_id: production.records[1].source_id + 1,
      },
    ],
  ]);
  await assert.rejects(
    () =>
      validateProductionPhasePartialRecords(
        phaseLookupRPC(production.specs, productionRows, production.detail),
        production.sourcePlan,
        [...productionRows.values()],
      ),
    /conflicting source_id/u,
  );
  await assert.rejects(
    () =>
      validateProductionPhasePartialRecords(
        phaseLookupRPC(production.specs, productionRows, production.detail),
        production.sourcePlan,
        [...production.records, { id: 99_998 }],
      ),
    /record prefix/u,
  );
  assert.equal(mutations, 0);
});

test("verified partial resume still rejects semantic drift before mutation", async () => {
  let mutations = 0;
  await assert.rejects(
    () =>
      reuseOrApplyManualAcceptanceFactPhase({
        phase: "outsourcing OUT-CONFLICT",
        apply: true,
        rpc: async ({ params }) => ({
          records:
            params.keyword === "ONE"
              ? [{ id: 1, fact_no: "ONE", status: "POSTED" }]
              : [],
        }),
        specs: ["ONE", "TWO"].map((businessNo) => ({
          domain: "test",
          method: "list",
          listKey: "records",
          businessField: "fact_no",
          businessNo,
          statuses: new Set(["POSTED"]),
        })),
        allowVerifiedPartialResume: true,
        validatePartialRecords: async () => {
          throw new Error("partial source grain conflicts");
        },
        mutate: async () => {
          mutations += 1;
        },
        readComplete: async () => ({ complete: true }),
      }),
    /partial source grain conflicts/u,
  );
  assert.equal(mutations, 0);
});

test("same-number semantic collision fails before replay mutation", async () => {
  let mutations = 0;
  let reads = 0;
  await assert.rejects(
    () =>
      reuseOrApplyManualAcceptanceFactPhase({
        phase: "sales SALE-SEMANTIC",
        apply: true,
        specs: [
          {
            domain: "operational_fact",
            method: "list_stock_reservations",
            listKey: "stock_reservations",
            businessField: "reservation_no",
            businessNo: "RSV-SAME",
            statuses: new Set(["ACTIVE"]),
          },
        ],
        rpc: async () => ({
          stock_reservations: [
            { id: 1, reservation_no: "RSV-SAME", status: "ACTIVE" },
          ],
        }),
        mutate: async () => {
          mutations += 1;
        },
        validateRecords: async () => {
          throw new Error("reservation source grain conflicts");
        },
        readComplete: async () => {
          reads += 1;
        },
      }),
    /source grain conflicts/u,
  );
  assert.equal(mutations, 0);
  assert.equal(reads, 0);
});

test("sales phase semantic validator rejects an exact number bound to the wrong source", () => {
  const report = sourceReport();
  const candidate =
    buildManualAcceptanceFactPlan(report).productionCandidates[0];
  const sourcePlan = buildSourceDrivenFactPlan(report, {
    instanceKey: "SALE-SEMANTIC",
    enabledPhases: ["sales"],
    sales: {
      order: candidate.salesOrder,
      item: candidate.item,
      inventory: { warehouseId: 302, lotId: 13000, quantity: "1" },
    },
  });
  const identity = sourcePlan.identities.sales;
  const reservation = {
    id: 1,
    status: "ACTIVE",
    sales_order_id: candidate.salesOrder.id,
    sales_order_item_id: candidate.item.id,
    product_id: candidate.item.productId,
    product_sku_id: candidate.item.productSkuId ?? null,
    warehouse_id: 302,
    unit_id: candidate.item.unitId,
    lot_id: 13000,
    quantity: "1",
    idempotency_key: identity.reservation.idempotencyKey,
  };
  const shipment = {
    id: 2,
    status: "SHIPPED",
    sales_order_id: candidate.salesOrder.id,
    customer_id: candidate.salesOrder.customerId,
    customer_snapshot: candidate.salesOrder.customerSnapshot,
    idempotency_key: identity.shipment.idempotencyKey,
    items: [
      {
        sales_order_item_id: candidate.item.id,
        product_id: candidate.item.productId,
        product_sku_id: candidate.item.productSkuId ?? null,
        warehouse_id: 302,
        unit_id: candidate.item.unitId,
        lot_id: 13000,
        quantity: "1",
      },
    ],
  };
  const receivable = {
    id: 3,
    fact_type: "RECEIVABLE",
    source_type: "SHIPMENT",
    source_id: shipment.id,
    idempotency_key: identity.receivable.idempotencyKey,
  };
  const receivableReconciliation = {
    id: 4,
    fact_type: "RECONCILIATION",
    source_type: "FINANCE_FACT",
    source_id: receivable.id,
    idempotency_key: identity.receivableReconciliation.idempotencyKey,
  };
  const invoice = {
    id: 5,
    fact_type: "INVOICE",
    source_type: "SHIPMENT",
    source_id: shipment.id,
    idempotency_key: identity.invoice.idempotencyKey,
  };
  const invoiceReconciliation = {
    id: 6,
    fact_type: "RECONCILIATION",
    source_type: "FINANCE_FACT",
    source_id: invoice.id,
    idempotency_key: identity.invoiceReconciliation.idempotencyKey,
  };
  validateSalesPhaseRecords(sourcePlan, [
    reservation,
    shipment,
    receivable,
    receivableReconciliation,
    invoice,
    invoiceReconciliation,
  ]);
  assert.throws(
    () =>
      validateSalesPhaseRecords(sourcePlan, [
        { ...reservation, sales_order_id: candidate.salesOrder.id + 1 },
        shipment,
        receivable,
        receivableReconciliation,
        invoice,
        invoiceReconciliation,
      ]),
    /conflicting sales_order_id/u,
  );
});

test("purchase correction validator rejects an existing number linked to another receipt", () => {
  assert.throws(
    () =>
      validatePurchaseCorrectionRecord(
        "adjustment",
        {
          id: 9,
          purchase_receipt_id: 100,
          items: [
            {
              purchase_receipt_item_id: 201,
              adjust_type: "QUANTITY_INCREASE",
              quantity: "1",
            },
          ],
        },
        { id: 101 },
        { id: 201 },
        { adjustType: "QUANTITY_INCREASE" },
      ),
    /conflicting purchase_receipt_id/u,
  );
});

test("complete sales phase with a consumed reservation replays without mutation", async () => {
  const report = sourceReport();
  const plan = buildManualAcceptanceFactPlan(report);
  const candidate = plan.productionCandidates[0];
  const sourcePlan = buildSourceDrivenFactPlan(report, {
    instanceKey: "SALE-REPLAY",
    enabledPhases: ["sales"],
    sales: {
      order: candidate.salesOrder,
      item: candidate.item,
      inventory: { warehouseId: 302, lotId: 13000, quantity: "1" },
    },
  });
  const specs = sourceDrivenPhaseIdentitySpecs(sourcePlan, "sales");
  const stored = new Map(
    specs.map((spec, index) => [
      spec.businessNo,
      {
        spec,
        record: {
          id: 60000 + index,
          [spec.businessField]: spec.businessNo,
          status:
            spec.listKey === "stock_reservations"
              ? "CONSUMED"
              : spec.listKey === "shipments"
                ? "SHIPPED"
                : "POSTED",
        },
      },
    ]),
  );
  let mutations = 0;
  let reads = 0;
  const replay = () =>
    reuseOrApplyManualAcceptanceFactPhase({
      phase: "sales SALE-REPLAY",
      apply: true,
      specs,
      rpc: async ({ params }) => {
        const value = stored.get(params.keyword);
        return { [value.spec.listKey]: [value.record] };
      },
      mutate: async () => {
        mutations += 1;
      },
      readComplete: async () => {
        reads += 1;
        return { complete: true };
      },
    });
  await replay();
  await replay();
  assert.equal(mutations, 0);
  assert.equal(reads, 2);
});

test("finance lifecycle uses stable business numbers and second apply is a no-op", async () => {
  const records = new Map();
  const baseIDs = new Set();
  let nextID = 50000;
  let mutations = 0;
  let creations = 0;
  const add = (record, base = true) => {
    const item = { id: nextID++, ...record };
    records.set(item.id, item);
    if (base) baseIDs.add(item.id);
    return item;
  };
  for (const type of ["PAYABLE", "RECEIVABLE", "INVOICE"]) {
    for (const suffix of ["04", "01", "03", "02"]) {
      const source = add({
        fact_no: `${type}-${suffix}`,
        fact_type: type,
        status: "POSTED",
        source_type: type === "PAYABLE" ? "OUTSOURCING_FACT" : "SHIPMENT",
        source_id: 70000 + nextID,
        source_no: `SOURCE-${type}-${suffix}`,
      });
      add({
        fact_no:
          type === "PAYABLE" && suffix === "01"
            ? "RECON-00-POSTED-PARENT"
            : type === "PAYABLE" && suffix === "02"
              ? "RECON-01-SETTLED-PARENT"
              : `RECON-${type}-${suffix}`,
        fact_type: "RECONCILIATION",
        status: "POSTED",
        source_type: "FINANCE_FACT",
        source_id: source.id,
        source_no: source.fact_no,
      });
    }
  }
  const rpc = async ({ method, params }) => {
    if (method === "list_finance_facts") {
      return {
        finance_facts: [...records.values()].filter(
          (item) => item.fact_no === params.keyword,
        ),
      };
    }
    if (method === "settle_finance_fact" || method === "cancel_finance_fact") {
      const current = records.get(params.id);
      assert.equal(current.status, "POSTED");
      const updated = {
        ...current,
        status: method === "settle_finance_fact" ? "SETTLED" : "CANCELLED",
      };
      records.set(updated.id, updated);
      mutations += 1;
      const response = { ...updated };
      delete response.source_no;
      return { finance_fact: response };
    }
    const typeByMethod = {
      create_payable_from_outsourcing_return: "PAYABLE",
      create_receivable_from_shipment: "RECEIVABLE",
      create_invoice_from_shipment: "INVOICE",
      create_reconciliation_from_finance_fact: "RECONCILIATION",
    };
    const factType = typeByMethod[method];
    assert.ok(factType, `unexpected method ${method}`);
    if (factType === "RECONCILIATION") {
      assert.equal(records.get(params.finance_fact_id)?.status, "POSTED");
    }
    const created = add(
      {
        fact_no: params.fact_no,
        fact_type: factType,
        status: "DRAFT",
        source_type:
          factType === "RECONCILIATION"
            ? "FINANCE_FACT"
            : params.outsourcing_fact_id
              ? "OUTSOURCING_FACT"
              : "SHIPMENT",
        source_id:
          params.finance_fact_id ||
          params.outsourcing_fact_id ||
          params.shipment_id,
        source_no: `SOURCE-${params.fact_no}`,
        idempotency_key: params.idempotency_key,
      },
      false,
    );
    creations += 1;
    const response = { ...created };
    delete response.source_no;
    return { finance_fact: response };
  };
  const plan = { prefix: "SIM-YOYOOSUN-UAT-REPLAY", dataVersion: DATA_VERSION };
  const currentBase = () => [...baseIDs].map((id) => ({ ...records.get(id) }));
  const first = await applyManualAcceptanceFinanceLifecycle({
    rpc,
    plan,
    financeFacts: currentBase(),
    apply: true,
  });
  assert.ok(first.every((item) => item.source_no));
  const firstMutationCount = mutations;
  const firstCreationCount = creations;
  const firstStates = [...records.values()].map(({ id, fact_no, status }) => ({
    id,
    fact_no,
    status,
  }));
  const second = await applyManualAcceptanceFinanceLifecycle({
    rpc,
    plan,
    financeFacts: currentBase(),
    apply: true,
  });
  assert.equal(mutations, firstMutationCount);
  assert.equal(creations, firstCreationCount);
  assert.deepEqual(
    [...records.values()].map(({ id, fact_no, status }) => ({
      id,
      fact_no,
      status,
    })),
    firstStates,
  );
  assert.deepEqual(
    second.map(({ id, status }) => ({ id, status })),
    first.map(({ id, status }) => ({ id, status })),
  );
  const verified = await applyManualAcceptanceFinanceLifecycle({
    rpc,
    plan,
    financeFacts: currentBase(),
    apply: false,
  });
  assert.equal(mutations, firstMutationCount);
  assert.equal(creations, firstCreationCount);
  assert.deepEqual(
    verified.map(({ id, status }) => ({ id, status })),
    first.map(({ id, status }) => ({ id, status })),
  );
});

test("apply emits the exact readiness contract and complete lifecycle matrices", async () => {
  const report = sourceReport();
  const plan = buildManualAcceptanceFactPlan(report);
  const result = await applyManualAcceptanceFactPlan(plan, report, {
    ...localMutationGuards(report),
    confirmPhrase: MANUAL_ACCEPTANCE_FACT_CONFIRM_PHRASE,
    executionContext: { rpc: async () => ({}), runtime },
    purchaseStage: async () => purchaseStage(),
    factStage: async () => factStage(),
  });
  assert.equal(result.reportContract, SOURCE_DRIVEN_FACT_REPORT_CONTRACT);
  assert.equal(result.mode, "apply");
  assert.equal(result.semanticDigest, report.semanticDigest);
  assert.equal(result.referenceRecords.purchaseReceipts.length, 54);
  assert.ok(
    result.referenceRecords.purchaseReceiptAdjustments.every(
      (item) =>
        item.adjust_type === "QUANTITY_INCREASE" ||
        item.adjust_type === "QUANTITY_DECREASE",
    ),
  );
  assert.ok(result.referenceRecords.productionFacts.length >= 45);
  assert.ok(
    result.referenceRecords.stockReservations.every(
      (item) => item.source_type === "SALES_ORDER" && item.source_id > 0,
    ),
  );
  assert.ok(result.referenceRecords.financeFacts.length >= 180);
  assert.equal(result.summary.outsourcingReturnInventoryCoverage.complete, true);
  assert.equal(
    result.summary.businessDashboardInventoryTotal,
    result.referenceRecords.inventoryBalances.length,
  );
  assert.ok(result.referenceRecords.attachmentOwners.productionFactId > 0);
  assert.ok(result.referenceRecords.attachmentOwners.financeFactId > 0);
  assert.deepEqual(Object.keys(result.statusCounts.productionOrders).sort(), [
    "CANCELLED",
    "CLOSED",
    "DRAFT",
    "RELEASED",
  ]);
});

test("outsourcing return inventory coverage rejects incomplete or unrelated evidence", () => {
  const records = factStage();
  assert.equal(
    evaluateManualAcceptanceOutsourcingInventoryCoverage(records).complete,
    true,
  );
  const missingBalance = {
    ...records,
    inventoryBalances: records.inventoryBalances.slice(0, -1),
  };
  assert.equal(
    evaluateManualAcceptanceOutsourcingInventoryCoverage(missingBalance)
      .complete,
    false,
  );
  const matchingTxnIndex = records.inventoryTxns.findIndex(
    (item) => item.source_type === "OUTSOURCING_FACT",
  );
  assert.ok(matchingTxnIndex >= 0);
  for (const patch of [
    { source_type: "PRODUCTION_FACT" },
    { source_id: records.inventoryTxns[matchingTxnIndex].source_id + 1 },
    {
      source_line_id:
        records.inventoryTxns[matchingTxnIndex].source_line_id + 1,
    },
    { txn_type: "OUT" },
    { direction: -1 },
    { quantity: "0" },
  ]) {
    const invalid = structuredClone(records);
    Object.assign(invalid.inventoryTxns[matchingTxnIndex], patch);
    assert.equal(
      evaluateManualAcceptanceOutsourcingInventoryCoverage(invalid).complete,
      false,
      JSON.stringify(patch),
    );
  }
  const missingTxn = structuredClone(records);
  missingTxn.inventoryTxns.splice(matchingTxnIndex, 1);
  assert.equal(
    evaluateManualAcceptanceOutsourcingInventoryCoverage(missingTxn).complete,
    false,
  );
});

test("runtime revision drift fails before purchase or fact mutation", async () => {
  const report = sourceReport();
  const plan = buildManualAcceptanceFactPlan(report);
  let stageCalls = 0;
  await assert.rejects(
    () =>
      applyManualAcceptanceFactPlan(plan, report, {
        ...localMutationGuards(report),
        confirmPhrase: MANUAL_ACCEPTANCE_FACT_CONFIRM_PHRASE,
        executionContext: {
          rpc: async () => ({}),
          runtime: { ...runtime, configRevision: "runtime-other" },
        },
        purchaseStage: async () => {
          stageCalls += 1;
          return purchaseStage();
        },
      }),
    /configRevision does not match/u,
  );
  assert.equal(stageCalls, 0);
});

test("verify is read-only and uses the same exact report contract", async () => {
  const report = sourceReport();
  const plan = buildManualAcceptanceFactPlan(report);
  let writes = 0;
  const result = await verifyManualAcceptanceFactPlan(plan, report, {
    executionContext: {
      rpc: async () => {
        writes += 1;
        throw new Error("unexpected rpc");
      },
      runtime,
    },
    verifyPurchaseStage: async () => purchaseStage(),
    factStage: async (_plan, _source, _purchase, options) => {
      assert.equal(options.apply, false);
      return factStage();
    },
  });
  assert.equal(writes, 0);
  assert.equal(result.mode, "verify");
  assert.equal(result.reportContract, SOURCE_DRIVEN_FACT_REPORT_CONTRACT);
});

test("facts-only apply verifies the purchase prerequisite without rewriting it", async () => {
  const report = sourceReport();
  const plan = buildManualAcceptanceFactPlan(report);
  let purchaseWrites = 0;
  let purchaseVerifies = 0;
  await applyManualAcceptanceFactPlan(plan, report, {
    ...localMutationGuards(report),
    phase: "facts",
    confirmPhrase: MANUAL_ACCEPTANCE_FACT_CONFIRM_PHRASE,
    executionContext: { rpc: async () => ({}), runtime },
    purchaseStage: async () => {
      purchaseWrites += 1;
      return purchaseStage();
    },
    verifyPurchaseStage: async () => {
      purchaseVerifies += 1;
      return purchaseStage();
    },
    factStage: async () => factStage(),
  });
  assert.equal(purchaseWrites, 0);
  assert.equal(purchaseVerifies, 1);
});

function attestation() {
  return {
    target: "customer-trial-133",
    origin: "http://127.0.0.1:18375",
    customerKey: "yoyoosun",
    environment: "prod",
    release: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    migration: "20260714165115",
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

function runtimeIdentityResponse() {
  return {
    ok: true,
    status: 200,
    redirected: false,
    headers: {
      get: (name) =>
        name === "X-ERP-Runtime-Identity-Proof" ? "matched-v1" : null,
    },
    async text() {
      return "runtime identity matched";
    },
  };
}

test("remote apply rejects missing target confirmation and attestation before execution", async () => {
  const report = sourceReport({ remote: true });
  const plan = buildManualAcceptanceFactPlan(report);
  let executionCalls = 0;
  const options = {
    confirmPhrase: MANUAL_ACCEPTANCE_FACT_CONFIRM_PHRASE,
    executionContext: {
      rpc: async () => ({}),
      runtime: {
        ...runtime,
        target: "customer-trial-133",
        targetAttestation: {
          source: "out-of-band",
          release: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          migration: "20260714165115",
        },
      },
    },
    purchaseStage: async () => {
      executionCalls += 1;
      return purchaseStage();
    },
    factStage: async () => factStage(),
    fetchImpl: async () => runtimeIdentityResponse(),
  };
  await assert.rejects(
    () => applyManualAcceptanceFactPlan(plan, report, options),
    /external apply requires MANUAL_ACCEPTANCE_TARGET_CONFIRM/u,
  );
  assert.equal(executionCalls, 0);
  const targetConfirmation = `APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA:customer-trial-133:${DATA_VERSION}:${RUN_ID}`;
  await assert.rejects(
    () =>
      applyManualAcceptanceFactPlan(plan, report, {
        ...options,
        targetConfirmation,
      }),
    /attestation is required/u,
  );
  assert.equal(executionCalls, 0);
  const result = await applyManualAcceptanceFactPlan(plan, report, {
    ...options,
    targetConfirmation,
    targetAttestation: attestation(),
  });
  assert.equal(result.target, "customer-trial-133");
  assert.equal(executionCalls, 1);
});

test("remote runtime release drift fails before any fact stage", async () => {
  const report = sourceReport({ remote: true });
  const plan = buildManualAcceptanceFactPlan(report);
  let stageCalls = 0;
  await assert.rejects(
    () =>
      applyManualAcceptanceFactPlan(plan, report, {
        confirmPhrase: MANUAL_ACCEPTANCE_FACT_CONFIRM_PHRASE,
        targetConfirmation: `APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA:customer-trial-133:${DATA_VERSION}:${RUN_ID}`,
        targetAttestation: attestation(),
        executionContext: {
          rpc: async () => ({}),
          runtime: {
            ...runtime,
            target: "customer-trial-133",
            targetAttestation: {
              source: "out-of-band",
              release: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              migration: "20260714165115",
            },
          },
        },
        purchaseStage: async () => {
          stageCalls += 1;
          return purchaseStage();
        },
        fetchImpl: async () => runtimeIdentityResponse(),
      }),
    /attestation release does not match/u,
  );
  assert.equal(stageCalls, 0);
});

test("remote runtime rejects missing attestation before login or any network request", async () => {
  const report = sourceReport({ remote: true });
  const plan = buildManualAcceptanceFactPlan(report);
  let networkCalls = 0;
  await assert.rejects(
    () =>
      verifyManualAcceptanceFactPlan(plan, report, {
        fetchImpl: async () => {
          networkCalls += 1;
          throw new Error("network must not run");
        },
      }),
    /attestation is required/u,
  );
  assert.equal(networkCalls, 0);
});

test("local apply forbids remote attestation before any stage runs", async () => {
  const report = sourceReport();
  const plan = buildManualAcceptanceFactPlan(report);
  let stageCalls = 0;
  await assert.rejects(
    () =>
      applyManualAcceptanceFactPlan(plan, report, {
        ...localMutationGuards(report),
        confirmPhrase: MANUAL_ACCEPTANCE_FACT_CONFIRM_PHRASE,
        targetAttestation: attestation(),
        executionContext: { rpc: async () => ({}), runtime },
        purchaseStage: async () => {
          stageCalls += 1;
          return purchaseStage();
        },
      }),
    /attestation is forbidden for local/u,
  );
  assert.equal(stageCalls, 0);
});

test("source contains no direct SQL or retired generic writer import", async () => {
  const source = await readFile(
    new URL("./manual-acceptance-fact-data.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /operational-fact-simulated-closure|purchase-quality-simulated-matrix/u,
  );
  assert.doesNotMatch(
    source,
    /\b(?:SELECT|INSERT|UPDATE|DELETE)\s+(?:FROM|INTO|SET)\b/iu,
  );
  assert.match(source, /applySourceDrivenFactPlan/u);
  assert.match(source, /assertManualAcceptanceTargetAttestation/u);
});
