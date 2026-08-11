import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  FORMAL_RPC_PARAM_ALLOWLIST,
  SourceDrivenFactError,
  applySourceDrivenFactPlan,
  buildSourceDrivenFactPlan,
  manualAcceptanceBusinessNo,
  preflightSourceDrivenFactPlan,
  sourceDrivenFactConfirmation,
} from "./manual-acceptance-source-driven-facts.mjs";
import {
  CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
  CURRENT_MANUAL_ACCEPTANCE_RUN_ID,
  CUSTOMER_TRIAL_133_DATABASE,
  manualAcceptanceTargetConfirmation,
} from "./manual-acceptance-target-policy.mjs";

const LOCAL_ACCEPTANCE_DATABASE = "plush_erp_acceptance_local_fixture_dev";

function sourceReport({ includeFacts = true, includePurchase = true } = {}) {
  const report = {
    mode: "apply",
    simulatedOnly: true,
    realCustomerImport: false,
    datasetKey: "yoyoosun-manual-acceptance",
    dataVersion: "2026.07.15-v1",
    runId: "20260715-V1",
    target: "local-dev",
    backendURL: "http://127.0.0.1:8310",
    databaseName: LOCAL_ACCEPTANCE_DATABASE,
    referenceRecords: {},
  };
  if (!includeFacts) return report;
  report.referenceRecords.sourceDrivenFacts = {
    datasetKey: report.datasetKey,
    dataVersion: report.dataVersion,
    runId: report.runId,
    production: {
      salesOrder: { id: 101, status: "ACTIVE" },
      item: {
        id: 102,
        productId: 103,
        productSkuId: 104,
        unitId: 105,
      },
      bom: { id: 106, status: "ACTIVE" },
      plannedQuantity: "1",
      route: {
        code: "PLUSH_SEW_HAND_V1",
        customerInspectionRequired: false,
        packagingVersionSnapshot: "试用验收包装版",
      },
      materialIssues: [
        {
          materialId: 201,
          unitId: 105,
          warehouseId: 202,
          lotId: 203,
          quantity: "2",
          productionOperationCode: "FABRIC_PROCESSING",
        },
      ],
      fabricOutsourcing: {
        order: { id: 311, status: "CONFIRMED" },
        item: { id: 312, materialId: 201, unitId: 105, quantity: "2" },
        warehouseId: 202,
        lotId: 203,
        quantity: "2",
      },
      completion: {
        warehouseId: 204,
        newLotNo: "SIM-FG-20260715-V1",
        quantity: "1",
      },
      rework: { quantity: "0.25", reason: "模拟返工验证" },
    },
    outsourcing: {
      issue: {
        order: { id: 301, status: "confirmed" },
        item: {
          id: 302,
          subjectType: "MATERIAL",
          subjectId: 201,
          unitId: 105,
        },
        warehouseId: 202,
        lotId: 203,
        quantity: "1",
      },
      return: {
        order: { id: 301, status: "confirmed" },
        item: {
          id: 303,
          subjectType: "PRODUCT",
          subjectId: 103,
          productSkuId: 104,
          unitId: 105,
        },
        warehouseId: 204,
        newLotNo: "SIM-OUT-20260715-V1",
        quantity: "1",
      },
    },
    sales: {
      order: {
        id: 401,
        status: "ACTIVE",
        customerId: 402,
        customerSnapshot: "【试用】验收客户",
        paymentTermDays: 30,
      },
      item: {
        id: 403,
        productId: 103,
        productSkuId: 104,
        unitId: 105,
        unitPrice: "128.88",
      },
      inventory: {
        warehouseId: 204,
        lotId: 405,
        quantity: "1",
      },
    },
    ...(includePurchase
      ? { purchase: { receipt: { id: 501, status: "POSTED" } } }
      : {}),
  };
  return report;
}

