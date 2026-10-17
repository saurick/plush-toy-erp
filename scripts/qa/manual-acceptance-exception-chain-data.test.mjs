import assert from "node:assert/strict";
import test from "node:test";

import {
  assertManualAcceptanceExceptionChainCoverage,
  ensureInventoryAdjustmentChain,
  ensurePurchaseDispositionChain,
  ensureOutsourcingDispositionChain,
} from "./manual-acceptance-exception-chain-data.mjs";
import {
  manualAcceptanceFactRPCCall,
  manualAcceptanceFactRPCParams,
} from "./manual-acceptance-fact-data.mjs";
import {
  FORMAL_RPC_PARAM_ALLOWLIST,
  manualAcceptanceBusinessNo,
} from "./manual-acceptance-source-driven-facts.mjs";
import { exceptionChainFixture } from "./test-fixtures/manual-acceptance-exception-chains.mjs";

function outsourcingDispositionFixture({
  genericSupplierType = "material",
  corrupt,
  interruptBeforeExecution = false,
} = {}) {
  const plan = {
    dataVersion: "2026.09.27-v8",
    anchorDate: "2026-10-18T00:00:00Z",
    productWarehouse: { id: 705 },
    outsourcingCandidates: [{ issue: { order: { id: 500 } } }],
    productionCandidates: [
      null,
      null,
      null,
      {
        fabricOutsourcing: { order: { id: 501, orderNo: "SOURCE-501" } },
      },
    ],
  };
  const production = [
    null,
    null,
    null,
    { order: { id: 101 }, completion: { id: 90 } },
  ];
  const calls = [],
    tasks = [],
    dispositions = [],
    facts = [],
    inspections = [],
    txns = [];
  const batch = {
    id: 401,
    production_order_id: 101,
    production_order_item_id: 201,
    production_order_operation_id: 301,
    origin_rework_fact_id: 44,
    source_batch_id: null,
    flow_type: "REWORK",
    status: "PLANNED",
    execution_mode: null,
    version: 1,
    quantity: "1",
  };
  const operation = {
    id: 301,
    production_order_id: 101,
    production_order_item_id: 201,
    operation_code: "HANDWORK",
    outsourcing_allowed: true,
    process_id: 704,
  };
  const batches = [batch];
  const item = { id: 201, product_id: 701, product_sku_id: 702, unit_id: 703 };
  const sourceContract = {
    id: 501,
    outsourcing_order_no: "SOURCE-501",
    supplier_id: 10,
    lifecycle_status: "confirmed",
    contract_party_snapshot: { name: "模拟合同主体" },
    supplier_snapshot: { supplier_id: 10 },
  };
  let contract, line, decision, process, interrupted;
  const result = (value) => structuredClone(value);
  const read = (kind, value) =>
    result(corrupt ? corrupt(kind, result(value)) : value);
  const processData = () =>
    read("process", {
      source_readback: decision,
      process_context: process,
    });
  const rpc = async (request) => {
    calls.push(result(request));
    const { actor, method, params } = request;
    switch (method) {
      case "list_production_facts":
        return {
          production_facts: [
            {
              id: 44,
              fact_no: manualAcceptanceBusinessNo({
                dataVersion: plan.dataVersion,
                code: "FG",
                sequence: 982,
              }),
              fact_type: "REWORK",
              source_type: "PRODUCTION_FACT",
              source_id: 90,
              quantity: "1",
              status: "POSTED",
            },
          ],
          total: 1,
        };
      case "get_production_order":
        return {
          production_order: { id: 101, order_no: "MO-101", status: "RELEASED" },
          production_order_items: [item],
        };
      case "get_production_wip":
        return read("wip", {
          production_wip_batches: batches,
          production_order_operations: [operation],
          quality_inspections: inspections
            .filter((row) => row.production_wip_batch_id)
            .map(({ id, production_wip_batch_id, status, result }) => ({
              id,
              production_wip_batch_id,
              status,
              result,
            })),
          outsourcing_allocations:
            line && batch.execution_mode
              ? [
                  {
                    id: 700,
                    production_wip_batch_id: batch.id,
                    outsourcing_order_item_id: line.id,
                  },
                ]
              : [],
        });
      case "get_outsourcing_order":
        return {
          outsourcing_order: read(
            "contract",
            params.id === 500
              ? {
                  ...sourceContract,
                  id: 500,
                  supplier_id: genericSupplierType === "material" ? 9 : 10,
                }
              : params.id === 501
                ? sourceContract
                : contract,
          ),
        };
      case "get_supplier":
        return {
          supplier: read("supplier", {
            id: params.id,
            is_active: true,
            supplier_type:
              params.id === 9 ? genericSupplierType : "outsourcing",
          }),
        };
      case "list_outsourcing_orders":
        return {
          outsourcing_orders: contract ? [result(contract)] : [],
          total: contract ? 1 : 0,
        };
      case "prepare_production_outsourcing_order":
        assert.equal(actor, "production");
        assert.equal(
          params.supplier_id,
          10,
          "prepare must use the registered production contract's outsourcing supplier",
        );
        assert.equal(params.production_wip_batch_id, 401);
        assert.equal(batch.status, "PLANNED");
        assert.equal(batch.execution_mode, null);
        assert.deepEqual(params.requirement_ids, []);
        contract = {
          id: 502,
          outsourcing_order_no: "OS-WIP-401-1",
          source_order_no: "MO-101",
          source_wip_batch_id: 401,
          supplier_id: 10,
          lifecycle_status: "draft",
          version: 1,
        };
        line = {
          id: 601,
          line_no: 1,
          subject_type: "PRODUCT",
          product_id: 701,
          product_sku_id: 702,
          unit_id: 703,
          process_id: 704,
          outsourcing_quantity: "1",
        };
        return { outsourcing_order_id: 502 };
      case "list_outsourcing_order_items":
        return { outsourcing_order_items: read("lines", [line]), total: 1 };
      case "save_outsourcing_order_with_items":
        assert.deepEqual(
          params.contract_party_snapshot,
          sourceContract.contract_party_snapshot,
        );
        assert.deepEqual(
          params.supplier_snapshot,
          sourceContract.supplier_snapshot,
        );
        assert.equal(params.supplier_id, 10);
        contract = { ...contract, ...params, version: contract.version + 1 };
        return { outsourcing_order: result(contract), items: result([line]) };
      case "submit_outsourcing_order":
      case "confirm_outsourcing_order":
        contract.lifecycle_status =
          method === "submit_outsourcing_order" ? "submitted" : "confirmed";
        contract.version += 1;
        return { outsourcing_order: result(contract) };
      case "execute_production_wip_action":
        assert.equal(params.production_wip_batch_id, batch.id);
        assert.equal(params.expected_version, batch.version);
        if (params.action === "ASSIGN_EXECUTION") {
          assert.equal(actor, "production");
          assert.equal(batch.status, "PLANNED");
          assert.deepEqual(params.outsourcing_allocations, [
            { outsourcing_order_item_id: line.id },
          ]);
          batch.execution_mode = "OUTSOURCED";
        } else if (params.action === "START_OPERATION") {
          assert.equal(actor, "production");
          assert.equal(batch.execution_mode, "OUTSOURCED");
          batch.status = "OUTSOURCED";
        } else {
          assert.equal(params.action, "RECEIVE_OUTSOURCING_RETURN");
          assert.equal(actor, "warehouse");
          assert.equal(batch.status, "OUTSOURCED");
          assert.equal(params.quantity, batch.quantity);
          batch.status = "WAITING_QUALITY";
          inspections.push({
            id: 802,
            production_wip_batch_id: batch.id,
            source_type: "PRODUCTION_WIP",
            source_id: batch.id,
            status: "DRAFT",
          });
        }
        batch.version += 1;
        return {};
      case "list_outsourcing_facts":
        return { outsourcing_facts: result(facts), total: facts.length };
      case "create_outsourcing_return_receipt_from_order": {
        assert.equal(batch.status, "WAITING_QUALITY");
        assert.equal(params.quantity, batch.quantity);
        const fact = {
          id: 803,
          ...params,
          fact_type: "RETURN_RECEIPT",
          subject_type: "PRODUCT",
          subject_id: 701,
          product_sku_id: 702,
          unit_id: 703,
          source_type: "OUTSOURCING_ORDER",
          source_id: contract.id,
          source_line_id: line.id,
          lot_id: 804,
          status: "DRAFT",
          version: 1,
        };
        facts.push(fact);
        return { outsourcing_fact: result(fact) };
      }
      case "post_outsourcing_fact":
        facts[0].status = "POSTED";
        facts[0].version += 1;
        return { outsourcing_fact: result(facts[0]) };
      case "list_outsourcing_return_quality_inspections": {
        const rows = inspections.filter(
          (row) => row.source_type === "OUTSOURCING_FACT",
        );
        return { quality_inspections: result(rows), total: rows.length };
      }
      case "create_quality_inspection_from_outsourcing_return": {
        const inspection = {
          id: 801,
          ...params,
          status: "DRAFT",
          source_type: "OUTSOURCING_FACT",
          source_id: facts[0].id,
        };
        inspections.push(inspection);
        return { quality_inspection: result(inspection) };
      }
      case "submit_quality_inspection":
      case "reject_quality_inspection": {
        assert.equal(actor, "quality");
        const inspection = inspections.find((row) => row.id === params.id);
        inspection.status =
          method === "submit_quality_inspection" ? "SUBMITTED" : "REJECTED";
        if (inspection.status === "REJECTED") {
          inspection.result = "REJECT";
          if (inspection.production_wip_batch_id) batch.status = "REJECTED";
        }
        return { quality_inspection: read("inspection", inspection) };
      }
      case "get_quality_inspection":
        return {
          quality_inspection: read(
            "inspection",
            inspections.find((row) => row.id === params.id),
          ),
        };
      case "list_outsourcing_return_dispositions":
        return {
          outsourcing_return_dispositions: result(dispositions),
          total: dispositions.length,
        };
      case "create_outsourcing_return_disposition": {
        assert.equal(
          params.disposition_type,
          "RETURN_TO_VENDOR",
          "direct REWORK disposition requires ProcessRuntime",
        );
        assert.equal(params.quality_inspection_id, 801);
        assert.equal(batch.status, "REJECTED");
        const row = {
          id: 901,
          ...params,
          production_wip_batch_id: batch.id,
          outsourcing_return_fact_id: facts[0].id,
          status: "DRAFT",
          version: 1,
        };
        dispositions.push(row);
        return { outsourcing_return_disposition: result(row) };
      }
      case "post_outsourcing_return_disposition":
      case "cancel_outsourcing_return_disposition": {
        const row = dispositions[0];
        row.status =
          method === "post_outsourcing_return_disposition"
            ? "POSTED"
            : "CANCELLED";
        row.version += 1;
        txns.push({
          id: 910 + txns.length,
          source_type: "OUTSOURCING_RETURN_DISPOSITION",
          source_id: row.id,
          lot_id: facts[0].lot_id,
          quantity: row.quantity,
          direction: row.status === "POSTED" ? -1 : 1,
          ...(txns.length ? { reversal_of_txn_id: 910 } : {}),
        });
        return { outsourcing_return_disposition: result(row) };
      }
      case "list_production_exceptions":
        return {
          production_exceptions: decision ? [read("decision", decision)] : [],
          total: decision ? 1 : 0,
        };
      case "submit_production_exception":
        for (const key of Object.keys(params))
          assert.ok(
            FORMAL_RPC_PARAM_ALLOWLIST[
              "operational_fact.submit_production_exception"
            ].includes(key),
            `production exception formal params must include ${key}`,
          );
        assert.equal(actor, "production");
        assert.equal(params.decision_type, "REWORK_ORIGINAL");
        assert.equal(
          params.quality_inspection_id,
          802,
          "production exception must use WIP quality, not receipt IQC",
        );
        assert.equal(params.target_supplier_id, contract.supplier_id);
        assert.equal(
          params.target_operation_id,
          batch.production_order_operation_id,
        );
        assert.equal(params.requested_quantity, batch.quantity);
        assert.equal(batch.status, "REJECTED");
        decision = {
          id: 903,
          ...params,
          status: "SUBMITTED",
          execution_status: "PENDING",
          version: 1,
        };
        return { production_exception: read("decision", decision) };
      case "get_production_exception_approval_process":
        return processData();
      case "start_production_exception_approval_process":
        process = {
          process_instance: {
            id: 1000,
            business_ref_type: "production_exception_decision",
            business_ref_id: decision.id,
          },
          nodes: [
            {
              id: 1001,
              process_instance_id: 1000,
              node_key: "production_exception_decision_approval",
              status: "active",
            },
            {
              id: 1002,
              process_instance_id: 1000,
              node_key: "production_exception_execution",
              status: "pending",
            },
            {
              id: 1003,
              process_instance_id: 1000,
              node_key: "execute_production_exception",
              status: "pending",
              version: 1,
            },
          ],
        };
        tasks.push(
          ...["boss", "production"].map((role, index) => ({
            id: 1101 + index,
            source_type: "production_exception_decision",
            source_id: decision.id,
            process_instance_id: 1000,
            process_node_instance_id: 1001 + index,
            owner_role_key: role,
            task_status_key: "ready",
            version: 1,
          })),
        );
        return processData();
      case "list_tasks":
        return { tasks: result(tasks), total: tasks.length };
      case "complete_task_action": {
        const task = tasks.find((row) => row.id === params.task_id);
        assert.equal(actor, task.owner_role_key);
        assert.equal(
          batch.status,
          "REJECTED",
          "human task must not execute rework",
        );
        assert.equal(
          batches.length,
          1,
          "human task must not create the rework child",
        );
        task.task_status_key = "done";
        process.nodes.find(
          (node) => node.id === task.process_node_instance_id,
        ).status = "completed";
        if (actor === "boss") {
          assert.equal(
            params.payload.process_decision.approved_quantity,
            batch.quantity,
          );
          decision.status = "APPROVED";
          decision.approved_quantity = batch.quantity;
          process.nodes[1].status = "active";
        } else process.nodes[2].status = "active";
        return { task: result(task) };
      }
      case "execute_production_exception_process":
        assert.equal(actor, "production");
        assert.equal(batch.status, "REJECTED");
        assert.ok(tasks.every((row) => row.task_status_key === "done"));
        assert.equal(params.process_node_instance_id, 1003);
        if (interruptBeforeExecution && !interrupted) {
          interrupted = true;
          throw new Error("execution has not been applied");
        }
        decision.execution_status = "APPLIED";
        decision.executed_at = 1;
        batch.status = "CANCELLED";
        batches.push({
          ...batch,
          id: 402,
          status: "PLANNED",
          execution_mode: null,
          source_batch_id: batch.id,
          origin_exception_decision_id: decision.id,
          version: 1,
        });
        process.nodes[2].status = "completed";
        return processData();
      case "list_inventory_txns":
        return { inventory_txns: result(txns), total: txns.length };
      default:
        throw new Error(`unexpected ${request.domain}.${method}`);
    }
  };
  return { rpc, plan, production, calls, batch, batches, inspections };
}

