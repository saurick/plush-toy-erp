import assert from "node:assert/strict";
import test from "node:test";

import {
  buildManualAcceptanceReadinessPlan,
  evaluateManualAcceptanceDataset,
  parseManualAcceptanceReadinessArgs,
  renderManualAcceptanceReadinessMarkdown,
  runManualAcceptanceReadinessCli,
  verifyManualAcceptanceReadiness,
} from "./manual-acceptance-readiness.mjs";

function sourceReport(overrides = {}) {
  return {
    mode: "apply",
    simulatedOnly: true,
    realCustomerImport: false,
    runId: "LOCAL-UAT",
    prefix: "SIM-YOYOOSUN-UAT-LOCAL-UAT",
    scale: {
      customers: 60,
      suppliers: 60,
      materials: 80,
      products: 20,
      skusPerProduct: 3,
      processes: 30,
      salesOrders: 45,
      purchaseOrders: 45,
      outsourcingOrders: 45,
      bomVersions: 45,
      ...overrides,
    },
  };
}

function factReport(overrides = {}) {
  return {
    reportContract: "source-driven-operational-facts-v1",
    mode: "apply",
    simulatedOnly: true,
    realCustomerImport: false,
    runId: "LOCAL-UAT-FACTS",
    sourceRunId: "LOCAL-UAT",
    sourcePrefix: "SIM-YOYOOSUN-UAT-LOCAL-UAT",
    expectedMinimums: {
      production: 45,
      inventoryBalances: 45,
      stockReservations: 45,
      shipments: 45,
      payables: 45,
      receivables: 45,
      invoices: 45,
      reconciliation: 45,
      purchaseReceipts: 54,
      qualityInspections: 54,
      ...overrides,
    },
  };
}

test("readiness rejects legacy generic operational fact reports", () => {
  const report = factReport();
  delete report.reportContract;
  assert.throws(
    () => buildManualAcceptanceReadinessPlan({ factReport: report }),
    /业务记录报告不是有效的模拟试用写入报告/u,
  );
});

function taskReport(overrides = {}) {
  const runId = overrides.runId || "LOCAL-UAT";
  return {
    mode: "apply",
    simulatedOnly: true,
    realCustomerImport: false,
    writesFacts: false,
    runId,
    prefix: overrides.prefix || `SIM-YOYOOSUN-UAT-TASK-${runId}`,
    sourceType: "simulated-manual-acceptance-task-batch",
    sourceID: 123456,
    summary: {
      total: 180,
      persisted: 180,
      byRole: {
        boss: 20,
        sales: 20,
        purchase: 20,
        production: 20,
        warehouse: 20,
        finance: 20,
        pmc: 20,
        quality: 20,
        engineering: 20,
      },
      byStatus: {
        ready: 121,
        blocked: 27,
        done: 24,
        rejected: 8,
      },
    },
    ...overrides,
  };
}

function records(count, field, values, identityField, identityPrefix) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    ...(field ? { [field]: values[index % values.length] } : {}),
    ...(identityField
      ? {
          [identityField]: `${identityPrefix}-${String(index + 1).padStart(3, "0")}`,
        }
      : {}),
  }));
}

function taskStatusesForRole(roleKey) {
  const canReject = ["boss", "warehouse", "finance", "quality"].includes(
    roleKey,
  );
  return Object.freeze([
    ...Array(roleKey === "boss" ? 15 : canReject ? 12 : 14).fill("ready"),
    ...Array(3).fill("blocked"),
    ...Array(roleKey === "boss" ? 0 : 3).fill("done"),
    ...Array(canReject ? 2 : 0).fill("rejected"),
  ]);
}

const TASK_STATUSES = taskStatusesForRole("sales");

function okResponse(data) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      jsonrpc: "2.0",
      id: "test",
      result: { code: 0, message: "ok", data },
    }),
  };
}