function createRPC({
  available = "50",
  conflictMethod,
  prepostedCreateMethods = new Set(),
} = {}) {
  const calls = [];
  const records = new Map();
  let nextID = 1000;
  let outsourcingQualityInspection;
  let finishedGoodsQualityInspection;
  let shipmentFinanceApprovalTask;
  let deliveryProcess;
  let deliveryNodes;
  let productionOrderItem;
  const productionWIPOperations = [
    [701, "FABRIC_PROCESSING"],
    [702, "SEWING"],
    [703, "HANDWORK"],
    [704, "PACKAGING"],
  ].map(([id, operationCode], index) => ({
    id,
    production_order_id: 600,
    production_order_item_id: 601,
    route_code: "PLUSH_SEW_HAND_V1",
    route_version: 1,
    step_no: (index + 1) * 10,
    operation_code: operationCode,
  }));
  const qualityGatesByOperation = new Map([
    ["FABRIC_PROCESSING", ["CUT_PIECE"]],
    ["SEWING", ["SHELL"]],
    ["HANDWORK", ["FINISHED_GOODS", "NEEDLE", "SAMPLING"]],
    ["PACKAGING", []],
  ]);
  const productionWIPBatches = [];
  const productionWIPQualities = new Map();
  const packagingConfirmation = {
    id: 720,
    production_order_id: 600,
    production_order_item_id: 601,
    status: "PENDING",
    version: 1,
  };

  const productionWIPAggregate = () => ({
    production_order: { id: 600, status: "RELEASED", version: 2 },
    production_order_items: productionOrderItem
      ? [structuredClone(productionOrderItem)]
      : [],
    production_order_operations: structuredClone(productionWIPOperations),
    production_wip_batches: structuredClone(productionWIPBatches),
    packaging_confirmations: [structuredClone(packagingConfirmation)],
    quality_inspections: [...productionWIPQualities.values()].flatMap((items) =>
      structuredClone(items),
    ),
  });

  const createRecord = (key, extra = {}, method = "") => {
    const item = {
      id: nextID,
      status: prepostedCreateMethods.has(method) ? "POSTED" : "DRAFT",
      version: 1,
      ...extra,
    };
    nextID += 1;
    records.set(item.id, { key, item });
    return { [key]: item };
  };

  const rpc = async ({ domain, method, params }) => {
    calls.push({ domain, method, params: structuredClone(params) });
    if (method === conflictMethod) {
      return { code: 40901, message: "source conflict" };
    }
    switch (method) {
      case "list_inventory_balances":
        return {
          inventory_balances: [
            {
              subject_type: params.subject_type,
              subject_id: params.subject_id,
              product_sku_id: params.product_sku_id,
              warehouse_id: params.warehouse_id,
              lot_id: params.lot_id,
              unit_id: params.subject_type === "MATERIAL" ? 105 : 105,
              available_quantity: available,
            },
          ],
          total: 1,
        };
      case "create_production_order":
        productionOrderItem = {
          id: 601,
          production_order_id: 600,
          ...structuredClone(params.items[0]),
        };
        if (
          productionOrderItem.route_code === "PLUSH_SEW_HAND_V1" &&
          productionWIPBatches.length === 0
        ) {
          productionWIPBatches.push({
            id: 711,
            production_order_id: 600,
            production_order_item_id: 601,
            production_order_operation_id: 701,
            batch_no: "WIP-600-601-10-001",
            flow_type: "NORMAL",
            execution_mode: null,
            status: "PLANNED",
            version: 1,
            quantity: params.items[0].planned_quantity,
          });
        }
        return {
          production_order: { id: 600, status: "DRAFT", version: 1 },
          production_order_items: [structuredClone(productionOrderItem)],
          production_material_requirements: [],
          material_requirements_state: "NOT_REQUIRED",
        };
      case "release_production_order":
        return {
          production_order: { id: 600, status: "RELEASED", version: 2 },
          production_order_items: [structuredClone(productionOrderItem)],
          production_material_requirements: [
            {
              id: 602,
              material_id: 201,
              unit_id: 105,
              remaining_quantity: "2",
            },
          ],
          material_requirements_state: "READY",
        };
      case "get_production_wip":
        assert.equal(domain, "production_wip");
        assert.equal(params.production_order_id, 600);
        return productionWIPAggregate();
      case "execute_production_wip_action": {
        assert.equal(domain, "production_wip");
        assert.equal(params.production_order_id, 600);
        if (params.action === "CONFIRM_PACKAGING_MATERIAL") {
          assert.equal(params.production_order_item_id, 601);
          assert.equal(params.expected_version, packagingConfirmation.version);
          packagingConfirmation.status = "CONFIRMED";
          packagingConfirmation.version += 1;
          packagingConfirmation.packaging_version_snapshot =
            params.packaging_version_snapshot;
          return productionWIPAggregate();
        }
        const batch = productionWIPBatches.find(
          (item) => item.id === params.production_wip_batch_id,
        );
        assert.ok(batch, `missing WIP batch ${params.production_wip_batch_id}`);
        assert.equal(params.expected_version, batch.version);
        const operation = productionWIPOperations.find(
          (item) => item.id === batch.production_order_operation_id,
        );
        if (params.action === "ASSIGN_EXECUTION") {
          assert.equal(batch.status, "PLANNED");
          if (operation.operation_code === "FABRIC_PROCESSING") {
            assert.equal(params.execution_mode, "OUTSOURCED");
            assert.deepEqual(params.outsourcing_allocations, [
              {
                outsourcing_order_item_id: 312,
                production_order_material_requirement_id: 602,
              },
            ]);
          } else {
            assert.equal(params.execution_mode, "IN_HOUSE");
            assert.equal(params.outsourcing_allocations, undefined);
          }
          batch.execution_mode = params.execution_mode;
          batch.version += 1;
        } else if (params.action === "START_OPERATION") {
          assert.equal(batch.status, "PLANNED");
          assert.ok(
            new Set(["IN_HOUSE", "OUTSOURCED"]).has(batch.execution_mode),
          );
          batch.status =
            batch.execution_mode === "OUTSOURCED"
              ? "OUTSOURCED"
              : "IN_PROGRESS";
          batch.version += 1;
        } else if (params.action === "COMPLETE_OPERATION") {
          assert.equal(batch.status, "IN_PROGRESS");
          const gates = qualityGatesByOperation.get(operation.operation_code);
          batch.status = gates.length > 0 ? "WAITING_QUALITY" : "ACCEPTED";
          batch.version += 1;
          if (gates.length > 0) {
            productionWIPQualities.set(batch.id, [
              {
                id: nextID++,
                production_wip_batch_id: batch.id,
                gate_code: gates[0],
                status: "DRAFT",
              },
            ]);
          }
        } else if (params.action === "RECEIVE_OUTSOURCING_RETURN") {
          assert.equal(batch.status, "OUTSOURCED");
          assert.equal(operation.operation_code, "FABRIC_PROCESSING");
          batch.status = "WAITING_QUALITY";
          batch.version += 1;
          productionWIPQualities.set(batch.id, [
            {
              id: nextID++,
              production_wip_batch_id: batch.id,
              gate_code: qualityGatesByOperation.get(
                operation.operation_code,
              )[0],
              status: "DRAFT",
            },
          ]);
        } else if (params.action === "TRANSFER_TO_NEXT_OPERATION") {
          assert.equal(batch.status, "ACCEPTED");
          const target = productionWIPOperations.find(
            (item) => item.id === params.target_operation_id,
          );
          assert.ok(target);
          assert.equal(params.quantity, batch.quantity);
          batch.version += 1;
          productionWIPBatches.push({
            id: 711 + productionWIPBatches.length,
            production_order_id: 600,
            production_order_item_id: 601,
            production_order_operation_id: target.id,
            batch_no: `WIP-600-601-${target.step_no}-001`,
            flow_type: "NORMAL",
            execution_mode: null,
            status: "PLANNED",
            version: 1,
            quantity: params.quantity,
          });
        } else {
          assert.fail(`unexpected production WIP action ${params.action}`);
        }
        return productionWIPAggregate();
      }
      case "create_production_material_issue_from_order":
      case "create_production_rework_from_completion":
        return createRecord("production_fact", {}, method);
      case "create_production_completion_from_order":
        return createRecord(
          "production_fact",
          {
            production_wip_batch_id: params.production_wip_batch_id ?? null,
          },
          method,
        );
      case "post_production_fact": {
        const record = records.get(params.id);
        assert.equal(record?.key, "production_fact");
        assert.equal(params.expected_version, record.item.version);
        record.item.status = "POSTED";
        record.item.version += 1;
        return { production_fact: record.item };
      }
      case "create_outsourcing_material_issue_from_order":
      case "create_outsourcing_return_receipt_from_order":
        return createRecord("outsourcing_fact", {}, method);
      case "post_outsourcing_fact": {
        const record = records.get(params.id);
        assert.equal(record?.key, "outsourcing_fact");
        assert.equal(params.expected_version, record.item.version);
        record.item.status = "POSTED";
        record.item.version += 1;
        return { outsourcing_fact: record.item };
      }
      case "list_outsourcing_return_quality_inspections":
        return {
          quality_inspections: outsourcingQualityInspection
            ? [outsourcingQualityInspection]
            : [],
          total: outsourcingQualityInspection ? 1 : 0,
        };
      case "list_production_stage_quality_inspections": {
        const inspections =
          productionWIPQualities.get(params.production_wip_batch_id) || [];
        return {
          quality_inspections: structuredClone(inspections),
          total: inspections.length,
        };
      }
      case "create_quality_inspection_from_outsourcing_return":
        outsourcingQualityInspection = { id: nextID++, status: "DRAFT" };
        return { quality_inspection: outsourcingQualityInspection };
      case "submit_quality_inspection":
        for (const inspections of productionWIPQualities.values()) {
          const wipInspection = inspections.find(
            (item) => item.id === params.id,
          );
          if (wipInspection) {
            assert.equal(wipInspection.status, "DRAFT");
            wipInspection.status = "SUBMITTED";
            return { quality_inspection: structuredClone(wipInspection) };
          }
        }
        if (finishedGoodsQualityInspection?.id === params.id) {
          finishedGoodsQualityInspection.status = "SUBMITTED";
          return { quality_inspection: finishedGoodsQualityInspection };
        }
        outsourcingQualityInspection.status = "SUBMITTED";
        return { quality_inspection: outsourcingQualityInspection };
      case "pass_quality_inspection":
        assert.equal(params.defect_rate_operator, "APPROX");
        assert.equal(typeof params.defect_rate_percent, "string");
        for (const [batchID, inspections] of productionWIPQualities) {
          const wipInspection = inspections.find(
            (item) => item.id === params.id,
          );
          if (!wipInspection) continue;
          assert.equal(params.defect_rate_percent, "0");
          assert.equal(wipInspection.status, "SUBMITTED");
          wipInspection.status = "PASSED";
          wipInspection.result = "PASS";
          const batch = productionWIPBatches.find(
            (item) => item.id === batchID,
          );
          const operation = productionWIPOperations.find(
            (item) => item.id === batch.production_order_operation_id,
          );
          const gates = qualityGatesByOperation.get(operation.operation_code);
          const nextGate = gates[inspections.length];
          if (nextGate) {
            inspections.push({
              id: nextID++,
              production_wip_batch_id: batch.id,
              gate_code: nextGate,
              status: "DRAFT",
            });
          } else {
            batch.status = "ACCEPTED";
            batch.version += 1;
          }
          return { quality_inspection: structuredClone(wipInspection) };
        }
        assert.equal(params.defect_rate_percent, "5");
        if (finishedGoodsQualityInspection?.id === params.id) {
          finishedGoodsQualityInspection.status = "PASSED";
          finishedGoodsQualityInspection.result = "PASS";
          finishedGoodsQualityInspection.defect_rate_operator =
            params.defect_rate_operator;
          finishedGoodsQualityInspection.defect_rate_percent =
            params.defect_rate_percent;
          return { quality_inspection: finishedGoodsQualityInspection };
        }
        outsourcingQualityInspection.status = "PASSED";
        outsourcingQualityInspection.result = "PASS";
        outsourcingQualityInspection.defect_rate_operator =
          params.defect_rate_operator;
        outsourcingQualityInspection.defect_rate_percent =
          params.defect_rate_percent;
        return { quality_inspection: outsourcingQualityInspection };
      case "create_stock_reservation_from_sales_order":
        return createRecord("stock_reservation", { status: "ACTIVE" });
      case "create_shipment_with_items": {
        const created = createRecord("shipment", {
          shipment_no: params.shipment_no,
          finance_release_status: "PENDING",
        });
        return created;
      }
      case "create_finished_goods_quality_inspection_draft":
        finishedGoodsQualityInspection ||= {
          id: nextID++,
          inspection_no: params.inspection_no,
          status: "DRAFT",
          source_type: "SHIPMENT",
          source_id: params.shipment_id,
          inspection_type: "FINISHED_GOODS",
          inventory_lot_id: params.finished_goods_lot_id,
        };
        return { quality_inspection: finishedGoodsQualityInspection };
      case "get_quality_inspection":
        assert.equal(params.id, finishedGoodsQualityInspection.id);
        return { quality_inspection: finishedGoodsQualityInspection };
      case "start_finished_goods_delivery_process": {
        const shipmentRecord = records.get(params.shipment_id);
        assert.equal(shipmentRecord?.key, "shipment");
        if (!deliveryProcess) {
          assert.equal(
            finishedGoodsQualityInspection?.status,
            "PASSED",
            "delivery process requires an independently passed inspection",
          );
          assert.equal(
            finishedGoodsQualityInspection?.result,
            "PASS",
            "delivery process requires an independently passed inspection result",
          );
          deliveryProcess = {
            id: nextID++,
            process_key: "finished_goods_delivery",
            business_ref_type: "shipment",
            business_ref_id: params.shipment_id,
            business_ref_no: shipmentRecord.item.shipment_no,
            status: "active",
          };
          deliveryNodes = [
            {
              id: nextID++,
              node_key: "shipment_finance_approval",
              node_type: "approval",
              status: "active",
              version: 1,
            },
            {
              id: nextID++,
              node_key: "shipment_finance_release",
              node_type: "domain_command",
              status: "waiting",
              version: 1,
            },
            {
              id: nextID++,
              node_key: "end",
              node_type: "end",
              status: "waiting",
              version: 1,
            },
            {
              id: nextID++,
              node_key: "shipment_finance_reject",
              node_type: "domain_command",
              status: "waiting",
              version: 1,
            },
            {
              id: nextID++,
              node_key: "shipment_finance_rejected_end",
              node_type: "end",
              status: "waiting",
              version: 1,
            },
          ];
          shipmentFinanceApprovalTask = {
            id: nextID++,
            task_group: "shipment_finance_approval",
            source_type: "shipment",
            source_id: deliveryProcess.business_ref_id,
            process_instance_id: deliveryProcess.id,
            process_node_instance_id: deliveryNodes[0].id,
            required_capability_key: "workflow.task.approve",
            version: 1,
            task_status_key: "ready",
          };
        }
        return {
          process_instance: structuredClone(deliveryProcess),
          started_node: structuredClone(deliveryNodes[0]),
          nodes: structuredClone(deliveryNodes),
        };
      }
      case "list_tasks":
        assert.equal(domain, "workflow");
        return {
          tasks: shipmentFinanceApprovalTask
            ? [structuredClone(shipmentFinanceApprovalTask)]
            : [],
          total: shipmentFinanceApprovalTask ? 1 : 0,
        };
      case "complete_task_action":
        assert.equal(domain, "workflow");
        assert.equal(params.task_id, shipmentFinanceApprovalTask.id);
        assert.equal(
          params.expected_version,
          shipmentFinanceApprovalTask.version,
        );
        assert.equal(params.action_key, "complete");
        shipmentFinanceApprovalTask = {
          ...shipmentFinanceApprovalTask,
          version: shipmentFinanceApprovalTask.version + 1,
          task_status_key: "done",
        };
        deliveryNodes[0] = {
          ...deliveryNodes[0],
          status: "completed",
          version: 2,
        };
        deliveryNodes[1] = {
          ...deliveryNodes[1],
          status: "completed",
          version: 2,
          outcome: "shipment.finance_released",
        };
        deliveryNodes[2] = {
          ...deliveryNodes[2],
          status: "completed",
          version: 2,
          outcome: "completed",
        };
        deliveryProcess.status = "completed";
        records.get(
          deliveryProcess.business_ref_id,
        ).item.finance_release_status = "APPROVED";
        return { task: shipmentFinanceApprovalTask };
      case "get_task_process_context":
        assert.equal(domain, "workflow");
        assert.equal(params.task_id, shipmentFinanceApprovalTask.id);
        return {
          process_context: {
            process_instance: structuredClone(deliveryProcess),
            nodes: structuredClone(deliveryNodes),
          },
        };
      case "get_shipment": {
        const record = records.get(params.id);
        assert.equal(record?.key, "shipment");
        return { shipment: record.item };
      }
      case "ship_shipment": {
        assert.equal(domain, "operational_fact");
        const record = records.get(params.id);
        assert.equal(record?.key, "shipment");
        record.item.status = "SHIPPED";
        return { shipment: record.item };
      }
      case "create_receivable_from_shipment":
        assert.equal(domain, "operational_fact");
        return createRecord(
          "finance_fact",
          {
            fact_no: params.fact_no,
            fact_type: "RECEIVABLE",
            source_type: "SHIPMENT",
            source_id: params.shipment_id,
            idempotency_key: params.idempotency_key,
            amount: "128.88",
            collection_type: "ACCOUNTS_RECEIVABLE",
            payment_term: "EOM_30",
            payment_term_days: 30,
          },
          method,
        );
      case "list_finance_facts": {
        const financeFacts = [...records.values()]
          .filter(
            (record) =>
              record.key === "finance_fact" &&
              record.item.fact_no === params.keyword &&
              record.item.fact_type === params.fact_type,
          )
          .map((record) => record.item);
        return { finance_facts: financeFacts, total: financeFacts.length };
      }
      case "create_invoice_from_shipment":
        assert.match(params.invoice_category, /^[A-Z0-9_]+$/u);
        return createRecord(
          "finance_fact",
          {
            fact_no: params.fact_no,
            fact_type: "INVOICE",
            invoice_category: params.invoice_category,
          },
          method,
        );
      case "create_payable_from_outsourcing_return":
      case "create_payable_from_purchase_receipt":
        return createRecord(
          "finance_fact",
          { fact_no: params.fact_no, fact_type: "PAYABLE" },
          method,
        );
      case "create_reconciliation_from_finance_fact":
        return createRecord(
          "finance_fact",
          { fact_no: params.fact_no, fact_type: "RECONCILIATION" },
          method,
        );
      case "post_finance_fact": {
        const record = records.get(params.id);
        assert.equal(record?.key, "finance_fact");
        assert.equal(params.expected_version, record.item.version);
        record.item.status = "POSTED";
        record.item.version += 1;
        return { finance_fact: record.item };
      }
      default:
        throw new Error(`unexpected RPC ${domain}.${method}`);
    }
  };
  return {
    calls,
    rpc,
    getDeliveryNodes: () => structuredClone(deliveryNodes || []),
  };
}

