import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  assertExceptionFlowEvidenceContract,
  assertNoUnexpectedHTTPFailures,
  exceptionFlowConfirmation,
  normalizeLoopbackOrigin,
  parseExceptionFlowArgs,
  resolveExceptionFlowReportPath,
  staleRetryReceipt,
  verifyRuntimeIdentity,
  readExceptionFlowReadyTask,
  actOnExceptionFlowTaskPage,
  closeSession,
} from "./exception-flow-real-write-browser.mjs";

const DATABASE_NAME = "plush_erp_acceptance_79da_contract_browser_actions_dev";
const BACKEND_URL = "http://127.0.0.1:8323";
const REPORT =
  "output/qa/manual-acceptance/contracts/exception-flow-browser.json";
const CONFIRMATION = exceptionFlowConfirmation({
  backendURL: BACKEND_URL,
  databaseName: DATABASE_NAME,
});

function idleBrowserPage() {
  return {
    pendingRPC: new Set(),
    rpcResponses: new Set(),
    waitForLoadState: async () => {},
    evaluate: async () => {},
  };
}

test("exception session waits for forwarded requests before closing their context", async () => {
  let release;
  const response = new Promise((resolve) => { release = resolve; });
  const events = [];
  const session = {
    page: { ...idleBrowserPage(), unrouteAll: async (options) => {
      assert.deepEqual(options, { behavior: "wait" });
      events.push("page-drained");
    } },
    context: {
      unrouteAll: async (options) => {
        assert.deepEqual(options, { behavior: "wait" });
        await response;
        events.push("response-forwarded");
      },
      close: async () => events.push("context-closed"),
    },
    httpFailures: [],
  };
  const closing = closeSession(session, "forwarded request");
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(!events.includes("context-closed"));
  release();
  await closing;
  assert.deepEqual(events, ["page-drained", "response-forwarded", "context-closed"]);
});

test("exception session reports HTTP failures arriving while routes drain", async () => {
  let closed = false;
  const session = {
    page: { ...idleBrowserPage(), unrouteAll: async () => {} },
    context: {
      unrouteAll: async () => {
        session.httpFailures.push({ status: 503, pathname: "/rpc/workflow", rpcMethod: "get_task_board" });
      },
      close: async () => { closed = true; },
    },
    httpFailures: [],
  };
  await assert.rejects(closeSession(session, "late failure"), /unexpected HTTP failures/u);
  assert.equal(closed, true);
});

test("exception session still closes its context when route draining fails", async () => {
  let closed = false;
  const session = {
    page: { ...idleBrowserPage(), unrouteAll: async () => { throw new Error("route drain failed"); } },
    context: { close: async () => { closed = true; } },
    httpFailures: [],
  };
  await assert.rejects(closeSession(session, "drain failure"), /route drain failed/u);
  assert.equal(closed, true);
});

function readyTaskFixture(group = "finance_payment_execution") {
  const inventory = group.startsWith("inventory_");
  const roleKey =
    group === "inventory_adjustment_approval"
      ? "boss"
      : inventory
        ? "warehouse"
        : "finance";
  const sourceType = inventory ? "inventory_operation" : "finance_payment";
  const expected = {
    roleKey,
    sourceID: 101,
    sourceNo: inventory ? "OP-101" : "PAY-101",
    taskGroup: group,
  };
  const task = {
    id: 42,
    version: 1,
    task_code: "PROC-81-NODE-91-A1",
    source_type: sourceType,
    source_id: 101,
    source_no: expected.sourceNo,
    process_instance_id: 81,
    process_node_instance_id: 91,
    owner_role_key: roleKey,
    task_group: group,
    task_status_key: "ready",
  };
  const process = {
    process_context: {
      process_instance: {
        id: 81,
        process_key: inventory
          ? "inventory_adjustment_approval"
          : "finance_payment_approval",
        business_ref_type: sourceType,
        business_ref_id: 101,
        business_ref_no: expected.sourceNo,
      },
      nodes: [
        { id: 91, process_instance_id: 81, node_key: group, status: "active" },
      ],
    },
    source_readback: {
      id: 101,
      [inventory ? "operation_no" : "payment_no"]: expected.sourceNo,
    },
  };
  const rows = [
    { ...task, id: 40, task_status_key: "done", process_node_instance_id: 90 },
    { ...task, id: 41, process_instance_id: 80 },
    task,
  ];
  const calls = [];
  const page = {
    evaluate: async (_fn, request) => {
      calls.push(request);
      const data = request.methodName.startsWith("get_")
        ? process
        : { tasks: rows, total: rows.length };
      return {
        status: 200,
        json: { result: { code: 0, data: structuredClone(data) } },
      };
    },
  };
  return { page, expected, task, process, rows, calls };
}

