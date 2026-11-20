import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const MANUAL_ACCEPTANCE_DAILY_TASK_CONTRACT =
  "manual-acceptance-source-task-board/v1";
export const MANUAL_ACCEPTANCE_DAILY_ROLE_TASK_COUNT = 30;

const DAY = 24 * 60 * 60;
const ROLE_TOPICS = Object.freeze({
  engineering: [
    "检查款图尺寸",
    "补充材料明细",
    "整理首件要求",
    "确认包装资料",
    "补充车缝说明",
  ],
  sales: [
    "核对订单款式",
    "确认客户包装要求",
    "核对订单交付备注",
    "核对产品与款号",
    "跟进订单图样确认",
  ],
  purchase: [
    "核对加工款式与工序",
    "确认加工厂图样",
    "核对加工件要求",
    "复核加工辅料说明",
    "核对加工交付资料",
  ],
  pmc: [
    "核对订单款式与排程",
    "核对样件准备",
    "确认交期所需资料",
    "核对待产产品清单",
    "检查物料准备要求",
  ],
  production: [
    "核对加工样件",
    "确认车缝用图",
    "核对加工工艺说明",
    "检查首件外观要求",
    "核对加工回货资料",
  ],
  warehouse: [
    "按订单款式核对备货",
    "确认外箱款式识别",
    "核对产品与规格",
    "核对订单包装图样",
    "确认交接资料",
  ],
  quality: [
    "核对成品外观图样",
    "确认尺寸检验要求",
    "整理首件检验资料",
    "核对色差参考",
    "核对包装检验要求",
  ],
  finance: [
    "核对订单款式与结算资料",
    "检查订单明细资料",
    "核对业务附件",
    "核对加工项说明",
    "核对结算来源单据",
  ],
});
const ROLES = Object.keys(ROLE_TOPICS);
const REJECT_ROLES = new Set(["boss", "warehouse", "quality", "finance"]);
const OUTSOURCING_ROLES = new Set([
  "purchase",
  "production",
  "warehouse",
  "quality",
  "finance",
]);
const RETIRE_REASON = "已有按来源单据生成的手测任务，本独立样例结束。";

function sameBatch(source, plan) {
  for (const key of [
    "target",
    "backendURL",
    "databaseName",
    "datasetKey",
    "dataVersion",
    "runId",
  ]) {
    assert.ok(plan[key], `task board requires ${key}`);
    assert.equal(source?.[key], plan[key], `task board source ${key} differs`);
  }
  assert.equal(source.simulatedOnly, true);
  assert.equal(source.realCustomerImport, false);
}

const compare = (left, right) =>
  left.orderNo.localeCompare(right.orderNo, "en");
const isOpen = (row) => ["ready", "blocked"].includes(row.task_status_key);
const isPositiveID = (value) => Number.isSafeInteger(value) && value > 0;
const optionalID = (value) => (value == null ? 0 : value);

