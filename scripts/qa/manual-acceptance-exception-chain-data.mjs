import assert from "node:assert/strict";

import { manualAcceptanceBusinessNo } from "./manual-acceptance-source-driven-facts.mjs";

const NOTE = "模拟业务链核验，不代表真实客户业务。";

function businessNo(plan, code, sequence) {
  return manualAcceptanceBusinessNo({
    dataVersion: plan.dataVersion,
    code,
    sequence,
  });
}

function identity(plan, name) {
  return `manual-acceptance:${plan.dataVersion}:exception-chain:${name}`;
}

function requireRecord(record, label) {
  assert.ok(
    Number.isSafeInteger(record?.id) && record.id > 0,
    `${label} is missing`,
  );
  return record;
}

function match(record, expected, label) {
  requireRecord(record, label);
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(record[key], value, `${label}.${key} source or state drifted`);
  }
  return record;
}

async function call(rpc, actor, domain, method, params = {}) {
  return rpc({ actor, domain, method, params });
}

async function list(rpc, actor, domain, method, key, params = {}) {
  const rows = [];
  for (let offset = 0; ; offset += 100) {
    const data = await call(rpc, actor, domain, method, {
      ...params,
      limit: 100,
      offset,
    });
    assert.ok(Array.isArray(data[key]), `${method}.${key} is missing`);
    rows.push(...data[key]);
    if (rows.length >= Number(data.total ?? rows.length)) return rows;
    assert.ok(data[key].length > 0, `${method} returned a truncated page`);
  }
}

function exact(rows, field, value) {
  const matches = rows.filter((row) => row[field] === value);
  assert.ok(matches.length <= 1, `${field}=${value} is not unique`);
  return matches[0];
}

function processNode(data, key) {
  const node = exact(data?.process_context?.nodes || [], "node_key", key);
  requireRecord(node, `process node ${key}`);
  assert.equal(
    node.process_instance_id,
    data.process_context.process_instance.id,
  );
  return node;
}

async function readProcess(rpc, actor, kind, idKey, id) {
  const data = await call(
    rpc,
    actor,
    "customer_config",
    `get_${kind}_approval_process`,
    { [idKey]: id },
  );
  if (data.process_context) {
    assert.equal(data.process_context.process_instance.business_ref_id, id);
    assert.equal(data.source_readback.id, id);
  }
  return data;
}

async function ensureProcess(rpc, plan, actor, kind, idKey, id, apply) {
  let data = await readProcess(rpc, actor, kind, idKey, id);
  if (!data.process_context && apply) {
    await call(
      rpc,
      actor,
      "customer_config",
      `start_${kind}_approval_process`,
      {
        [idKey]: id,
        idempotency_key: identity(plan, `${kind}:${id}:process`),
      },
    );
    data = await readProcess(rpc, actor, kind, idKey, id);
  }
  requireRecord(data?.process_context?.process_instance, `${kind} process`);
  return data;
}

async function completeHuman(
  rpc,
  plan,
  data,
  { actor, sourceType, sourceID, nodeKey, decision, apply },
) {
  const node = processNode(data, nodeKey);
  const tasks = await list(rpc, actor, "workflow", "list_tasks", "tasks", {
    source_type: sourceType,
    source_id: sourceID,
  });
  const matches = tasks.filter(
    (task) =>
      task.process_instance_id === node.process_instance_id &&
      task.process_node_instance_id === node.id,
  );
  assert.equal(
    matches.length,
    1,
    `${nodeKey} must have exactly one bound task`,
  );
  let task = matches[0];
  match(
    task,
    { source_type: sourceType, source_id: sourceID, owner_role_key: actor },
    nodeKey,
  );
  if (node.status === "active" && task.task_status_key === "ready" && apply) {
    task = (
      await call(rpc, actor, "workflow", "complete_task_action", {
        task_id: task.id,
        expected_version: task.version,
        idempotency_key: identity(plan, `${nodeKey}:${task.id}:complete`),
        action_key: "complete",
        reason: NOTE,
        payload: {
          surface_key: "workflow_business_module",
          feedback: NOTE,
          ...(decision
            ? { process_decision: { reason: NOTE, ...decision } }
            : {}),
        },
      })
    ).task;
  }
  assert.equal(task.task_status_key, "done", `${nodeKey} task is not done`);
  return task;
}

async function executeNode(rpc, plan, data, actor, method, nodeKey, idKey, id) {
  const node = processNode(data, nodeKey);
  assert.equal(node.status, "active", `${nodeKey} is not active`);
  return call(rpc, actor, "customer_config", method, {
    [idKey]: id,
    process_instance_id: node.process_instance_id,
    process_node_instance_id: node.id,
    expected_version: node.version,
    idempotency_key: identity(plan, `${nodeKey}:${id}:${node.id}`),
    ...(method === "execute_production_exception_process"
      ? { reason: NOTE }
      : {}),
  });
}

async function inventoryTransactions(rpc, lotID) {
  return list(
    rpc,
    "warehouse",
    "inventory",
    "list_inventory_txns",
    "inventory_txns",
    { lot_id: lotID },
  );
}