test("exception task identity selects the active source/process-bound ready task for all three actors", async () => {
  for (const group of [
    "finance_payment_execution",
    "inventory_adjustment_approval",
    "inventory_adjustment_execution",
  ]) {
    const fixture = readyTaskFixture(group);
    assert.deepEqual(
      await readExceptionFlowReadyTask(fixture.page, fixture.expected),
      fixture.task,
    );
    assert.equal(fixture.calls.length, 2);
    assert.match(
      fixture.calls[0].methodName,
      /^get_(finance_payment|inventory_adjustment)_approval_process$/u,
    );
    assert.equal(fixture.calls[1].methodName, "list_tasks");
    assert.deepEqual(fixture.calls[1].requestParams, {
      source_type: fixture.task.source_type,
      source_id: 101,
      owner_role_key: fixture.expected.roleKey,
      task_group: group,
      limit: 100,
      offset: 0,
    });
  }
});

test("exception task identity rejects ambiguous, done, foreign source and inactive process tasks without mutation", async () => {
  for (const mutate of [
    (f) => {
      f.rows.push({ ...f.task, id: 43 });
    },
    (f) => {
      f.task.task_status_key = "done";
    },
    (f) => {
      f.task.source_id = 999;
    },
    (f) => {
      f.task.source_no = "OTHER";
    },
    (f) => {
      f.task.owner_role_key = "boss";
    },
    (f) => {
      f.task.task_group = "other";
    },
    (f) => {
      f.process.process_context.nodes[0].status = "completed";
    },
    (f) => {
      f.process.process_context.process_instance.business_ref_id = 999;
    },
    (f) => {
      f.process.source_readback.id = 999;
    },
  ]) {
    const fixture = readyTaskFixture();
    mutate(fixture);
    await assert.rejects(
      readExceptionFlowReadyTask(fixture.page, fixture.expected),
    );
    assert.ok(
      fixture.calls.every((r) => /^(?:get_|list_)/u.test(r.methodName)),
    );
  }
  const fixture = readyTaskFixture();
  await assert.rejects(
    readExceptionFlowReadyTask(fixture.page, {
      ...fixture.expected,
      roleKey: "admin",
    }),
    /actor drifted/u,
  );
  await assert.rejects(
    readExceptionFlowReadyTask(fixture.page, {
      ...fixture.expected,
      taskGroup: "unknown",
    }),
    /not registered/u,
  );
  assert.equal(fixture.calls.length, 0);
});

test("exception task identity reads every task page before asserting source/node uniqueness", async () => {
  const fixture = readyTaskFixture();
  const calls = [];
  fixture.page.evaluate = async (_fn, request) => {
    calls.push(request);
    let data = fixture.process;
    if (request.methodName === "list_tasks") {
      const rows =
        request.requestParams.offset === 0
          ? Array.from({ length: 100 }, (_, index) => ({
              ...fixture.task,
              id: 200 + index,
              process_node_instance_id: 90,
            }))
          : [fixture.task];
      data = { tasks: rows, total: 101 };
    }
    return { status: 200, json: { result: { code: 0, data } } };
  };
  assert.equal(
    (await readExceptionFlowReadyTask(fixture.page, fixture.expected)).id,
    42,
  );
  assert.deepEqual(
    calls
      .filter((r) => r.methodName === "list_tasks")
      .map((r) => r.requestParams.offset),
    [0, 100],
  );
});