test("plan is no-write and missing source-driven references are explicitly blocked", () => {
  const plan = buildSourceDrivenFactPlan(sourceReport({ includeFacts: false }));

  assert.equal(plan.mode, "plan");
  assert.equal(plan.writes, false);
  assert.equal(plan.applySupported, true);
  assert.equal(plan.directSQL, false);
  assert.equal(plan.retiredGenericFactWriter, false);
  assert.equal(plan.readyForPreflight, false);
  assert.deepEqual(
    plan.blocked.map((item) => item.phase),
    ["production", "outsourcing", "sales"],
  );
  assert.match(plan.blocked[0].reason, /sourceDrivenFacts is missing/u);
});

test("source candidates retain exact blocked readiness without becoming writable facts", () => {
  const report = sourceReport({ includeFacts: false });
  report.referenceRecords.sourceDrivenFacts = {
    datasetKey: report.datasetKey,
    dataVersion: report.dataVersion,
    runId: report.runId,
    sourceCandidates: {
      production: { salesOrder: { id: 101, status: "ACTIVE" } },
    },
    phaseReadiness: {
      production: {
        status: "blocked",
        reason: "no posted inventory lot was read back",
      },
      outsourcing: { status: "blocked", reason: "no posted lot" },
      sales: { status: "blocked", reason: "no posted lot" },
      purchase: { status: "unsupported", reason: "no posted receipt" },
    },
  };

  const plan = buildSourceDrivenFactPlan(report);
  assert.equal(plan.phases.production.status, "blocked");
  assert.equal(
    plan.phases.production.reason,
    "no posted inventory lot was read back",
  );
  assert.equal(plan.phases.production.sourceCandidate.salesOrder.id, 101);
  assert.equal(plan.phases.purchase.status, "unsupported");
  assert.equal(plan.writes, false);
  assert.equal(plan.applySupported, true);
});