export async function ensureInventoryAdjustmentChain({
  rpc,
  plan,
  purchase,
  apply,
}) {
  const receipt = purchase.purchaseReceipts.find(
    (row) => row.status === "POSTED" && row.items?.some((item) => item.lot_id),
  );
  requireRecord(receipt, "inventory adjustment source receipt");
  const source = receipt.items.find((item) => item.lot_id);
  const grain = {
    subject_type: "MATERIAL",
    subject_id: source.material_id,
    unit_id: source.unit_id,
    from_warehouse_id: source.warehouse_id,
    from_lot_id: source.lot_id,
  };
  const records = [];
  const processes = [];
  const tasks = [];
  for (const [index, finalStatus] of ["POSTED", "CANCELLED"].entries()) {
    const operationNo = businessNo(plan, "KCTZ", index + 1);
    let operation = exact(
      await list(
        rpc,
        "warehouse",
        "inventory",
        "list_inventory_operations",
        "inventory_operations",
        { operation_type: "MANUAL_ADJUSTMENT" },
      ),
      "operation_no",
      operationNo,
    );
    if (!operation && apply) {
      operation = (
        await call(
          rpc,
          "warehouse",
          "inventory",
          "create_inventory_operation",
          {
            operation_no: operationNo,
            operation_type: "MANUAL_ADJUSTMENT",
            reason: NOTE,
            idempotency_key: identity(plan, operationNo),
            items: [
              { line_no: "1", ...grain, adjustment_quantity: "1", note: NOTE },
            ],
          },
        )
      ).inventory_operation;
    }
    requireRecord(operation, operationNo);
    operation = (
      await call(rpc, "warehouse", "inventory", "get_inventory_operation", {
        id: operation.id,
      })
    ).inventory_operation;
    match(
      operation,
      { operation_no: operationNo, operation_type: "MANUAL_ADJUSTMENT" },
      operationNo,
    );
    assert.equal(operation.items.length, 1);
    match(
      operation.items[0],
      { ...grain, adjustment_quantity: "1" },
      operationNo,
    );
    let data = await ensureProcess(
      rpc,
      plan,
      "warehouse",
      "inventory_adjustment",
      "inventory_operation_id",
      operation.id,
      apply,
    );
    if (operation.status === "DRAFT" && apply) {
      data = await executeNode(
        rpc,
        plan,
        data,
        "warehouse",
        "execute_inventory_adjustment_submit",
        "submit_inventory_adjustment",
        "inventory_operation_id",
        operation.id,
      );
      operation = data.source_readback;
    }
    tasks.push(
      await completeHuman(rpc, plan, data, {
        actor: "boss",
        sourceType: "inventory_operation",
        sourceID: operation.id,
        nodeKey: "inventory_adjustment_approval",
        decision: {},
        apply,
      }),
    );
    data = await readProcess(
      rpc,
      "warehouse",
      "inventory_adjustment",
      "inventory_operation_id",
      operation.id,
    );
    tasks.push(
      await completeHuman(rpc, plan, data, {
        actor: "warehouse",
        sourceType: "inventory_operation",
        sourceID: operation.id,
        nodeKey: "inventory_adjustment_execution",
        apply,
      }),
    );
    data = await readProcess(
      rpc,
      "warehouse",
      "inventory_adjustment",
      "inventory_operation_id",
      operation.id,
    );
    operation = data.source_readback;
    if (operation.status === "APPROVED" && apply) {
      data = await executeNode(
        rpc,
        plan,
        data,
        "warehouse",
        "execute_inventory_adjustment_post",
        "post_inventory_adjustment",
        "inventory_operation_id",
        operation.id,
      );
      operation = data.source_readback;
    }
    if (finalStatus === "CANCELLED" && operation.status === "POSTED" && apply) {
      operation = (
        await call(
          rpc,
          "warehouse",
          "inventory",
          "cancel_inventory_operation",
          {
            id: operation.id,
            expected_version: operation.version,
            reason: NOTE,
          },
        )
      ).inventory_operation;
    }
    assert.equal(operation.status, finalStatus, operationNo);
    data = await readProcess(
      rpc,
      "warehouse",
      "inventory_adjustment",
      "inventory_operation_id",
      operation.id,
    );
    assert.equal(
      processNode(data, "post_inventory_adjustment").status,
      "completed",
    );
    records.push(operation);
    processes.push(data.process_context);
  }
  const txns = (await inventoryTransactions(rpc, source.lot_id)).filter(
    (txn) =>
      txn.source_type === "INVENTORY_OPERATION" &&
      records.some((row) => row.id === txn.source_id),
  );
  const result = {
    records,
    processes,
    tasks,
    txns,
    sourceReceiptID: receipt.id,
  };
  assertInventoryAdjustmentCoverage(result);
  return result;
}