test("outsourcing rejection uses the production-bound qualified supplier and approved explicit rework execution", async () => {
  const fixture = outsourcingDispositionFixture();
  const evidence = await ensureOutsourcingDispositionChain({
    ...fixture,
    apply: true,
  });
  assert.equal(evidence.records.length, 1);
  assert.equal(evidence.records[0].disposition_type, "RETURN_TO_VENDOR");
  assert.equal(evidence.reworkDecision.decision_type, "REWORK_ORIGINAL");
  assert.equal(evidence.reworkDecision.execution_status, "APPLIED");
  assert.equal(evidence.batch.status, "CANCELLED");
  assert.equal(
    evidence.reworkBatch.origin_exception_decision_id,
    evidence.reworkDecision.id,
  );
  assert.equal(evidence.reworkBatch.status, "PLANNED");
  assert.equal(evidence.processes.length, 1);
  assert.deepEqual(
    evidence.tasks.map((row) => row.owner_role_key),
    ["boss", "production"],
  );
  assert.equal(
    fixture.calls.filter(
      (row) => row.method === "execute_production_exception_process",
    ).length,
    1,
  );
  const writes = () =>
    fixture.calls.filter((row) =>
      /^(?:prepare|save|submit|confirm|create|post|cancel|complete|start|execute)_/u.test(
        row.method,
      ),
    ).length;
  const written = writes();
  await ensureOutsourcingDispositionChain({ ...fixture, apply: true });
  await ensureOutsourcingDispositionChain({ ...fixture, apply: false });
  assert.equal(
    writes(),
    written,
    "resume and verify must not replay business writes",
  );
});

