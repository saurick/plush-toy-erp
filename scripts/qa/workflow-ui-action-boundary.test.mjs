import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const erpSourceRoot = path.join(repoRoot, "web/src/erp");

const sourceExtensions = new Set([".js", ".jsx", ".mjs"]);
const skippedRelativePaths = new Set(["web/src/erp/api/workflowApi.mjs"]);
const skippedSuffixes = [".test.js", ".test.jsx", ".test.mjs"];

const forbiddenWorkflowUiContracts = [
  {
    token: "createWorkflowTask",
    reason:
      "普通 UI 不应直接创建协同任务；任务派生应由后端 WorkflowUsecase 或受控修复入口处理",
  },
  {
    token: "updateWorkflowTaskStatus",
    reason:
      "正式任务动作应走 complete/block/reject action 合同，旧 update_task_status 只保留兼容",
  },
  {
    token: "upsertWorkflowBusinessState",
    reason:
      "普通 UI 不应直接写协同业务状态；业务状态投影应由后端 WorkflowUsecase 维护",
  },
  {
    token: "'create_task'",
    reason: "普通 UI 不应绕过 workflow API wrapper 直接调用 create_task",
  },
  {
    token: '"create_task"',
    reason: "普通 UI 不应绕过 workflow API wrapper 直接调用 create_task",
  },
  {
    token: "'update_task_status'",
    reason: "普通 UI 不应绕过 action 合同直接调用 update_task_status",
  },
  {
    token: '"update_task_status"',
    reason: "普通 UI 不应绕过 action 合同直接调用 update_task_status",
  },
  {
    token: "'upsert_business_state'",
    reason: "普通 UI 不应绕过后端规则直接调用 upsert_business_state",
  },
  {
    token: '"upsert_business_state"',
    reason: "普通 UI 不应绕过后端规则直接调用 upsert_business_state",
  },
];

function toRelative(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function shouldCheck(filePath) {
  const relativePath = toRelative(filePath);
  if (skippedRelativePaths.has(relativePath)) return false;
  if (skippedSuffixes.some((suffix) => relativePath.endsWith(suffix))) {
    return false;
  }
  return sourceExtensions.has(path.extname(filePath));
}

function collectSourceFiles(dirPath) {
  const entries = readdirSync(dirPath);
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry);
    const stat = statSync(entryPath);
    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(entryPath));
      continue;
    }
    if (stat.isFile() && shouldCheck(entryPath)) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

test("workflow UI action boundary: runtime UI uses action contracts only", () => {
  const sourceFiles = collectSourceFiles(erpSourceRoot);
  assert(sourceFiles.length > 0, "expected ERP runtime source files");

  for (const filePath of sourceFiles) {
    const relativePath = toRelative(filePath);
    const source = readFileSync(filePath, "utf8");
    for (const forbidden of forbiddenWorkflowUiContracts) {
      assert(
        !source.includes(forbidden.token),
        `${relativePath} must not contain ${forbidden.token}: ${forbidden.reason}`,
      );
    }
  }
});

test("mobile task detail action bar does not expose unsupported processing action", () => {
  const detailScreenPath = path.join(
    erpSourceRoot,
    "mobile/components/MobileTaskDetailScreen.jsx",
  );
  const source = readFileSync(detailScreenPath, "utf8");

  assert(
    !source.includes("handleTaskAction(selectedTask, 'processing')"),
    "mobile detail must not expose a processing action without a backend action contract",
  );
  assert(
    !source.includes("mobile-role-action-bar__button--processing"),
    "mobile detail must not keep a processing button that maps to an unsupported action",
  );
});

test("mobile task detail latest event fallback hides raw owner role key", () => {
  const detailScreenPath = path.join(
    erpSourceRoot,
    "mobile/components/MobileTaskDetailScreen.jsx",
  );
  const source = readFileSync(detailScreenPath, "utf8");

  assert(
    source.includes(": `任务已流转至 ${ownerRoleLabel}`"),
    "mobile detail latest event fallback must use the readable owner role label",
  );
  assert(
    !source.includes("任务已流转至 ${roleLabel} / ${"),
    "mobile detail latest event fallback must not concatenate raw owner_role_key",
  );
});