function createReadinessFetch(runtimeOptions = {}) {
  const calls = [];
  const listSpecs = {
    list_customers: ["customers", 60, "is_active", [true, false], "code"],
    list_suppliers: ["suppliers", 60, "is_active", [true, false], "code"],
    list_product_skus: [
      "product_skus",
      60,
      "is_active",
      [true, false],
      "sku_code",
    ],
    list_materials: ["materials", 80, "is_active", [true, false], "code"],
    list_sales_orders: [
      "sales_orders",
      54,
      "lifecycle_status",
      ["DRAFT", "SUBMITTED", "ACTIVE", "CLOSED", "CANCELED"],
      "order_no",
    ],
    list_bom_versions: [
      "bom_versions",
      45,
      "status",
      ["DRAFT", "ACTIVE", "ARCHIVED"],
      "version",
    ],
    list_processes: ["processes", 30, "is_active", [true, false], "code"],
    list_purchase_orders: [
      "purchase_orders",
      45,
      "lifecycle_status",
      ["DRAFT", "SUBMITTED", "APPROVED", "CLOSED", "CANCELED"],
      "purchase_order_no",
    ],
    list_purchase_receipts: [
      "purchase_receipts",
      54,
      "status",
      ["DRAFT", "POSTED", "CANCELLED"],
      "receipt_no",
    ],
    list_inventory_lots: [
      "inventory_lots",
      54,
      "status",
      ["HOLD", "ACTIVE", "REJECTED"],
      "lot_no",
    ],
    list_outsourcing_orders: [
      "outsourcing_orders",
      45,
      "lifecycle_status",
      ["DRAFT", "SUBMITTED", "CONFIRMED", "CLOSED", "CANCELED"],
      "outsourcing_order_no",
    ],
    list_production_facts: [
      "production_facts",
      45,
      "status",
      ["DRAFT", "POSTED", "CANCELLED"],
      "fact_no",
      "fact_type",
      ["MATERIAL_ISSUE", "FINISHED_GOODS_RECEIPT", "REWORK"],
    ],
    list_stock_reservations: [
      "stock_reservations",
      45,
      "status",
      ["ACTIVE", "RELEASED"],
      "reservation_no",
    ],
    list_shipments: [
      "shipments",
      45,
      "status",
      ["DRAFT", "SHIPPED", "CANCELLED"],
      "shipment_no",
    ],
  };
  const fetchImpl = async (url, requestOptions) => {
    const body = JSON.parse(requestOptions.body);
    calls.push({
      url: String(url),
      method: body.method,
      params: body.params,
      redirect: requestOptions.redirect,
      authorization: requestOptions.headers.Authorization,
    });
    if (requestOptions.redirect !== "error") {
      throw new Error("readiness requests must reject redirects");
    }
    if (body.method === "admin_login") {
      return okResponse({ access_token: `token-${body.params.username}` });
    }
    if (body.method === "capabilities") {
      return okResponse({
        environment: runtimeOptions.runtimeEnvironment || "local",
      });
    }
    if (body.method === "get_effective_session") {
      return okResponse({
        session: {
          customer: { key: runtimeOptions.customerKey || "yoyoosun" },
          source:
            runtimeOptions.sessionSource || "active_customer_config_revision",
          config_revision:
            runtimeOptions.configRevision === undefined
              ? "cfg-local-1"
              : runtimeOptions.configRevision,
        },
      });
    }
    if (body.method === "list") {
      return okResponse({
        admins: records(13, "disabled", [false, true]),
      });
    }
    if (body.method === "rbac_options") {
      return okResponse({ roles: records(10, null, []) });
    }
    if (body.method === "audit_logs") {
      return okResponse({
        events: records(30, "source", ["AUTH", "BUSINESS"]),
        total: 30,
      });
    }
    if (body.method === "list_tasks") {
      const statuses =
        runtimeOptions.taskStatuses ||
        taskStatusesForRole(body.params.owner_role_key);
      const count = runtimeOptions.taskCount ?? statuses.length;
      return okResponse({
        tasks: records(count, "task_status_key", statuses).map(
          (item, index) => ({
            ...item,
            task_code: `${runtimeOptions.taskPrefix || "SIM-YOYOOSUN-UAT-TASK-LOCAL-UAT"}-${String(index + 1).padStart(2, "0")}`,
            owner_role_key:
              runtimeOptions.taskOwnerRoleKey || body.params.owner_role_key,
            source_type:
              runtimeOptions.taskSourceType || body.params.source_type,
            source_id: runtimeOptions.taskSourceID || body.params.source_id,
          }),
        ),
        total: runtimeOptions.taskResponseTotal ?? count,
      });
    }
    if (body.method === "list_finance_facts") {
      assert.match(
        body.params.keyword,
        /^SIM-YOYOOSUN-OPFACT-LOCAL-UAT-FACTS/u,
      );
      return okResponse({
        finance_facts: records(
          45,
          "status",
          ["DRAFT", "POSTED", "SETTLED", "CANCELLED"],
          "fact_no",
          body.params.keyword,
        ),
        total: 45,
      });
    }
    const spec = listSpecs[body.method];
    assert(spec, `unexpected read method ${body.method}`);
    const [
      listKey,
      count,
      field,
      values,
      identityField,
      secondaryField,
      secondaryValues,
    ] = spec;
    assert(body.params.keyword, `${body.method} must be batch filtered`);
    const items = records(
      count,
      field,
      values,
      identityField,
      body.params.keyword,
    ).map((item, index) => ({
      ...item,
      ...(secondaryField
        ? {
            [secondaryField]: secondaryValues[index % secondaryValues.length],
          }
        : {}),
    }));
    return okResponse({
      [listKey]: items,
      total: count,
    });
  };
  return { fetchImpl, calls };
}