function assertInventoryAdjustmentCoverage(data) {
  assert.equal(
    data?.records?.length,
    2,
    "inventory adjustment specimens are missing",
  );
  for (const [index, status] of ["POSTED", "CANCELLED"].entries()) {
    const operation = match(
      data.records[index],
      { status, operation_type: "MANUAL_ADJUSTMENT" },
      "inventory adjustment",
    );
    assert.equal(operation.items?.length, 1);
    const grain = operation.items[0];
    const txns = data.txns.filter(
      (txn) =>
        txn.source_type === "INVENTORY_OPERATION" &&
        txn.source_id === operation.id,
    );
    assert.equal(
      txns.length,
      index === 0 ? 1 : 2,
      "inventory adjustment postings are incomplete",
    );
    for (const txn of txns)
      match(
        txn,
        {
          subject_type: grain.subject_type,
          subject_id: grain.subject_id,
          warehouse_id: grain.from_warehouse_id,
          lot_id: grain.from_lot_id,
          unit_id: grain.unit_id,
          quantity: "1",
        },
        "inventory adjustment grain",
      );
    assert.equal(
      txns.reduce((sum, txn) => sum + Number(txn.quantity) * txn.direction, 0),
      index === 0 ? 1 : 0,
    );
    if (index === 1) {
      const reversal = txns.find((txn) => txn.reversal_of_txn_id);
      assert.ok(
        reversal && txns.some((txn) => txn.id === reversal.reversal_of_txn_id),
        "inventory reversal source is missing",
      );
    }
    assertProcessCoverage(
      data,
      operation.id,
      "inventory_operation",
      "post_inventory_adjustment",
      ["boss", "warehouse"],
    );
  }
}

function assertProcessCoverage(data, sourceID, sourceType, commandKey, roles) {
  const processes = (data.processes || []).filter(
    (context) =>
      context.process_instance?.business_ref_id === sourceID &&
      context.process_instance?.business_ref_type === sourceType,
  );
  assert.equal(processes.length, 1, `${sourceType} process source is missing`);
  const context = processes[0];
  const command = processNode({ process_context: context }, commandKey);
  assert.equal(command.status, "completed", `${commandKey} did not complete`);
  for (const role of roles) {
    const tasks = (data.tasks || []).filter(
      (task) =>
        task.source_type === sourceType &&
        task.source_id === sourceID &&
        task.process_instance_id === context.process_instance.id &&
        task.owner_role_key === role,
    );
    assert.equal(tasks.length, 1, `${sourceType} ${role} task is missing`);
    assert.equal(tasks[0].task_status_key, "done");
    assert.ok(
      context.nodes.some(
        (node) =>
          node.id === tasks[0].process_node_instance_id &&
          node.status === "completed",
      ),
      "task and process node do not agree",
    );
  }
}

async function decideQuality(rpc, inspection, result, apply) {
  requireRecord(inspection, "quality inspection");
  if (inspection.status === "DRAFT" && apply) {
    inspection = (
      await call(rpc, "quality", "quality", "submit_quality_inspection", {
        id: inspection.id,
      })
    ).quality_inspection;
  }
  if (inspection.status === "SUBMITTED" && apply) {
    inspection = (
      await call(
        rpc,
        "quality",
        "quality",
        result === "PASS"
          ? "pass_quality_inspection"
          : "reject_quality_inspection",
        {
          id: inspection.id,
          result,
          defect_rate_operator: "APPROX",
          defect_rate_percent: result === "PASS" ? "0" : "100",
          decision_note: NOTE,
          check_items: [
            {
              name: "外观",
              requirement: "模拟确认样",
              observation: result === "PASS" ? "符合" : "不符合",
              result: result === "PASS" ? "PASS" : "FAIL",
              scope: "FULL",
            },
          ],
        },
      )
    ).quality_inspection;
  }
  assert.equal(inspection.status, result === "PASS" ? "PASSED" : "REJECTED");
  return inspection;
}

export async function ensurePurchaseDispositionChain({
  rpc,
  plan,
  purchase,
  apply,
}) {
  const rejected = purchase.qualityInspections
    .filter(
      (row) =>
        row.source_type === "PURCHASE_RECEIPT" && row.status === "REJECTED",
    )
    .sort((a, b) => a.id - b.id);
  assert.ok(
    rejected.length >= 3,
    "three rejected purchase inspections are required",
  );
  const records = [],
    sourceReceipts = [],
    replacementReceipts = [],
    replacementInspections = [];
  for (const [index, status] of ["POSTED", "CANCELLED", "POSTED"].entries()) {
    const inspection = rejected[index];
    const source = purchase.purchaseReceipts.find(
      (row) => row.id === inspection.purchase_receipt_id,
    );
    requireRecord(source, "rejected purchase source");
    const line = source.items.find(
      (row) => row.id === inspection.purchase_receipt_item_id,
    );
    requireRecord(line, "rejected purchase source line");
    const dispositionNo = businessNo(plan, "CGCZ", index + 1);
    const type = index === 2 ? "REPLACE" : "RETURN_TO_VENDOR";
    let record = exact(
      await list(
        rpc,
        "purchase",
        "purchase",
        "list_purchase_rejection_dispositions",
        "purchase_rejection_dispositions",
        { quality_inspection_id: inspection.id },
      ),
      "disposition_no",
      dispositionNo,
    );
    if (!record && apply) {
      record = (
        await call(
          rpc,
          "purchase",
          "purchase",
          "create_purchase_rejection_disposition",
          {
            disposition_no: dispositionNo,
            quality_inspection_id: inspection.id,
            disposition_type: type,
            quantity: line.quantity,
            reason: NOTE,
            idempotency_key: identity(plan, dispositionNo),
          },
        )
      ).purchase_rejection_disposition;
    }
    match(
      record,
      {
        disposition_no: dispositionNo,
        quality_inspection_id: inspection.id,
        purchase_receipt_id: source.id,
        purchase_receipt_item_id: line.id,
        disposition_type: type,
        quantity: line.quantity,
      },
      dispositionNo,
    );
    if (record.status === "DRAFT" && apply) {
      record = (
        await call(
          rpc,
          "purchase",
          "purchase",
          "post_purchase_rejection_disposition",
          { id: record.id, expected_version: record.version },
        )
      ).purchase_rejection_disposition;
    }
    if (status === "CANCELLED" && record.status === "POSTED" && apply) {
      record = (
        await call(
          rpc,
          "purchase",
          "purchase",
          "cancel_purchase_rejection_disposition",
          { id: record.id, expected_version: record.version, reason: NOTE },
        )
      ).purchase_rejection_disposition;
    }
    assert.equal(record.status, status);
    const current = (
      await call(rpc, "warehouse", "purchase", "get_purchase_receipt", {
        id: source.id,
      })
    ).purchase_receipt;
    assert.equal(current.status, "DRAFT", "rejected source must not be posted");
    sourceReceipts.push(current);
    records.push(record);
    if (type === "REPLACE") {
      assert.ok(record.replacement_receipt_id > 0);
      const qualities = await list(
        rpc,
        "quality",
        "quality",
        "list_quality_inspections",
        "quality_inspections",
        { purchase_receipt_id: record.replacement_receipt_id },
      );
      assert.ok(qualities.length > 0, "replacement IQC is missing");
      for (const quality of qualities)
        replacementInspections.push(
          await decideQuality(rpc, quality, "PASS", apply),
        );
      let replacement = (
        await call(rpc, "warehouse", "purchase", "get_purchase_receipt", {
          id: record.replacement_receipt_id,
        })
      ).purchase_receipt;
      if (replacement.status === "DRAFT" && apply) {
        replacement = (
          await call(rpc, "warehouse", "purchase", "post_purchase_receipt", {
            id: replacement.id,
          })
        ).purchase_receipt;
      }
      assert.equal(replacement.status, "POSTED");
      replacementReceipts.push(replacement);
    }
  }
  return {
    records,
    sourceReceipts,
    replacementReceipts,
    replacementInspections,
  };
}