export function buildManualAcceptanceDailyTaskBoard({
  plan,
  sourceReport,
  nowSec = Math.floor(Date.now() / 1000),
}) {
  sameBatch(sourceReport, plan);
  assert.match(sourceReport.anchorDate, /^\d{4}-\d{2}-\d{2}$/u);
  const todayNoon = Math.floor((nowSec + 8 * 3600) / DAY) * DAY + 4 * 3600;
  const anchor = Math.max(
    todayNoon,
    Math.floor(Date.parse(`${sourceReport.anchorDate}T12:00:00+08:00`) / 1000),
  );
  assert.ok(Number.isSafeInteger(anchor));
  const images = new Map(
    sourceReport.productImages.records.map((item) => [item.productId, item]),
  );
  const pick = (rows, items) => {
    const chosen = new Map();
    for (const row of rows.slice().sort(compare)) {
      assert.ok(
        isPositiveID(row.id) &&
          row.orderNo.startsWith(`${sourceReport.prefix}-`),
      );
      const productIDs = [...new Set(items(row))];
      if (!productIDs.length || productIDs.some((id) => !images.has(id)))
        continue;
      const image = images.get(productIDs[0]);
      if (chosen.has(image.styleKey)) continue;
      chosen.set(image.styleKey, {
        id: row.id,
        orderNo: row.orderNo,
        productIDs,
      });
      if (chosen.size === 6) break;
    }
    assert.equal(
      chosen.size,
      6,
      "daily image tasks need six different source product styles",
    );
    return [...chosen.values()];
  };
  const references = sourceReport.referenceRecords;
  const sales = pick(references.salesOrders, (row) =>
    row.items.map((line) => line.productId),
  );
  const outsourcing = pick(references.outsourcingOrders, (row) =>
    row.items
      .filter((line) => line.subjectType === "PRODUCT")
      .map((line) => line.subjectId),
  );
  const statusesFor = (role) => [
    ...Array(18).fill("ready"),
    ...Array(6).fill("blocked"),
    ...Array(REJECT_ROLES.has(role) ? 3 : 6).fill("done"),
    ...Array(REJECT_ROLES.has(role) ? 3 : 0).fill("rejected"),
  ];
  const tasks = ROLES.flatMap((role) =>
    statusesFor(role).map((status, index) => {
      const useOutsourcing =
        role === "production" ||
        (OUTSOURCING_ROLES.has(role) &&
          (role === "purchase" || index % 2 === 1));
      const type = useOutsourcing ? "outsourcing_order" : "sales_order";
      const source = (useOutsourcing ? outsourcing : sales)[index % 6];
      return {
        role,
        type,
        source,
        status,
        assigned: index % 2 === 0,
        task_name: ROLE_TOPICS[role][Math.floor(index / 6)],
        due_at: anchor + [1, 2, 3, 6, 8, 12][index % 6] * DAY,
        idempotency_key: `manual-acceptance:${plan.batchRunId}:source-board:${role}:${index + 1}`,
      };
    }),
  );
  return { tasks, images, roles: ROLES };
}

function getTask(result) {
  assert.ok(
    isPositiveID(result?.task?.id) && isPositiveID(result?.task?.version),
    "task result incomplete",
  );
  return result.task;
}

function taskSample(task, images) {
  const products = (task.display_context?.items || []).filter(
    (item) => item.kind === "product",
  );
  assert.ok(
    products.length && task.source_id > 0 && task.source_no,
    `${task.task_code} has no product source`,
  );
  for (const product of products) {
    const expected = images.get(product.product_id);
    assert.ok(expected, `${task.task_code} product is outside this batch`);
    assert.equal(
      product.image_attachment_id,
      expected.attachmentId,
      `${task.task_code} product image differs`,
    );
  }
  return {
    id: task.id,
    taskCode: task.task_code,
    status: task.task_status_key,
    group: task.task_group,
    role: task.owner_role_key,
    sourceType: task.source_type,
    sourceID: task.source_id,
    sourceNo: task.source_no,
    products: products.map((item) => ({
      code: images.get(item.product_id).productCode,
      id: item.product_id,
      attachmentId: item.image_attachment_id,
    })),
  };
}

async function action(call, role, task, kind, key, reason) {
  const methods = {
    block: "block_task_action",
    complete: "complete_task_action",
    reject: "reject_task_action",
    resume: "resume_task_action",
  };
  return getTask(
    await call(role, "workflow", methods[kind], {
      task_id: task.id,
      expected_version: task.version,
      action_key: kind,
      idempotency_key: key,
      reason,
      ...(kind === "complete" ? { payload: { feedback: reason } } : {}),
    }),
  );
}

async function listRoleTasks(call, role, params) {
  const rows = [];
  for (let offset = 0; ;) {
    assert.ok(offset < 10_000, `${role} task paging exceeded bound`);
    const page = await call(role, "workflow", "list_tasks", {
      ...params,
      owner_role_key: role,
      limit: 100,
      offset,
    });
    assert.ok(Array.isArray(page.tasks) && Number.isSafeInteger(page.total));
    rows.push(...page.tasks);
    offset += page.tasks.length;
    if (offset >= page.total) return rows;
    assert.ok(page.tasks.length);
  }
}

function stableCode(actorId, key) {
  return `FOLLOWUP-${createHash("sha256").update(`${actorId}:${key}`).digest("hex").slice(0, 40)}`;
}

