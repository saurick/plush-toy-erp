import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  applyManualAcceptanceTaskData,
  buildManualAcceptanceTaskDataPlan,
  CONFIRM_PHRASE,
  normalizeLocalBackendURL,
  parseArgs,
  ROLE_USERS,
  TASK_ROLES,
  TASKS_PER_ROLE,
  TOTAL_TASKS,
  validateManualAcceptanceTaskPlan,
} from "./manual-acceptance-task-data.mjs";

const NOW_SEC = 1_800_000_000;
const SCRIPT_PATH = fileURLToPath(
  new URL("./manual-acceptance-task-data.mjs", import.meta.url),
);
const RUNTIME_ADMIN_ID = 100;
const ROLE_IDS = Object.freeze(
  Object.fromEntries(
    Object.keys(ROLE_USERS).map((roleKey, offset) => [roleKey, 101 + offset]),
  ),
);

function jsonResponse(data, code = 0, message = "OK") {
  return {
    ok: true,
    status: 200,
    async json() {
      return { result: { code, message, data } };
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
              ? "yoyoosun-test-revision"
              : options.configRevision,
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
    assert.equal(params.payload.handling_note, params.reason);
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
      (task) => task.createParams.task_group === "production_scheduling",
    ).length,
    20,
  );
  assert.equal(
    plan.tasks.filter(
      (task) => task.createParams.task_group === "production_exception",
    ).length,
    20,
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
      ["boss", "warehouse", "finance", "quality"].includes(roleKey)
        ? 2
        : 0,
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
        ["ready", "blocked", "done", "rejected"].includes(
          task.targetStatus,
        ),
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
    /local-only/u,
  );
  assert.throws(
    () => normalizeLocalBackendURL("http://192.168.0.133:8300"),
    /local-only/u,
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
    /local-only/u,
  );
  assert.equal(fetched, false);
});

test("rejects redirected login responses before task reads or writes", async () => {
  const plan = buildManualAcceptanceTaskDataPlan({
    runId: "REDIRECT-GUARD",
    nowSec: NOW_SEC,
  });
  let fetchCalls = 0;
  await assert.rejects(
    () =>
      applyManualAcceptanceTaskData(plan, {
        confirmPhrase: CONFIRM_PHRASE,
        password: "local-password",
        adminPassword: "admin-password",
        fetchImpl: async () => {
          fetchCalls += 1;
          return {
            ok: true,
            status: 200,
            redirected: true,
            json: async () => ({ result: { code: 0, data: {} } }),
          };
        },
      }),
    /redirected response/u,
  );
  assert.equal(fetchCalls, 1);
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
    "http://localhost:8300/",
    "--run-id",
    "local-uat-20260711",
    "--out",
    "output/custom-task-data",
  ]);
  assert.deepEqual(options, {
    apply: true,
    help: false,
    out: "output/custom-task-data",
    backendURL: "http://localhost:8300",
    runId: "LOCAL-UAT-20260711",
  });

  const help = spawnSync(process.execPath, [SCRIPT_PATH, "--help"], {
    encoding: "utf8",
  });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--out <directory>/u);
  assert.match(help.stdout, /<out>\/apply-report\.json/u);
  assert.match(help.stdout, /sourceType, and sourceID/u);
  assert.match(help.stdout, /--run-id LOCAL-UAT-20260711/u);
  assert.match(help.stdout, /MANUAL_ACCEPTANCE_ADMIN_PASSWORD/u);
  assert.match(help.stdout, /used only for debug\.capabilities/u);
});

test("exported apply requires the exact confirmation before login", async () => {
  const plan = buildManualAcceptanceTaskDataPlan({
    runId: "CONFIRM-GUARD",
    nowSec: NOW_SEC,
  });
  let fetched = false;
  await assert.rejects(
    () =>
      applyManualAcceptanceTaskData(plan, {
        confirmPhrase: "yes",
        password: "local-password",
        adminPassword: "admin-password",
        fetchImpl: async () => {
          fetched = true;
          throw new Error("must not fetch");
        },
      }),
    /MANUAL_ACCEPTANCE_TASK_CONFIRM/u,
  );
  assert.equal(fetched, false);
});

test("requires the independent admin credential before any fetch", async () => {
  const plan = buildManualAcceptanceTaskDataPlan({
    runId: "ADMIN-CRED-GUARD",
    nowSec: NOW_SEC,
  });
  let fetched = false;
  await assert.rejects(
    () =>
      applyManualAcceptanceTaskData(plan, {
        confirmPhrase: CONFIRM_PHRASE,
        password: "local-password",
        adminPassword: "   ",
        fetchImpl: async () => {
          fetched = true;
          throw new Error("must not fetch");
        },
      }),
    /MANUAL_ACCEPTANCE_ADMIN_PASSWORD/u,
  );
  assert.equal(fetched, false);
});

