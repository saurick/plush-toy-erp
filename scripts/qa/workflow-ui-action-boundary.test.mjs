import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const erpSourceRoot = path.join(repoRoot, "web/src/erp");

const sourceExtensions = new Set([".js", ".jsx", ".mjs"]);
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
      "正式任务动作应走 complete/block/reject action 合同，update_task_status 已退出运行时",
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

function assertWorkflowRetainedAttemptGuardBeforeMutation({
  source,
  relativePath,
}) {
  const guardIndex = source.indexOf("const accessVerified = await");
  const mutationIndex = source.indexOf(
    "mutationAttemptsRef.current.run",
    guardIndex,
  );
  assert(
    guardIndex >= 0,
    `${relativePath} must verify only new workflow mutation attempts`,
  );
  assert(
    mutationIndex > guardIndex,
    `${relativePath} must verify a new attempt before running the retained mutation`,
  );
  const guardedSource = source.slice(guardIndex, mutationIndex);
  assert(
    source.includes("verifyNewWorkflowTaskMutationAttempt") &&
      source.includes("verifyWorkflowTaskActionAccessBeforeSubmit"),
    `${relativePath} must keep backend access explain behind the new-attempt verifier`,
  );
  assert(
    guardedSource.includes("if (!accessVerified) return"),
    `${relativePath} must stop a new mutation when access verification denies`,
  );
}