async function wipState(rpc, orderID) {
  return call(rpc, "production", "production_wip", "get_production_wip", {
    production_order_id: orderID,
  });
}

async function wipAction(rpc, plan, batch, action, extra = {}) {
  await call(
    rpc,
    action === "RECEIVE_OUTSOURCING_RETURN" ? "warehouse" : "production",
    "production_wip",
    "execute_production_wip_action",
    {
      action,
      production_order_id: batch.production_order_id,
      production_wip_batch_id: batch.id,
      expected_version: batch.version,
      idempotency_key: identity(plan, `wip:${batch.id}:${action}`),
      ...extra,
    },
  );
  const state = await wipState(rpc, batch.production_order_id);
  return requireRecord(
    state.production_wip_batches.find((row) => row.id === batch.id),
    "WIP action readback",
  );
}

async function ensureReworkFact({ rpc, plan, completion, sequence, apply }) {
  const factNo = businessNo(plan, "FG", sequence);
  let rework = exact(
    await list(
      rpc,
      "production",
      "operational_fact",
      "list_production_facts",
      "production_facts",
      { keyword: factNo },
    ),
    "fact_no",
    factNo,
  );
  if (!rework && apply) {
    rework = (
      await call(
        rpc,
        "production",
        "operational_fact",
        "create_production_rework_from_completion",
        {
          fact_no: factNo,
          source_completion_fact_id: completion.id,
          quantity: "1",
          idempotency_key: identity(plan, factNo),
          reason: NOTE,
        },
      )
    ).production_fact;
  }
  match(
    rework,
    {
      fact_no: factNo,
      fact_type: "REWORK",
      source_type: "PRODUCTION_FACT",
      source_id: completion.id,
      quantity: "1",
    },
    factNo,
  );
  if (rework.status === "DRAFT" && apply) {
    rework = (
      await call(
        rpc,
        "production",
        "operational_fact",
        "post_production_fact",
        { id: rework.id, expected_version: rework.version },
      )
    ).production_fact;
  }
  assert.equal(rework.status, "POSTED");
  return rework;
}