test("default plan covers all 48 targets and never connects to a backend", async () => {
  let fetchCalls = 0;
  const result = await runManualAcceptanceReadinessCli([], {
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("unexpected backend call");
    },
  });

  assert.equal(result.exitCode, 0);
  assert.equal(fetchCalls, 0);
  assert.equal(result.plan.callsBackend, false);
  assert.equal(result.plan.writesBackend, false);
  assert.equal(result.plan.directSQL, false);
  assert.equal(result.plan.targets.length, 48);
  assert.equal(
    result.plan.targets.filter(
      (item) => item.catalogGroup === "mobileRolePages",
    ).length,
    9,
  );
  assert(
    result.plan.targets
      .filter((item) => item.catalogGroup === "mobileRolePages")
      .every((item) => item.expectedMinimum === 20),
  );
  assert.deepEqual(
    result.plan.targets.find(
      (item) => item.id === "desktopPages:production-scheduling",
    ).probeIds,
    ["mobile-tasks:pmc"],
  );
  assert.deepEqual(
    result.plan.targets.find(
      (item) => item.id === "desktopPages:production-exceptions",
    ).probeIds,
    ["mobile-tasks:production"],
  );
  const productionOrders = result.plan.targets.find(
    (item) => item.id === "desktopPages:production-orders",
  );
  assert.deepEqual(productionOrders.roleKeys, ["production"]);
  assert.equal(productionOrders.expectedMinimum, 45);
  assert.deepEqual(productionOrders.probeIds, []);
  assert.equal(productionOrders.quantityNotProven, true);
  assert.equal(result.plan.expected.mobileTaskTotal, 180);
});