test("outsourcing rework never uses the retired direct disposition REWORK API", async () => {
  const fixture = outsourcingDispositionFixture({
    genericSupplierType: "outsourcing",
  });
  const evidence = await ensureOutsourcingDispositionChain({
    ...fixture,
    apply: true,
  });
  assert.equal(evidence.reworkDecision.status, "APPROVED");
  assert.equal(
    fixture.calls.filter(
      (row) => row.method === "create_outsourcing_return_disposition",
    ).length,
    1,
  );
});

test("approved outsourcing rework resumes the explicit execution without repeating human tasks or contracts", async () => {
  const fixture = outsourcingDispositionFixture({
    interruptBeforeExecution: true,
  });
  await assert.rejects(
    ensureOutsourcingDispositionChain({ ...fixture, apply: true }),
    /execution has not been applied/u,
  );
  assert.equal(fixture.batch.status, "REJECTED");
  assert.equal(fixture.batches.length, 1);
  const completedTasks = fixture.calls.filter(
    (row) => row.method === "complete_task_action",
  ).length;
  const evidence = await ensureOutsourcingDispositionChain({
    ...fixture,
    apply: true,
  });
  assert.equal(evidence.reworkDecision.execution_status, "APPLIED");
  assert.equal(
    fixture.calls.filter((row) => row.method === "complete_task_action").length,
    completedTasks,
  );
  assert.equal(
    fixture.calls.filter(
      (row) => row.method === "prepare_production_outsourcing_order",
    ).length,
    1,
  );
  assert.equal(
    fixture.calls.filter((row) => row.method === "submit_production_exception")
      .length,
    1,
  );
});

