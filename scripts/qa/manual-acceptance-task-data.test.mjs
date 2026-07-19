import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { MANUAL_ACCEPTANCE_ROLE_TASK_SCENARIOS } from "./manual-acceptance-catalog.mjs";

import {
  applyManualAcceptanceTaskData,
  buildLegacyManualAcceptanceTaskBatchReference,
  buildManualAcceptanceTaskDataPlan,
  CONFIRM_PHRASE,
  normalizeLocalBackendURL,
  parseArgs,
  manualAcceptanceTaskRetireConfirmation,
  manualAcceptanceLegacyTaskCode,
  ROLE_USERS,
  TASK_ROLES,
  TASK_COPY_REVISION,
  TASK_CATALOG_SCENARIO_DIGEST,
  TASK_VISIBLE_CODE_PREFIX_BY_ROLE,
  TASKS_PER_ROLE,
  TOTAL_TASKS,
  getManualAcceptanceTaskBusinessStatus,
  getManualAcceptanceTaskGroup,
  getManualAcceptanceTaskGroupScenarios,
  retireLegacyManualAcceptanceTaskBatch,
  validateManualAcceptanceTaskPlan,
  WORKFLOW_TASK_CAS_MIGRATION,
  WORKFLOW_TASK_CAS_RELEASE,
} from "./manual-acceptance-task-data.mjs";
import { buildManualAcceptanceSourceDataPlan } from "./manual-acceptance-source-data.mjs";
import {
  CUSTOMER_TRIAL_133_CONFIG_APPLY_PURPOSE,
  CUSTOMER_TRIAL_133_CONFIG_DATA_VERSION,
  CUSTOMER_TRIAL_133_CONFIG_PRODUCT_VERSION,
  CUSTOMER_TRIAL_133_CONFIG_REVISION,
  CUSTOMER_TRIAL_133_DATABASE,
  CUSTOMER_TRIAL_133_ORIGIN,
  CUSTOMER_TRIAL_133_TARGET,
  LOCAL_MANUAL_ACCEPTANCE_CONFIG_APPLY_PURPOSE,
  LOCAL_MANUAL_ACCEPTANCE_CONFIG_PRODUCT_VERSION,
  LOCAL_MANUAL_ACCEPTANCE_CONFIG_REVISION,
  MANUAL_ACCEPTANCE_DATASET_KEY,
  manualAcceptanceTargetConfirmation,
} from "./manual-acceptance-target-policy.mjs";

const NOW_SEC = 1_800_000_000;
const LOCAL_ACCEPTANCE_BACKEND_URL = "http://127.0.0.1:8310";
const LOCAL_ACCEPTANCE_DATABASE = "plush_erp_acceptance_20260716_v5_dev";
const SCRIPT_PATH = fileURLToPath(
  new URL("./manual-acceptance-task-data.mjs", import.meta.url),
);
const RUNTIME_ADMIN_ID = 100;
const ROLE_IDS = Object.freeze(
  Object.fromEntries(
    Object.keys(ROLE_USERS).map((roleKey, offset) => [roleKey, 101 + offset]),
  ),
);

function buildLocalTaskMutationPlan(overrides = {}) {
  return buildManualAcceptanceTaskDataPlan({
    backendURL: LOCAL_ACCEPTANCE_BACKEND_URL,
    databaseName: LOCAL_ACCEPTANCE_DATABASE,
    ...overrides,
  });
}

function localTaskMutationOptions(plan, overrides = {}) {
  return {
    targetConfirmation: manualAcceptanceTargetConfirmation(plan),
    ...overrides,
  };
}

function customerTrial133Attestation(overrides = {}) {
  return {
    target: CUSTOMER_TRIAL_133_TARGET,
    origin: CUSTOMER_TRIAL_133_ORIGIN,
    customerKey: "yoyoosun",
    environment: "prod",
    release: WORKFLOW_TASK_CAS_RELEASE,
    migration: "20260714165115",
    debug: {
      seedEnabled: false,
      seedAllowed: false,
      cleanupEnabled: false,
      cleanupAllowed: false,
      businessDataClearEnabled: false,
      businessDataClearAllowed: false,
    },
    ...overrides,
  };
}