test("source report and nested source references must use the exact dataset identity", () => {
  const mismatchedRefs = sourceReport();
  mismatchedRefs.referenceRecords.sourceDrivenFacts.runId = "OTHER-RUN";
  const plan = buildSourceDrivenFactPlan(mismatchedRefs);
  assert.equal(plan.readyForPreflight, false);
  assert.ok(
    plan.blocked.every((item) => /identity does not match/u.test(item.reason)),
  );
});

test("every allowlisted method is present in the current formal JSON-RPC dispatchers", async () => {
  const files = await Promise.all(
    [
      "../../server/internal/service/jsonrpc_inventory.go",
      "../../server/internal/service/jsonrpc_production_order.go",
      "../../server/internal/service/jsonrpc_production_wip.go",
      "../../server/internal/service/jsonrpc_operational_fact_production.go",
      "../../server/internal/service/jsonrpc_operational_fact_exception.go",
      "../../server/internal/service/jsonrpc_operational_fact_outsourcing.go",
      "../../server/internal/service/jsonrpc_operational_fact_reservation.go",
      "../../server/internal/service/jsonrpc_operational_fact_shipment.go",
      "../../server/internal/service/jsonrpc_operational_fact_finance.go",
      "../../server/internal/service/jsonrpc_quality.go",
      "../../server/internal/service/jsonrpc_workflow_task.go",
      "../../server/internal/service/jsonrpc_customer_config.go",
      "../../server/internal/service/jsonrpc_customer_config_lifecycle.go",
      "../../server/internal/service/jsonrpc_customer_config_runtime_access.go",
      "../../server/internal/service/jsonrpc_customer_config_exception_process.go",
    ].map((relative) => readFile(new URL(relative, import.meta.url), "utf8")),
  );
  const dispatchers = files.join("\n");
  const exceptionProcessDispatcher = files.at(-1);
  assert.match(exceptionProcessDispatcher, /case contract\.startMethod:/u);
  assert.match(exceptionProcessDispatcher, /case contract\.getMethod:/u);
  for (const key of Object.keys(FORMAL_RPC_PARAM_ALLOWLIST)) {
    const method = key.slice(key.indexOf(".") + 1);
    const contractField = method.startsWith("start_")
      ? "startMethod"
      : method.startsWith("get_")
        ? "getMethod"
        : "";
    const declaredByExceptionProcessContract =
      contractField !== "" &&
      new RegExp(`${contractField}:\\s+"${method}"`, "u").test(
        exceptionProcessDispatcher,
      );
    assert.ok(
      dispatchers.includes(`case "${method}"`) ||
        declaredByExceptionProcessContract,
      `${key} must remain a formal dispatcher method`,
    );
  }
});