export async function reconcileManualAcceptanceDailyTaskBoard({
  plan,
  sourceReport,
  actorIDs,
  call,
  apply = false,
}) {
  const { tasks, images, roles } = buildManualAcceptanceDailyTaskBoard({
    plan,
    sourceReport,
  });
  assert.ok(isPositiveID(actorIDs.admin));
  const existing = new Map();
  const legacy = new Map();
  const previousPrefixes = {};
  for (const role of ["boss", ...roles]) {
    assert.ok(isPositiveID(actorIDs[role]));
    if (role !== "boss") {
      const rows = await listRoleTasks(call, role, {
        task_group: "business_followup",
      });
      for (const row of rows) existing.set(row.task_code, row);
    }
    const codes = plan.tasks.filter((row) => row.roleKey === role);
    const byCode = new Map(
      codes.map((row) => [row.createParams.task_code, row]),
    );
    const keyword = codes[0]?.createParams.task_code.replace(/-\d+$/u, "-");
    assert.ok(keyword);
    previousPrefixes[role] = keyword;
    legacy.set(
      role,
      (await listRoleTasks(call, role, { keyword }))
        .filter((row) => byCode.has(row.task_code))
        .map((row) => [row, byCode.get(row.task_code)]),
    );
  }
  const codeFor = (task) => stableCode(actorIDs.admin, task.idempotency_key);
  function assertSource(task, row) {
    assert.equal(row.task_code, codeFor(task));
    assert.equal(row.task_name, task.task_name);
    assert.equal(row.owner_role_key, task.role);
    assert.equal(row.source_type, task.type);
    assert.equal(row.source_id, task.source.id);
    assert.equal(row.source_no, task.source.orderNo);
  }
  const preflight = new Map();
  for (const task of tasks) {
    const row = existing.get(codeFor(task));
    if (row) {
      assertSource(task, row);
      continue;
    }
    const key = `${task.type}:${task.source.id}`;
    if (!preflight.has(key)) {
      preflight.set(
        key,
        await call("admin", "workflow", "get_task_create_options", {
          source_type: task.type,
          source_id: task.source.id,
        }),
      );
    }
    const options = preflight.get(key);
    assert.equal(options.source_no, task.source.orderNo);
    assert.ok(
      options.can_create &&
        options.roles.some(
          (row) =>
            row.role_key === task.role &&
            row.assignees.some(
              (member) => member.admin_id === actorIDs[task.role],
            ),
        ),
      `${task.role} cannot receive a task from ${task.source.orderNo}`,
    );
  }
  const pristine = [];
  const preserved = [];
  for (const [role, rows] of legacy)
    for (const [row, planned] of rows) {
      if (!isOpen(row)) continue;
      const p = planned.createParams;
      const initialVersion = planned.targetStatus === "ready" ? 1 : 2;
      const identityMatches =
        !row.source_type &&
        !row.source_id &&
        !row.source_no &&
        !row.process_instance_id &&
        !row.process_node_instance_id &&
        !row.config_revision &&
        row.owner_role_key === role &&
        row.task_group === p.task_group &&
        row.task_name === p.task_name &&
        row.owner_pool_key === p.owner_pool_key &&
        row.required_capability_key === p.required_capability_key &&
        optionalID(row.assignee_id) ===
          (planned.assignmentMode === "role_account" ? actorIDs[role] : 0);
      const unchanged =
        identityMatches &&
        row.version === initialVersion &&
        row.task_status_key === planned.targetStatus;
      if (unchanged) pristine.push({ row, role });
      else if (
        row.task_status_key === "ready" &&
        row.version === 3 &&
        planned.targetStatus === "blocked" &&
        identityMatches
      ) {
        const result = await call(role, "workflow", "list_task_events", {
          task_id: row.id,
          limit: 1,
        });
        const event = result.items?.[0];
        if (event?.reason === RETIRE_REASON) pristine.push({ row, role });
        else preserved.push({ role, code: row.task_code });
      } else preserved.push({ role, code: row.task_code });
    }
  const overview = {
    contract: MANUAL_ACCEPTANCE_DAILY_TASK_CONTRACT,
    planned: tasks.length,
    create: tasks.filter((row) => !existing.has(codeFor(row))).length,
    retire: pristine.length,
    preserved,
    previousPrefixes,
    binding: createHash("sha256")
      .update(
        JSON.stringify({
          tasks: tasks.map((task) => [
            codeFor(task),
            task.role,
            task.type,
            task.source.id,
            task.source.orderNo,
            task.status,
            task.due_at,
            task.assigned,
          ]),
          retire: pristine
            .map(({ row, role }) => [role, row.task_code, row.id, row.version])
            .sort(),
        }),
      )
      .digest("hex"),
  };
  if (!apply) return overview;

  const samples = [];
  for (const task of tasks) {
    let current = existing.get(codeFor(task));
    if (!current) {
      current = getTask(
        await call("admin", "workflow", "create_followup_task", {
          source_type: task.type,
          source_id: task.source.id,
          task_name: task.task_name,
          description: "请按订单上的产品图、款号和业务资料核对。",
          owner_role_key: task.role,
          ...(task.assigned ? { assignee_id: actorIDs[task.role] } : {}),
          priority: 0,
          due_at: task.due_at,
          idempotency_key: task.idempotency_key,
        }),
      );
    }
    assertSource(task, current);
    if (
      current.task_status_key === "ready" &&
      current.version === 1 &&
      task.status !== "ready"
    ) {
      const kind = { blocked: "block", done: "complete", rejected: "reject" }[
        task.status
      ];
      const reason = {
        block: "待补齐本款的规格或外观确认资料。",
        complete: "已核对款号、产品图片和对应资料。",
        reject: "款式要求还需核对，请补齐资料后再提交。",
      }[kind];
      current = await action(
        call,
        task.role,
        current,
        kind,
        `${task.idempotency_key}:${kind}`,
        reason,
      );
      assert.equal(current.task_status_key, task.status);
    }
    const verified = getTask(
      await call(task.role, "workflow", "get_task", { task_id: current.id }),
    );
    const sample = taskSample(verified, images);
    assert.ok(
      sample.products.every((product) =>
        task.source.productIDs.includes(product.id),
      ),
    );
    samples.push(sample);
  }

  const bossBoard = await call("boss", "workflow", "get_task_board", {
    todo_only: true,
    limit: 20,
    offset: 0,
  });
  const bossRows = new Map(
    [
      ...bossBoard.lanes.flatMap((lane) => lane.tasks || []),
      ...(await listRoleTasks(call, "boss", {})),
    ].map((row) => [row.id, row]),
  );
  const boss = [...bossRows.values()].filter((task) => {
    const products = (task.display_context?.items || []).filter(
      (item) => item.kind === "product",
    );
    return (
      products.length &&
      products.every((item) => images.has(item.product_id)) &&
      task.source_id > 0 &&
      task.source_no
    );
  });
  const bossByStatus = new Map();
  for (const task of boss) {
    const rows = bossByStatus.get(task.task_status_key) || [];
    if (rows.length < MANUAL_ACCEPTANCE_DAILY_ROLE_TASK_COUNT)
      rows.push(taskSample(task, images));
    bossByStatus.set(task.task_status_key, rows);
  }
  assert.ok(
    (bossByStatus.get("ready") || []).length >= 20,
    "boss needs current source-backed approval tasks",
  );
  samples.push(...[...bossByStatus.values()].flat());

  const retired = [];
  for (const { row, role } of pristine) {
    let current = row;
    const key = `manual-acceptance:${plan.batchRunId}:retire-unbound:${row.task_code}`;
    if (current.task_status_key === "blocked") {
      current = await action(
        call,
        role,
        current,
        "resume",
        `${key}:resume`,
        RETIRE_REASON,
      );
    }
    const kind = REJECT_ROLES.has(role) ? "reject" : "complete";
    current = await action(
      call,
      role,
      current,
      kind,
      `${key}:${kind}`,
      RETIRE_REASON,
    );
    assert.ok(!isOpen(current));
    retired.push({
      role,
      code: current.task_code,
      status: current.task_status_key,
    });
  }
  return { ...overview, samples, retired };
}