test("outsourcing preparation refuses missing binding, supplier drift and unavailable WIP before any mutation", async () => {
  const cases = [
    {
      mutate: (fixture) => {
        delete fixture.plan.productionCandidates[3].fabricOutsourcing;
      },
    },
    {
      corrupt: (kind, row) => (kind === "contract" ? { ...row, id: 999 } : row),
    },
    {
      corrupt: (kind, row) =>
        kind === "contract" ? { ...row, outsourcing_order_no: "OTHER" } : row,
    },
    {
      corrupt: (kind, row) =>
        kind === "supplier" ? { ...row, is_active: false } : row,
    },
    {
      corrupt: (kind, row) =>
        kind === "supplier" ? { ...row, supplier_type: "material" } : row,
    },
    {
      corrupt: (kind, row) => (kind === "supplier" ? { ...row, id: 999 } : row),
    },
    {
      mutate: (fixture) => {
        fixture.batch.status = "DONE";
      },
    },
    {
      mutate: (fixture) => {
        fixture.batch.execution_mode = "IN_HOUSE";
      },
    },
    {
      mutate: (fixture) => {
        fixture.batch.quantity = "2";
      },
    },
    {
      mutate: (fixture) => {
        fixture.batches.push({ ...fixture.batch, id: 999 });
      },
    },
    {
      corrupt: (kind, row) => {
        if (kind === "wip")
          row.production_order_operations[0].operation_code = "SEWING";
        return row;
      },
    },
  ];
  for (const { mutate, ...options } of cases) {
    const fixture = outsourcingDispositionFixture(options);
    mutate?.(fixture);
    await assert.rejects(
      ensureOutsourcingDispositionChain({ ...fixture, apply: true }),
    );
    assert.equal(
      fixture.calls.filter((row) =>
        /^(?:prepare|save|submit|confirm|create|post|cancel|complete|start|execute)_/u.test(
          row.method,
        ),
      ).length,
      0,
    );
  }
});