function jsonResponse(data, code = 0, message = "OK") {
  return {
    ok: true,
    status: 200,
    async json() {
      return { result: { code, message, data } };
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

function permissionsFor(roleKey) {
  if (roleKey === "debug") return ["debug.business.seed"];
  const permissions = new Set(["workflow.task.read", "workflow.task.update"]);
  if (roleKey !== "boss") permissions.add("workflow.task.complete");
  if (["boss", "warehouse", "finance", "quality"].includes(roleKey)) {
    permissions.add("workflow.task.reject");
  }
  if (roleKey === "boss") permissions.add("workflow.task.approve");
  if (roleKey === "pmc") permissions.add("workflow.task.create");
  return [...permissions];
}

function createMockRuntime(options = {}) {
  const tasks = new Map();
  const calls = [];
  let nextTaskID = 1000;
  let createCount = 0;
  let actionCount = 0;

  const usernameToRole = new Map(
    Object.entries(ROLE_USERS).map(([roleKey, username]) => [
      username,
      roleKey,
    ]),
  );
  usernameToRole.set("admin", "runtime_admin");
  const tokenToRole = new Map(
    Object.keys(ROLE_USERS).map((roleKey) => [`token-${roleKey}`, roleKey]),
  );
  tokenToRole.set("token-runtime-admin", "runtime_admin");

  const fetchImpl = async (url, request) => {
    if (!request.body) {
      calls.push({
        domain: "runtime-identity",
        method: "probe",
        params: {},
        actorRole: undefined,
      });
      return runtimeIdentityResponse();
    }
    const domain = new URL(url).pathname.split("/").filter(Boolean).at(-1);
    const body = JSON.parse(request.body);
    const params = body.params || {};
    const authorization = request.headers.Authorization || "";
    const token = authorization.replace(/^Bearer\s+/u, "");
    const actorRole = tokenToRole.get(token);
    calls.push({ domain, method: body.method, params, actorRole });
    assert.equal(request.redirect, "error");

    if (domain === "auth" && body.method === "admin_login") {
      assert.equal(Object.hasOwn(params, "customer_key"), false);
      const roleKey = usernameToRole.get(params.username);
      assert.ok(roleKey, `unexpected username ${params.username}`);
      if (roleKey === "runtime_admin") {
        assert.equal(
          params.password,
          options.adminPassword || "admin-password",
        );
        return jsonResponse({
          id: RUNTIME_ADMIN_ID,
          user_id: RUNTIME_ADMIN_ID,
          username: params.username,
          access_token: "token-runtime-admin",
          disabled: false,
          is_super_admin: options.adminIsSuperAdmin !== false,
          roles: [],
          permissions: [],
        });
      }
      assert.equal(params.password, options.rolePassword || "local-password");
      return jsonResponse({
        id: ROLE_IDS[roleKey],
        user_id: ROLE_IDS[roleKey],
        username: params.username,
        access_token: `token-${roleKey}`,
        disabled: false,
        roles: [{ role_key: roleKey }],
        permissions: permissionsFor(roleKey),
      });
    }

    if (domain === "workflow") {
      assert.equal(Object.hasOwn(params, "customer_key"), false);
    } else {
      assert.equal(params.customer_key, "yoyoosun");
    }
    assert.ok(actorRole, `${domain}.${body.method} must be authenticated`);

    if (domain === "debug" && body.method === "capabilities") {
      assert.equal(actorRole, "runtime_admin");
      return jsonResponse({
        environment: options.environment || "local",
        databaseName:
          options.databaseName ||
          (options.environment === "remote"
            ? CUSTOMER_TRIAL_133_DATABASE
            : LOCAL_ACCEPTANCE_DATABASE),
        ...(["prod", "remote", "sql"].includes(options.environment)
          ? {
              seedEnabled: false,
              seedAllowed: false,
              cleanupEnabled: false,
              cleanupAllowed: false,
              businessDataClearEnabled: false,
              businessDataClearAllowed: false,
            }
          : {}),
        ...(options.capabilities || {}),
      });
    }

    if (
      domain === "customer_config" &&
      body.method === "get_effective_session"
    ) {
      assert.equal(actorRole, "pmc");
      return jsonResponse({
        session: {
          customer: { key: options.customerKey || "yoyoosun" },
          source:
            options.sessionSource === undefined
              ? "active_customer_config_revision"
              : options.sessionSource,
          config_revision:
            options.configRevision === undefined
              ? options.environment === "remote"
                ? CUSTOMER_TRIAL_133_CONFIG_REVISION
                : LOCAL_MANUAL_ACCEPTANCE_CONFIG_REVISION
              : options.configRevision,
          ...(options.environment === "remote"
            ? {
                config_product_version:
                  CUSTOMER_TRIAL_133_CONFIG_PRODUCT_VERSION,
                config_apply_purpose: CUSTOMER_TRIAL_133_CONFIG_APPLY_PURPOSE,
                config_dataset_version: CUSTOMER_TRIAL_133_CONFIG_DATA_VERSION,
                config_target: CUSTOMER_TRIAL_133_TARGET,
              }
            : {
                config_product_version:
                  LOCAL_MANUAL_ACCEPTANCE_CONFIG_PRODUCT_VERSION,
                config_apply_purpose:
                  LOCAL_MANUAL_ACCEPTANCE_CONFIG_APPLY_PURPOSE,
              }),
          modules: {
            workflow_tasks:
              options.workflowTasksModule === undefined
                ? "enabled"
                : options.workflowTasksModule,
          },
        },
      });
    }

    if (domain !== "workflow") {
      assert.fail(`unexpected domain ${domain}.${body.method}`);
    }

    if (body.method === "list_tasks") {
      const matched = [...tasks.values()].filter(
        (task) =>
          task.owner_role_key === params.owner_role_key &&
          task.source_type === params.source_type &&
          task.source_id === params.source_id,
      );
      assert.equal(actorRole, params.owner_role_key);
      assert.equal(params.limit, 200);
      assert.equal(params.offset, 0);
      return jsonResponse({
        tasks: matched.map((task) => structuredClone(task)),
        total: matched.length,
        limit: 200,
        offset: 0,
      });
    }

    if (body.method === "create_task") {
      createCount += 1;
      assert.equal(actorRole, "pmc");
      assert.equal(params.task_status_key, "ready");
      for (const forbiddenKey of [
        "config_revision",
        "process_instance_id",
        "process_node_instance_id",
        "target_status",
        "assignment_mode",
      ]) {
        assert.equal(
          Object.hasOwn(params, forbiddenKey),
          false,
          `create_task must not send ${forbiddenKey}`,
        );
      }
      assert.equal(params.payload.simulated_only, true);
      assert.equal(params.payload.real_customer_data, false);
      assert.equal(tasks.has(params.task_code), false);
      const task = {
        ...structuredClone(params),
        id: nextTaskID,
        version: 1,
        assignee_id: params.assignee_id ?? null,
        blocked_reason: params.blocked_reason ?? null,
      };
      delete task.customer_key;
      nextTaskID += 1;
      tasks.set(task.task_code, task);
      if (
        options.malformedCreateAt &&
        createCount === options.malformedCreateAt
      ) {
        const malformed = structuredClone(task);
        delete malformed.version;
        return jsonResponse({ task: malformed });
      }
      return jsonResponse({ task: structuredClone(task) });
    }

    const actionContracts = {
      block_task_action: ["block", "blocked"],
      complete_task_action: ["complete", "done"],
      reject_task_action: ["reject", "rejected"],
      resume_task_action: ["resume", "ready"],
    };
    const contract = actionContracts[body.method];
    assert.ok(contract, `unexpected workflow method ${body.method}`);
    actionCount += 1;
    const [expectedActionKey, targetStatus] = contract;
    assert.equal(Object.hasOwn(params, "id"), false);
    assert.equal(params.action_key, expectedActionKey);
    assert.equal(typeof params.idempotency_key, "string");
    assert.ok(params.idempotency_key.trim());
    assert.equal(typeof params.reason, "string");
    assert.ok(params.reason.trim());
    assert.deepEqual(
      Object.keys(params.payload),
      targetStatus === "done" ? ["feedback"] : [],
    );
    if (targetStatus === "done") {
      assert.equal(params.payload.feedback, params.reason);
    }
    const task = [...tasks.values()].find((item) => item.id === params.task_id);
    assert.ok(task, `missing task ${params.task_id}`);
    assert.equal(actorRole, task.owner_role_key);
    assert.equal(params.expected_version, task.version);
    task.version += 1;
    task.task_status_key = targetStatus;
    task.payload = { ...task.payload, ...structuredClone(params.payload) };
    if (targetStatus === "blocked") {
      task.business_status_key = "blocked";
      task.blocked_reason = params.reason;
      task.payload.blocked_reason = params.reason;
      delete task.payload.rejected_reason;
    } else if (targetStatus === "rejected") {
      task.blocked_reason = null;
      task.payload.rejected_reason = params.reason;
      delete task.payload.blocked_reason;
    }
    if (
      options.malformedActionAt &&
      actionCount === options.malformedActionAt
    ) {
      return jsonResponse({});
    }
    return jsonResponse({ task: structuredClone(task) });
  };

  function seedPlannedTask(plan, plannedTask, { final = false } = {}) {
    const params = structuredClone(plannedTask.createParams);
    if (plannedTask.assignmentMode === "role_account") {
      params.assignee_id = ROLE_IDS[plannedTask.roleKey];
    }
    const task = {
      ...params,
      id: nextTaskID,
      version: 1,
      assignee_id: params.assignee_id ?? null,
      blocked_reason: params.blocked_reason ?? null,
    };
    nextTaskID += 1;
    if (final && plannedTask.action) {
      task.version += 1;
      task.task_status_key = plannedTask.targetStatus;
      task.payload = {
        ...task.payload,
        ...structuredClone(plannedTask.action.payload),
      };
      if (plannedTask.targetStatus === "blocked") {
        task.business_status_key = "blocked";
        task.blocked_reason = plannedTask.action.reason;
        task.payload.blocked_reason = plannedTask.action.reason;
      }
      if (plannedTask.targetStatus === "rejected") {
        task.payload.rejected_reason = plannedTask.action.reason;
      }
    }
    tasks.set(task.task_code, task);
    return task;
  }

  return {
    calls,
    fetchImpl,
    seedPlannedTask,
    tasks,
    counts() {
      return { createCount, actionCount };
    },
  };
}

test("builds exactly 20 readable tasks for each of nine trial roles", () => {
  const plan = buildManualAcceptanceTaskDataPlan({
    runId: "PLAN-COVERAGE",
    nowSec: NOW_SEC,
  });

  assert.equal(plan.target, "local-dev");
  assert.equal(plan.datasetKey, MANUAL_ACCEPTANCE_DATASET_KEY);
  assert.equal(plan.dataVersion, "PLAN-COVERAGE");
  assert.equal(plan.tasks.length, TOTAL_TASKS);
  assert.equal(plan.summary.total, 180);
  assert.deepEqual(plan.summary.byStatus, {
    ready: 121,
    blocked: 27,
    done: 24,
    rejected: 8,
  });
  assert.deepEqual(plan.summary.dueScenarios, {
    overdue: 45,
    due_soon: 45,
    this_week: 45,
    later: 45,
  });
  assert.equal(plan.summary.assigned, 90);
  assert.equal(plan.summary.ownerPoolOnly, 90);
  assert.equal(plan.summary.actionCount, 59);
  assert.equal(
    plan.tasks.filter(
      (task) => task.createParams.task_group === "trial_pmc_work",
    ).length,
    25,
  );
  assert.equal(
    plan.tasks.filter(
      (task) => task.createParams.task_group === "trial_production_work",
    ).length,
    15,
  );
  const productionExceptionTopics = plan.tasks
    .filter((task) => task.roleKey === "production")
    .map((task) => task.createParams.task_name)
    .join("\n");
  for (const topic of ["延期", "返工", "质量", "设备", "缺料"]) {
    assert.match(productionExceptionTopics, new RegExp(topic, "u"));
  }
  for (const topic of ["今日生产", "委外回货", "返工"]) {
    assert.match(productionExceptionTopics, new RegExp(topic, "u"));
  }
  assert.deepEqual(
    new Set(
      plan.tasks
        .filter((task) => task.roleKey === "production")
        .map((task) => task.createParams.payload.acceptance_scenario_key),
    ),
    new Set(MANUAL_ACCEPTANCE_ROLE_TASK_SCENARIOS.production),
  );
  assert.equal(
    plan.tasks.every(
      (task) =>
        task.createParams.task_group.startsWith("trial_") &&
        !task.createParams.task_code.startsWith("source-"),
    ),
    true,
  );

  for (const roleKey of TASK_ROLES) {
    const tasks = plan.tasks.filter((task) => task.roleKey === roleKey);
    assert.equal(tasks.length, TASKS_PER_ROLE);
    assert.equal(
      tasks.filter((task) => task.targetStatus === "ready").length,
      roleKey === "boss"
        ? 15
        : ["warehouse", "finance", "quality"].includes(roleKey)
          ? 12
          : 14,
    );
    assert.equal(
      tasks.filter((task) => task.targetStatus === "blocked").length,
      3,
    );
    assert.equal(
      tasks.filter((task) => task.targetStatus === "done").length,
      roleKey === "boss" ? 0 : 3,
    );
    assert.equal(
      tasks.filter((task) => task.targetStatus === "rejected").length,
      ["boss", "warehouse", "finance", "quality"].includes(roleKey) ? 2 : 0,
    );
    assert.equal(
      tasks.filter((task) => task.assignmentMode === "role_account").length,
      10,
    );
    assert.equal(
      tasks.every((task) => task.createParams.task_status_key === "ready"),
      true,
    );
    assert.equal(
      tasks
        .filter((task) =>
          ["blocked", "done", "rejected"].includes(task.targetStatus),
        )
        .every((task) => task.action),
      true,
    );
    assert.equal(
      tasks.every((task) =>
        ["ready", "blocked", "done", "rejected"].includes(task.targetStatus),
      ),
      true,
    );
  }

  const visibleText = plan.tasks.flatMap((task) => [
    task.createParams.task_name,
    task.createParams.source_no,
    task.action?.reason,
    ...Object.values(task.createParams.payload).filter(
      (value) => typeof value === "string",
    ),
  ]);
  assert.equal(
    visibleText.some((value) =>
      /\b(?:workflow|fact|json-rpc|rbac|usecase|schema|api|version|idempotency|raw\s*id)\b|甲方/iu.test(
        String(value || ""),
      ),
    ),
    false,
  );
});

test("uses short yoyoosun-style copy while keeping every task visibly synthetic", () => {
  const plan = buildManualAcceptanceTaskDataPlan({
    runId: "COPY-SIMPLIFIED",
    dataVersion: "2026.07.15-v3",
    nowSec: NOW_SEC,
  });
  const visibleText = plan.tasks.flatMap((task) => [
    task.createParams.task_name,
    task.createParams.source_no,
    task.action?.reason,
    ...Object.values(task.createParams.payload).filter(
      (value) => typeof value === "string",
    ),
  ]);

  assert.equal(
    plan.tasks.every(
      (task) =>
        task.createParams.task_code.startsWith(
          `${TASK_VISIBLE_CODE_PREFIX_BY_ROLE[task.roleKey]}-`,
        ) &&
        task.createParams.source_type ===
          "simulated-manual-acceptance-task-batch" &&
        task.createParams.source_no.startsWith("样例-") &&
        task.createParams.payload.simulated_only === true &&
        task.createParams.payload.real_customer_data === false,
    ),
    true,
  );
  assert.equal(
    plan.tasks.every((task) => task.createParams.task_name.length <= 16),
    true,
  );
  assert.equal(
    visibleText.some((value) =>
      /【试用】|合成(?:试用|玩偶|客户|材料供应商)|任务说明|明确下一步负责人|资料完整性|跨部门优先事项|供应商回签|交付风险|批次标签信息|外观问题分布|下一岗位|\bPMC\b|物料清单|抽检|排产|往来单位|库位数量/iu.test(
        String(value || ""),
      ),
    ),
    false,
  );
  assert.equal(
    plan.tasks.some(
      (task) =>
        task.createParams.payload.style_no === "27001#" &&
        task.createParams.payload.product_name === "云朵小熊",
    ),
    true,
  );
  assert.equal(
    plan.tasks.some((task) =>
      task.createParams.task_name.startsWith("确认材料齐不齐"),
    ),
    true,
  );
  assert.equal(
    plan.tasks.every((task) => {
      const style = task.createParams.payload.style_no;
      const product = task.createParams.payload.product_name;
      if (!style || !product) return true;
      return (
        new Map([
          ["27001#", "云朵小熊"],
          ["27002#", "星星挂兔"],
          ["27003#", "奶油小狗"],
        ]).get(style) === product
      );
    }),
    true,
  );

  const source = buildManualAcceptanceSourceDataPlan({
    runId: "20260715-V3",
    dataVersion: "2026.07.15-v3",
  });
  const sourceProducts = new Set(
    source.records.products.map(
      (product) => `${product.style_no}\u001f${product.name}`,
    ),
  );
  const sourceMaterials = new Set(
    source.records.materials.map(
      (material) => `${material.name}\u001f${material.spec}`,
    ),
  );
  const sourceSuppliers = new Set(
    source.records.suppliers.map((supplier) => supplier.name),
  );
  for (const task of plan.tasks) {
    const payload = task.createParams.payload;
    if (payload.style_no || payload.product_name) {
      assert.equal(
        sourceProducts.has(`${payload.style_no}\u001f${payload.product_name}`),
        true,
      );
    }
    if (payload.material_name || payload.spec) {
      assert.equal(
        sourceMaterials.has(`${payload.material_name}\u001f${payload.spec}`),
        true,
      );
    }
    if (payload.supplier_name) {
      assert.equal(sourceSuppliers.has(payload.supplier_name), true);
    }
  }
});

test("warehouse scenarios stay in the trial namespace and never fill the formal shipping release page", () => {
  const plan = buildManualAcceptanceTaskDataPlan({
    runId: "20260716-V5",
    dataVersion: "2026.07.16-v5",
    nowSec: NOW_SEC,
  });
  const warehouseTasks = plan.tasks.filter(
    (task) => task.roleKey === "warehouse",
  );

  assert.equal(TASK_COPY_REVISION, "PLAIN5");
  assert.equal(warehouseTasks.length, 20);
  assert.equal(plan.summary.byTaskGroup.trial_warehouse_work, 20);
  assert.equal(plan.summary.byTaskGroup.shipment_release, undefined);
  assert(
    warehouseTasks.every((task) => {
      const scenarioKey = task.createParams.payload.acceptance_scenario_key;
      return (
        task.createParams.task_group ===
          getManualAcceptanceTaskGroup("warehouse", scenarioKey) &&
        task.createParams.business_status_key ===
          getManualAcceptanceTaskBusinessStatus("warehouse", scenarioKey) &&
        task.createParams.owner_role_key === "warehouse" &&
        task.createParams.source_type ===
          "simulated-manual-acceptance-task-batch" &&
        task.createParams.payload.shipment_release === undefined &&
        task.createParams.payload.finished_goods === undefined
      );
    }),
  );
  assert.deepEqual(
    new Set(
      warehouseTasks.map(
        (task) => task.createParams.payload.acceptance_scenario_key,
      ),
    ),
    new Set(MANUAL_ACCEPTANCE_ROLE_TASK_SCENARIOS.warehouse),
  );
  assert.deepEqual(
    plan.coverage.taskGroupsByRole.warehouse,
    Object.keys(getManualAcceptanceTaskGroupScenarios("warehouse")),
  );
  assert.deepEqual(
    plan.coverage.scenariosByRoleTaskGroup.warehouse.trial_warehouse_work,
    { receiving: 4, inbound: 4, material_picking: 4, shipping: 4, exception: 4 },
  );
  assert.equal(
    plan.coverage.catalogScenarioDigest,
    TASK_CATALOG_SCENARIO_DIGEST,
  );
  const visibleTopics = warehouseTasks
    .map((task) => task.createParams.task_name)
    .join("\n");
  for (const phrase of ["回货", "入库", "备料", "出货", "异常"]) {
    assert.match(visibleTopics, new RegExp(phrase, "u"));
  }
});

test("task plan fails closed when a catalog role scenario is missing", () => {
  const plan = buildManualAcceptanceTaskDataPlan({
    runId: "SCENARIO-GUARD",
    nowSec: NOW_SEC,
  });
  for (const task of plan.tasks.filter(
    (item) =>
      item.roleKey === "production" &&
      item.createParams.payload.acceptance_scenario_key ===
        "outsourcing_return",
  )) {
    task.createParams.payload.acceptance_scenario_key = "today_production";
    task.createParams.task_group = getManualAcceptanceTaskGroup(
      "production",
      "today_production",
    );
    task.createParams.business_status_key =
      getManualAcceptanceTaskBusinessStatus("production", "today_production");
  }
  assert.throws(
    () => validateManualAcceptanceTaskPlan(plan),
    /missing catalog task scenarios: outsourcing_return/u,
  );
});

test("formal source task groups and codes are rejected from simulated plans", () => {
  const shippingMismatch = buildManualAcceptanceTaskDataPlan({
    runId: "SHIPPING-GROUP-GUARD",
    nowSec: NOW_SEC,
  });
  const inbound = shippingMismatch.tasks.find(
    (task) =>
      task.roleKey === "warehouse" &&
      task.createParams.payload.acceptance_scenario_key === "inbound",
  );
  inbound.createParams.task_group = "shipment_release";
  assert.throws(
    () => validateManualAcceptanceTaskPlan(shippingMismatch),
    /task group does not match scenario inbound/u,
  );

  const productionMismatch = buildManualAcceptanceTaskDataPlan({
    runId: "PROD-GROUP-GUARD",
    nowSec: NOW_SEC,
  });
  const normalProduction = productionMismatch.tasks.find(
    (task) =>
      task.roleKey === "production" &&
      task.createParams.payload.acceptance_scenario_key === "today_production",
  );
  normalProduction.createParams.task_group = "production_exception";
  assert.throws(
    () => validateManualAcceptanceTaskPlan(productionMismatch),
    /task group does not match scenario today_production/u,
  );

  const formalCode = buildManualAcceptanceTaskDataPlan({
    runId: "SOURCE-CODE-GUARD",
    nowSec: NOW_SEC,
  });
  const first = formalCode.tasks[0];
  first.createParams.task_code = "source-shipment-release-41";
  assert.throws(
    () => validateManualAcceptanceTaskPlan(formalCode),
    /formal source task code/u,
  );
});

test("rejects developer-facing copy in a business-visible task field", () => {
  const plan = buildManualAcceptanceTaskDataPlan({
    runId: "COPY-GUARD",
    nowSec: NOW_SEC,
  });
  plan.tasks[0].createParams.task_name = "请检查 API 返回";
  assert.throws(
    () => validateManualAcceptanceTaskPlan(plan),
    /developer-facing business copy/u,
  );
});

test("CLI and exported URL normalization fail closed for external backends", async () => {
  assert.throws(
    () => parseArgs(["--backend-url", "https://erp.example.com"]),
    /refuse external backend/u,
  );
  assert.throws(
    () => normalizeLocalBackendURL("http://192.168.0.133:8300"),
    /refuse external backend/u,
  );

  const plan = buildManualAcceptanceTaskDataPlan({
    runId: "DIRECT-URL-GUARD",
    nowSec: NOW_SEC,
  });
  plan.backendURL = "https://erp.example.com";
  let fetched = false;
  await assert.rejects(
    () =>
      applyManualAcceptanceTaskData(plan, {
        confirmPhrase: CONFIRM_PHRASE,
        password: "local-password",
        adminPassword: "admin-password",
        fetchImpl: async () => {
          fetched = true;
          throw new Error("must not fetch");
        },
      }),
    /registered external origin|refuse external backend/u,
  );
  assert.equal(fetched, false);
});

test("rejects redirected login responses before task reads or writes", async () => {
  const plan = buildLocalTaskMutationPlan({
    runId: "REDIRECT-GUARD",
    nowSec: NOW_SEC,
  });
  let fetchCalls = 0;
  await assert.rejects(
    () =>
      applyManualAcceptanceTaskData(
        plan,
        localTaskMutationOptions(plan, {
          confirmPhrase: CONFIRM_PHRASE,
          password: "local-password",
          adminPassword: "admin-password",
          fetchImpl: async (_url, request) => {
            fetchCalls += 1;
            if (!request.body) return runtimeIdentityResponse();
            return {
              ok: true,
              status: 200,
              redirected: true,
              json: async () => ({ result: { code: 0, data: {} } }),
            };
          },
        }),
      ),
    /redirected response/u,
  );
  assert.equal(fetchCalls, 2);
});

test("date-bearing run ids keep the same schedule anchor across rebuilds", () => {
  const first = buildManualAcceptanceTaskDataPlan({
    runId: "LOCAL-UAT-20260711",
  });
  const second = buildManualAcceptanceTaskDataPlan({
    runId: "LOCAL-UAT-20260711",
  });
  assert.equal(first.generatedAtUnix, Date.UTC(2026, 6, 11, 12) / 1000);
  assert.deepEqual(
    first.tasks.map((item) => item.createParams.due_at),
    second.tasks.map((item) => item.createParams.due_at),
  );
});

test("non-date run ids use a stable schedule anchor instead of wall-clock time", () => {
  const originalDateNow = Date.now;
  try {
    for (const runId of ["STABLE-BATCH", "INVALID-20260230"]) {
      Date.now = () => Date.UTC(2026, 6, 11, 0, 0, 0);
      const first = buildManualAcceptanceTaskDataPlan({ runId });
      Date.now = () => Date.UTC(2036, 6, 11, 0, 0, 0);
      const second = buildManualAcceptanceTaskDataPlan({ runId });

      assert.equal(first.generatedAtUnix, second.generatedAtUnix);
      assert.deepEqual(first.tasks, second.tasks);
    }
    const other = buildManualAcceptanceTaskDataPlan({
      runId: "OTHER-STABLE-BATCH",
    });
    const stable = buildManualAcceptanceTaskDataPlan({
      runId: "STABLE-BATCH",
    });
    assert.notEqual(stable.generatedAtUnix, other.generatedAtUnix);
  } finally {
    Date.now = originalDateNow;
  }
});

test("CLI documents and parses the output report boundary", () => {
  const options = parseArgs([
    "--apply",
    "--backend-url",
    `${LOCAL_ACCEPTANCE_BACKEND_URL}/`,
    "--database-name",
    LOCAL_ACCEPTANCE_DATABASE,
    "--run-id",
    "local-uat-20260711",
    "--schedule-anchor-utc",
    "2026-07-17T09:00:00.000Z",
    "--out",
    "output/custom-task-data",
  ]);
  assert.deepEqual(options, {
    apply: true,
    help: false,
    out: "output/custom-task-data",
    backendURL: LOCAL_ACCEPTANCE_BACKEND_URL,
    target: "local-dev",
    databaseName: LOCAL_ACCEPTANCE_DATABASE,
    dataVersion: "LOCAL-UAT-20260711",
    runId: "LOCAL-UAT-20260711",
    scheduleAnchorUtc: "2026-07-17T09:00:00.000Z",
    nowSec: Date.parse("2026-07-17T09:00:00.000Z") / 1000,
    retireLegacyRunId: "",
    retireLegacyCopyRevision: "",
  });

  const help = spawnSync(process.execPath, [SCRIPT_PATH, "--help"], {
    encoding: "utf8",
  });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--out <directory>/u);
  assert.match(help.stdout, /--retire-legacy-run-id/u);
  assert.match(help.stdout, /--retire-legacy-copy-revision/u);
  assert.match(help.stdout, /<out>\/apply-report\.json/u);
  assert.match(help.stdout, /sourceType, and sourceID/u);
  assert.match(help.stdout, /--database-name <name>/u);
  assert.match(help.stdout, /--schedule-anchor-utc <iso>/u);
  assert.match(help.stdout, /http:\/\/127\.0\.0\.1:8310/u);
  assert.match(
    help.stdout,
    /--database-name plush_erp_acceptance_20260716_v5_dev/u,
  );
  assert.match(help.stdout, /--run-id 20260716-V5/u);
  assert.doesNotMatch(help.stdout, /127\.0\.0\.1:8300/u);
  assert.match(help.stdout, /MANUAL_ACCEPTANCE_ADMIN_PASSWORD/u);
  assert.match(help.stdout, /used only for debug\.capabilities/u);

  assert.throws(
    () => parseArgs(["--apply", "--retire-legacy-copy-revision", "PLAIN2"]),
    /requires --retire-legacy-run-id/u,
  );
});

test("exported apply requires the exact confirmation before login", async () => {
  const plan = buildLocalTaskMutationPlan({
    runId: "CONFIRM-GUARD",
    nowSec: NOW_SEC,
  });
  let fetched = false;
  await assert.rejects(
    () =>
      applyManualAcceptanceTaskData(
        plan,
        localTaskMutationOptions(plan, {
          confirmPhrase: "yes",
          password: "local-password",
          adminPassword: "admin-password",
          fetchImpl: async () => {
            fetched = true;
            throw new Error("must not fetch");
          },
        }),
      ),
    /MANUAL_ACCEPTANCE_TASK_CONFIRM/u,
  );
  assert.equal(fetched, false);
});

test("requires the independent admin credential before any fetch", async () => {
  const plan = buildLocalTaskMutationPlan({
    runId: "ADMIN-CRED-GUARD",
    nowSec: NOW_SEC,
  });
  let fetched = false;
  await assert.rejects(
    () =>
      applyManualAcceptanceTaskData(
        plan,
        localTaskMutationOptions(plan, {
          confirmPhrase: CONFIRM_PHRASE,
          password: "local-password",
          adminPassword: "   ",
          fetchImpl: async () => {
            fetched = true;
            throw new Error("must not fetch");
          },
        }),
      ),
    /MANUAL_ACCEPTANCE_ADMIN_PASSWORD/u,
  );
  assert.equal(fetched, false);
});

test("accepts the independent admin credential from the environment", async () => {
  const plan = buildLocalTaskMutationPlan({
    runId: "ADMIN-ENV-GUARD",
    nowSec: NOW_SEC,
  });
  const mock = createMockRuntime({ environment: "production" });
  const previous = process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD;
  process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD = "admin-password";
  try {
    await assert.rejects(
      () =>
        applyManualAcceptanceTaskData(
          plan,
          localTaskMutationOptions(plan, {
            confirmPhrase: CONFIRM_PHRASE,
            password: "local-password",
            fetchImpl: mock.fetchImpl,
          }),
        ),
      /environment=production/u,
    );
  } finally {
    if (previous === undefined) {
      delete process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD;
    } else {
      process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD = previous;
    }
  }
  assert.deepEqual(mock.counts(), { createCount: 0, actionCount: 0 });
});

test("requires username admin to be a local super admin before capabilities", async () => {
  const plan = buildLocalTaskMutationPlan({
    runId: "ADMIN-SUPER-GUARD",
    nowSec: NOW_SEC,
  });
  const mock = createMockRuntime({ adminIsSuperAdmin: false });
  await assert.rejects(
    () =>
      applyManualAcceptanceTaskData(
        plan,
        localTaskMutationOptions(plan, {
          confirmPhrase: CONFIRM_PHRASE,
          password: "local-password",
          adminPassword: "admin-password",
          fetchImpl: mock.fetchImpl,
        }),
      ),
    /requires a local super admin/u,
  );
  assert.deepEqual(mock.counts(), { createCount: 0, actionCount: 0 });
  assert.deepEqual(
    mock.calls.map(({ domain, method }) => ({ domain, method })),
    [
      { domain: "runtime-identity", method: "probe" },
      { domain: "auth", method: "admin_login" },
    ],
  );
});

test("refuses non-local runtime environments before any task write", async () => {
  const plan = buildLocalTaskMutationPlan({
    runId: "ENV-GUARD",
    nowSec: NOW_SEC,
  });
  const mock = createMockRuntime({ environment: "production" });
  await assert.rejects(
    () =>
      applyManualAcceptanceTaskData(
        plan,
        localTaskMutationOptions(plan, {
          confirmPhrase: CONFIRM_PHRASE,
          password: "local-password",
          adminPassword: "admin-password",
          fetchImpl: mock.fetchImpl,
        }),
      ),
    /environment=production/u,
  );
  assert.deepEqual(mock.counts(), { createCount: 0, actionCount: 0 });
  assert.equal(
    mock.calls.some((call) => call.method === "get_effective_session"),
    false,
  );
});

test("requires a non-empty active yoyoosun revision before any task write", async () => {
  const plan = buildLocalTaskMutationPlan({
    runId: "REVISION-GUARD",
    nowSec: NOW_SEC,
  });
  const mock = createMockRuntime({ configRevision: "" });
  await assert.rejects(
    () =>
      applyManualAcceptanceTaskData(
        plan,
        localTaskMutationOptions(plan, {
          confirmPhrase: CONFIRM_PHRASE,
          password: "local-password",
          adminPassword: "admin-password",
          fetchImpl: mock.fetchImpl,
        }),
      ),
    /active customer configuration/u,
  );
  assert.deepEqual(mock.counts(), { createCount: 0, actionCount: 0 });
  assert.equal(
    mock.calls.some(
      (call) => call.domain === "workflow" && call.method !== "list_tasks",
    ),
    false,
  );
});

test("requires the workflow task module before any task read or write", async () => {
  const plan = buildLocalTaskMutationPlan({
    runId: "MODULE-GUARD",
    nowSec: NOW_SEC,
  });
  const mock = createMockRuntime({ workflowTasksModule: "disabled" });
  await assert.rejects(
    () =>
      applyManualAcceptanceTaskData(
        plan,
        localTaskMutationOptions(plan, {
          confirmPhrase: CONFIRM_PHRASE,
          password: "local-password",
          adminPassword: "admin-password",
          fetchImpl: mock.fetchImpl,
        }),
      ),
    /required modules are not enabled: workflow_tasks/u,
  );
  assert.deepEqual(mock.counts(), { createCount: 0, actionCount: 0 });
  assert.equal(
    mock.calls.some((call) => call.domain === "workflow"),
    false,
  );
});

test("applies and safely resumes the 180-task batch through current CAS action contracts", async () => {
  const plan = buildLocalTaskMutationPlan({
    runId: "APPLY-CONTRACT",
    nowSec: NOW_SEC,
  });
  const mock = createMockRuntime();
  const actionSeed = plan.tasks.find((task) => task.action);
  const directSeed = plan.tasks.find(
    (task) => !task.action && task.targetStatus === "ready",
  );
  mock.seedPlannedTask(plan, actionSeed);
  mock.seedPlannedTask(plan, directSeed, { final: true });

  const report = await applyManualAcceptanceTaskData(
    plan,
    localTaskMutationOptions(plan, {
      confirmPhrase: CONFIRM_PHRASE,
      password: "local-password",
      adminPassword: "admin-password",
      fetchImpl: mock.fetchImpl,
    }),
  );

  assert.equal(report.summary.persisted, 180);
  assert.equal(report.runId, plan.runId);
  assert.equal(report.prefix, plan.prefix);
  assert.equal(report.copyRevision, TASK_COPY_REVISION);
  assert.equal(report.sourceType, plan.sourceType);
  assert.equal(report.sourceID, plan.sourceID);
  assert.doesNotMatch(JSON.stringify(report), /local-password|admin-password/u);
  assert.equal(report.summary.created, 178);
  assert.equal(report.summary.resumed, 1);
  assert.equal(report.summary.reusedFinal, 1);
  assert.equal(report.summary.actionsApplied, 59);
  assert.equal(mock.tasks.size, 180);
  assert.deepEqual(mock.counts(), { createCount: 178, actionCount: 59 });

  const mutationCalls = mock.calls.filter(
    (call) =>
      call.domain === "workflow" &&
      [
        "create_task",
        "block_task_action",
        "complete_task_action",
        "reject_task_action",
      ].includes(call.method),
  );
  assert.equal(mutationCalls.length, 178 + 59);
  assert.equal(
    mutationCalls.some((call) =>
      [
        "customer_key",
        "config_revision",
        "process_instance_id",
        "process_node_instance_id",
      ].some((key) => Object.hasOwn(call.params, key)),
    ),
    false,
  );
  assert.equal(
    mock.calls.some(
      (call) =>
        ![
          "runtime-identity",
          "auth",
          "debug",
          "customer_config",
          "workflow",
        ].includes(call.domain),
    ),
    false,
  );

  const countsBeforeReplay = mock.counts();
  const replayReport = await applyManualAcceptanceTaskData(
    plan,
    localTaskMutationOptions(plan, {
      confirmPhrase: CONFIRM_PHRASE,
      password: "local-password",
      adminPassword: "admin-password",
      fetchImpl: mock.fetchImpl,
    }),
  );
  assert.equal(replayReport.summary.created, 0);
  assert.equal(replayReport.summary.resumed, 0);
  assert.equal(replayReport.summary.reusedFinal, 180);
  assert.equal(replayReport.summary.actionsApplied, 0);
  assert.deepEqual(mock.counts(), countsBeforeReplay);
});

test("retires an exact legacy batch only after the plain-copy keep batch is complete", async () => {
  const keepPlan = buildLocalTaskMutationPlan({
    runId: "RETIRE-KEEP",
    nowSec: NOW_SEC,
  });
  const legacyBatch = buildLegacyManualAcceptanceTaskBatchReference({
    runId: "RETIRE-OLD",
    copyRevision: "PLAIN2",
    backendURL: keepPlan.backendURL,
  });
  const mock = createMockRuntime();
  for (const task of keepPlan.tasks) {
    mock.seedPlannedTask(keepPlan, task, { final: true });
    const legacyTask = structuredClone(task);
    legacyTask.createParams.task_code = `${legacyBatch.prefix}-${task.roleKey.toUpperCase()}-${String(task.index).padStart(2, "0")}`;
    legacyTask.createParams.source_id = legacyBatch.sourceID;
    legacyTask.createParams.task_name = `【试用】${task.roleKey}：旧任务（${String(task.index).padStart(2, "0")}）`;
    legacyTask.createParams.source_no = `试用任务单-${task.roleKey}-${task.index}`;
    mock.seedPlannedTask(keepPlan, legacyTask, { final: true });
  }

  const report = await retireLegacyManualAcceptanceTaskBatch(
    keepPlan,
    localTaskMutationOptions(keepPlan, {
      retireRunId: legacyBatch.runId,
      retireCopyRevision: legacyBatch.copyRevision,
      confirmPhrase: manualAcceptanceTaskRetireConfirmation(
        keepPlan,
        legacyBatch,
      ),
      password: "local-password",
      adminPassword: "admin-password",
      fetchImpl: mock.fetchImpl,
    }),
  );

  assert.deepEqual(report.summary, {
    total: 180,
    activeBefore: 148,
    alreadyTerminal: 32,
    resumed: 27,
    terminalized: 148,
    actionsApplied: 175,
    finalDone: 109,
    finalRejected: 71,
  });
  assert.equal(report.cleanup.physicalDelete, false);
  assert.equal(report.keepBatch.copyRevision, TASK_COPY_REVISION);
  assert.equal(report.retiredBatch.sourceID, legacyBatch.sourceID);
  assert.equal(
    [...mock.tasks.values()]
      .filter((task) => task.source_id === legacyBatch.sourceID)
      .every((task) => ["done", "rejected"].includes(task.task_status_key)),
    true,
  );
  const countsAfterFirst = mock.counts();
  assert.deepEqual(countsAfterFirst, { createCount: 0, actionCount: 175 });

  const replay = await retireLegacyManualAcceptanceTaskBatch(
    keepPlan,
    localTaskMutationOptions(keepPlan, {
      retireRunId: legacyBatch.runId,
      retireCopyRevision: legacyBatch.copyRevision,
      confirmPhrase: manualAcceptanceTaskRetireConfirmation(
        keepPlan,
        legacyBatch,
      ),
      password: "local-password",
      adminPassword: "admin-password",
      fetchImpl: mock.fetchImpl,
    }),
  );
  assert.equal(replay.summary.activeBefore, 0);
  assert.equal(replay.summary.alreadyTerminal, 180);
  assert.equal(replay.summary.actionsApplied, 0);
  assert.deepEqual(mock.counts(), countsAfterFirst);
});

test("PLAIN5 legacy references retain the short visible code scheme for future retirement", () => {
  const legacyBatch = buildLegacyManualAcceptanceTaskBatchReference({
    runId: "20260716-V5",
    copyRevision: "PLAIN5",
  });
  assert.equal(legacyBatch.codeScheme, "short-v5");
  assert.equal(
    manualAcceptanceLegacyTaskCode(legacyBatch, "warehouse", 1),
    "YS-V5-CK-01",
  );
  assert.throws(
    () =>
      buildLegacyManualAcceptanceTaskBatchReference({
        runId: "FUTURE",
        copyRevision: "UNKNOWN",
      }),
    /unsupported legacy task copy revision/u,
  );
});

test("customer-trial-133 task apply binds exact attestation and live debug capabilities", async () => {
  const plan = buildManualAcceptanceTaskDataPlan({
    target: CUSTOMER_TRIAL_133_TARGET,
    backendURL: CUSTOMER_TRIAL_133_ORIGIN,
    dataVersion: "2026.07.16-v5",
    runId: "20260716-V5",
    nowSec: NOW_SEC,
  });
  const mock = createMockRuntime({ environment: "remote" });
  const report = await applyManualAcceptanceTaskData(plan, {
    confirmPhrase: CONFIRM_PHRASE,
    targetConfirmation: manualAcceptanceTargetConfirmation(plan),
    targetAttestation: customerTrial133Attestation(),
    password: "local-password",
    adminPassword: "admin-password",
    fetchImpl: mock.fetchImpl,
  });

  assert.equal(report.target, CUSTOMER_TRIAL_133_TARGET);
  assert.equal(report.datasetKey, MANUAL_ACCEPTANCE_DATASET_KEY);
  assert.equal(report.dataVersion, "2026.07.16-v5");
  assert.equal(report.runId, "20260716-V5");
  assert.equal(report.summary.persisted, 180);
  assert.deepEqual(report.runtime.targetAttestation, {
    source: "out-of-band",
    release: WORKFLOW_TASK_CAS_RELEASE,
    migration: "20260714165115",
  });
  assert.equal(
    mock.calls.some(
      (call) => call.domain === "debug" || call.actorRole === "runtime_admin",
    ),
    true,
  );
});

test("customer-trial-133 accepts a later immutable release when the CAS migration floor is satisfied", async () => {
  const plan = buildManualAcceptanceTaskDataPlan({
    target: CUSTOMER_TRIAL_133_TARGET,
    backendURL: CUSTOMER_TRIAL_133_ORIGIN,
    dataVersion: "2026.07.16-v5",
    runId: "20260716-V5",
    nowSec: NOW_SEC,
  });
  const laterRelease = "56ecf873796ffafc53f12a3cd5f8b7adb0214581";
  const mock = createMockRuntime({ environment: "remote" });
  const report = await applyManualAcceptanceTaskData(plan, {
    confirmPhrase: CONFIRM_PHRASE,
    targetConfirmation: manualAcceptanceTargetConfirmation(plan),
    targetAttestation: customerTrial133Attestation({ release: laterRelease }),
    password: "local-password",
    adminPassword: "admin-password",
    fetchImpl: mock.fetchImpl,
  });
  assert.equal(report.summary.persisted, TOTAL_TASKS);
  assert.equal(report.runtime.targetAttestation.release, laterRelease);
});

test("customer-trial-133 rejects an old Workflow migration before login or write", async () => {
  const plan = buildManualAcceptanceTaskDataPlan({
    target: CUSTOMER_TRIAL_133_TARGET,
    backendURL: CUSTOMER_TRIAL_133_ORIGIN,
    dataVersion: "2026.07.16-v5",
    runId: "20260716-V5",
    nowSec: NOW_SEC,
  });
  let fetchCount = 0;

  await assert.rejects(
    () =>
      applyManualAcceptanceTaskData(plan, {
        confirmPhrase: CONFIRM_PHRASE,
        targetConfirmation: manualAcceptanceTargetConfirmation(plan),
        targetAttestation: customerTrial133Attestation({
          migration: "20260710150001",
        }),
        password: "must-not-be-used",
        fetchImpl: async () => {
          fetchCount += 1;
          throw new Error("must not fetch");
        },
      }),
    /attestation\.migration must be at least 20260714165115/u,
  );
  assert.equal(fetchCount, 0);
});

test("local task apply rejects out-of-band target attestation before login or write", async () => {
  const plan = buildLocalTaskMutationPlan({
    runId: "LOCAL-ATTESTATION",
    nowSec: NOW_SEC,
  });
  let fetchCount = 0;

  await assert.rejects(
    () =>
      applyManualAcceptanceTaskData(
        plan,
        localTaskMutationOptions(plan, {
          confirmPhrase: CONFIRM_PHRASE,
          targetAttestation: customerTrial133Attestation(),
          password: "must-not-be-used",
          adminPassword: "must-not-be-used",
          fetchImpl: async () => {
            fetchCount += 1;
            throw new Error("must not fetch");
          },
        }),
      ),
    /target attestation is only valid for customer-trial-133/u,
  );
  assert.equal(fetchCount, 0);
});

test("fails when create_task success omits the current version required by CAS", async () => {
  const plan = buildLocalTaskMutationPlan({
    runId: "MALFORMED-CREATE",
    nowSec: NOW_SEC,
  });
  const mock = createMockRuntime({ malformedCreateAt: 1 });
  await assert.rejects(
    () =>
      applyManualAcceptanceTaskData(
        plan,
        localTaskMutationOptions(plan, {
          confirmPhrase: CONFIRM_PHRASE,
          password: "local-password",
          adminPassword: "admin-password",
          fetchImpl: mock.fetchImpl,
        }),
      ),
    /create_task task\.version/u,
  );
  assert.deepEqual(mock.counts(), { createCount: 1, actionCount: 0 });
});

test("fails when an action response omits the updated task", async () => {
  const plan = buildLocalTaskMutationPlan({
    runId: "MALFORMED-ACTION",
    nowSec: NOW_SEC,
  });
  const mock = createMockRuntime({ malformedActionAt: 1 });
  await assert.rejects(
    () =>
      applyManualAcceptanceTaskData(
        plan,
        localTaskMutationOptions(plan, {
          confirmPhrase: CONFIRM_PHRASE,
          password: "local-password",
          adminPassword: "admin-password",
          fetchImpl: mock.fetchImpl,
        }),
      ),
    /response missing task/u,
  );
  assert.equal(mock.counts().actionCount, 1);
});
