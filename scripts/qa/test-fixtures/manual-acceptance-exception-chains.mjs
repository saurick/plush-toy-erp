export function exceptionChainFixture() {
  const process = (sourceID, sourceType, commandKey, roles) => {
    const id = sourceID + 1000;
    return {
      context: {
        process_instance: {
          id,
          business_ref_id: sourceID,
          business_ref_type: sourceType,
        },
        nodes: [
          ...roles.map((role, index) => ({
            id: id + 100 + index,
            process_instance_id: id,
            node_key: role,
            status: "completed",
          })),
          {
            id: id + 200,
            process_instance_id: id,
            node_key: commandKey,
            status: "completed",
          },
        ],
      },
      tasks: roles.map((role, index) => ({
        id: id + 300 + index,
        source_id: sourceID,
        source_type: sourceType,
        process_instance_id: id,
        process_node_instance_id: id + 100 + index,
        owner_role_key: role,
        task_status_key: "done",
      })),
    };
  };
  const inventoryProcesses = [1, 2].map((id) =>
    process(id, "inventory_operation", "post_inventory_adjustment", [
      "boss",
      "warehouse",
    ]),
  );
  const productionProcesses = [6, 7].map((id) =>
    process(
      id,
      "production_exception_decision",
      "execute_production_exception",
      ["boss", "production"],
    ),
  );
  const grain = {
    subject_type: "MATERIAL",
    subject_id: 101,
    from_warehouse_id: 102,
    from_lot_id: 103,
    unit_id: 104,
    adjustment_quantity: "1",
  };
  const txn = {
    subject_type: "MATERIAL",
    subject_id: 101,
    warehouse_id: 102,
    lot_id: 103,
    unit_id: 104,
    quantity: "1",
    source_type: "INVENTORY_OPERATION",
  };
  return {
    inventoryAdjustment: {
      records: ["POSTED", "CANCELLED"].map((status, index) => ({
        id: index + 1,
        operation_type: "MANUAL_ADJUSTMENT",
        status,
        items: [{ id: index + 10, ...grain }],
      })),
      processes: inventoryProcesses.map((item) => item.context),
      tasks: inventoryProcesses.flatMap((item) => item.tasks),
      txns: [
        { ...txn, id: 11, source_id: 1, direction: 1 },
        { ...txn, id: 12, source_id: 2, direction: 1 },
        { ...txn, id: 13, source_id: 2, direction: -1, reversal_of_txn_id: 12 },
      ],
    },
    purchaseDisposition: {
      records: ["POSTED", "CANCELLED", "POSTED"].map((status, index) => ({
        id: index + 3,
        status,
        disposition_type: index === 2 ? "REPLACE" : "RETURN_TO_VENDOR",
        purchase_receipt_id: 201 + index,
        ...(index === 2 ? { replacement_receipt_id: 204 } : {}),
      })),
      sourceReceipts: [201, 202, 203].map((id) => ({ id, status: "DRAFT" })),
      replacementReceipts: [{ id: 204, status: "POSTED" }],
      replacementInspections: [
        { id: 205, purchase_receipt_id: 204, status: "PASSED" },
      ],
    },
    productionException: {
      records: ["WIP_CONCESSION", "SCRAP"].map((decision_type, index) => ({
        id: index + 6,
        decision_type,
        status: "APPROVED",
        execution_status: "REVERSED",
        production_wip_batch_id: 301,
        quality_inspection_id: 302,
        executed_at: 1,
        reversed_at: 2,
      })),
      batch: {
        id: 301,
        status: "REJECTED",
        flow_type: "REWORK",
        origin_rework_fact_id: 303,
      },
      inspection: { id: 302, status: "REJECTED" },
      rework: { id: 303 },
      processes: productionProcesses.map((item) => item.context),
      tasks: productionProcesses.flatMap((item) => item.tasks),
    },
    outsourcingDisposition: {
      records: [
        {
          id: 8,
          disposition_type: "RETURN_TO_VENDOR",
          status: "CANCELLED",
          outsourcing_return_fact_id: 404,
        },
        {
          id: 9,
          disposition_type: "REWORK",
          status: "POSTED",
          outsourcing_return_fact_id: 404,
          result_wip_batch_id: 402,
        },
      ],
      batch: { id: 401, flow_type: "REWORK", origin_rework_fact_id: 406 },
      reworkBatch: { id: 402, flow_type: "REWORK", source_batch_id: 401 },
      allocation: {
        id: 403,
        production_wip_batch_id: 401,
        outsourcing_order_item_id: 411,
      },
      rework: { id: 406, status: "POSTED", fact_type: "REWORK" },
      returnFact: {
        id: 404,
        status: "POSTED",
        lot_id: 410,
        subject_type: "PRODUCT",
        source_line_id: 411,
      },
      inspection: {
        id: 405,
        status: "REJECTED",
        source_type: "OUTSOURCING_FACT",
        source_id: 404,
      },
      wipInspection: { id: 407, status: "REJECTED" },
      txns: [
        {
          id: 408,
          source_type: "OUTSOURCING_RETURN_DISPOSITION",
          source_id: 8,
          lot_id: 410,
          quantity: "3",
          direction: -1,
        },
        {
          id: 409,
          source_type: "OUTSOURCING_RETURN_DISPOSITION",
          source_id: 8,
          lot_id: 410,
          quantity: "3",
          direction: 1,
          reversal_of_txn_id: 408,
        },
      ],
    },
  };
}