test("mobile mine role list fallback uses readable role label", () => {
  const listScreenPath = path.join(
    erpSourceRoot,
    "mobile/components/MobileTaskListScreen.jsx",
  );
  const source = readFileSync(listScreenPath, "utf8");

  assert(
    source.includes("role?.name || getMobileRoleLabel(role?.role_key)"),
    "mobile mine role list must translate role_key through getMobileRoleLabel",
  );
  assert(
    !source.includes("role?.name || role?.role_key"),
    "mobile mine role list must not expose raw role_key when role name is missing",
  );
});

test("mobile task visibility explanations hide raw workflow field names", () => {
  const taskViewPath = path.join(erpSourceRoot, "utils/mobileTaskView.mjs");
  const taskQueriesPath = path.join(erpSourceRoot, "utils/mobileTaskQueries.mjs");
  const taskViewSource = readFileSync(taskViewPath, "utf8");
  const taskQueriesSource = readFileSync(taskQueriesPath, "utf8");
  const forbiddenVisibleSnippets = [
    "未选择 role_key",
    "task_status_key 是终态",
    "owner_role_key 命中",
    "blocked / rejected",
    "critical_path 任务",
    "high priority",
    "shipment risk",
    "finance critical",
    "扩展命中 confirm_role_key",
    "扩展命中 outsource_owner_role_key",
    "owner_role_key=${",
    "task_group 不在生产关注范围",
    "source_type 或 task_group",
    "payload 缺少",
    "不只看 owner_role_key",
    "按 owner_role_key 直查任务池",
  ];

  for (const snippet of forbiddenVisibleSnippets) {
    assert(
      !taskViewSource.includes(snippet),
      `mobileTaskView visible explanation must not expose raw workflow field snippet: ${snippet}`,
    );
    assert(
      !taskQueriesSource.includes(snippet),
      `mobileTaskQueries visible explanation must not expose raw workflow field snippet: ${snippet}`,
    );
  }
  assert(
    taskViewSource.includes("未选择岗位，无法判断岗位任务端可见性。"),
    "mobileTaskView must explain missing role in business-readable copy",
  );
  assert(
    taskQueriesSource.includes("按主责岗位直查任务池"),
    "mobileTaskQueries must explain owner-pool lookup as 主责岗位",
  );
});

test("desktop workflow task UI hides raw owner role key fallbacks", () => {
  const dashboardPath = path.join(erpSourceRoot, "pages/DashboardPage.jsx");
  const workflowBusinessPath = path.join(
    erpSourceRoot,
    "pages/WorkflowBusinessModulePage.jsx",
  );
  const collaborationPanelPath = path.join(
    erpSourceRoot,
    "components/business-list/CollaborationTaskPanel.jsx",
  );
  const actionDrawerPath = path.join(
    erpSourceRoot,
    "components/workflow/WorkflowTaskActionDrawer.jsx",
  );
  const taskBoardPath = path.join(erpSourceRoot, "utils/workflowTaskBoard.mjs");
  const dashboardSource = readFileSync(dashboardPath, "utf8");
  const workflowBusinessSource = readFileSync(workflowBusinessPath, "utf8");
  const collaborationPanelSource = readFileSync(collaborationPanelPath, "utf8");
  const actionDrawerSource = readFileSync(actionDrawerPath, "utf8");
  const taskBoardSource = readFileSync(taskBoardPath, "utf8");

  assert.match(dashboardSource, /getWorkflowTaskOwnerRoleLabel\(record\)/u);
  assert.match(
    dashboardSource,
    /getWorkflowTaskOwnerRoleLabel\(selectedWorkbenchTask\)/u,
  );
  assert(
    !dashboardSource.includes("按 owner_role_key 或具体负责人接收。"),
    "dashboard visible exception flow copy must not expose owner_role_key",
  );
  assert(
    !dashboardSource.includes("render: (_, record) => getTaskOwnerRoleKey(record) || '-'"),
    "dashboard task board owner column must not render raw owner_role_key",
  );
  assert.match(
    workflowBusinessSource,
    /render: \(_, record\) => getWorkflowTaskOwnerRoleLabel\(record\)/u,
  );
  assert.match(
    workflowBusinessSource,
    /exportValue: \(record\) => getWorkflowTaskOwnerRoleLabel\(record\)/u,
  );
  assert.match(
    workflowBusinessSource,
    /getWorkflowTaskCodeLabel\(selectedTask\)/u,
  );
  assert.match(workflowBusinessSource, /exportValue: getWorkflowTaskCodeLabel/u);
  assert(
    !workflowBusinessSource.includes("`TASK-${selectedTask.id}`") &&
      !workflowBusinessSource.includes("`TASK-${record.id}`") &&
      !workflowBusinessSource.includes("`TASK-${record?.id}`"),
    "workflow business page must not build visible task code from raw task id",
  );
  assert(
    !workflowBusinessSource.includes("getTaskOwnerRoleKey(selectedTask) ||"),
    "workflow business selected action summary must not fall back to raw owner_role_key",
  );
  assert.match(
    collaborationPanelSource,
    /roleLabels\.get\(task\.owner_role_key\) \|\|[\s\S]*getWorkflowTaskOwnerRoleLabel\(task\)/u,
  );
  assert(
    !collaborationPanelSource.includes(
      "roleLabels.get(task.owner_role_key) || task.owner_role_key",
    ),
    "collaboration task panel must not render raw owner_role_key fallback",
  );
  assert.match(
    actionDrawerSource,
    /roleLabelMap\?\.get\?\.\(ownerRoleKey\) \|\|[\s\S]*getWorkflowTaskOwnerRoleLabel\(task\)/u,
  );
  assert.match(actionDrawerSource, /getWorkflowTaskCodeLabel\(task\)/u);
  assert(
    !actionDrawerSource.includes("`TASK-${task.id"),
    "workflow task action drawer must not build visible task code from raw task id",
  );
  assert(
    !actionDrawerSource.includes(
      "roleLabelMap?.get?.(ownerRoleKey) || ownerRoleKey",
    ),
    "workflow task action drawer must not render raw owner_role_key fallback",
  );
  assert.match(taskBoardSource, /getWorkflowTaskOwnerRoleLabel/u);
  assert(
    !taskBoardSource.includes("当前账号不属于 ${ownerRoleKey}"),
    "workflow task readonly reason must not interpolate raw owner_role_key",
  );
});