test("inventory preflight aggregates shared stock grains before any write", async () => {
  const plan = buildSourceDrivenFactPlan(sourceReport());
  const { calls, rpc } = createRPC();
  const result = await preflightSourceDrivenFactPlan(plan, { rpc });

  assert.equal(result.ok, true);
  assert.equal(result.writes, false);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.method === "list_inventory_balances"));
  const sharedMaterial = result.inventory.find(
    (item) => item.subjectType === "MATERIAL",
  );
  assert.equal(sharedMaterial.requiredQuantity, "3");
  assert.deepEqual(sharedMaterial.phases, ["production", "outsourcing"]);
});

test("apply requires a target-bound confirmation before preflight", async () => {
  const plan = buildSourceDrivenFactPlan(sourceReport());
  const { calls, rpc } = createRPC();

  await assert.rejects(
    applySourceDrivenFactPlan(plan, {
      rpc,
      confirmation: "APPLY_SOURCE_DRIVEN_FACT_DATA:wrong",
    }),
    (error) =>
      error instanceof SourceDrivenFactError &&
      error.exitCode === 2 &&
      /confirmation/u.test(error.message),
  );
  assert.equal(calls.length, 0);
});

test("phase-scoped apply executes the formal production chain and returns exact objects", async () => {
  const plan = buildSourceDrivenFactPlan(sourceReport(), {
    instanceKey: "ROW-01",
    enabledPhases: ["production"],
  });
  const { calls, rpc } = createRPC();
  const report = await applySourceDrivenFactPlan(plan, {
    rpc,
    confirmation: sourceDrivenFactConfirmation(plan),
    targetConfirmation: manualAcceptanceTargetConfirmation(plan),
  });

  assert.equal(report.ok, true);
  assert.equal(report.instanceKey, "ROW-01");
  assert.deepEqual(report.enabledPhases, ["production"]);
  assert.equal(report.results.production.order.status, "RELEASED");
  assert.equal(report.results.production.materialIssues.length, 0);
  assert.equal(
    report.results.production.fabricOutsourcingIssue.status,
    "POSTED",
  );
  assert.equal(
    calls.some(
      (call) => call.method === "create_production_material_issue_from_order",
    ),
    false,
  );
  assert.equal(report.results.production.completion.status, "POSTED");
  assert.ok(report.results.production.completion.production_wip_batch_id > 0);
  assert.equal(report.results.production.rework.status, "POSTED");
  assert.ok(calls.some((call) => call.method === "create_production_order"));
  assert.equal(
    calls.some((call) => call.method === "create_shipment_with_items"),
    false,
  );
  assert.deepEqual(
    calls
      .filter((call) => call.method === "execute_production_wip_action")
      .map((call) => call.params.action),
    [
      "ASSIGN_EXECUTION",
      "START_OPERATION",
      "RECEIVE_OUTSOURCING_RETURN",
      "TRANSFER_TO_NEXT_OPERATION",
      "ASSIGN_EXECUTION",
      "START_OPERATION",
      "COMPLETE_OPERATION",
      "TRANSFER_TO_NEXT_OPERATION",
      "ASSIGN_EXECUTION",
      "START_OPERATION",
      "COMPLETE_OPERATION",
      "TRANSFER_TO_NEXT_OPERATION",
      "CONFIRM_PACKAGING_MATERIAL",
      "ASSIGN_EXECUTION",
      "START_OPERATION",
      "COMPLETE_OPERATION",
    ],
  );
  assert.equal(
    calls.filter(
      (call) =>
        call.method === "pass_quality_inspection" &&
        call.params.defect_rate_percent === "0",
    ).length,
    5,
  );
});

