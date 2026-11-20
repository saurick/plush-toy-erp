import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  buildManualAcceptanceDailyTaskBoard,
  reconcileManualAcceptanceDailyTaskBoard,
} from "./manual-acceptance-task-board-data.mjs";

const identity = {
  target: "scenario-demo",
  backendURL: "http://127.0.0.1:8300",
  databaseName: "plush_erp",
  datasetKey: "yoyoosun-manual-acceptance",
  dataVersion: "2026.11.07-v9",
  runId: "20261107-V9",
};

function input() {
  const roles = [
    "admin",
    "boss",
    "engineering",
    "sales",
    "purchase",
    "pmc",
    "production",
    "warehouse",
    "quality",
    "finance",
  ];
  const actorIDs = Object.fromEntries(roles.map((role, i) => [role, i + 1]));
  const plan = {
    ...identity,
    batchRunId: identity.runId,
    tasks: roles
      .filter((role) => role !== "admin")
      .map((role) => ({
        roleKey: role,
        targetStatus: "ready",
        assignmentMode: "owner_pool",
        createParams: {
          task_code: `OLD-${role}-01`,
          task_name: "核对样例",
          task_group: "trial",
          owner_pool_key: role,
          required_capability_key: "workflow.task.complete",
        },
      })),
  };
  const sourceReport = {
    ...identity,
    simulatedOnly: true,
    realCustomerImport: false,
    prefix: "YS9",
    anchorDate: "2026-11-07",
    productImages: {
      records: Array.from({ length: 6 }, (_, i) => ({
        productId: i + 1,
        styleKey: `style-${i}`,
        productCode: `YS9-CP-${i + 1}`,
        attachmentId: i + 20,
      })),
    },
    referenceRecords: {
      salesOrders: Array.from({ length: 6 }, (_, i) => ({
        id: i + 10,
        orderNo: `YS9-XD-00${i + 1}`,
        items: [{ productId: i + 1 }],
      })),
      outsourcingOrders: Array.from({ length: 6 }, (_, i) => ({
        id: i + 40,
        orderNo: `YS9-WW-00${i + 1}`,
        items: [{ subjectId: i + 1, subjectType: "PRODUCT" }],
      })),
    },
  };
  return { plan, sourceReport, actorIDs };
}

test("daily samples distribute real product sources and allowed statuses without granting the boss a new action", () => {
  const args = input();
  const nowSec = Date.UTC(2026, 11, 1, 9) / 1000;
  const { tasks } = buildManualAcceptanceDailyTaskBoard({ ...args, nowSec });
  assert.equal(tasks.length, 240);
  assert.ok(
    tasks.every(
      (task) => task.due_at > nowSec && task.source.productIDs.length > 0,
    ),
  );
  assert.ok(!tasks.some((task) => task.role === "boss"));
  const engineering = tasks.filter((task) => task.role === "engineering");
  assert.equal(engineering.length, 30);
  assert.ok(engineering.every((task) => task.type === "sales_order"));
  assert.equal(new Set(engineering.map((task) => task.source.id)).size, 6);
  assert.ok(!engineering.some((task) => task.status === "rejected"));
  assert.equal(
    tasks.filter(
      (task) => task.role === "quality" && task.status === "rejected",
    ).length,
    3,
  );
  assert.throws(
    () =>
      buildManualAcceptanceDailyTaskBoard({
        ...args,
        sourceReport: { ...args.sourceReport, databaseName: "wrong" },
      }),
    /databaseName differs/u,
  );
});

test("a missing product image in a new task prevents every old-task retirement", async () => {
  const args = input();
  const { actorIDs } = args;
  const calls = [];
  const old = {
    id: 90,
    version: 1,
    task_code: "OLD-engineering-01",
    task_name: "核对样例",
    task_group: "trial",
    owner_role_key: "engineering",
    owner_pool_key: "engineering",
    required_capability_key: "workflow.task.complete",
    task_status_key: "ready",
  };
  let created;
  const call = async (role, domain, method, params) => {
    calls.push(method);
    if (method === "list_tasks") {
      const tasks = role === "engineering" && params.keyword ? [old] : [];
      return { tasks, total: tasks.length };
    }
    if (method === "get_task_create_options") {
      return {
        source_no: [
          ...args.sourceReport.referenceRecords.salesOrders,
          ...args.sourceReport.referenceRecords.outsourcingOrders,
        ].find((row) => row.id === params.source_id).orderNo,
        can_create: true,
        roles: Object.entries(actorIDs).map(([role_key, admin_id]) => ({
          role_key,
          assignees: [{ admin_id }],
        })),
      };
    }
    if (method === "create_followup_task") {
      created = {
        id: 91,
        version: 1,
        task_code:
          "FOLLOWUP-" +
          createHash("sha256")
            .update(`${actorIDs.admin}:${params.idempotency_key}`)
            .digest("hex")
            .slice(0, 40),
        task_name: params.task_name,
        task_group: "business_followup",
        owner_role_key: params.owner_role_key,
        source_type: params.source_type,
        source_id: params.source_id,
        source_no: "YS9-XD-001",
        task_status_key: "ready",
      };
      return { task: created };
    }
    if (method === "get_task") return { task: created };
    throw new Error(`unexpected call ${method}`);
  };
  await assert.rejects(
    () =>
      reconcileManualAcceptanceDailyTaskBoard({ ...args, call, apply: true }),
    /has no product source/u,
  );
  assert.equal(
    calls.filter((method) => method === "create_followup_task").length,
    1,
  );
  assert.ok(
    !calls.some((method) =>
      /(?:resume|complete|reject)_task_action/u.test(method),
    ),
  );
});