export async function ensureProductionExceptionChain({
  rpc,
  plan,
  production,
  apply,
}) {
  const completion = requireRecord(
    production[4]?.completion,
    "routed completion for WIP exceptions",
  );
  const rework = await ensureReworkFact({
    rpc,
    plan,
    completion,
    sequence: 981,
    apply,
  });
  const orderID = production[4].order.id;
  let state = await wipState(rpc, orderID);
  let batch = exact(
    state.production_wip_batches,
    "origin_rework_fact_id",
    rework.id,
  );
  requireRecord(batch, "rework WIP source");
  if (batch.status === "PLANNED" && !batch.execution_mode && apply)
    batch = await wipAction(rpc, plan, batch, "ASSIGN_EXECUTION", {
      execution_mode: "IN_HOUSE",
    });
  if (batch.status === "PLANNED" && apply)
    batch = await wipAction(rpc, plan, batch, "START_OPERATION");
  if (batch.status === "IN_PROGRESS" && apply)
    batch = await wipAction(rpc, plan, batch, "COMPLETE_OPERATION");
  state = await wipState(rpc, orderID);
  let inspection = exact(
    state.quality_inspections,
    "production_wip_batch_id",
    batch.id,
  );
  inspection = await decideQuality(rpc, inspection, "REJECT", apply);
  const records = [],
    processes = [],
    tasks = [];
  for (const [index, type] of ["WIP_CONCESSION", "SCRAP"].entries()) {
    const decisionNo = businessNo(plan, "SCYC", 981 + index);
    state = await wipState(rpc, orderID);
    batch = state.production_wip_batches.find((row) => row.id === batch.id);
    let decision = exact(
      await list(
        rpc,
        "production",
        "operational_fact",
        "list_production_exceptions",
        "production_exceptions",
        { production_order_id: orderID },
      ),
      "decision_no",
      decisionNo,
    );
    if (!decision && apply) {
      assert.equal(batch.status, "REJECTED");
      decision = (
        await call(
          rpc,
          "production",
          "operational_fact",
          "submit_production_exception",
          {
            decision_no: decisionNo,
            decision_type: type,
            production_order_id: orderID,
            production_order_item_id: batch.production_order_item_id,
            production_wip_batch_id: batch.id,
            quality_inspection_id: inspection.id,
            requested_quantity: batch.quantity,
            reason: NOTE,
            idempotency_key: identity(plan, decisionNo),
          },
        )
      ).production_exception;
    }
    match(
      decision,
      {
        decision_no: decisionNo,
        decision_type: type,
        production_order_id: orderID,
        production_order_item_id: batch.production_order_item_id,
        production_wip_batch_id: batch.id,
        quality_inspection_id: inspection.id,
        requested_quantity: batch.quantity,
      },
      decisionNo,
    );
    let data = await ensureProcess(
      rpc,
      plan,
      "production",
      "production_exception",
      "production_exception_id",
      decision.id,
      apply,
    );
    tasks.push(
      await completeHuman(rpc, plan, data, {
        actor: "boss",
        sourceType: "production_exception_decision",
        sourceID: decision.id,
        nodeKey: "production_exception_decision_approval",
        decision: { approved_quantity: batch.quantity },
        apply,
      }),
    );
    data = await readProcess(
      rpc,
      "production",
      "production_exception",
      "production_exception_id",
      decision.id,
    );
    tasks.push(
      await completeHuman(rpc, plan, data, {
        actor: "production",
        sourceType: "production_exception_decision",
        sourceID: decision.id,
        nodeKey: "production_exception_execution",
        apply,
      }),
    );
    data = await readProcess(
      rpc,
      "production",
      "production_exception",
      "production_exception_id",
      decision.id,
    );
    decision = data.source_readback;
    if (decision.execution_status === "PENDING" && apply) {
      state = await wipState(rpc, orderID);
      assert.equal(
        state.production_wip_batches.find((row) => row.id === batch.id).status,
        "REJECTED",
        "approval/task completion must not execute the disposition",
      );
      data = await executeNode(
        rpc,
        plan,
        data,
        "production",
        "execute_production_exception_process",
        "execute_production_exception",
        "production_exception_id",
        decision.id,
      );
      decision = data.source_readback;
    }
    if (decision.execution_status === "APPLIED" && apply) {
      state = await wipState(rpc, orderID);
      assert.equal(
        state.production_wip_batches.find((row) => row.id === batch.id).status,
        type === "SCRAP" ? "CANCELLED" : "ACCEPTED",
      );
      decision = (
        await call(
          rpc,
          "production",
          "operational_fact",
          "reverse_production_exception",
          { id: decision.id, expected_version: decision.version, reason: NOTE },
        )
      ).production_exception;
    }
    assert.equal(decision.execution_status, "REVERSED");
    assert.ok(
      decision.executed_at > 0 && decision.reversed_at > 0,
      "exception execution/reversal audit is missing",
    );
    data = await readProcess(
      rpc,
      "production",
      "production_exception",
      "production_exception_id",
      decision.id,
    );
    assert.equal(
      processNode(data, "execute_production_exception").status,
      "completed",
    );
    records.push(decision);
    processes.push(data.process_context);
  }
  state = await wipState(rpc, orderID);
  batch = state.production_wip_batches.find((row) => row.id === batch.id);
  assert.equal(batch.status, "REJECTED", "reversal must restore rejected WIP");
  return { records, processes, tasks, rework, completion, batch, inspection };
}

function pick(record, keys) {
  return Object.fromEntries(
    keys.filter((key) => record[key] != null).map((key) => [key, record[key]]),
  );
}