test("route-less production remains supported but cannot request a rework source", async () => {
  const report = sourceReport();
  delete report.referenceRecords.sourceDrivenFacts.production.route;
  delete report.referenceRecords.sourceDrivenFacts.production.rework;
  delete report.referenceRecords.sourceDrivenFacts.production.fabricOutsourcing;
  const plan = buildSourceDrivenFactPlan(report, {
    instanceKey: "ROW-ROUTELESS",
    enabledPhases: ["production"],
  });
  const { calls, rpc } = createRPC();
  const applied = await applySourceDrivenFactPlan(plan, {
    rpc,
    confirmation: sourceDrivenFactConfirmation(plan),
    targetConfirmation: manualAcceptanceTargetConfirmation(plan),
  });
  assert.equal(applied.results.production.completion.status, "POSTED");
  assert.equal(
    applied.results.production.completion.production_wip_batch_id,
    null,
  );
  assert.equal(
    calls.some((call) => call.domain === "production_wip"),
    false,
  );

  const invalidReport = sourceReport();
  delete invalidReport.referenceRecords.sourceDrivenFacts.production.route;
  delete invalidReport.referenceRecords.sourceDrivenFacts.production
    .fabricOutsourcing;
  const invalid = buildSourceDrivenFactPlan(invalidReport, {
    instanceKey: "ROW-INVALID-REWORK",
    enabledPhases: ["production"],
  });
  assert.equal(invalid.phases.production.status, "blocked");
  assert.match(invalid.phases.production.reason, /routed WIP completion/u);
});

test("outsourcing quality apply sends the required approximate defect-rate pair", async () => {
  const plan = buildSourceDrivenFactPlan(sourceReport(), {
    instanceKey: "ROW-OUT-QUALITY",
    enabledPhases: ["outsourcing"],
  });
  const { calls, rpc } = createRPC();

  const report = await applySourceDrivenFactPlan(plan, {
    rpc,
    confirmation: sourceDrivenFactConfirmation(plan),
    targetConfirmation: manualAcceptanceTargetConfirmation(plan),
  });

  assert.equal(report.results.outsourcing.qualityInspection.status, "PASSED");
  const decision = calls.find(
    (call) => call.method === "pass_quality_inspection",
  );
  assert.deepEqual(decision?.params, {
    customer_key: "yoyoosun",
    id: report.results.outsourcing.qualityInspection.id,
    result: "PASS",
    defect_rate_operator: "APPROX",
    defect_rate_percent: "5",
    decision_note: "按订单办理。",
  });
  assert.equal(typeof decision.params.defect_rate_percent, "string");
  assert.deepEqual(
    FORMAL_RPC_PARAM_ALLOWLIST["quality.pass_quality_inspection"],
    [
      "customer_key",
      "id",
      "result",
      "defect_rate_operator",
      "defect_rate_percent",
      "decision_note",
    ],
  );
});