test("mobile task actions explain backend access before submitting actions", () => {
  const actionHookPath = path.join(
    erpSourceRoot,
    "mobile/hooks/useMobileRoleTaskActions.js",
  );
  const source = readFileSync(actionHookPath, "utf8");

  const reasonGuardIndex = source.indexOf(
    "if (reasonRequired && !blockedReason)"
  );
  const explainCallIndex = source.indexOf(
    "const explainAllowed = await explainTaskAction(task, explainActionKey)"
  );
  const completeActionIndex = source.indexOf("await completeWorkflowTaskAction");
  const blockActionIndex = source.indexOf("await blockWorkflowTaskAction");
  const rejectActionIndex = source.indexOf("await rejectWorkflowTaskAction");
  const urgeReasonGuardIndex = source.indexOf("if (!reason)");
  const urgeExplainIndex = source.indexOf(
    "const explainAllowed = await explainTaskAction(task, 'urge')"
  );
  const urgeActionIndex = source.indexOf("await urgeWorkflowTask");

  assert.match(source, /import \{[\s\S]*explainWorkflowActionAccess/u);
  assert.match(
    source,
    /import \{ getActionErrorMessage \} from ['"]@\/common\/utils\/errorMessage['"]/u,
  );
  assert.match(source, /task_id: task\.id,[\s\S]*action_key: actionKey/u);
  assert.match(source, /message\.warning\(action\.reason \|\| '当前账号不能提交这个任务动作'\)/u);
  assert.match(
    source,
    /message\.error\(getActionErrorMessage\(error, '核对任务动作权限失败'\)\)/u,
  );
  assert(
    reasonGuardIndex >= 0 && reasonGuardIndex < explainCallIndex,
    "blocked/rejected reason must be validated before backend access explain",
  );
  assert(
    explainCallIndex >= 0 && explainCallIndex < completeActionIndex,
    "mobile complete must explain backend access before submit",
  );
  assert(
    explainCallIndex < blockActionIndex,
    "mobile block must explain backend access before submit",
  );
  assert(
    explainCallIndex < rejectActionIndex,
    "mobile reject must explain backend access before submit",
  );
  assert(
    urgeReasonGuardIndex >= 0 && urgeReasonGuardIndex < urgeExplainIndex,
    "mobile urge reason must be validated before backend access explain",
  );
  assert(
    urgeExplainIndex >= 0 && urgeExplainIndex < urgeActionIndex,
    "mobile urge must explain backend access before submit",
  );
});

test("sales order page keeps write buttons behind projected actions", () => {
  const pagePath = path.join(erpSourceRoot, "pages/V1SalesOrdersPage.jsx");
  const modalPath = path.join(
    erpSourceRoot,
    "components/sales-orders/SalesOrderBusinessModal.jsx",
  );
  const formPath = path.join(
    erpSourceRoot,
    "components/sales-orders/SalesOrderForm.jsx",
  );
  const pageSource = readFileSync(pagePath, "utf8");
  const modalSource = readFileSync(modalPath, "utf8");
  const formSource = readFileSync(formPath, "utf8");

  assert(
    pageSource.includes(
      "const canCreateOrder = hasActionPermission(adminProfile, 'sales_order.create')",
    ),
    "sales order page must derive create permission through projected action helper",
  );
  assert(
    pageSource.includes("primaryAction={") &&
      pageSource.includes("canCreateOrder ? (") &&
      pageSource.includes("onClick={openCreateOrder}"),
    "sales order create button must be hidden when canCreateOrder is false",
  );
  assert(
    pageSource.includes(
      "hasActionPermission(adminProfile, action.permission) &&",
    ) &&
      pageSource.includes(
        "canRunSalesOrderLifecycleAction(\n          selectedOrder.lifecycle_status,\n          action.nextStatus\n        )",
      ),
    "sales order lifecycle actions must require both action projection and lifecycle state",
  );
  assert(
    pageSource.includes("canCreateOrder={canCreateOrder}") &&
      pageSource.includes("canUpdateOrder={canUpdateOrder}") &&
      pageSource.includes("canCreateItem={canCreateItem}") &&
      pageSource.includes("canUpdateItem={canUpdateItem}") &&
      pageSource.includes("canCancelItem={canCancelItem}"),
    "sales order modal must receive projected write permissions",
  );
  assert(
    modalSource.includes("canUpload={canUpdateOrder || canCreateOrder}") &&
      modalSource.includes("canDelete={canUpdateOrder}") &&
      modalSource.includes("canCreateItem={canCreateItem}") &&
      modalSource.includes("canUpdateItem={canUpdateItem}") &&
      modalSource.includes("canCancelItem={canCancelItem}"),
    "sales order modal must pass projected permissions to attachments and order lines",
  );
  assert(
    formSource.includes("disabled={!canCreateItem}") &&
      formSource.includes("disabled={!canRemoveLine}"),
    "sales order line import/copy/delete controls must stay disabled without projected item actions",
  );
});

test("purchase order page keeps write buttons behind projected actions", () => {
  const pagePath = path.join(erpSourceRoot, "pages/V1PurchaseOrdersPage.jsx");
  const panelPath = path.join(
    erpSourceRoot,
    "components/purchase-orders/PurchaseOrderOperationPanel.jsx",
  );
  const modalPath = path.join(
    erpSourceRoot,
    "components/purchase-orders/PurchaseOrderBusinessModal.jsx",
  );
  const pageSource = readFileSync(pagePath, "utf8");
  const panelSource = readFileSync(panelPath, "utf8");
  const modalSource = readFileSync(modalPath, "utf8");

  assert(
    pageSource.includes(
      "const canCreate = hasActionPermission(adminProfile, 'purchase.order.create')",
    ) &&
      pageSource.includes(
        "const canUpdate = hasActionPermission(adminProfile, 'purchase.order.update')",
      ) &&
      pageSource.includes(
        "const canCreatePurchaseReceipt = hasActionPermission(",
      ) &&
      pageSource.includes("'purchase.receipt.create'"),
    "purchase order page must derive write permissions through projected action helper",
  );
  assert(
    pageSource.includes(
      "hasActionPermission(adminProfile, action.permission) &&",
    ) &&
      pageSource.includes(
        "canRunPurchaseOrderLifecycleAction(\n          singleSelectedOrder.lifecycle_status,\n          action.nextStatus\n        )",
      ),
    "purchase order lifecycle actions must require both action projection and lifecycle state",
  );
  assert(
    pageSource.includes("canCreate={canCreate}") &&
      pageSource.includes("canUpdate={canUpdate}") &&
      pageSource.includes(
        "canCreatePurchaseReceipt,\n    order: singleSelectedOrder",
      ),
    "purchase order page must pass projected permissions into operation panel, modal, and inbound draft guard",
  );
  assert(
    panelSource.includes("disabled={!canCreate}") &&
      panelSource.includes("disabled={!selectedOrderCanEdit}") &&
      panelSource.includes("disabled={\n                !canGenerateInboundDraft"),
    "purchase order create/edit/inbound draft controls must stay disabled without projected actions",
  );
  assert(
    modalSource.includes("canUpload={canUpdate || canCreate}") &&
      modalSource.includes("canDelete={canUpdate}"),
    "purchase order modal attachments must use projected create/update permissions",
  );
});

test("outsourcing order page keeps write buttons behind projected actions", () => {
  const pagePath = path.join(erpSourceRoot, "pages/V1OutsourcingOrdersPage.jsx");
  const pageSource = readFileSync(pagePath, "utf8");

  assert(
    pageSource.includes(
      "const canCreate = hasActionPermission(\n    adminProfile,\n    'outsourcing.order.create'\n  )",
    ) &&
      pageSource.includes(
        "const canUpdate = hasActionPermission(\n    adminProfile,\n    'outsourcing.order.update'\n  )",
      ),
    "outsourcing order page must derive create/update through projected action helper",
  );
  assert(
    pageSource.includes("disabled={!canCreate}") &&
      pageSource.includes("!canUpdate ||\n              !canEditOutsourcingOrder(selectedRow)") &&
      pageSource.includes("canUpload={canUpdate || canCreate}") &&
      pageSource.includes("canDelete={canUpdate}"),
    "outsourcing order create/edit/attachment controls must stay disabled without projected actions",
  );
  assert(
    pageSource.includes(
      "hasActionPermission(adminProfile, action.permission) &&",
    ) &&
      pageSource.includes(
        "canRunOutsourcingOrderLifecycleAction(\n            selectedRow.lifecycle_status,\n            action.nextStatus\n          )",
      ),
    "outsourcing lifecycle actions must require both action projection and lifecycle state",
  );
  assert(
    pageSource.includes("canUpdateWorkflowTasks ? blockWorkflowTask : undefined") &&
      pageSource.includes(
        "canUpdateWorkflowTasks ? urgeOutsourcingWorkflowTask : undefined",
      ) &&
      pageSource.includes("canCompleteWorkflowTasks ? completeWorkflowTask : undefined"),
    "outsourcing collaboration actions must remain behind workflow task action permissions",
  );
});

test("fact pages keep write buttons behind projected actions and status guards", () => {
  const factPageExpectations = [
    {
      relativePath: "web/src/erp/pages/ShipmentsPage.jsx",
      name: "shipment page",
      tokens: [
        "const canCreate = hasPermission(adminProfile, 'shipment.create')",
        "const canShip = hasPermission(adminProfile, 'shipment.ship')",
        "const canCancel = hasPermission(adminProfile, 'shipment.cancel')",
        "disabled={!canCreate}",
        "selectedRow.status !== 'DRAFT' ||\n              !canCreate",
        "selectedRow.status !== 'DRAFT' ||\n                !canShip",
        "selectedRow.status !== 'SHIPPED' ||\n                !canCancel",
        "canCreate={canCreate}",
        "canShip={canShip}",
      ],
    },
    {
      relativePath: "web/src/erp/pages/V1PurchaseReceiptsPage.jsx",
      name: "purchase receipt page",
      tokens: [
        "const canCreate = hasPermission(adminProfile, 'purchase.receipt.create')",
        "canCreate || hasPermission(adminProfile, 'warehouse.inbound.confirm')",
        "canUpload={canCreate || canPost}",
        "canDelete={canCreate || canPost}",
        "selectedRow.status !== 'DRAFT' ||\n              !canCreate",
        "selectedRow.status !== 'DRAFT' ||\n                !canPost",
        "selectedRow.status !== 'POSTED' ||\n                !canPost",
        "过账和取消均由后端采购入库 usecase 写库存事实或冲正",
      ],
    },
    {
      relativePath: "web/src/erp/pages/V1QualityInspectionsPage.jsx",
      name: "quality inspection page",
      tokens: [
        "const canCreate = hasPermission(adminProfile, 'quality.inspection.create')",
        "const canUpdate = hasPermission(adminProfile, 'quality.inspection.update')",
        "disabled={!canCreate}",
        "selectedRow.status !== 'DRAFT' ||\n                !canUpdate",
        "selectedRow.status !== 'SUBMITTED' ||\n              !canUpdate",
        "!['DRAFT', 'SUBMITTED'].includes(selectedRow.status) ||\n              !canUpdate",
        "canUpload={canCreate || canUpdate}",
        "canDelete={canUpdate}",
        "前端不本地改批次状态，不写库存流水",
      ],
    },
  ];

  for (const expectation of factPageExpectations) {
    const source = readFileSync(
      path.join(repoRoot, expectation.relativePath),
      "utf8",
    );
    for (const token of expectation.tokens) {
      assert(
        source.includes(token),
        `${expectation.name} must keep projected action/status guard token: ${token}`,
      );
    }
  }
});

test("formal business actions do not bypass projected action helper", () => {
  const sourceFiles = collectSourceFiles(erpSourceRoot);
  const skippedBypassPaths = new Set([
    "web/src/erp/components/ERPLayout.jsx",
    "web/src/erp/pages/AuditLogsPage.jsx",
    "web/src/erp/pages/PermissionCenterPage.jsx",
  ]);
  const bypassPattern =
    /is_super_admin\s*={0,2}\s*true[\s\S]{0,120}\|\|[\s\S]{0,120}hasActionPermission|hasActionPermission[\s\S]{0,120}\|\|[\s\S]{0,120}is_super_admin\s*={0,2}\s*true/;

  for (const filePath of sourceFiles) {
    const relativePath = toRelative(filePath);
    if (skippedBypassPaths.has(relativePath)) continue;
    const source = readFileSync(filePath, "utf8");
    assert(
      !bypassPattern.test(source),
      `${relativePath} must not use is_super_admin || hasActionPermission for formal business actions`,
    );
  }
});

test("source document lifecycle confirmations keep fact boundaries visible", () => {
  const configExpectations = [
    {
      relativePath:
        "web/src/erp/components/sales-orders/salesOrderPageConfig.mjs",
      sourceName: "销售订单",
      actions: [
        {
          key: "close",
          requiredTokens: ["停止", "不会自动写", "出货", "库存", "财务", "Workflow"],
        },
        {
          key: "cancel",
          requiredTokens: ["源单", "不会自动取消", "出货", "库存", "财务", "Workflow"],
        },
      ],
    },
    {
      relativePath:
        "web/src/erp/components/purchase-orders/purchaseOrderPageConfig.mjs",
      sourceName: "采购订单",
      actions: [
        {
          key: "close",
          requiredTokens: ["停止", "不会自动写", "入库", "质检", "库存", "财务"],
        },
        {
          key: "cancel",
          requiredTokens: ["源单", "不会自动冲正", "入库", "质检", "库存", "财务"],
        },
      ],
    },
    {
      relativePath:
        "web/src/erp/components/outsourcing-orders/outsourcingOrderPageConfig.mjs",
      sourceName: "加工合同",
      actions: [
        {
          key: "close",
          requiredTokens: ["停止", "不会自动写", "发料", "回货", "库存", "财务事实"],
        },
        {
          key: "cancel",
          requiredTokens: ["源单", "不会自动冲正", "发料", "回货", "财务事实"],
        },
      ],
    },
  ];

  for (const expectation of configExpectations) {
    const source = readFileSync(
      path.join(repoRoot, expectation.relativePath),
      "utf8",
    );
    for (const action of expectation.actions) {
      const blockMatch = source.match(
        new RegExp(
          `key:\\s*['"]${action.key}['"][\\s\\S]*?run:\\s*[A-Za-z0-9_]+,`,
        ),
      );
      assert(
        blockMatch,
        `${expectation.relativePath} must keep an explicit ${action.key} lifecycle action`,
      );
      const actionBlock = blockMatch[0];
      for (const token of action.requiredTokens) {
        assert(
          actionBlock.includes(token),
          `${expectation.sourceName} ${action.key} confirmation must mention ${token} to avoid implying fact writes or rollback`,
        );
      }
    }
  }
});