test("apply reports may raise expectations but cannot lower current catalog thresholds", () => {
  const plan = buildManualAcceptanceReadinessPlan({
    sourceReport: sourceReport({ customers: 75, salesOrders: 20 }),
    factReport: factReport({ shipments: 55, payables: 12 }),
    taskReport: taskReport(),
  });
  const byId = new Map(plan.probes.map((probe) => [probe.id, probe]));

  assert.equal(byId.get("customers").expectedMinimum, 75);
  assert.equal(byId.get("sales-orders").expectedMinimum, 45);
  assert.equal(byId.get("shipments").expectedMinimum, 55);
  assert.equal(byId.get("finance-payables").expectedMinimum, 45);
  assert.equal(
    byId.get("customers").params.keyword,
    "SIM-YOYOOSUN-UAT-LOCAL-UAT",
  );
  assert.equal(
    byId.get("shipments").params.keyword,
    "SIM-YOYOOSUN-OPFACT-LOCAL-UAT-FACTS",
  );
  assert.equal(
    byId.get("purchase-receipts").params.keyword,
    "SIM-YOYOOSUN-PQ-LOCAL-UAT-FACTS",
  );
  assert.equal(byId.get("quality-inspections").batchEvidence, "not_proven");
  assert.equal(byId.get("inventory-balances").batchEvidence, "not_proven");
  assert.equal(byId.get("inventory-lots").batchEvidence, "not_proven");
  assert.equal(byId.get("inventory-txns").batchEvidence, "not_proven");
  assert(
    plan.probes
      .filter((probe) => probe.batchEvidence === "prefix_filtered")
      .every(
        (probe) =>
          probe.params.keyword === probe.batchPrefix &&
          Boolean(probe.batchMatchField),
      ),
  );
  assert.deepEqual(
    new Set(plan.inputWarnings.map((item) => item.datasetId)),
    new Set(["sales-orders", "finance-payables"]),
  );
  assert.throws(
    () =>
      buildManualAcceptanceReadinessPlan({
        sourceReport: { mode: "verify", simulatedOnly: true },
      }),
    /不是有效的模拟试用写入报告/u,
  );
  assert.throws(
    () =>
      buildManualAcceptanceReadinessPlan({
        sourceReport: sourceReport(),
        factReport: { ...factReport(), sourceRunId: "STALE-SOURCE" },
        taskReport: taskReport(),
      }),
    /不是同一批次/u,
  );
  assert.throws(
    () =>
      buildManualAcceptanceReadinessPlan({
        sourceReport: sourceReport(),
        taskReport: taskReport({ runId: "STALE-TASK" }),
      }),
    /岗位任务报告不是同一批次/u,
  );
  assert.throws(
    () =>
      buildManualAcceptanceReadinessPlan({
        factReport: factReport(),
        taskReport: taskReport({ runId: "STALE-TASK" }),
      }),
    /业务记录与岗位任务报告不是同一批次/u,
  );
  assert.throws(
    () =>
      buildManualAcceptanceReadinessPlan({
        taskReport: taskReport({
          summary: {
            ...taskReport().summary,
            byRole: { ...taskReport().summary.byRole, sales: 19 },
          },
        }),
      }),
    /岗位任务报告不是有效/u,
  );
  assert.throws(
    () =>
      buildManualAcceptanceReadinessPlan({
        taskReport: taskReport({ sourceType: "another-task-source" }),
      }),
    /岗位任务报告不是有效/u,
  );
});

test("dataset evaluation requires the named state set and only counts this batch prefix", () => {
  const probe = {
    id: "sales-orders",
    listKey: "sales_orders",
    statusField: "lifecycle_status",
    expectedMinimum: 45,
    requiredStatuses: ["DRAFT", "SUBMITTED", "ACTIVE"],
    batchEvidence: "prefix_filtered",
    batchPrefix: "SIM-BATCH",
    batchMatchField: "order_no",
  };
  const insufficientStates = evaluateManualAcceptanceDataset(probe, {
    sales_orders: records(
      45,
      "lifecycle_status",
      ["DRAFT", "SUBMITTED", "CLOSED"],
      "order_no",
      "SIM-BATCH",
    ),
    total: 145,
  });
  const enough = evaluateManualAcceptanceDataset(probe, {
    sales_orders: [
      ...records(
        45,
        "lifecycle_status",
        ["DRAFT", "SUBMITTED", "ACTIVE"],
        "order_no",
        "SIM-BATCH",
      ),
      ...records(
        20,
        "lifecycle_status",
        ["DRAFT", "SUBMITTED", "ACTIVE"],
        "order_no",
        "OLD-BATCH",
      ),
    ],
    total: 145,
  });

  assert.equal(insufficientStates.status, "fail");
  assert.equal(insufficientStates.enoughRecords, true);
  assert.equal(insufficientStates.enoughStatuses, false);
  assert.deepEqual(insufficientStates.missingStatuses, ["ACTIVE"]);
  assert.equal(enough.status, "pass");
  assert.equal(enough.statusKinds, 3);
  assert.equal(enough.actual, 45);
  assert.equal(enough.responseTotal, 145);

  const wrongSecondaryKinds = evaluateManualAcceptanceDataset(
    {
      id: "production-facts",
      listKey: "production_facts",
      statusField: "status",
      requiredStatuses: ["DRAFT", "POSTED", "CANCELLED"],
      secondaryField: "fact_type",
      requiredSecondaryKinds: [
        "MATERIAL_ISSUE",
        "FINISHED_GOODS_RECEIPT",
        "REWORK",
      ],
      expectedMinimum: 45,
      batchEvidence: "prefix_filtered",
      batchPrefix: "SIM-FACT",
      batchMatchField: "fact_no",
    },
    {
      production_facts: records(
        45,
        "status",
        ["DRAFT", "POSTED", "CANCELLED"],
        "fact_no",
        "SIM-FACT",
      ).map((item, index) => ({
        ...item,
        fact_type: ["MATERIAL_ISSUE", "FINISHED_GOODS_RECEIPT", "OTHER"][
          index % 3
        ],
      })),
      total: 45,
    },
  );
  assert.equal(wrongSecondaryKinds.status, "fail");
  assert.deepEqual(wrongSecondaryKinds.missingSecondaryKinds, ["REWORK"]);
});