test("sales apply keeps quality, finance release, shipping, and receivable on their formal owners", async () => {
  const plan = buildSourceDrivenFactPlan(sourceReport(), {
    instanceKey: "ROW-SALES-RELEASE",
    enabledPhases: ["sales"],
  });
  const { calls, rpc, getDeliveryNodes } = createRPC();

  const report = await applySourceDrivenFactPlan(plan, {
    rpc,
    confirmation: sourceDrivenFactConfirmation(plan),
    targetConfirmation: manualAcceptanceTargetConfirmation(plan),
  });

  assert.equal(report.results.sales.shipment.status, "SHIPPED");
  assert.equal(
    report.results.sales.shipment.finance_release_status,
    "APPROVED",
  );
  assert.equal(report.results.sales.qualityInspection.status, "PASSED");
  assert.deepEqual(
    getDeliveryNodes().map((node) => [node.node_key, node.status]),
    [
      ["shipment_finance_approval", "completed"],
      ["shipment_finance_release", "completed"],
      ["end", "completed"],
      ["shipment_finance_reject", "waiting"],
      ["shipment_finance_rejected_end", "waiting"],
    ],
  );
  assert.equal(
    report.results.sales.approvalTask.required_capability_key,
    "workflow.task.approve",
  );
  const orderedMethods = calls.map((call) => call.method);
  const startIndex = orderedMethods.indexOf(
    "start_finished_goods_delivery_process",
  );
  const createQualityIndex = orderedMethods.indexOf(
    "create_finished_goods_quality_inspection_draft",
  );
  const submitQualityIndex = orderedMethods.indexOf(
    "submit_quality_inspection",
  );
  const qualityIndex = orderedMethods.indexOf("pass_quality_inspection");
  const completeIndex = orderedMethods.indexOf("complete_task_action");
  const contextIndex = orderedMethods.indexOf("get_task_process_context");
  const getShipmentIndex = orderedMethods.indexOf("get_shipment");
  const shipIndex = orderedMethods.indexOf("ship_shipment");
  const receivableIndex = orderedMethods.indexOf(
    "create_receivable_from_shipment",
  );
  assert.ok(startIndex >= 0);
  assert.ok(createQualityIndex >= 0);
  assert.ok(submitQualityIndex > createQualityIndex);
  assert.ok(qualityIndex > submitQualityIndex);
  assert.ok(startIndex > qualityIndex);
  assert.ok(completeIndex > startIndex);
  assert.ok(contextIndex > completeIndex);
  assert.ok(getShipmentIndex > contextIndex);
  assert.ok(shipIndex > getShipmentIndex);
  assert.ok(receivableIndex > shipIndex);
  assert.equal(orderedMethods.includes("submit_shipment_release"), false);
  assert.equal(
    orderedMethods.includes("execute_finished_goods_delivery_quality_decide"),
    false,
  );
  assert.equal(
    orderedMethods.includes("execute_finished_goods_delivery_shipment_ship"),
    false,
  );
  assert.equal(
    orderedMethods.includes("execute_finished_goods_delivery_receivable_lead"),
    false,
  );
  const completion = calls[completeIndex];
  assert.equal(completion.domain, "workflow");
  assert.equal(
    completion.params.payload.surface_key,
    "shipment-finance-approval",
  );
  assert.deepEqual(Object.keys(completion.params).sort(), [
    "action_key",
    "expected_version",
    "idempotency_key",
    "payload",
    "task_id",
  ]);
  assert.equal(calls[contextIndex].domain, "workflow");
  assert.deepEqual(calls[contextIndex].params, {
    task_id: report.results.sales.approvalTask.id,
  });
  assert.equal(calls[getShipmentIndex].domain, "operational_fact");
  assert.deepEqual(calls[getShipmentIndex].params, {
    id: report.results.sales.shipment.id,
  });
  assert.equal(calls[shipIndex].domain, "operational_fact");
  assert.equal(calls[receivableIndex].domain, "operational_fact");
  assert.deepEqual(
    FORMAL_RPC_PARAM_ALLOWLIST["workflow.get_task_process_context"],
    ["task_id"],
  );
  assert.deepEqual(
    FORMAL_RPC_PARAM_ALLOWLIST["operational_fact.get_shipment"],
    ["id"],
  );
  assert.deepEqual(
    FORMAL_RPC_PARAM_ALLOWLIST["operational_fact.ship_shipment"],
    ["customer_key", "id"],
  );
});

test("sales replay reuses an already posted source receivable without reposting it", async () => {
  const plan = buildSourceDrivenFactPlan(sourceReport(), {
    instanceKey: "ROW-SALES-POSTED",
    enabledPhases: ["sales"],
  });
  const { calls, rpc } = createRPC({
    prepostedCreateMethods: new Set(["create_receivable_from_shipment"]),
  });

  const report = await applySourceDrivenFactPlan(plan, {
    rpc,
    confirmation: sourceDrivenFactConfirmation(plan),
    targetConfirmation: manualAcceptanceTargetConfirmation(plan),
  });

  assert.equal(report.results.sales.receivable.finance.status, "POSTED");
  assert.equal(
    calls.some(
      (call) =>
        call.method === "post_finance_fact" &&
        call.params.id === report.results.sales.receivable.finance.id,
    ),
    false,
  );
});