test("outsourcing rejection binds WIP quality, decision destination and executed child exactly", async () => {
  for (const corrupt of [
    (kind, row) =>
      kind === "inspection" && row.id === 802
        ? { ...row, source_type: "OUTSOURCING_FACT" }
        : row,
    (kind, row) =>
      kind === "decision" ? { ...row, quality_inspection_id: 801 } : row,
    (kind, row) =>
      kind === "decision" ? { ...row, target_supplier_id: 99 } : row,
    (kind, row) =>
      kind === "decision" ? { ...row, requested_quantity: "2" } : row,
    (kind, row) => {
      if (kind === "wip" && row.production_wip_batches.length === 2)
        row.production_wip_batches[1].quantity = "2";
      return row;
    },
    (kind, row) => {
      if (kind === "wip" && row.production_wip_batches.length === 2)
        row.production_wip_batches[1].source_batch_id = 999;
      return row;
    },
    (kind, row) => {
      if (
        kind === "process" &&
        row.source_readback.execution_status === "APPLIED"
      )
        row.process_context.nodes.at(-1).status = "active";
      return row;
    },
  ]) {
    const fixture = outsourcingDispositionFixture({ corrupt });
    await assert.rejects(
      ensureOutsourcingDispositionChain({ ...fixture, apply: true }),
    );
  }
});

test("outsourcing supplier mixed is supported while verify cannot prepare absent specimens", async () => {
  const mixed = outsourcingDispositionFixture({
    corrupt: (kind, row) =>
      kind === "supplier" ? { ...row, supplier_type: "mixed" } : row,
  });
  assert.equal(
    (await ensureOutsourcingDispositionChain({ ...mixed, apply: true }))
      .supplier.supplier_type,
    "mixed",
  );
  const fresh = outsourcingDispositionFixture();
  await assert.rejects(
    ensureOutsourcingDispositionChain({ ...fresh, apply: false }),
    /outsourcing source order is missing/u,
  );
  assert.equal(
    fresh.calls.filter((row) =>
      /^(?:prepare|save|submit|confirm|create|post|cancel|complete|start|execute)_/u.test(
        row.method,
      ),
    ).length,
    0,
  );
});

test("exception outsourcing readbacks use the fact transport strict document params", async () => {
  const plan = {
    dataVersion: "2026.09.27-v8",
    anchorDate: "2026-10-18T00:00:00Z",
    outsourcingCandidates: [{ issue: { order: { id: 501 } } }],
    productionCandidates: [
      null,
      null,
      null,
      { fabricOutsourcing: { order: { id: 501, orderNo: "SOURCE-501" } } },
    ],
  };
  const requests = [];
  const stopAfterReadback = new Error("second outsourcing readback captured");
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    const domain = new URL(url).pathname.split("/").at(-1);
    const { method, params } = body;
    requests.push({ domain, method, params });
    let data;
    switch (method) {
      case "list_production_facts":
        data = {
          production_facts: [
            {
              id: 44,
              fact_no: manualAcceptanceBusinessNo({
                dataVersion: plan.dataVersion,
                code: "FG",
                sequence: 982,
              }),
              fact_type: "REWORK",
              source_type: "PRODUCTION_FACT",
              source_id: 90,
              quantity: "1",
              status: "POSTED",
            },
          ],
          total: 1,
        };
        break;
      case "get_production_order":
        data = {
          production_order: { id: 101, order_no: "MO-101", status: "RELEASED" },
          production_order_items: [{ id: 201 }],
        };
        break;
      case "get_production_wip":
        data = {
          production_wip_batches: [
            {
              id: 401,
              production_order_id: 101,
              origin_rework_fact_id: 44,
              production_order_item_id: 201,
              production_order_operation_id: 301,
              status: "PLANNED",
              flow_type: "REWORK",
              version: 1,
              quantity: "1",
            },
          ],
          production_order_operations: [
            {
              id: 301,
              production_order_id: 101,
              production_order_item_id: 201,
              operation_code: "HANDWORK",
              outsourcing_allowed: true,
            },
          ],
        };
        break;
      case "get_outsourcing_order":
        assert.deepEqual(params, {
          id:
            requests.filter((request) => request.method === method).length === 1
              ? 501
              : 502,
        });
        if (params.id === 502) throw stopAfterReadback;
        data = {
          outsourcing_order: {
            id: 501,
            outsourcing_order_no: "SOURCE-501",
            lifecycle_status: "confirmed",
            supplier_id: 9,
            contract_party_snapshot: {},
            supplier_snapshot: {},
          },
        };
        break;
      case "get_supplier":
        data = {
          supplier: { id: 9, supplier_type: "outsourcing", is_active: true },
        };
        break;
      case "list_outsourcing_orders":
        data = { outsourcing_orders: [], total: 0 };
        break;
      case "prepare_production_outsourcing_order":
        assert.equal(Object.hasOwn(params, "customer_key"), false);
        data = { outsourcing_order_id: 502 };
        break;
      default:
        throw new Error(`unexpected ${domain}.${method}`);
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ result: { code: 0, data } }),
    };
  };
  const rpc = ({ domain, method, params }) =>
    manualAcceptanceFactRPCCall({
      backendURL: "http://127.0.0.1:8310",
      domain,
      method,
      params: manualAcceptanceFactRPCParams(domain, method, params),
      fetchImpl,
    });
  await assert.rejects(
    ensureOutsourcingDispositionChain({
      rpc,
      plan,
      production: [
        null,
        null,
        null,
        { order: { id: 101 }, completion: { id: 90 } },
      ],
      apply: true,
    }),
    (error) => error === stopAfterReadback,
  );
  assert.deepEqual(
    requests
      .filter((request) => request.method === "get_outsourcing_order")
      .map((request) => request.params),
    [{ id: 501 }, { id: 502 }],
  );
});