function taskTablePage(
  task,
  {
    rowCount = 1,
    entryCount = 1,
    actionCount = 1,
    confirmCount = 1,
    confirmText = "确认完成",
  } = {},
) {
  const events = [];
  const visible = new Set();
  const isTransitionControl = (key) =>
    ["处理完成", "审批通过", "confirm"].includes(key);
  const actualCount = (key) =>
    key === "row"
      ? rowCount
      : key === "entry"
        ? entryCount
        : key === "处理完成" || key === "审批通过"
          ? actionCount
          : key === "confirm"
            ? confirmCount
            : 1;
  const control = (key) => ({
    count: async () => {
      events.push(`count:${key}`);
      return isTransitionControl(key) && !visible.has(key)
        ? 0
        : actualCount(key);
    },
    waitFor: async ({ state }) => {
      assert.equal(state, "visible");
      if (actualCount(key) === 0) throw new Error(`not visible:${key}`);
      visible.add(key);
      events.push(`visible:${key}`);
    },
    fill: async (value) => events.push(`fill:${key}:${value}`),
    press: async (value) => events.push(`press:${key}:${value}`),
    click: async () => events.push(`click:${key}`),
    innerText: async () => confirmText,
    last() {
      return this;
    },
    filter: ({ hasText }) => control(hasText),
  });
  const drawer = {
    ...control("drawer"),
    getByRole: (role, options) => {
      if (role === "radio") return control("radio");
      assert.equal(role, "button");
      assert.equal(options.exact, true);
      assert.ok(
        !["确认完成", "确认通过"].includes(options.name),
        "decorative send icon participates in the accessible button name",
      );
      return control(options.name);
    },
    locator: (selector) => {
      if (selector === ".erp-task-action-drawer__footer-primary button") {
        return control("confirm");
      }
      assert.equal(selector, "textarea");
      return control("reason");
    },
  };
  const row = {
    ...control("row"),
    locator: (selector) => {
      assert.equal(selector, "button[data-task-entry]");
      return control("entry");
    },
  };
  const page = {
    getByPlaceholder: (placeholder, options) => {
      assert.equal(placeholder, "订单 / 产品 / 物料 / 款号");
      assert.equal(options.exact, true);
      return control("search");
    },
    locator: (selector) => {
      if (selector === ".erp-task-action-drawer:visible") return drawer;
      if (selector === ".ant-message-notice-content") return control("message");
      assert.equal(
        selector,
        `tr.erp-task-table-row[data-task-id="${task.id}"][data-task-code="${task.task_code}"]`,
      );
      return row;
    },
  };
  return { page, events };
}

test("exception task browser action clicks the exact table row detail entry and preserves drawer action semantics", async () => {
  for (const approval of [false, true]) {
    const fixture = readyTaskFixture(
      approval ? "inventory_adjustment_approval" : "finance_payment_execution",
    );
    const ui = taskTablePage(fixture.task, {
      confirmText: approval ? "确认通过" : "确认完成",
    });
    await actOnExceptionFlowTaskPage(ui.page, fixture.task, {
      actionTitle: approval ? "审批通过" : "处理完成",
      confirmLabel: approval ? "确认通过" : "确认完成",
      successMessage: approval ? "审批已通过" : "任务已处理完成",
      reason: approval ? "批准" : "",
    });
    assert.ok(ui.events.includes(`fill:search:${fixture.task.task_code}`));
    assert.ok(ui.events.includes("click:entry"));
    assert.ok(ui.events.includes("click:选择处理方式"));
    assert.ok(ui.events.includes("click:核对并确认"));
    assert.ok(ui.events.includes("click:confirm"));
    for (const key of [
      approval ? "审批通过" : "处理完成",
      "confirm",
    ]) {
      assert.ok(
        ui.events.indexOf(`visible:${key}`) < ui.events.indexOf(`count:${key}`),
      );
      assert.ok(
        ui.events.indexOf(`count:${key}`) < ui.events.indexOf(`click:${key}`),
      );
    }
    assert.equal(ui.events.includes("fill:reason:批准"), approval);
  }
});

test("exception task browser action refuses duplicate rows, detail entries and confirmation buttons", async () => {
  for (const counts of [
    { rowCount: 2 },
    { entryCount: 2 },
    { actionCount: 2 },
    { confirmCount: 2 },
  ]) {
    const { task } = readyTaskFixture();
    const ui = taskTablePage(task, counts);
    await assert.rejects(
      actOnExceptionFlowTaskPage(ui.page, task, {
        actionTitle: "处理完成",
        confirmLabel: "确认完成",
        successMessage: "任务已处理完成",
      }),
      /unique/u,
    );
    assert.ok(!ui.events.includes("click:confirm"));
  }
});

test("exception task browser action stops before submission when a transition control never appears", async () => {
  for (const counts of [{ actionCount: 0 }, { confirmCount: 0 }]) {
    const { task } = readyTaskFixture();
    const ui = taskTablePage(task, counts);
    await assert.rejects(
      actOnExceptionFlowTaskPage(ui.page, task, {
        actionTitle: "处理完成",
        confirmLabel: "确认完成",
        successMessage: "任务已处理完成",
      }),
      /not visible/u,
    );
    assert.ok(!ui.events.includes("click:confirm"));
  }
});

test("exception task browser action rejects a unique confirmation with the wrong visible label", async () => {
  const { task } = readyTaskFixture();
  const ui = taskTablePage(task, { confirmText: "确认取消" });
  await assert.rejects(
    actOnExceptionFlowTaskPage(ui.page, task, {
      actionTitle: "处理完成",
      confirmLabel: "确认完成",
      successMessage: "任务已处理完成",
    }),
    /confirmation label/u,
  );
  assert.ok(!ui.events.includes("click:confirm"));
});