test("task evidence requires exact source, role, prefix, count, and canonical status distribution", () => {
  const probe = {
    id: "mobile-tasks:sales",
    listKey: "tasks",
    statusField: "task_status_key",
    requiredStatuses: ["READY", "BLOCKED", "DONE"],
    requiredStatusCounts: {
      READY: 14,
      BLOCKED: 3,
      DONE: 3,
    },
    expectedMinimum: 20,
    expectedExact: 20,
    batchEvidence: "exact_source",
    exactSourceType: "simulated-manual-acceptance-task-batch",
    exactSourceID: 123456,
    exactTaskPrefix: "SIM-YOYOOSUN-UAT-TASK-LOCAL-UAT",
    exactOwnerRoleKey: "sales",
  };
  const batchTasks = TASK_STATUSES.map((status, index) => ({
    id: index + 1,
    task_code: `SIM-YOYOOSUN-UAT-TASK-LOCAL-UAT-SALES-${String(index + 1).padStart(2, "0")}`,
    source_type: "simulated-manual-acceptance-task-batch",
    source_id: 123456,
    owner_role_key: "sales",
    task_status_key: status,
  }));
  const ignoredOldTasks = [
    {
      ...batchTasks[0],
      id: 100,
      task_code: "SIM-YOYOOSUN-UAT-TASK-OLD-SALES-01",
    },
    {
      ...batchTasks[1],
      id: 101,
      owner_role_key: "purchase",
    },
    {
      ...batchTasks[2],
      id: 102,
      source_id: 999999,
    },
  ];
  const pass = evaluateManualAcceptanceDataset(probe, {
    tasks: [...batchTasks, ...ignoredOldTasks],
    total: 203,
  });
  assert.equal(pass.status, "pass");
  assert.equal(pass.actual, 20);
  assert.equal(pass.responseTotal, 203);
  assert.deepEqual(pass.mismatchedStatusCounts, {});

  const wrongDistribution = batchTasks.map((item, index) => ({
    ...item,
    task_status_key: index === 14 ? "ready" : item.task_status_key,
  }));
  const distributionFailure = evaluateManualAcceptanceDataset(probe, {
    tasks: wrongDistribution,
    total: 20,
  });
  assert.equal(distributionFailure.status, "fail");
  assert.deepEqual(distributionFailure.missingStatuses, []);
  assert.deepEqual(distributionFailure.mismatchedStatusCounts, {
    READY: { expected: 14, actual: 15 },
    BLOCKED: { expected: 3, actual: 2 },
  });

  const countFailure = evaluateManualAcceptanceDataset(probe, {
    tasks: [...batchTasks, { ...batchTasks[0], id: 200 }],
    total: 21,
  });
  assert.equal(countFailure.status, "fail");
  assert.equal(countFailure.actual, 21);
  assert.equal(countFailure.enoughRecords, false);
});