export async function ensureOutsourcingDispositionChain({
  rpc,
  plan,
  production,
  apply,
}) {
  const completion = requireRecord(
    production[3]?.completion,
    "outsourcing rework source completion",
  );
  const rework = await ensureReworkFact({
    rpc,
    plan,
    completion,
    sequence: 982,
    apply,
  });
  const source = await call(
    rpc,
    "admin",
    "production_order",
    "get_production_order",
    {
      production_order_id: production[3].order.id,
    },
  );
  const order = requireRecord(
    source.production_order,
    "outsourcing production order",
  );
  const orderNo = order.order_no;
  assert.equal(order.status, "RELEASED");
  let state = await wipState(rpc, order.id);
  let batch = requireRecord(
    state.production_wip_batches.find(
      (row) => row.origin_rework_fact_id === rework.id && !row.source_batch_id,
    ),
    "outsourcing rework WIP root",
  );
  const sourceItem = requireRecord(
    source.production_order_items.find(
      (row) => row.id === batch.production_order_item_id,
    ),
    "outsourcing production item",
  );
  const preparedOrderNo = `OS-WIP-${batch.id}-1`;
  const contractID = plan.outsourcingCandidates[0].issue.order.id;
  const contractSource = (
    await call(rpc, "admin", "outsourcing_order", "get_outsourcing_order", {
      id: contractID,
    })
  ).outsourcing_order;
  let outsourcingOrder = exact(
    await list(
      rpc,
      "admin",
      "outsourcing_order",
      "list_outsourcing_orders",
      "outsourcing_orders",
      { keyword: preparedOrderNo },
    ),
    "outsourcing_order_no",
    preparedOrderNo,
  );
  if (!outsourcingOrder && apply) {
    const prepared = await call(
      rpc,
      "production",
      "production_wip",
      "prepare_production_outsourcing_order",
      {
        production_wip_batch_id: batch.id,
        expected_version: batch.version,
        supplier_id: contractSource.supplier_id,
        requirement_ids: [],
        expected_return_date: plan.anchorDate.slice(0, 10),
      },
    );
    outsourcingOrder = (
      await call(rpc, "admin", "outsourcing_order", "get_outsourcing_order", {
        id: prepared.outsourcing_order_id,
      })
    ).outsourcing_order;
  }
  match(
    outsourcingOrder,
    {
      outsourcing_order_no: preparedOrderNo,
      source_order_no: orderNo,
      supplier_id: contractSource.supplier_id,
    },
    "outsourcing source order",
  );
  let lines = await list(
    rpc,
    "admin",
    "outsourcing_order",
    "list_outsourcing_order_items",
    "outsourcing_order_items",
    { outsourcing_order_id: outsourcingOrder.id },
  );
  assert.equal(lines.length, 1);
  let line = lines[0];
  match(
    line,
    {
      subject_type: "PRODUCT",
      product_id: sourceItem.product_id,
      product_sku_id: sourceItem.product_sku_id,
      unit_id: sourceItem.unit_id,
      outsourcing_quantity: batch.quantity,
    },
    "outsourcing line",
  );
  if (outsourcingOrder.lifecycle_status === "draft" && apply) {
    const saved = await call(
      rpc,
      "admin",
      "outsourcing_order",
      "save_outsourcing_order_with_items",
      {
        ...pick(outsourcingOrder, [
          "id",
          "outsourcing_order_no",
          "supplier_id",
          "currency",
          "payment_term_days",
          "order_date",
          "expected_return_date",
          "source_order_no",
          "note",
        ]),
        order_date: plan.anchorDate.slice(0, 10),
        expected_version: outsourcingOrder.version,
        contract_party_snapshot: contractSource.contract_party_snapshot,
        supplier_snapshot: contractSource.supplier_snapshot,
        items: [
          {
            ...pick(line, [
              "id",
              "line_no",
              "subject_type",
              "material_id",
              "product_id",
              "product_sku_id",
              "process_id",
              "unit_id",
              "outsourcing_quantity",
              "expected_return_date",
            ]),
            processing_item: "模拟手工返修加工",
            unit_price: "1",
            amount: line.outsourcing_quantity,
          },
        ],
      },
    );
    outsourcingOrder = saved.outsourcing_order;
    lines = saved.items || lines;
    line = lines[0];
    outsourcingOrder = (
      await call(
        rpc,
        "admin",
        "outsourcing_order",
        "submit_outsourcing_order",
        {
          id: outsourcingOrder.id,
          expected_version: outsourcingOrder.version,
          idempotency_key: identity(plan, `${orderNo}:submit`),
        },
      )
    ).outsourcing_order;
  }
  if (outsourcingOrder.lifecycle_status === "submitted" && apply)
    outsourcingOrder = (
      await call(
        rpc,
        "admin",
        "outsourcing_order",
        "confirm_outsourcing_order",
        {
          id: outsourcingOrder.id,
          expected_version: outsourcingOrder.version,
          idempotency_key: identity(plan, `${orderNo}:confirm`),
        },
      )
    ).outsourcing_order;
  assert.equal(outsourcingOrder.lifecycle_status, "confirmed");
  if (batch.status === "PLANNED" && !batch.execution_mode && apply)
    batch = await wipAction(rpc, plan, batch, "ASSIGN_EXECUTION", {
      execution_mode: "OUTSOURCED",
      outsourcing_allocations: [{ outsourcing_order_item_id: line.id }],
    });
  if (batch.status === "PLANNED" && apply)
    batch = await wipAction(rpc, plan, batch, "START_OPERATION");
  if (batch.status === "OUTSOURCED" && apply)
    batch = await wipAction(rpc, plan, batch, "RECEIVE_OUTSOURCING_RETURN");
  const factNo = businessNo(plan, "WWHG", 981);
  let returned = exact(
    await list(
      rpc,
      "admin",
      "operational_fact",
      "list_outsourcing_facts",
      "outsourcing_facts",
      { keyword: factNo },
    ),
    "fact_no",
    factNo,
  );
  if (!returned && apply) {
    returned = (
      await call(
        rpc,
        "admin",
        "operational_fact",
        "create_outsourcing_return_receipt_from_order",
        {
          fact_no: factNo,
          outsourcing_order_id: outsourcingOrder.id,
          outsourcing_order_item_id: line.id,
          warehouse_id: plan.productWarehouse.id,
          quantity: batch.quantity,
          new_lot_no: businessNo(plan, "WWCP", 981),
          idempotency_key: identity(plan, factNo),
          note: NOTE,
        },
      )
    ).outsourcing_fact;
  }
  match(
    returned,
    {
      fact_no: factNo,
      fact_type: "RETURN_RECEIPT",
      subject_type: "PRODUCT",
      subject_id: sourceItem.product_id,
      product_sku_id: sourceItem.product_sku_id,
      unit_id: sourceItem.unit_id,
      warehouse_id: plan.productWarehouse.id,
      source_type: "OUTSOURCING_ORDER",
      source_id: outsourcingOrder.id,
      source_line_id: line.id,
      quantity: batch.quantity,
    },
    factNo,
  );
  if (returned.status === "DRAFT" && apply)
    returned = (
      await call(rpc, "admin", "operational_fact", "post_outsourcing_fact", {
        id: returned.id,
        expected_version: returned.version,
      })
    ).outsourcing_fact;
  assert.equal(returned.status, "POSTED");
  const inspectionNo = businessNo(plan, "WWZJ", 981);
  let inspection = exact(
    await list(
      rpc,
      "quality",
      "quality",
      "list_outsourcing_return_quality_inspections",
      "quality_inspections",
      { fact_id: returned.id },
    ),
    "inspection_no",
    inspectionNo,
  );
  if (!inspection && apply)
    inspection = (
      await call(
        rpc,
        "quality",
        "quality",
        "create_quality_inspection_from_outsourcing_return",
        { fact_id: returned.id, inspection_no: inspectionNo, note: NOTE },
      )
    ).quality_inspection;
  inspection = await decideQuality(rpc, inspection, "REJECT", apply);
  state = await wipState(rpc, order.id);
  const wipInspection = await decideQuality(
    rpc,
    exact(state.quality_inspections, "production_wip_batch_id", batch.id),
    "REJECT",
    apply,
  );
  const records = [];
  const dispositionQuantity = batch.quantity;
  for (const [index, type] of ["RETURN_TO_VENDOR", "REWORK"].entries()) {
    const dispositionNo = businessNo(plan, "WWCZ", index + 1);
    let disposition = exact(
      await list(
        rpc,
        "admin",
        "operational_fact",
        "list_outsourcing_return_dispositions",
        "outsourcing_return_dispositions",
        { quality_inspection_id: inspection.id },
      ),
      "disposition_no",
      dispositionNo,
    );
    if (!disposition && apply)
      disposition = (
        await call(
          rpc,
          "admin",
          "operational_fact",
          "create_outsourcing_return_disposition",
          {
            disposition_no: dispositionNo,
            quality_inspection_id: inspection.id,
            disposition_type: type,
            ...(type === "REWORK" ? { production_wip_batch_id: batch.id } : {}),
            quantity: dispositionQuantity,
            reason: NOTE,
            idempotency_key: identity(plan, dispositionNo),
          },
        )
      ).outsourcing_return_disposition;
    match(
      disposition,
      {
        disposition_no: dispositionNo,
        quality_inspection_id: inspection.id,
        outsourcing_return_fact_id: returned.id,
        disposition_type: type,
        production_wip_batch_id: batch.id,
        quantity: dispositionQuantity,
      },
      dispositionNo,
    );
    if (disposition.status === "DRAFT" && apply)
      disposition = (
        await call(
          rpc,
          "admin",
          "operational_fact",
          "post_outsourcing_return_disposition",
          { id: disposition.id, expected_version: disposition.version },
        )
      ).outsourcing_return_disposition;
    if (type === "RETURN_TO_VENDOR" && disposition.status === "POSTED" && apply)
      disposition = (
        await call(
          rpc,
          "admin",
          "operational_fact",
          "cancel_outsourcing_return_disposition",
          {
            id: disposition.id,
            expected_version: disposition.version,
            reason: NOTE,
          },
        )
      ).outsourcing_return_disposition;
    assert.equal(
      disposition.status,
      type === "RETURN_TO_VENDOR" ? "CANCELLED" : "POSTED",
    );
    records.push(disposition);
  }
  state = await wipState(rpc, order.id);
  batch = state.production_wip_batches.find((row) => row.id === batch.id);
  const reworkBatch = requireRecord(
    state.production_wip_batches.find(
      (row) => row.id === records[1].result_wip_batch_id,
    ),
    "outsourcing rework child",
  );
  match(
    reworkBatch,
    { flow_type: "REWORK", source_batch_id: batch.id, status: "PLANNED" },
    "outsourcing rework child",
  );
  const txns = await inventoryTransactions(rpc, returned.lot_id);
  return {
    records,
    productionOrder: order,
    outsourcingOrder,
    rework,
    batch,
    allocation: state.outsourcing_allocations.find(
      (row) => row.outsourcing_order_item_id === line.id,
    ),
    returnFact: returned,
    inspection,
    wipInspection,
    reworkBatch,
    txns,
  };
}