test("runtime identity verification rejects a browser proxy connected to another database", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), options });
    return url.pathname === "/readyz"
      ? new Response("ready")
      : new Response("runtime identity mismatch", { status: 409 });
  };
  await assert.rejects(
    verifyRuntimeIdentity(
      { backendURL: "http://localhost:15214", databaseName: DATABASE_NAME },
      fetchImpl,
    ),
    /identity mismatch/u,
  );
  assert.equal(requests.length, 1);
  assert.ok(requests.every(({ options }) => options.redirect === "error"));
  assert.ok(
    requests[0].options.headers["X-ERP-Expected-Runtime-Identity-SHA256"],
  );
});

test("exception-flow task search follows the current page placeholder contract", () => {
  const runnerSource = readFileSync(
    new URL("./exception-flow-real-write-browser.mjs", import.meta.url),
    "utf8",
  );
  const dashboardSource = readFileSync(
    new URL(
      "../../web/src/erp/components/workflow/WorkflowDashboardViews.jsx",
      import.meta.url,
    ),
    "utf8",
  );
  const pageSource = readFileSync(
    new URL("../../web/src/erp/pages/DashboardPage.jsx", import.meta.url),
    "utf8",
  );

  assert.match(pageSource, /<TaskBoardSearch\b/u);
  assert.match(dashboardSource, /placeholder="订单 \/ 产品 \/ 物料 \/ 款号"/u);
  assert.match(
    dashboardSource,
    /searchHint="可搜索：任务、单号、产品、款号、物料、处理原因"/u,
  );
  assert.match(
    runnerSource,
    /getByPlaceholder\("订单 \/ 产品 \/ 物料 \/ 款号",\s*\{\s*exact: true,?\s*\}\)/u,
  );
  assert.match(dashboardSource, /data-task-entry/u);
  assert.match(dashboardSource, /'data-task-id': task\.id/u);
  assert.match(dashboardSource, /'data-task-code': task\.task_code/u);
  assert.match(runnerSource, /button\[data-task-entry\]/u);
  assert.doesNotMatch(runnerSource, /erp-task-board-card|erp-task-card__open/u);
});

function validArgs(...extra) {
  return [
    "--base-url",
    "http://localhost:15214/",
    "--backend-url",
    BACKEND_URL,
    "--database-name",
    DATABASE_NAME,
    "--report",
    REPORT,
    ...extra,
  ];
}

function validEnv(extra = {}) {
  return {
    MANUAL_ACCEPTANCE_DEMO_PASSWORD: "unit-test-only-password",
    EXCEPTION_FLOW_BROWSER_CONFIRM: CONFIRMATION,
    ...extra,
  };
}

test("exception-flow browser runner accepts only an explicitly confirmed isolated target", () => {
  const options = parseExceptionFlowArgs(validArgs(), validEnv());
  assert.equal(options.baseURL, "http://localhost:15214");
  assert.equal(options.backendURL, BACKEND_URL);
  assert.equal(options.databaseName, DATABASE_NAME);
  assert.equal(options.password, "unit-test-only-password");
  assert.equal(options.reportPath, resolveExceptionFlowReportPath(REPORT));
  assert.equal(
    CONFIRMATION,
    `RUN_ISOLATED_EXCEPTION_FLOW_BROWSER_ACTIONS:${DATABASE_NAME}:${BACKEND_URL}`,
  );
});

test("exception-flow browser runner rejects non-loopback and credential-bearing origins", () => {
  for (const value of [
    "https://example.invalid",
    "http://user:secret@127.0.0.1:8323",
    "file:///tmp/backend",
    "http://127.0.0.1:8323/path",
  ]) {
    assert.throws(
      () => normalizeLoopbackOrigin(value, "origin"),
      /loopback|credential-free|http or https|path, query, or hash/u,
    );
  }
});

test("exception-flow browser runner rejects the shared backend and non-action databases", () => {
  assert.throws(
    () =>
      parseExceptionFlowArgs(
        validArgs().map((value) =>
          value === BACKEND_URL ? "http://127.0.0.1:8300" : value,
        ),
        validEnv({
          EXCEPTION_FLOW_BROWSER_CONFIRM: `RUN_ISOLATED_EXCEPTION_FLOW_BROWSER_ACTIONS:${DATABASE_NAME}:http://127.0.0.1:8300`,
        }),
      ),
    /shared\/default backend port 8300/u,
  );
  assert.throws(
    () =>
      parseExceptionFlowArgs(
        validArgs().map((value) =>
          value === DATABASE_NAME
            ? "plush_erp_acceptance_local_fixture_dev"
            : value,
        ),
        validEnv(),
      ),
    /dedicated browser_actions acceptance database/u,
  );
});