test("explicit verification reports page data, nine role totals, and honest manual gaps", async () => {
  const plan = buildManualAcceptanceReadinessPlan({
    sourceReport: sourceReport(),
    factReport: factReport(),
    taskReport: taskReport(),
  });
  const { fetchImpl, calls } = createReadinessFetch();
  const report = await verifyManualAcceptanceReadiness(plan, {
    backendURL: "http://127.0.0.1:8300",
    password: "local-demo-password",
    adminPassword: "local-admin-password",
    fetchImpl,
    now: () => new Date("2026-07-11T10:00:00.000Z"),
  });

  assert.equal(report.summary.totalTargets, 48);
  assert.equal(report.summary.passedTargetData, 35);
  assert.equal(report.summary.failedTargetData, 0);
  assert.equal(report.summary.notProvenTargetData, 13);
  assert.equal(report.summary.queryChecksPassed, true);
  assert.equal(report.summary.queryEvidenceComplete, false);
  assert.equal(report.summary.browserChecksCompleted, 0);
  assert.equal(report.summary.manualAcceptanceCompleted, false);
  assert.equal(report.summary.mobileRolePages, 9);
  assert.equal(report.summary.mobileTaskTotalActual, 180);
  assert.deepEqual(
    new Set(Object.values(report.summary.mobileActualByRole)),
    new Set([20]),
  );
  assert.equal(report.targets.length, 48);
  assert.equal(report.runtimePreflight.environment, "local");
  assert.equal(report.runtimePreflight.customerKey, "yoyoosun");
  assert.equal(report.runtimePreflight.configRevision, "cfg-local-1");
  assert.equal(
    report.targets.find((item) => item.id === "entries:admin-login").actual,
    13,
  );
  assert.equal(
    report.targets.find((item) => item.id === "desktopPages:reconciliation")
      .supporting[0].statusCounts.POSTED > 0,
    true,
  );
  const productionProbe = report.probes.find(
    (item) => item.id === "production-facts",
  );
  assert.equal(productionProbe.secondaryKinds, 3);
  assert.equal(productionProbe.enoughSecondaryKinds, true);
  assert.deepEqual(productionProbe.missingSecondaryKinds, []);
  const mobileProbes = report.probes.filter((item) =>
    item.id.startsWith("mobile-tasks:"),
  );
  assert.equal(mobileProbes.length, 9);
  assert(
    mobileProbes.every(
      (item) =>
        item.status === "pass" &&
        item.actual === 20 &&
        item.statusKinds ===
          (item.id === "mobile-tasks:boss" ||
          [
            "mobile-tasks:sales",
            "mobile-tasks:purchase",
            "mobile-tasks:production",
            "mobile-tasks:pmc",
            "mobile-tasks:engineering",
          ].includes(item.id)
            ? 3
            : 4) &&
        Object.keys(item.mismatchedStatusCounts).length === 0,
    ),
  );
  assert.equal(
    report.targets.find((item) => item.id === "desktopPages:global-dashboard")
      .actual,
    180,
  );
  assert.equal(
    report.targets.find((item) => item.id === "desktopPages:inventory")
      .dataStatus,
    "not_proven",
  );
  assert.equal(
    report.targets.find(
      (item) => item.id === "desktopPages:quality-inspections",
    ).dataStatus,
    "not_proven",
  );
  assert.equal(
    report.targets.find(
      (item) => item.id === "desktopPages:production-orders",
    ).dataStatus,
    "not_proven",
  );
  assert(
    report.targets
      .filter((item) => item.catalogGroup === "printWorkspacePages")
      .every((item) => item.dataStatus === "not_proven"),
  );
  assert.equal(report.readyForManualAcceptance, false);
  assert(!JSON.stringify(report).includes("local-demo-password"));
  assert(!JSON.stringify(report).includes("local-admin-password"));
  assert.deepEqual(
    calls.slice(0, 4).map((item) => item.method),
    ["admin_login", "capabilities", "get_effective_session", "admin_login"],
  );
  assert.equal(calls[0].params.username, "admin");
  assert.equal(calls[0].params.password, "local-admin-password");
  assert(
    calls.some(
      (item) =>
        item.method === "admin_login" &&
        item.params.username === "demo_admin" &&
        item.params.password === "local-demo-password",
    ),
  );
  assert(calls.every((item) => item.redirect === "error"));
  assert(!calls.some((item) => item.method === "list_quality_inspections"));
  assert(!calls.some((item) => item.method === "list_inventory_balances"));
  assert(!calls.some((item) => item.method === "list_inventory_txns"));
  assert(
    calls
      .filter((item) => item.method === "list_tasks")
      .every(
        (item) =>
          item.params.source_type ===
            "simulated-manual-acceptance-task-batch" &&
          item.params.source_id === 123456 &&
          Boolean(item.params.owner_role_key),
      ),
  );
  assert(
    calls.every(({ method }) =>
      /^(?:admin_login|capabilities|get_effective_session|list|list_|rbac_options|audit_logs)/u.test(
        method,
      ),
    ),
  );
});