test("accepts the independent admin credential from the environment", async () => {
  const plan = buildManualAcceptanceTaskDataPlan({
    runId: "ADMIN-ENV-GUARD",
    nowSec: NOW_SEC,
  });
  const mock = createMockRuntime({ environment: "production" });
  const previous = process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD;
  process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD = "admin-password";
  try {
    await assert.rejects(
      () =>
        applyManualAcceptanceTaskData(plan, {
          confirmPhrase: CONFIRM_PHRASE,
          password: "local-password",
          fetchImpl: mock.fetchImpl,
        }),
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
  const plan = buildManualAcceptanceTaskDataPlan({
    runId: "ADMIN-SUPER-GUARD",
    nowSec: NOW_SEC,
  });
  const mock = createMockRuntime({ adminIsSuperAdmin: false });
  await assert.rejects(
    () =>
      applyManualAcceptanceTaskData(plan, {
        confirmPhrase: CONFIRM_PHRASE,
        password: "local-password",
        adminPassword: "admin-password",
        fetchImpl: mock.fetchImpl,
      }),
    /requires a local super admin/u,
  );
  assert.deepEqual(mock.counts(), { createCount: 0, actionCount: 0 });
  assert.deepEqual(
    mock.calls.map(({ domain, method }) => ({ domain, method })),
    [{ domain: "auth", method: "admin_login" }],
  );
});

test("refuses non-local runtime environments before any task write", async () => {
  const plan = buildManualAcceptanceTaskDataPlan({
    runId: "ENV-GUARD",
    nowSec: NOW_SEC,
  });
  const mock = createMockRuntime({ environment: "production" });
  await assert.rejects(
    () =>
      applyManualAcceptanceTaskData(plan, {
        confirmPhrase: CONFIRM_PHRASE,
        password: "local-password",
        adminPassword: "admin-password",
        fetchImpl: mock.fetchImpl,
      }),
    /environment=production/u,
  );
  assert.deepEqual(mock.counts(), { createCount: 0, actionCount: 0 });
  assert.equal(
    mock.calls.some((call) => call.method === "get_effective_session"),
    false,
  );
});

test("requires a non-empty active yoyoosun revision before any task write", async () => {
  const plan = buildManualAcceptanceTaskDataPlan({
    runId: "REVISION-GUARD",
    nowSec: NOW_SEC,
  });
  const mock = createMockRuntime({ configRevision: "" });
  await assert.rejects(
    () =>
      applyManualAcceptanceTaskData(plan, {
        confirmPhrase: CONFIRM_PHRASE,
        password: "local-password",
        adminPassword: "admin-password",
        fetchImpl: mock.fetchImpl,
      }),
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
  const plan = buildManualAcceptanceTaskDataPlan({
    runId: "MODULE-GUARD",
    nowSec: NOW_SEC,
  });
  const mock = createMockRuntime({ workflowTasksModule: "disabled" });
  await assert.rejects(
    () =>
      applyManualAcceptanceTaskData(plan, {
        confirmPhrase: CONFIRM_PHRASE,
        password: "local-password",
        adminPassword: "admin-password",
        fetchImpl: mock.fetchImpl,
      }),
    /workflow_tasks is not enabled/u,
  );
  assert.deepEqual(mock.counts(), { createCount: 0, actionCount: 0 });
  assert.equal(
    mock.calls.some((call) => call.domain === "workflow"),
    false,
  );
});

test("applies and safely resumes the 180-task batch through current CAS action contracts", async () => {
  const plan = buildManualAcceptanceTaskDataPlan({
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

  const report = await applyManualAcceptanceTaskData(plan, {
    confirmPhrase: CONFIRM_PHRASE,
    password: "local-password",
    adminPassword: "admin-password",
    fetchImpl: mock.fetchImpl,
  });

  assert.equal(report.summary.persisted, 180);
  assert.equal(report.runId, plan.runId);
  assert.equal(report.prefix, plan.prefix);
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
        !["auth", "debug", "customer_config", "workflow"].includes(call.domain),
    ),
    false,
  );

  const countsBeforeReplay = mock.counts();
  const replayReport = await applyManualAcceptanceTaskData(plan, {
    confirmPhrase: CONFIRM_PHRASE,
    password: "local-password",
    adminPassword: "admin-password",
    fetchImpl: mock.fetchImpl,
  });
  assert.equal(replayReport.summary.created, 0);
  assert.equal(replayReport.summary.resumed, 0);
  assert.equal(replayReport.summary.reusedFinal, 180);
  assert.equal(replayReport.summary.actionsApplied, 0);
  assert.deepEqual(mock.counts(), countsBeforeReplay);
});

test("fails when create_task success omits the current version required by CAS", async () => {
  const plan = buildManualAcceptanceTaskDataPlan({
    runId: "MALFORMED-CREATE",
    nowSec: NOW_SEC,
  });
  const mock = createMockRuntime({ malformedCreateAt: 1 });
  await assert.rejects(
    () =>
      applyManualAcceptanceTaskData(plan, {
        confirmPhrase: CONFIRM_PHRASE,
        password: "local-password",
        adminPassword: "admin-password",
        fetchImpl: mock.fetchImpl,
      }),
    /create_task task\.version/u,
  );
  assert.deepEqual(mock.counts(), { createCount: 1, actionCount: 0 });
});

test("fails when an action response omits the updated task", async () => {
  const plan = buildManualAcceptanceTaskDataPlan({
    runId: "MALFORMED-ACTION",
    nowSec: NOW_SEC,
  });
  const mock = createMockRuntime({ malformedActionAt: 1 });
  await assert.rejects(
    () =>
      applyManualAcceptanceTaskData(plan, {
        confirmPhrase: CONFIRM_PHRASE,
        password: "local-password",
        adminPassword: "admin-password",
        fetchImpl: mock.fetchImpl,
      }),
    /response missing task/u,
  );
  assert.equal(mock.counts().actionCount, 1);
});