function purchaseDispositionFixture({
  quantities = ["1", "2", "3.250000"],
  corruptDisposition,
  corruptReplacement,
  corruptInspection,
} = {}) {
  const plan = { dataVersion: "2026.09.27-v8" };
  const purchase = {
    purchaseReceipts: quantities.map((quantity, index) => ({
      id: 10 + index,
      supplier_id: 7,
      status: "DRAFT",
      items: [
        {
          id: 20 + index,
          purchase_order_item_id: 40 + index,
          quantity,
          declared_quantity: "999",
          unit_id: 1,
          warehouse_id: 2,
          material_id: 3,
        },
      ],
    })),
    qualityInspections: quantities.map((_, index) => ({
      id: 30 + index,
      source_type: "PURCHASE_RECEIPT",
      status: "REJECTED",
      purchase_receipt_id: 10 + index,
      purchase_receipt_item_id: 20 + index,
    })),
  };
  const calls = [],
    dispositions = new Map();
  let replacement, quality;
  const rpc = async (request) => {
    calls.push(structuredClone(request));
    const { actor, method, params } = request;
    const responseRecord = (record) =>
      corruptDisposition
        ? corruptDisposition(structuredClone(record))
        : structuredClone(record);
    switch (method) {
      case "list_purchase_rejection_dispositions": {
        assert.equal(actor, "purchase");
        const rows = [...dispositions.values()].filter(
          (row) => row.quality_inspection_id === params.quality_inspection_id,
        );
        return {
          purchase_rejection_dispositions: rows.map(responseRecord),
          total: rows.length,
        };
      }
      case "create_purchase_rejection_disposition": {
        assert.equal(actor, "purchase");
        const inspection = purchase.qualityInspections.find(
          (row) => row.id === params.quality_inspection_id,
        );
        const record = {
          id: dispositions.size + 100,
          ...params,
          status: "DRAFT",
          version: 1,
          purchase_receipt_id: inspection.purchase_receipt_id,
          purchase_receipt_item_id: inspection.purchase_receipt_item_id,
        };
        dispositions.set(record.id, record);
        return { purchase_rejection_disposition: responseRecord(record) };
      }
      case "post_purchase_rejection_disposition": {
        const record = dispositions.get(params.id);
        assert.equal(record.status, "DRAFT");
        assert.equal(params.expected_version, record.version);
        if (record.disposition_type === "REPLACE") {
          assert.equal(actor, "warehouse");
          assert.deepEqual(params, {
            id: record.id,
            expected_version: record.version,
            counted_quantity: quantities[2],
          });
          assert.notEqual(
            params.counted_quantity,
            purchase.purchaseReceipts[2].items[0].declared_quantity,
          );
          replacement = {
            id: 900,
            supplier_id: 7,
            status: "DRAFT",
            items: [
              {
                ...purchase.purchaseReceipts[2].items[0],
                id: 901,
                quantity: record.quantity,
              },
            ],
          };
          quality = {
            id: 902,
            status: "DRAFT",
            source_type: "PURCHASE_RECEIPT",
            inspection_type: "INCOMING",
            purchase_receipt_id: 900,
            purchase_receipt_item_id: 901,
          };
          record.replacement_receipt_id = replacement.id;
        } else {
          assert.equal(actor, "purchase");
          assert.deepEqual(params, {
            id: record.id,
            expected_version: record.version,
          });
        }
        record.status = "POSTED";
        record.version += 1;
        return { purchase_rejection_disposition: responseRecord(record) };
      }
      case "cancel_purchase_rejection_disposition": {
        assert.equal(actor, "purchase");
        const record = dispositions.get(params.id);
        assert.equal(params.expected_version, record.version);
        record.status = "CANCELLED";
        record.version += 1;
        return { purchase_rejection_disposition: responseRecord(record) };
      }
      case "get_purchase_receipt": {
        assert.equal(actor, "warehouse");
        const receipt = structuredClone(
          params.id === 900
            ? replacement
            : purchase.purchaseReceipts.find((row) => row.id === params.id),
        );
        return {
          purchase_receipt:
            params.id === 900 && corruptReplacement
              ? corruptReplacement(receipt)
              : receipt,
        };
      }
      case "list_quality_inspections":
        assert.equal(actor, "quality");
        assert.equal(params.purchase_receipt_id, replacement.id);
        return {
          quality_inspections: [
            corruptInspection
              ? corruptInspection(structuredClone(quality))
              : structuredClone(quality),
          ],
          total: 1,
        };
      case "submit_quality_inspection":
        assert.equal(actor, "quality");
        assert.equal(params.id, quality.id);
        quality.status = "SUBMITTED";
        return { quality_inspection: structuredClone(quality) };
      case "pass_quality_inspection":
        assert.equal(actor, "quality");
        assert.equal(params.id, quality.id);
        quality.status = "PASSED";
        return { quality_inspection: structuredClone(quality) };
      case "post_purchase_receipt":
        assert.equal(actor, "warehouse");
        assert.deepEqual(params, { id: replacement.id });
        replacement.status = "POSTED";
        return { purchase_receipt: structuredClone(replacement) };
      default:
        assert.fail(`unexpected purchase disposition RPC ${method}`);
    }
  };
  return { plan, purchase, rpc, calls };
}