test("idempotent create responses already POSTED are reused without a second post", async () => {
  const plan = buildSourceDrivenFactPlan(sourceReport(), {
    instanceKey: "ROW-POSTED",
    enabledPhases: ["production"],
  });
  const prepostedCreateMethods = new Set([
    "create_outsourcing_material_issue_from_order",
    "create_production_completion_from_order",
    "create_production_rework_from_completion",
  ]);
  const { calls, rpc } = createRPC({ prepostedCreateMethods });

  const report = await applySourceDrivenFactPlan(plan, {
    rpc,
    confirmation: sourceDrivenFactConfirmation(plan),
    targetConfirmation: manualAcceptanceTargetConfirmation(plan),
  });

  assert.equal(
    report.results.production.fabricOutsourcingIssue.status,
    "POSTED",
  );
  assert.equal(report.results.production.completion.status, "POSTED");
  assert.equal(report.results.production.rework.status, "POSTED");
  assert.equal(
    calls.some((call) => call.method === "post_production_fact"),
    false,
  );
  assert.equal(
    calls.some((call) => call.method === "post_outsourcing_fact"),
    false,
  );
});

test("instance keys and enabled phases participate in deterministic identities", () => {
  const report = sourceReport();
  const first = buildSourceDrivenFactPlan(report, {
    instanceKey: "ROW-01",
    enabledPhases: ["sales"],
  });
  const second = buildSourceDrivenFactPlan(report, {
    instanceKey: "ROW-02",
    enabledPhases: ["sales"],
  });
  assert.notEqual(
    first.identities.sales.shipment.businessNo,
    second.identities.sales.shipment.businessNo,
  );
  assert.equal(first.phases.production.status, "disabled");
  assert.equal(first.readyForPreflight, true);
  assert.notEqual(
    sourceDrivenFactConfirmation(first),
    sourceDrivenFactConfirmation(second),
  );
});

test("visible fact numbers are short, deterministic, unique, and versioned", () => {
  const report = sourceReport();
  const first = buildSourceDrivenFactPlan(report, {
    instanceKey: "ROW-01",
  });
  const replay = buildSourceDrivenFactPlan(structuredClone(report), {
    instanceKey: "ROW-01",
  });
  const collectIdentities = (value) => {
    if (!value || typeof value !== "object") return [];
    if (typeof value.businessNo === "string") return [value];
    return Object.values(value).flatMap(collectIdentities);
  };
  const identities = collectIdentities(first.identities);
  assert.ok(identities.length > 0);
  assert.equal(
    new Set(identities.map((identity) => identity.businessNo)).size,
    identities.length,
  );
  assert.equal(
    identities.every(
      (identity) =>
        identity.businessNo.length <= 28 &&
        /^TEST-YS-\d{6}V\d+-[A-Z]{2,5}\d{3,6}$/u.test(identity.businessNo) &&
        !/SIM-SDF|PRODUCTION|OUTSOURCING|RECONCILIATION|[A-F0-9]{12,}/u.test(
          identity.businessNo,
        ),
    ),
    true,
  );
  assert.deepEqual(replay.identities, first.identities);

  const nextReport = structuredClone(report);
  nextReport.dataVersion = "2026.07.15-v3";
  nextReport.referenceRecords.sourceDrivenFacts.dataVersion =
    nextReport.dataVersion;
  const next = buildSourceDrivenFactPlan(nextReport, {
    instanceKey: "ROW-01",
  });
  assert.notEqual(
    next.identities.sales.shipment.businessNo,
    first.identities.sales.shipment.businessNo,
  );
  assert.notEqual(
    next.identities.sales.shipment.idempotencyKey,
    first.identities.sales.shipment.idempotencyKey,
  );

  assert.throws(
    () =>
      manualAcceptanceBusinessNo({
        dataVersion: "2026.07.15-v3",
        code: "UNKNOWN",
        sequence: 1,
      }),
    /not registered/u,
  );
});

test("explicit phase sources replace the source report's pre-inventory blocked readiness", () => {
  const report = sourceReport();
  const production = structuredClone(
    report.referenceRecords.sourceDrivenFacts.production,
  );
  report.referenceRecords.sourceDrivenFacts.phaseReadiness = {
    production: {
      status: "blocked",
      reason: "source apply ran before inventory was posted",
    },
  };
  delete report.referenceRecords.sourceDrivenFacts.production;

  const plan = buildSourceDrivenFactPlan(report, {
    instanceKey: "ROW-03",
    enabledPhases: ["production"],
    production,
  });
  assert.equal(plan.phases.production.status, "planned");
  assert.equal(plan.readyForPreflight, true);
});

test("registered 133 apply rejects missing target confirmation before RPC", async () => {
  const report = sourceReport();
  report.dataVersion = CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION;
  report.runId = CURRENT_MANUAL_ACCEPTANCE_RUN_ID;
  report.target = "customer-trial-133";
  report.backendURL = "http://127.0.0.1:18375";
  report.databaseName = CUSTOMER_TRIAL_133_DATABASE;
  report.referenceRecords.sourceDrivenFacts.dataVersion = report.dataVersion;
  report.referenceRecords.sourceDrivenFacts.runId = report.runId;
  const plan = buildSourceDrivenFactPlan(report, {
    instanceKey: "ROW-REMOTE",
    enabledPhases: ["production"],
  });
  const { calls, rpc } = createRPC();

  await assert.rejects(
    applySourceDrivenFactPlan(plan, {
      rpc,
      confirmation: sourceDrivenFactConfirmation(plan),
    }),
    /MANUAL_ACCEPTANCE_TARGET_CONFIRM/u,
  );
  assert.equal(calls.length, 0);
});