function assertPostSuccessRefreshIsolated({
  source,
  relativePath,
  refreshCall,
  expectedCount,
}) {
  const escapedRefreshCall = refreshCall.replace(
    /[.*+?^${}()|[\]\\]/gu,
    "\\$&",
  );
  const pattern = new RegExp(
    `message\\.success\\([^\\n]+\\)\\s*\\n\\s*try\\s*\\{\\s*\\n\\s*await ${escapedRefreshCall}\\s*\\n\\s*\\}\\s*catch\\s*\\{\\s*\\n\\s*message\\.warning\\(['\"]操作已成功但列表刷新失败，请手动刷新['\"]\\)`,
    "gu",
  );
  assert.equal(
    [...source.matchAll(pattern)].length,
    expectedCount,
    `${relativePath} must keep every post-success refresh failure outside mutation unknown-result handling`,
  );
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

test("mobile role labels use shared role display names", () => {
  const roleModelPath = path.join(
    erpSourceRoot,
    "mobile/utils/mobileRoleTaskModel.mjs",
  );
  const source = readFileSync(roleModelPath, "utf8");

  assert(
    source.includes("getRoleDisplayName"),
    "mobile role labels must reuse the shared role display name source",
  );
  assert(
    !source.includes("const MOBILE_ROLE_LABELS"),
    "mobile role labels must not keep a private role label table",
  );
  assert(
    !source.includes("warehouse: '仓库组'") &&
      !source.includes("quality: '质检'"),
    "mobile role labels must not keep stale private warehouse / quality labels",
  );
});

test("mobile task visibility copy stays readable and role task query uses server cursor contract", () => {
  const taskViewPath = path.join(erpSourceRoot, "utils/mobileTaskView.mjs");
  const taskQueriesPath = path.join(
    erpSourceRoot,
    "utils/mobileTaskQueries.mjs",
  );
  const workflowApiPath = path.join(erpSourceRoot, "api/workflowApi.mjs");
  const taskViewSource = readFileSync(taskViewPath, "utf8");
  const taskQueriesSource = readFileSync(taskQueriesPath, "utf8");
  const workflowApiSource = readFileSync(workflowApiPath, "utf8");
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
  for (const contractSnippet of [
    "view_key: normalizedViewKey",
    "role_key: normalizedRoleKey",
    "...(normalizedCursor ? { cursor: normalizedCursor } : {})",
    "next_cursor: response.next_cursor || ''",
    "has_more: response.has_more === true",
    "server_time: response.server_time || 0",
  ]) {
    assert(
      taskQueriesSource.includes(contractSnippet),
      `mobileTaskQueries must preserve the server role-task cursor contract: ${contractSnippet}`,
    );
  }
  assert(
    workflowApiSource.includes("workflowRpc.call('list_role_tasks', query)"),
    "mobile role tasks must query the backend list_role_tasks projection",
  );
  assert(
    !taskQueriesSource.includes("limit: 200") &&
      !taskQueriesSource.includes("按主责岗位直查任务池"),
    "mobile role tasks must not restore the old capped client-side owner-pool query",
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
    !dashboardSource.includes("getWorkflowTaskAllowedActionModes"),
    "dashboard must not use local workflow action fallback as executable button proof; backend explain projection controls task actions",
  );
  assert(
    !dashboardSource.includes("getAllowedActionModes={") &&
      !dashboardSource.includes("onOpenAction={"),
    "dashboard task lanes must expose neutral task context entries before backend explain returns action choices",
  );
  assert(
    !dashboardSource.includes("按 owner_role_key 或具体负责人接收。"),
    "dashboard visible exception flow copy must not expose owner_role_key",
  );
  assert(
    !dashboardSource.includes(
      "render: (_, record) => getTaskOwnerRoleKey(record) || '-'",
    ),
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
  assert.match(
    workflowBusinessSource,
    /exportValue: getWorkflowTaskCodeLabel/u,
  );
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
    /<Tag>\{getWorkflowTaskOwnerRoleLabel\(task\)\}<\/Tag>/u,
  );
  assert(
    !collaborationPanelSource.includes("roleLabelMap") &&
      !collaborationPanelSource.includes("roleLabels.get(task.owner_role_key)"),
    "collaboration task panel must not keep page-level owner role label maps",
  );
  assert.match(
    collaborationPanelSource,
    /getWorkflowTaskStatusMeta\(task\)\.label/u,
  );
  assert.match(
    collaborationPanelSource,
    /getBusinessCollaborationTaskReasonLabel\(task\)/u,
  );
  assert(
    !collaborationPanelSource.includes("阻塞原因：{taskReason}"),
    "collaboration task panel must not label rejected reasons as blocked reasons",
  );
  assert(
    !collaborationPanelSource.includes(
      "statusLabels.get(taskStatusKey) || taskStatusKey",
    ),
    "collaboration task panel must not render raw task_status_key fallback",
  );
  assert.match(
    actionDrawerSource,
    /const ownerRoleLabel = task \? getWorkflowTaskOwnerRoleLabel\(task\) : ''/u,
  );
  assert.match(actionDrawerSource, /getWorkflowTaskCodeLabel\(task\)/u);
  assert(
    !actionDrawerSource.includes("`TASK-${task.id"),
    "workflow task action drawer must not build visible task code from raw task id",
  );
  assert(
    !actionDrawerSource.includes("roleLabelMap") &&
      !actionDrawerSource.includes("ownerRoleKey"),
    "workflow task action drawer must not keep page-level owner role label maps",
  );
  assert.match(taskBoardSource, /getWorkflowTaskOwnerRoleLabel/u);
  assert(
    !taskBoardSource.includes("当前账号不属于 ${ownerRoleKey}"),
    "workflow task readonly reason must not interpolate raw owner_role_key",
  );
  assert.match(taskBoardSource, /getWorkflowTaskReasonLabel/u);
  assert(
    !readFileSync(
      path.join(erpSourceRoot, "pages/DashboardPage.jsx"),
      "utf8",
    ).includes("阻塞原因：{getWorkflowTaskReason(task)}"),
    "dashboard task board must label blocked/rejected reasons through the shared reason helper",
  );
});

test("workflow business role filters use shared role display names", () => {
  const workflowBusinessPath = path.join(
    erpSourceRoot,
    "pages/WorkflowBusinessModulePage.jsx",
  );
  const source = readFileSync(workflowBusinessPath, "utf8");

  assert.match(source, /getRoleDisplayName/u);
  assert.match(
    source,
    /function workflowRoleOption\(value\) \{[\s\S]*getRoleDisplayName\(value, '责任岗位'\)/u,
  );
  for (const roleKey of [
    "pmc",
    "production",
    "warehouse",
    "quality",
    "sales",
    "finance",
  ]) {
    assert(
      source.includes(`workflowRoleOption('${roleKey}')`),
      `Workflow business owner-role filter must derive ${roleKey} label from shared role display names`,
    );
  }
  for (const hardCodedRoleOption of [
    "{ label: 'PMC', value: 'pmc' }",
    "{ label: '生产', value: 'production' }",
    "{ label: '仓库', value: 'warehouse' }",
    "{ label: '品质', value: 'quality' }",
    "{ label: '业务', value: 'sales' }",
    "{ label: '财务', value: 'finance' }",
  ]) {
    assert(
      !source.includes(hardCodedRoleOption),
      `Workflow business page must not maintain hard-coded owner-role option ${hardCodedRoleOption}`,
    );
  }
});

test("mobile task actions explain backend access before submitting actions", () => {
  const actionHookPath = path.join(
    erpSourceRoot,
    "mobile/hooks/useMobileRoleTaskActions.js",
  );
  const submitGuardPath = path.join(
    erpSourceRoot,
    "utils/workflowTaskActionSubmitGuard.mjs",
  );
  const source = readFileSync(actionHookPath, "utf8");
  const submitGuardSource = readFileSync(submitGuardPath, "utf8");

  const reasonGuardIndex = source.indexOf(
    "if (reasonRequired && !actionReason)",
  );
  const retainedAttemptGuardIndex = source.indexOf(
    "const accessVerified = await verifyNewWorkflowTaskMutationAttempt({",
  );
  const mutationRunIndex = source.indexOf(
    "await mutationAttemptsRef.current.run({",
    retainedAttemptGuardIndex,
  );
  const urgeReasonGuardIndex = source.indexOf("if (!reason)");
  const urgeRetainedAttemptGuardIndex = source.indexOf(
    "const accessVerified = await verifyNewWorkflowTaskMutationAttempt({",
    retainedAttemptGuardIndex + 1,
  );
  const urgeMutationRunIndex = source.indexOf(
    "await mutationAttemptsRef.current.run({",
    mutationRunIndex + 1,
  );

  assert.match(
    source,
    /import \{ verifyWorkflowTaskActionAccessBeforeSubmit \} from ['"]\.\.\/\.\.\/utils\/workflowTaskActionSubmitGuard\.mjs['"]/u,
  );
  assert.match(
    source,
    /resolveMobileTaskActionReason/u,
    "mobile action hook must derive blocked/rejected reason through the shared action-specific resolver",
  );
  assert.doesNotMatch(
    source,
    /canOpenMobileTaskDetailAction|canRunWorkflowTaskAction/u,
    "mobile action hook must not restore a local authorization projection beside backend explain",
  );
  assert.match(
    source,
    /const accessMatchesTask\s*=\s*[\s\S]*Number\(task\?\.id\)\s*===\s*Number\(selectedTask\?\.id\)[\s\S]*Number\(task\?\.version\)\s*===\s*Number\(selectedTask\?\.version\)/u,
    "mobile action access must stay bound to the selected task id and version",
  );
  assert.match(
    source,
    /taskActionAccess\?\.canRun\?\.\(actionMode\)\s*===\s*true/u,
    "mobile action entry must consume the backend action projection",
  );
  assert.match(
    source,
    /if \(!canRunMobileTaskAction\(task, taskStatusKey\)\)/u,
    "mobile status-action submit path must re-check the selected backend projection before fresh explain",
  );
  assert.match(
    source,
    /if \(!canRunMobileTaskAction\(task, action\)\)/u,
    "mobile detail action entry must not rely only on hidden buttons for action permission",
  );
  assert(
    !source.includes("blockedReasonByTaskID"),
    "mobile action hook must not keep one shared blockedReasonByTaskID draft for blocked and rejected actions",
  );
  assert.match(
    source,
    /const actionParams\s*=\s*\{[\s\S]*reason:\s*reasonRequired\s*\?\s*actionReason\s*:\s*''[\s\S]*payload,/u,
    "mobile status actions must submit the canonical top-level reason beside allowlisted evidence",
  );
  assert(
    !source.includes("rejected_reason:") &&
      !source.includes("blocked_reason:") &&
      !source.includes("business_status_key:"),
    "mobile status actions must not replay client-derived lifecycle fields in payload",
  );
  assert.match(
    submitGuardSource,
    /explainWorkflowActionAccess\(\{[\s\S]*task_id: taskID,[\s\S]*action_key: normalizedActionKey,[\s\S]*\}\)/u,
    "shared submit guard must use the formal backend explain task_id/action_key contract",
  );
  assert.match(
    submitGuardSource,
    /REASON_REQUIRED_ACTION_MODES[\s\S]*block[\s\S]*reject[\s\S]*resume[\s\S]*urge/u,
    "shared submit guard must centralize reason-required workflow actions",
  );
  assert.match(
    submitGuardSource,
    /REASON_REQUIRED_ACTION_MODES\.has\(normalizedActionKey\)[\s\S]*!String\(reason \|\| ''\)\.trim\(\)/u,
    "shared submit guard must reject missing reason before backend explain",
  );
  assert.match(
    submitGuardSource,
    /const taskID = Number\(task\?\.id \?\? 0\)/u,
    "shared submit guard must derive the formal task_id request from the backend task id only",
  );
  assert(
    !submitGuardSource.includes("task?.task_id"),
    "shared submit guard must not accept legacy task_id fallback from task-shaped UI objects",
  );
  assert.match(
    source,
    /verifyWorkflowTaskActionAccessBeforeSubmit\(\{[\s\S]*task,[\s\S]*actionKey: actionMode,[\s\S]*reason: actionReason,[\s\S]*onWarning: message\.warning,[\s\S]*onError: message\.error,[\s\S]*\}\)/u,
  );
  assert(
    !source.includes("explainWorkflowActionAccess"),
    "mobile action hook must not keep a private backend explain branch",
  );
  assert.match(
    source,
    /verifyNewWorkflowTaskMutationAttempt\(\{[\s\S]*verify:[\s\S]*verifyWorkflowTaskActionAccessBeforeSubmit\(\{[\s\S]*task,[\s\S]*actionKey: operation,[\s\S]*reason,[\s\S]*onWarning: message\.warning,[\s\S]*onError: message\.error,[\s\S]*\}\)/u,
  );
  assert.match(
    source,
    /const actionParams = \{[\s\S]*task_id: task\.id/u,
    "mobile complete/block/reject payload must use the formal task_id action contract",
  );
  const actionParamsMatch = source.match(
    /const actionParams = \{(?<body>[\s\S]*?)\n      \}/u,
  );
  assert(
    actionParamsMatch?.groups?.body,
    "mobile actionParams block must exist",
  );
  assert(
    !/^\s*id:\s*task\.id,/mu.test(actionParamsMatch.groups.body),
    "mobile complete/block/reject payload must not rely on legacy id fallback",
  );
  assert(
    !source.includes("...(task.payload || {})") &&
      !source.includes("...task.payload"),
    "mobile complete/block/reject must not echo the raw workflow payload back to action APIs",
  );
  assert(
    !source.includes("business_status_key:"),
    "mobile complete/block/reject payload must not submit client-controlled business_status_key",
  );
  for (const rawWorkflowSourceField of [
    "source_type",
    "source_id",
    "source_no",
  ]) {
    assert(
      !source.includes(rawWorkflowSourceField),
      `mobile action hook must not submit raw workflow source field ${rawWorkflowSourceField}`,
    );
  }
  assert(
    reasonGuardIndex >= 0 && reasonGuardIndex < retainedAttemptGuardIndex,
    "blocked/rejected reason must be validated before creating or replaying an attempt",
  );
  assert(
    retainedAttemptGuardIndex >= 0 &&
      retainedAttemptGuardIndex < mutationRunIndex,
    "mobile complete/block/reject must verify new intents before mutation while allowing exact replay",
  );
  assert(
    source
      .slice(retainedAttemptGuardIndex, mutationRunIndex)
      .includes("verifyWorkflowTaskActionAccessBeforeSubmit"),
    "mobile status actions must explain backend access for new intents",
  );
  assert(
    urgeReasonGuardIndex >= 0 &&
      urgeReasonGuardIndex < urgeRetainedAttemptGuardIndex,
    "mobile urge reason must be validated before creating or replaying an attempt",
  );
  assert(
    urgeRetainedAttemptGuardIndex >= 0 &&
      urgeRetainedAttemptGuardIndex < urgeMutationRunIndex &&
      source
        .slice(urgeRetainedAttemptGuardIndex, urgeMutationRunIndex)
        .includes("verifyWorkflowTaskActionAccessBeforeSubmit"),
    "mobile urge must verify new intents before mutation while allowing exact replay",
  );
});

test("desktop workflow task actions explain backend access before submitting actions", () => {
  const expectations = [
    {
      relativePath: "web/src/erp/pages/DashboardPage.jsx",
      actionWrappers: [
        "completeWorkflowTaskAction",
        "blockWorkflowTaskAction",
        "rejectWorkflowTaskAction",
        "resumeWorkflowTaskAction",
        "urgeWorkflowTask",
      ],
      forbiddenLegacyIDPattern: /^\s*id:\s*selectedTask\.id,/mu,
    },
    {
      relativePath: "web/src/erp/pages/WorkflowBusinessModulePage.jsx",
      actionWrappers: [
        "completeWorkflowTaskAction",
        "blockWorkflowTaskAction",
        "rejectWorkflowTaskAction",
        "resumeWorkflowTaskAction",
        "urgeWorkflowTask",
      ],
      forbiddenLegacyIDPattern: /^\s*id:\s*task\.id,/mu,
    },
    {
      relativePath:
        "web/src/erp/components/purchase-orders/usePurchaseOrderWorkflowActions.mjs",
      actionWrappers: [
        "completeWorkflowTaskAction",
        "blockWorkflowTaskAction",
        "rejectWorkflowTaskAction",
        "resumeWorkflowTaskAction",
        "urgeWorkflowTask",
      ],
      forbiddenLegacyIDPattern: /^\s*id:\s*task\.id,/mu,
    },
    {
      relativePath:
        "web/src/erp/components/outsourcing-orders/useOutsourcingOrderWorkflowActions.mjs",
      actionWrappers: [
        "completeWorkflowTaskAction",
        "blockWorkflowTaskAction",
        "rejectWorkflowTaskAction",
        "resumeWorkflowTaskAction",
        "urgeWorkflowTask",
      ],
      forbiddenLegacyIDPattern: /^\s*id:\s*task\.id,/mu,
    },
  ];

  for (const expectation of expectations) {
    const source = readFileSync(
      path.join(repoRoot, expectation.relativePath),
      "utf8",
    );
    assert.match(
      source,
      /verifyWorkflowTaskActionAccessBeforeSubmit/u,
      `${expectation.relativePath} must use the shared backend explain submit guard`,
    );
    assert.match(
      source,
      /verifyWorkflowTaskActionAccessBeforeSubmit\(\{[\s\S]*reason,/u,
      `${expectation.relativePath} must pass the current reason to the shared submit guard`,
    );
    for (const actionWrapper of expectation.actionWrappers) {
      assert(
        source.includes(actionWrapper),
        `${expectation.relativePath} must keep using ${actionWrapper}`,
      );
    }
    assertWorkflowRetainedAttemptGuardBeforeMutation({
      source,
      relativePath: expectation.relativePath,
    });
    assert.match(
      source,
      /task_id:\s*(?:selectedTask|task)\.id/u,
      `${expectation.relativePath} must submit formal task_id action payloads`,
    );
    assert(
      !expectation.forbiddenLegacyIDPattern.test(source),
      `${expectation.relativePath} must not rely on legacy id workflow action fallback`,
    );
    assert(
      !source.includes("business_status_key:") &&
        !source.includes("completeBusinessStatusKey"),
      `${expectation.relativePath} must not submit client-controlled business_status_key; backend action/usecase derives business status`,
    );
    if (
      expectation.relativePath.includes("usePurchaseOrderWorkflowActions") ||
      expectation.relativePath.includes("useOutsourcingOrderWorkflowActions") ||
      expectation.relativePath.includes("DashboardPage") ||
      expectation.relativePath.includes("WorkflowBusinessModulePage")
    ) {
      assert(
        !source.includes("workflowPayloadOf(task)") &&
          !source.includes("...workflowPayloadOf") &&
          !source.includes("payloadOf(selectedTask)") &&
          !source.includes("...payloadOf"),
        `${expectation.relativePath} must not echo page-derived workflow payload snapshots back to action APIs`,
      );
    }
  }
});

test("workflow task post-success refresh failures stay separate from mutation results", () => {
  const expectations = [
    {
      relativePath: "web/src/erp/mobile/hooks/useMobileRoleTaskActions.js",
      refreshCall: "loadTasks()",
      expectedCount: 2,
    },
    {
      relativePath: "web/src/erp/pages/DashboardPage.jsx",
      refreshCall: "loadDashboardStats()",
      expectedCount: 1,
    },
    {
      relativePath: "web/src/erp/pages/WorkflowBusinessModulePage.jsx",
      refreshCall: "loadWorkflowTasks()",
      expectedCount: 5,
    },
    {
      relativePath:
        "web/src/erp/components/purchase-orders/usePurchaseOrderWorkflowActions.mjs",
      refreshCall: "loadWorkflowTasks()",
      expectedCount: 5,
    },
    {
      relativePath:
        "web/src/erp/components/outsourcing-orders/useOutsourcingOrderWorkflowActions.mjs",
      refreshCall: "loadWorkflowTasks()",
      expectedCount: 5,
    },
  ];

  for (const expectation of expectations) {
    const source = readFileSync(
      path.join(repoRoot, expectation.relativePath),
      "utf8",
    );
    assertPostSuccessRefreshIsolated({ source, ...expectation });
  }
});

test("workflow urge payloads do not replay frontend task source fields", () => {
  const urgeActionFiles = [
    "web/src/erp/mobile/hooks/useMobileRoleTaskActions.js",
    "web/src/erp/pages/DashboardPage.jsx",
    "web/src/erp/pages/WorkflowBusinessModulePage.jsx",
    "web/src/erp/components/purchase-orders/usePurchaseOrderWorkflowActions.mjs",
    "web/src/erp/components/outsourcing-orders/useOutsourcingOrderWorkflowActions.mjs",
  ];

  for (const relativePath of urgeActionFiles) {
    const source = readFileSync(path.join(repoRoot, relativePath), "utf8");
    assert(
      /mutate:\s*urgeWorkflowTask|actionMode === 'urge'[\s\S]*\?\s*urgeWorkflowTask/u.test(
        source,
      ),
      `${relativePath} must pass the workflow urge API wrapper to the retained-attempt runner`,
    );
    assert.doesNotMatch(
      source,
      /^\s*source_(?:type|id|no):\s*(?:task|selectedTask)\.source_/mu,
      `${relativePath} urge payload must not re-submit source fields; backend resolves source truth from task_id`,
    );
  }
});

test("business collaboration panel delegates mutation verification to action-owning handlers", () => {
  const panelPath = path.join(
    erpSourceRoot,
    "components/business-list/CollaborationTaskPanel.jsx",
  );
  const source = readFileSync(panelPath, "utf8");
  const actionHandlerIndex = source.indexOf(
    "await actionHandler(actionDrawerTask",
  );

  assert.doesNotMatch(
    source,
    /verifyWorkflowTaskActionAccessBeforeSubmit/u,
    "collaboration panel must not repeat the action handler preflight and block an exact receipt replay",
  );
  assert(
    !source.includes("canRunWorkflowTaskAction"),
    "collaboration panel list actions must not use local workflow action fallback as executable proof",
  );
  assert(
    !source.includes("openActionDrawer(task, 'complete')") &&
      !source.includes("openActionDrawer(task, 'block')") &&
      !source.includes("openActionDrawer(task, 'reject')") &&
      !source.includes("openActionDrawer(task, 'urge')"),
    "collaboration panel list must open the drawer without preselecting an action; backend explain decides available actions",
  );
  assert(
    source.includes("onClick={() => openActionDrawer(task)}"),
    "collaboration panel list must expose a neutral processing entry before backend explain returns action choices",
  );
  assert(
    actionHandlerIndex >= 0 &&
      source.includes("if (succeeded !== false) closeActionDrawer()"),
    "collaboration panel must keep the drawer open when an action-owning handler rejects a new attempt",
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
    pageSource.includes(
      "const canCreateItem = canCreateOrder || canUpdateOrder",
    ) &&
      pageSource.includes("const canUpdateItem = canUpdateOrder") &&
      pageSource.includes("const canCancelItem = canUpdateOrder") &&
      !/sales_order_item\.(create|update|cancel)/u.test(pageSource),
    "sales order lines must use the aggregate order save permission instead of removed split-write actions",
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
      panelSource.includes("loading={itemsLoading}") &&
      panelSource.includes(
        "disabled={!selectedOrderCanEdit || itemsLoading}",
      ) &&
      panelSource.includes(
        "disabled={\n                !canGenerateInboundDraft",
      ),
    "purchase order create/edit/inbound draft controls must stay disabled without projected actions",
  );
  assert(
    modalSource.includes("canUpload={canUpdate || canCreate}") &&
      modalSource.includes("canDelete={canUpdate}"),
    "purchase order modal attachments must use projected create/update permissions",
  );
  assert(
    pageSource.includes(
      "canUpdateWorkflowTasks ? blockWorkflowTask : undefined",
    ) &&
      pageSource.includes(
        "canUpdateWorkflowTasks ? rejectWorkflowTask : undefined",
      ) &&
      pageSource.includes(
        "canUpdateWorkflowTasks ? urgePurchaseWorkflowTask : undefined",
      ) &&
      pageSource.includes(
        "canCompleteWorkflowTasks ? completeWorkflowTask : undefined",
      ),
    "purchase collaboration actions must remain behind workflow task action permissions",
  );
});

test("outsourcing order page keeps write buttons behind projected actions", () => {
  const pagePath = path.join(
    erpSourceRoot,
    "pages/V1OutsourcingOrdersPage.jsx",
  );
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
      pageSource.includes(
        "!canUpdate ||\n              !canEditOutsourcingOrder(selectedRow)",
      ) &&
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
    pageSource.includes(
      "canUpdateWorkflowTasks ? blockWorkflowTask : undefined",
    ) &&
      pageSource.includes(
        "canUpdateWorkflowTasks ? rejectWorkflowTask : undefined",
      ) &&
      pageSource.includes(
        "canUpdateWorkflowTasks ? urgeOutsourcingWorkflowTask : undefined",
      ) &&
      pageSource.includes(
        "canCompleteWorkflowTasks ? completeWorkflowTask : undefined",
      ),
    "outsourcing collaboration actions must remain behind workflow task action permissions",
  );
  assert(
    pageSource.includes("if (initialDraft.lines.length === 0)") &&
      pageSource.includes("message.warning('当前委外订单没有可打印的明细')"),
    "outsourcing contract print entry must block empty active line drafts before opening the print workspace",
  );
});

test("fact pages keep write buttons behind projected actions and status guards", () => {
  const factPageExpectations = [
    {
      relativePath: "web/src/erp/pages/ShipmentsPage.jsx",
      name: "shipment page",
      tokens: [
        "const canCreate = hasActionPermission(adminProfile, 'shipment.create')",
        "const canShip = hasActionPermission(adminProfile, 'shipment.ship')",
        "const canCancel = hasActionPermission(adminProfile, 'shipment.cancel')",
        "disabled={!canCreate}",
        "disabled={!selectedRow || saving}",
        "onClick={() => openShipmentDetails(selectedRow)}",
        "selectedRow.status !== 'DRAFT' ||\n                !canShip",
        "selectedRow.status !== 'SHIPPED' ||\n                !canCancel",
        "canCreate={canCreate}",
        "isViewModal={isViewModal}",
      ],
      forbiddenTokens: ["addShipmentItem", "mode: 'append'", "维护明细"],
    },
    {
      relativePath: "web/src/erp/pages/V1PurchaseReceiptsPage.jsx",
      name: "purchase receipt page",
      tokens: [
        "const canCreate = hasActionPermission(adminProfile, 'purchase.receipt.create')",
        "canCreate || hasActionPermission(adminProfile, 'warehouse.inbound.confirm')",
        "canUpload={canCreate || canPost}",
        "canDelete={canCreate || canPost}",
        "selectedRow.status !== 'DRAFT' ||\n              !canCreate",
        "selectedRow.status !== 'DRAFT' ||\n                !canPost",
        "selectedRow.status !== 'POSTED' ||\n                !canPost",
        "过账和取消均由系统按采购入库规则更新库存或生成冲正记录",
      ],
    },
    {
      relativePath: "web/src/erp/pages/V1QualityInspectionsPage.jsx",
      name: "quality inspection page",
      tokens: [
        "const canCreate = hasActionPermission(\n    adminProfile,\n    'quality.inspection.create'\n  )",
        "const canUpdate = hasActionPermission(\n    adminProfile,\n    'quality.inspection.update'\n  )",
        "disabled={!canCreate}",
        "selectedRow.status !== 'DRAFT' ||\n                !canUpdate",
        "selectedRow.status !== 'SUBMITTED' ||\n              !canUpdate",
        "!['DRAFT', 'SUBMITTED'].includes(selectedRow.status) ||\n              !canUpdate",
        "canUpload={canCreate || canUpdate}",
        "canDelete={canUpdate}",
        "不会绕过规则直接修改批次状态或库存流水",
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
    for (const token of expectation.forbiddenTokens || []) {
      assert(
        !source.includes(token),
        `${expectation.name} must not restore retired write entry: ${token}`,
      );
    }
    assert(
      !/function\s+hasPermission\s*\(/u.test(source),
      `${expectation.name} must call shared hasActionPermission directly instead of page-local wrappers`,
    );
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
          requiredTokens: [
            "停止",
            "不会自动改变",
            "出货",
            "库存",
            "财务",
            "协同任务",
          ],
        },
        {
          key: "cancel",
          requiredTokens: [
            "销售订单本身",
            "不会自动取消",
            "出货",
            "库存",
            "财务",
            "协同任务",
          ],
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
          requiredTokens: [
            "停止",
            "不会自动改变",
            "入库",
            "质检",
            "库存",
            "财务",
          ],
        },
        {
          key: "cancel",
          requiredTokens: [
            "采购订单本身",
            "不会自动冲正",
            "入库",
            "质检",
            "库存",
            "财务",
          ],
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
          requiredTokens: [
            "停止",
            "不会自动改变",
            "发料",
            "回货",
            "库存",
            "财务记录",
          ],
        },
        {
          key: "cancel",
          requiredTokens: [
            "加工合同本身",
            "不会自动冲正",
            "发料",
            "回货",
            "财务记录",
          ],
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