test("replacement posting shares the exact server allowlist and preserves explicit counted quantity", () => {
  assert.deepEqual(
    FORMAL_RPC_PARAM_ALLOWLIST["purchase.post_purchase_rejection_disposition"],
    ["id", "expected_version", "counted_quantity"],
  );
  const params = { id: 1, expected_version: 2, counted_quantity: "3.250000" };
  assert.deepEqual(
    manualAcceptanceFactRPCParams(
      "purchase",
      "post_purchase_rejection_disposition",
      params,
    ),
    params,
  );
});

test("purchase replacement is explicitly counted by warehouse while returns stay with purchasing and resume does not repost", async () => {
  const fixture = purchaseDispositionFixture();
  const run = (apply) => ensurePurchaseDispositionChain({ ...fixture, apply });
  const result = await run(true);
  assert.deepEqual(
    result.records.map((row) => row.status),
    ["POSTED", "CANCELLED", "POSTED"],
  );
  assert.equal(result.replacementReceipts.length, 1);
  assert.equal(result.replacementReceipts[0].status, "POSTED");
  assert.equal(
    result.replacementInspections[0].purchase_receipt_id,
    result.replacementReceipts[0].id,
  );
  assert.equal(result.replacementInspections[0].status, "PASSED");
  assert.ok(result.sourceReceipts.every((row) => row.status === "DRAFT"));
  const mutations = () =>
    fixture.calls.filter((row) =>
      /^(?:create|post|cancel|submit|pass)_/u.test(row.method),
    ).length;
  const mutationCount = mutations();
  assert.deepEqual(await run(true), result);
  assert.equal(mutations(), mutationCount);
  assert.deepEqual(await run(false), result);
  assert.equal(mutations(), mutationCount);
});

test("purchase disposition rejects quantity drift, unknown types and invalid source decimals before posting", async () => {
  for (const patch of [{ quantity: "999" }, { disposition_type: "UNKNOWN" }]) {
    const fixture = purchaseDispositionFixture({
      corruptDisposition: (row) => ({ ...row, ...patch }),
    });
    await assert.rejects(
      () => ensurePurchaseDispositionChain({ ...fixture, apply: true }),
      /source or state drifted/u,
    );
    assert.equal(
      fixture.calls.filter((row) => row.method.startsWith("post_")).length,
      0,
    );
  }
  for (const quantity of ["0", "-1", "1.0000001", "not-a-quantity", 3]) {
    const fixture = purchaseDispositionFixture({
      quantities: [quantity, "2", "3"],
    });
    await assert.rejects(
      () => ensurePurchaseDispositionChain({ ...fixture, apply: true }),
      /positive exact decimal/u,
    );
    assert.equal(
      fixture.calls.filter((row) =>
        /^(?:create|post|cancel)_/u.test(row.method),
      ).length,
      0,
    );
  }
});