test("exception-flow browser runner binds confirmation to exact database and backend", () => {
  for (const confirmation of [
    "",
    "yes",
    CONFIRMATION.replace(DATABASE_NAME, `${DATABASE_NAME}_other`),
    CONFIRMATION.replace(":8323", ":8324"),
  ]) {
    assert.throws(
      () =>
        parseExceptionFlowArgs(
          validArgs(),
          validEnv({ EXCEPTION_FLOW_BROWSER_CONFIRM: confirmation }),
        ),
      /EXCEPTION_FLOW_BROWSER_CONFIRM must equal/u,
    );
  }
});

test("exception-flow browser runner keeps reports inside the acceptance evidence root", () => {
  for (const report of [
    "../outside.json",
    "output/qa/outside.json",
    "output/qa/manual-acceptance/contracts/report.txt",
  ]) {
    assert.throws(
      () => resolveExceptionFlowReportPath(report),
      /JSON file under output\/qa\/manual-acceptance/u,
    );
  }
});

test("exception-flow browser runner fails on any collected HTTP 4xx or 5xx", () => {
  assert.equal(assertNoUnexpectedHTTPFailures([], "production flow"), true);
  assert.throws(
    () =>
      assertNoUnexpectedHTTPFailures(
        [
          {
            status: 429,
            pathname: "/rpc/operational_fact",
            rpcMethod: "list_production_order_material_requirements",
          },
        ],
        "production flow",
      ),
    /production flow observed unexpected HTTP failures.*429/u,
  );
});

test("exception-flow browser runner fails closed on incomplete or unsupported arguments", () => {
  assert.throws(
    () =>
      parseExceptionFlowArgs(
        ["--base-url", "http://localhost:15214"],
        validEnv(),
      ),
    /required/u,
  );
  assert.throws(
    () =>
      parseExceptionFlowArgs(
        [...validArgs(), "--unknown", "value"],
        validEnv(),
      ),
    /unsupported argument/u,
  );
  assert.throws(
    () =>
      parseExceptionFlowArgs(
        validArgs(),
        validEnv({ MANUAL_ACCEPTANCE_DEMO_PASSWORD: "" }),
      ),
    /MANUAL_ACCEPTANCE_DEMO_PASSWORD is required/u,
  );
});

function validEvidenceReport() {
  return {
    failures: [],
    flows: Array.from({ length: 3 }, (_, index) => ({
      key: `flow-${index + 1}`,
      passed: true,
      retry: {
        code: 40920,
        result: "duplicate_or_stale_rejected",
      },
    })),
    negativePermissions: Array.from({ length: 3 }, () => ({
      code: 40304,
      result: "server_rejected",
    })),
    simulatedTransportFaults: Array.from({ length: 3 }, () => ({
      injected: true,
      backendResultCode: 0,
      transportFault: "response_dropped_after_backend_completed",
    })),
  };
}

test("exception-flow browser runner requires the exact stale-write error code", () => {
  assert.deepEqual(
    staleRetryReceipt(
      { status: 200, json: { result: { code: 40920 } } },
      "inventory",
      "cancel_inventory_operation",
    ),
    {
      service: "inventory",
      method: "cancel_inventory_operation",
      httpStatus: 200,
      code: 40920,
      result: "duplicate_or_stale_rejected",
    },
  );
  for (const code of [0, 40304, 40910, null]) {
    assert.throws(
      () =>
        staleRetryReceipt(
          { status: 200, json: { result: { code } } },
          "inventory",
          "cancel_inventory_operation",
        ),
      /STALE_WRITE_CONFLICT/u,
    );
  }
});

test("exception-flow browser report contract fails closed on incomplete evidence", () => {
  assert.equal(
    assertExceptionFlowEvidenceContract(validEvidenceReport()),
    true,
  );

  for (const mutate of [
    (report) => {
      report.failures.push({
        runner: "runFinancePaymentFlow",
        message: "failed",
      });
    },
    (report) => report.flows.pop(),
    (report) => {
      report.flows[0].retry.code = 40910;
    },
    (report) => {
      report.negativePermissions[0].code = 0;
    },
    (report) => {
      report.simulatedTransportFaults[0].backendResultCode = 500;
    },
  ]) {
    const report = validEvidenceReport();
    mutate(report);
    assert.throws(() => assertExceptionFlowEvidenceContract(report));
  }
});