test("CLI requires an explicit backend for verification and stays read-only", async () => {
  assert.deepEqual(parseManualAcceptanceReadinessArgs([]), {
    verify: false,
    backendURL: "",
    sourceReport: "",
    factReport: "",
    taskReport: "",
    out: "",
    format: "json",
    help: false,
  });
  assert.throws(
    () => parseManualAcceptanceReadinessArgs(["--verify"]),
    /必须同时提供 --backend-url/u,
  );
  const parsed = parseManualAcceptanceReadinessArgs([
    "--verify",
    "--backend-url",
    "http://127.0.0.1:8300",
    "--task-report",
    "output/task-report.json",
    "--format",
    "markdown",
  ]);
  assert.equal(parsed.verify, true);
  assert.equal(parsed.taskReport, "output/task-report.json");
  assert.equal(parsed.format, "markdown");
  const help = await runManualAcceptanceReadinessCli(["--help"]);
  assert.match(help.text, /MANUAL_ACCEPTANCE_ADMIN_PASSWORD/u);
  assert.match(help.text, /超级管理员 admin/u);
  assert.match(help.text, /demo_admin 仍按试用账号权限核对/u);
});

test("CLI verification uses strict non-green exit codes for not-proven and wrong-batch evidence", async () => {
  const normalRuntime = createReadinessFetch();
  const normal = await runManualAcceptanceReadinessCli(
    ["--verify", "--backend-url", "http://127.0.0.1:8300"],
    {
      sourceReport: sourceReport(),
      factReport: factReport(),
      taskReport: taskReport(),
      password: "local-demo-password",
      adminPassword: "local-admin-password",
      fetchImpl: normalRuntime.fetchImpl,
    },
  );
  assert.equal(normal.report.summary.failedTargetData, 0);
  assert(normal.report.summary.notProvenTargetData > 0);
  assert.equal(normal.report.summary.queryEvidenceComplete, false);
  assert.equal(normal.exitCode, 1);

  const wrongBatchRuntime = createReadinessFetch({ taskSourceID: 999999 });
  const wrongBatch = await runManualAcceptanceReadinessCli(
    ["--verify", "--backend-url", "http://127.0.0.1:8300"],
    {
      sourceReport: sourceReport(),
      factReport: factReport(),
      taskReport: taskReport(),
      password: "local-demo-password",
      adminPassword: "local-admin-password",
      fetchImpl: wrongBatchRuntime.fetchImpl,
    },
  );
  assert(wrongBatch.report.summary.failedTargetData > 0);
  assert.equal(wrongBatch.exitCode, 1);

  const noTaskRuntime = createReadinessFetch();
  const noTask = await runManualAcceptanceReadinessCli(
    ["--verify", "--backend-url", "http://127.0.0.1:8300"],
    {
      sourceReport: sourceReport(),
      factReport: factReport(),
      password: "local-demo-password",
      adminPassword: "local-admin-password",
      fetchImpl: noTaskRuntime.fetchImpl,
    },
  );
  assert.equal(noTask.exitCode, 1);
  assert.equal(noTask.report.summary.mobileTaskTotalActual, null);
  assert(!noTaskRuntime.calls.some((item) => item.method === "list_tasks"));
});

test("CLI and exported verification reject external backends before the first fetch", async () => {
  const plan = buildManualAcceptanceReadinessPlan({
    sourceReport: sourceReport(),
    factReport: factReport(),
    taskReport: taskReport(),
  });
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    throw new Error("external backend must not be called");
  };

  await assert.rejects(
    () =>
      verifyManualAcceptanceReadiness(plan, {
        backendURL: "https://example.com",
        password: "local-demo-password",
        adminPassword: "local-admin-password",
        fetchImpl,
      }),
    /loopback/u,
  );
  await assert.rejects(
    () =>
      runManualAcceptanceReadinessCli(
        ["--verify", "--backend-url", "http://127.0.0.1.example.com:8300"],
        {
          sourceReport: sourceReport(),
          factReport: factReport(),
          taskReport: taskReport(),
          password: "local-demo-password",
          adminPassword: "local-admin-password",
          fetchImpl,
        },
      ),
    /loopback/u,
  );
  assert.equal(fetchCalls, 0);
});