test("replacement receipt and IQC must retain their exact source grain before quality or inbound writes", async () => {
  for (const options of [
    { corruptReplacement: (row) => ({ ...row, supplier_id: 999 }) },
    {
      corruptReplacement: (row) => ({
        ...row,
        items: [{ ...row.items[0], purchase_order_item_id: 999 }],
      }),
    },
    {
      corruptReplacement: (row) => ({
        ...row,
        items: [{ ...row.items[0], quantity: "999" }],
      }),
    },
    { corruptInspection: (row) => ({ ...row, purchase_receipt_id: 999 }) },
    { corruptInspection: (row) => ({ ...row, purchase_receipt_item_id: 999 }) },
  ]) {
    const fixture = purchaseDispositionFixture(options);
    await assert.rejects(
      () => ensurePurchaseDispositionChain({ ...fixture, apply: true }),
      /source or state drifted/u,
    );
    assert.equal(
      fixture.calls.filter((row) =>
        [
          "submit_quality_inspection",
          "pass_quality_inspection",
          "post_purchase_receipt",
        ].includes(row.method),
      ).length,
      0,
    );
  }
});

test("exception chain evidence requires task, source, fact and reversal readbacks", () => {
  assert.equal(
    assertManualAcceptanceExceptionChainCoverage(exceptionChainFixture()),
    true,
  );
  const mutations = [
    (data) => {
      delete data.inventoryAdjustment;
    },
    (data) => {
      data.inventoryAdjustment.records[0].status = "APPROVED";
    },
    (data) => {
      data.inventoryAdjustment.txns[2].reversal_of_txn_id = 999;
    },
    (data) => {
      data.inventoryAdjustment.txns[0].lot_id = 999;
    },
    (data) => {
      data.inventoryAdjustment.processes[0].nodes.at(-1).status = "active";
    },
    (data) => {
      data.inventoryAdjustment.tasks[0].task_status_key = "ready";
    },
    (data) => {
      data.purchaseDisposition.sourceReceipts[0].status = "POSTED";
    },
    (data) => {
      data.purchaseDisposition.replacementInspections[0].status = "SUBMITTED";
    },
    (data) => {
      data.productionException.records[0].quality_inspection_id = 999;
    },
    (data) => {
      data.productionException.records[1].execution_status = "PENDING";
    },
    (data) => {
      data.productionException.batch.status = "CANCELLED";
    },
    (data) => {
      data.outsourcingDisposition.reworkBatch.source_batch_id = 999;
    },
    (data) => {
      data.outsourcingDisposition.allocation.production_wip_batch_id = 999;
    },
    (data) => {
      data.outsourcingDisposition.txns.pop();
    },
    (data) => {
      data.outsourcingDisposition.reworkDecision.execution_status = "PENDING";
    },
    (data) => {
      data.outsourcingDisposition.reworkDecision.quality_inspection_id = 405;
    },
    (data) => {
      data.outsourcingDisposition.reworkDecision.target_supplier_id = 999;
    },
    (data) => {
      data.outsourcingDisposition.reworkDecision.approved_quantity = "2";
    },
    (data) => {
      data.outsourcingDisposition.reworkBatch.origin_exception_decision_id = 999;
    },
    (data) => {
      data.outsourcingDisposition.reworkBatch.production_order_operation_id = 999;
    },
    (data) => {
      data.outsourcingDisposition.batch.status = "REJECTED";
    },
    (data) => {
      data.outsourcingDisposition.tasks[0].task_status_key = "ready";
    },
    (data) => {
      data.outsourcingDisposition.processes[0].nodes.at(-1).status = "active";
    },
    (data) => {
      data.outsourcingDisposition.supplier.supplier_type = "material";
    },
    (data) => {
      data.outsourcingDisposition.outsourcingOrder.supplier_snapshot = {
        supplier_id: 999,
      };
    },
  ];
  for (const mutate of mutations) {
    const data = exceptionChainFixture();
    mutate(data);
    assert.throws(() => assertManualAcceptanceExceptionChainCoverage(data));
  }
});

test("verify mode refuses missing specimens without calling a write endpoint", async () => {
  const calls = [];
  const rpc = async ({ method }) => {
    calls.push(method);
    assert.match(method, /^list_/u);
    return {
      inventory_operations: [],
      purchase_rejection_dispositions: [],
      total: 0,
    };
  };
  const plan = { dataVersion: "2026.09.27-v8" };
  const receipt = {
    id: 1,
    status: "POSTED",
    items: [
      {
        id: 3,
        material_id: 4,
        unit_id: 5,
        warehouse_id: 2,
        lot_id: 6,
        quantity: "1",
      },
    ],
  };
  await assert.rejects(
    ensureInventoryAdjustmentChain({
      rpc,
      plan,
      purchase: { purchaseReceipts: [receipt] },
      apply: false,
    }),
    /is missing/u,
  );
  receipt.status = "DRAFT";
  const rejected = [1, 2, 3].map((id) => ({
    id,
    source_type: "PURCHASE_RECEIPT",
    status: "REJECTED",
    purchase_receipt_id: 1,
    purchase_receipt_item_id: 3,
  }));
  await assert.rejects(
    ensurePurchaseDispositionChain({
      rpc,
      plan,
      purchase: { purchaseReceipts: [receipt], qualityInspections: rejected },
      apply: false,
    }),
    /is missing/u,
  );
  assert.equal(calls.length, 2);
});
