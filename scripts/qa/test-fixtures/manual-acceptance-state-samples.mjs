import { MANUAL_ACCEPTANCE_CASH_PAYMENT_SCENARIOS } from "../manual-acceptance-cash-payment-data.mjs";
import { buildManualAcceptanceWIPExceptionScenarios } from "../manual-acceptance-exception-chain-data.mjs";

const REPORT_FIELDS = {
  payment_no: "paymentNo",
  counterparty_type: "counterpartyType",
  counterparty_id: "counterpartyID",
  source_type: "sourceType",
  source_id: "sourceID",
  refund_of_payment_id: "refundOfPaymentID",
  decision_no: "decisionNo",
  decision_type: "decisionType",
  execution_status: "executionStatus",
  production_order_id: "productionOrderID",
  production_order_item_id: "productionOrderItemID",
  production_wip_batch_id: "productionWIPBatchID",
  quality_inspection_id: "qualityInspectionID",
  target_operation_id: "targetOperationID",
  target_supplier_id: "targetSupplierID",
  requested_quantity: "requestedQuantity",
  approved_quantity: "approvedQuantity",
  production_order_no: "productionOrderNo",
  process_instance_id: "processInstanceID",
  approval_task_id: "approvalTaskID",
  approval_task_code: "approvalTaskCode",
  approval_process_node_id: "approvalProcessNodeID",
};
const reportRecord = (record, camel) =>
  camel
    ? Object.fromEntries(
        Object.entries(record).map(([key, value]) => [
          REPORT_FIELDS[key] || key,
          value,
        ]),
      )
    : record;

export function cashPaymentReferences({ camel = false } = {}) {
  return MANUAL_ACCEPTANCE_CASH_PAYMENT_SCENARIOS.map(
    (sample, index, recipes) =>
      reportRecord(
        {
          id: 126_100 + index,
          payment_no: `SIM-SDF-${sample.number.code}-${sample.number.sequence}`,
          kind: sample.kind,
          status: sample.status,
          direction: sample.direction,
          counterparty_type:
            sample.sourceType === "sales_order" ? "CUSTOMER" : "SUPPLIER",
          counterparty_id: 10_010 + sample.copy,
          currency: "CNY",
          amount: sample.kind === "ADVANCE" ? "100" : "1",
          source_type: sample.kind === "ADVANCE" ? sample.sourceType : null,
          source_id: sample.kind === "ADVANCE" ? 501_000 + index : null,
          refund_of_payment_id:
            sample.kind === "REFUND"
              ? 126_100 +
                recipes.findIndex((parent) => parent.key === sample.parentKey)
              : null,
          allocations: [],
          available_amount:
            sample.status === "POSTED" && sample.kind === "ADVANCE"
              ? "99"
              : "0",
          refunded_amount:
            sample.status === "POSTED" && sample.kind === "ADVANCE" ? "1" : "0",
          reversed_at: sample.status === "REVERSED" ? 123 : null,
          reversed_by: sample.status === "REVERSED" ? 456 : null,
        },
        camel,
      ),
  );
}

export function wipExceptionReferences({ camel = false } = {}) {
  return buildManualAcceptanceWIPExceptionScenarios().map((sample, index) => {
    const cancelled = sample.status === "CANCELLED";
    const instance = 310_100 + index,
      node = 330_100 + index;
    return reportRecord(
      {
        id: 15_100 + index,
        decision_no: `SIM-SDF-SCYC-${sample.sequence}`,
        decision_type: sample.type,
        status: sample.status,
        execution_status: "PENDING",
        production_order_id: 1001 + sample.sourceIndex,
        production_order_item_id: 1101 + sample.sourceIndex,
        production_wip_batch_id: 301_000 + index,
        quality_inspection_id: 401_000 + index,
        target_operation_id: [
          "REWORK_ORIGINAL",
          "REWORK_SWITCH",
          "REMAKE",
        ].includes(sample.type)
          ? 201_000 + index
          : null,
        target_supplier_id: ["REWORK_SWITCH", "REMAKE"].includes(sample.type)
          ? 208
          : null,
        requested_quantity: "1",
        approved_quantity: sample.status === "APPROVED" ? "1" : null,
        production_order_no: `SIM-SDF-SC-${sample.sourceIndex + 1}`,
        process_instance_id: cancelled ? null : instance,
        approval_task_id: cancelled ? null : 320_100 + index,
        approval_process_node_id: cancelled ? null : node,
        approval_task_code: cancelled
          ? null
          : `PROC-${instance}-NODE-${node}-A1`,
      },
      camel,
    );
  });
}