test("verification requires the local super-admin credential before any fetch", async () => {
  const plan = buildManualAcceptanceReadinessPlan({
    sourceReport: sourceReport(),
    factReport: factReport(),
    taskReport: taskReport(),
  });
  const previous = process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD;
  delete process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD;
  let fetchCalls = 0;
  try {
    await assert.rejects(
      () =>
        verifyManualAcceptanceReadiness(plan, {
          backendURL: "http://127.0.0.1:8300",
          password: "local-demo-password",
          fetchImpl: async () => {
            fetchCalls += 1;
            throw new Error("missing admin credential must fail before fetch");
          },
        }),
      /MANUAL_ACCEPTANCE_ADMIN_PASSWORD/u,
    );
  } finally {
    if (previous === undefined) {
      delete process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD;
    } else {
      process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD = previous;
    }
  }
  assert.equal(fetchCalls, 0);
});

test("runtime preflight rejects unsafe environment or missing active revision before other account logins", async () => {
  const plan = buildManualAcceptanceReadinessPlan({
    sourceReport: sourceReport(),
    factReport: factReport(),
    taskReport: taskReport(),
  });
  const production = createReadinessFetch({ runtimeEnvironment: "production" });
  await assert.rejects(
    () =>
      verifyManualAcceptanceReadiness(plan, {
        backendURL: "http://127.0.0.1:8300",
        password: "local-demo-password",
        adminPassword: "local-admin-password",
        fetchImpl: production.fetchImpl,
      }),
    /environment=production/u,
  );
  assert.deepEqual(
    production.calls.map((item) => item.method),
    ["admin_login", "capabilities"],
  );

  const missingRevision = createReadinessFetch({ configRevision: "" });
  await assert.rejects(
    () =>
      verifyManualAcceptanceReadiness(plan, {
        backendURL: "http://localhost:8300",
        password: "local-demo-password",
        adminPassword: "local-admin-password",
        fetchImpl: missingRevision.fetchImpl,
      }),
    /非空的已激活配置版本/u,
  );
  assert.deepEqual(
    missingRevision.calls.map((item) => item.method),
    ["admin_login", "capabilities", "get_effective_session"],
  );
});

test("verification rejects a redirected response even with a custom fetch", async () => {
  const plan = buildManualAcceptanceReadinessPlan({
    sourceReport: sourceReport(),
    factReport: factReport(),
    taskReport: taskReport(),
  });
  let fetchCalls = 0;
  await assert.rejects(
    () =>
      verifyManualAcceptanceReadiness(plan, {
        backendURL: "http://[::1]:8300",
        password: "local-demo-password",
        adminPassword: "local-admin-password",
        fetchImpl: async () => {
          fetchCalls += 1;
          return {
            ...okResponse({ access_token: "token-admin" }),
            redirected: true,
          };
        },
      }),
    /拒绝重定向响应/u,
  );
  assert.equal(fetchCalls, 1);
});

test("customer-facing report uses ordinary business wording", async () => {
  const plan = buildManualAcceptanceReadinessPlan({
    sourceReport: sourceReport(),
    factReport: factReport(),
    taskReport: taskReport(),
  });
  const { fetchImpl } = createReadinessFetch();
  const report = await verifyManualAcceptanceReadiness(plan, {
    backendURL: "http://127.0.0.1:8300",
    password: "local-demo-password",
    adminPassword: "local-admin-password",
    fetchImpl,
  });
  const markdown = renderManualAcceptanceReadinessMarkdown(report);

  assert.match(markdown, /# 全页面手动验收就绪核验/u);
  assert.match(markdown, /九个岗位任务合计：180 \/ 180/u);
  assert.match(markdown, /尚未证明/u);
  assert.match(markdown, /人工验收：未完成/u);
  assert.match(markdown, /页面操作已完成：0 \/ 48/u);
  assert.doesNotMatch(
    markdown,
    /Workflow|Fact|JSON-RPC|RBAC|schema|raw\s*id|甲方/iu,
  );
});