export async function runManualAcceptanceExceptionChains(options) {
  const inventoryAdjustment = await ensureInventoryAdjustmentChain(options);
  const purchaseDisposition = await ensurePurchaseDispositionChain(options);
  const productionException = await ensureProductionExceptionChain(options);
  const outsourcingDisposition =
    await ensureOutsourcingDispositionChain(options);
  const result = {
    inventoryAdjustment,
    purchaseDisposition,
    productionException,
    outsourcingDisposition,
  };
  assertManualAcceptanceExceptionChainCoverage(result);
  return result;
}

export function assertManualAcceptanceExceptionChainCoverage(data) {
  assertInventoryAdjustmentCoverage(data?.inventoryAdjustment);
  const purchase = data.purchaseDisposition;
  assert.equal(
    purchase?.records?.length,
    3,
    "purchase disposition specimens are missing",
  );
  for (const [index, status] of ["POSTED", "CANCELLED", "POSTED"].entries()) {
    const record = match(
      purchase.records[index],
      {
        status,
        disposition_type: index === 2 ? "REPLACE" : "RETURN_TO_VENDOR",
      },
      "purchase disposition",
    );
    assert.ok(
      purchase.sourceReceipts.some(
        (source) =>
          source.id === record.purchase_receipt_id && source.status === "DRAFT",
      ),
      "rejected receipt source drifted",
    );
  }
  const replacementID = purchase.records[2].replacement_receipt_id;
  assert.ok(
    replacementID > 0 &&
      purchase.replacementReceipts.some(
        (receipt) =>
          receipt.id === replacementID && receipt.status === "POSTED",
      ),
  );
  assert.ok(
    purchase.replacementInspections.some(
      (inspection) =>
        inspection.purchase_receipt_id === replacementID &&
        inspection.status === "PASSED",
    ),
  );
  const production = data.productionException;
  assert.equal(
    production?.records?.length,
    2,
    "WIP exception specimens are missing",
  );
  match(
    production.batch,
    {
      status: "REJECTED",
      flow_type: "REWORK",
      origin_rework_fact_id: production.rework.id,
    },
    "exception WIP source",
  );
  for (const [index, type] of ["WIP_CONCESSION", "SCRAP"].entries()) {
    const decision = match(
      production.records[index],
      {
        decision_type: type,
        status: "APPROVED",
        execution_status: "REVERSED",
        production_wip_batch_id: production.batch.id,
        quality_inspection_id: production.inspection.id,
      },
      "WIP exception",
    );
    assert.ok(decision.executed_at > 0 && decision.reversed_at > 0);
    assertProcessCoverage(
      production,
      decision.id,
      "production_exception_decision",
      "execute_production_exception",
      ["boss", "production"],
    );
  }
  const outsourcing = data.outsourcingDisposition;
  match(
    outsourcing.rework,
    { fact_type: "REWORK", status: "POSTED" },
    "outsourcing rework source",
  );
  match(
    outsourcing.batch,
    {
      flow_type: "REWORK",
      origin_rework_fact_id: outsourcing.rework.id,
    },
    "outsourcing WIP source",
  );
  assert.equal(outsourcing.returnFact.subject_type, "PRODUCT");
  assert.equal(
    outsourcing?.records?.length,
    2,
    "outsourcing disposition specimens are missing",
  );
  match(
    outsourcing.records[0],
    {
      disposition_type: "RETURN_TO_VENDOR",
      status: "CANCELLED",
      outsourcing_return_fact_id: outsourcing.returnFact.id,
    },
    "outsourcing return",
  );
  match(
    outsourcing.records[1],
    {
      disposition_type: "REWORK",
      status: "POSTED",
      result_wip_batch_id: outsourcing.reworkBatch.id,
      outsourcing_return_fact_id: outsourcing.returnFact.id,
    },
    "outsourcing rework",
  );
  match(
    outsourcing.reworkBatch,
    { flow_type: "REWORK", source_batch_id: outsourcing.batch.id },
    "outsourcing rework child",
  );
  requireRecord(outsourcing.allocation, "production outsourcing allocation");
  assert.equal(
    outsourcing.allocation.production_wip_batch_id,
    outsourcing.batch.id,
  );
  assert.equal(
    outsourcing.allocation.outsourcing_order_item_id,
    outsourcing.returnFact.source_line_id,
  );
  assert.equal(outsourcing.returnFact.status, "POSTED");
  assert.equal(outsourcing.inspection.source_id, outsourcing.returnFact.id);
  assert.equal(outsourcing.inspection.source_type, "OUTSOURCING_FACT");
  assert.equal(outsourcing.inspection.status, "REJECTED");
  assert.equal(outsourcing.wipInspection.status, "REJECTED");
  const postings = outsourcing.txns.filter(
    (txn) =>
      txn.source_type === "OUTSOURCING_RETURN_DISPOSITION" &&
      txn.source_id === outsourcing.records[0].id,
  );
  assert.equal(
    postings.length,
    2,
    "outsourcing return/reversal ledger is missing",
  );
  assert.equal(
    postings.reduce(
      (sum, txn) => sum + Number(txn.quantity) * txn.direction,
      0,
    ),
    0,
  );
  const reversal = postings.find((txn) => txn.reversal_of_txn_id);
  assert.ok(
    reversal && postings.some((txn) => txn.id === reversal.reversal_of_txn_id),
  );
  assert.ok(
    postings.every((txn) => txn.lot_id === outsourcing.returnFact.lot_id),
  );
  return true;
}
