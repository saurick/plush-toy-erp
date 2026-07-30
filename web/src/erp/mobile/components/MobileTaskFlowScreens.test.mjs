import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const actionScreenSource = readFileSync(
  new URL('./MobileTaskActionScreen.jsx', import.meta.url),
  'utf8'
)
const detailScreenSource = readFileSync(
  new URL('./MobileTaskDetailScreen.jsx', import.meta.url),
  'utf8'
)
const listScreenSource = readFileSync(
  new URL('./MobileTaskListScreen.jsx', import.meta.url),
  'utf8'
)
const listSkeletonSource = readFileSync(
  new URL('./MobileTaskListSkeleton.jsx', import.meta.url),
  'utf8'
)
const flowHeaderSource = readFileSync(
  new URL('./MobileTaskFlowHeader.jsx', import.meta.url),
  'utf8'
)
const processStageSource = readFileSync(
  new URL(
    '../../components/workflow/WorkflowProcessStageTrack.jsx',
    import.meta.url
  ),
  'utf8'
)
const taskEventTrailSource = readFileSync(
  new URL(
    '../../components/workflow/WorkflowTaskEventTrail.jsx',
    import.meta.url
  ),
  'utf8'
)
const receiptScreenSource = readFileSync(
  new URL('./MobileTaskReceiptScreen.jsx', import.meta.url),
  'utf8'
)
const actionHookSource = readFileSync(
  new URL('../hooks/useMobileRoleTaskActions.js', import.meta.url),
  'utf8'
)
const flowStyleSource = readFileSync(
  new URL('../mobileRoleTasks.css', import.meta.url),
  'utf8'
)
const taskModelSource = readFileSync(
  new URL('../utils/mobileRoleTaskModel.mjs', import.meta.url),
  'utf8'
)
const roleTaskPageSource = readFileSync(
  new URL('../pages/MobileRoleTasksPage.jsx', import.meta.url),
  'utf8'
)

test('mobile task action screen fails closed and covers every backend-explained action mode', () => {
  assert.match(
    taskModelSource,
    /ACTIONABLE:\s*'actionable'[\s\S]*CHECKING:\s*'checking'[\s\S]*FAILED:\s*'failed'[\s\S]*READONLY:\s*'readonly'[\s\S]*URGE_ONLY:\s*'urge-only'/u
  )
  assert.match(
    actionScreenSource,
    /import \{[\s\S]*MOBILE_TASK_ACTION_ACCESS_STATES,[\s\S]*\} from '\.\.\/utils\/mobileRoleTaskModel\.mjs'/u
  )
  for (const action of ['done', 'blocked', 'rejected', 'resume', 'urge']) {
    assert.match(actionScreenSource, new RegExp(`key: '${action}'`, 'u'))
  }
  assert.match(
    actionScreenSource,
    /accessState = MOBILE_TASK_ACTION_ACCESS_STATES\.CHECKING/u
  )
  assert.match(actionScreenSource, /availableActions\.includes\(option\.key\)/u)
})

test('mobile task action screen separates a single command from multiple choices', () => {
  assert.match(
    actionScreenSource,
    /visibleActions\.length === 1 \? visibleActions\[0\] : null/u
  )
  assert.match(actionScreenSource, /visibleActions\.length > 1/u)
  assert.match(
    actionScreenSource,
    /const singleVisibleActionKey = singleVisibleAction\?\.key \|\| ''/u
  )
  assert.match(
    actionScreenSource,
    /selectedAction === singleVisibleActionKey[\s\S]*onActionChange\(singleVisibleActionKey\)/u
  )
  assert.match(actionScreenSource, /role="radiogroup"/u)
  assert.match(actionScreenSource, /type="radio"/u)
  assert.match(actionScreenSource, /data-testid="mobile-task-action-options"/u)
  assert.match(actionScreenSource, /data-testid="mobile-task-single-action"/u)
  assert.match(
    actionScreenSource,
    /data-testid="mobile-task-single-action-summary"/u
  )
  assert.match(actionScreenSource, />\s*本次操作\s*</u)
  assert.match(actionScreenSource, /`确认\$\{effectiveActionLabel\}`/u)
  assert.doesNotMatch(actionScreenSource, /<legend/u)
  assert.doesNotMatch(actionScreenSource, /aria-pressed/u)
})

test('mobile task action screen validates and focuses the first missing field', () => {
  assert.match(
    actionScreenSource,
    /REASON_REQUIRED_ACTIONS = new Set\(\[[\s\S]*'done'[\s\S]*'blocked'[\s\S]*'rejected'[\s\S]*'resume'[\s\S]*'urge'/u
  )
  assert.match(
    actionScreenSource,
    /if \(action === 'done'\) return approvalTask \? '审批意见' : '完成反馈'/u
  )
  assert.match(actionScreenSource, /isWorkflowApprovalTask\(task\)/u)
  assert.match(actionScreenSource, /\? '审批通过'/u)
  assert.match(actionScreenSource, /说明通过依据、核对结果和需要交接的信息/u)
  assert.match(actionScreenSource, /actionChoiceRef\.current\?\.focus\(\)/u)
  assert.match(actionScreenSource, /reasonRef\.current\?\.focus\(\)/u)
  assert.doesNotMatch(actionScreenSource, /现场证据|onEvidenceChange/u)
  assert.match(actionScreenSource, /任务附件统一在详情页查看或管理/u)
  assert.match(actionScreenSource, /aria-invalid=/u)
  assert.match(actionScreenSource, /noValidate/u)
  assert.match(actionScreenSource, /min-h-\[48px\]/u)
  assert.match(actionScreenSource, /const \{ visualViewport \} = window/u)
  assert.match(actionScreenSource, /screen\.requestSubmit\(\)/u)
  assert.match(actionScreenSource, /event\.key === 'Escape'/u)
})

test('mobile task action screen loads authoritative approval form and fails closed on drift', () => {
  assert.match(actionScreenSource, /getWorkflowTaskProcessContext/u)
  assert.match(actionScreenSource, /expectedApprovalProfile/u)
  assert.match(
    actionScreenSource,
    /processApprovalForm\?\.profile_key === 'production_exception_approval'/u
  )
  assert.match(actionScreenSource, /审批表单暂时无法从流程真源确认/u)
  assert.match(actionScreenSource, /重新读取流程表单/u)
  assert.match(
    actionScreenSource,
    /系统不会根据任务文案或岗位名称猜测审批字段/u
  )
  assert.match(actionScreenSource, /processDecisionRequired \? 255 : 500/u)
  assert.match(roleTaskPageSource, /mobileRoleTasksApprovedQuantity/u)
  assert.match(
    roleTaskPageSource,
    /approvedQuantity:\s*detailApprovedQuantityValue/u
  )
  assert.match(roleTaskPageSource, /persistMobileTaskDraftBackup/u)
  assert.match(actionScreenSource, /showDisabledSubmit/u)
})

test('mobile task flow exposes one shared three-step navigation contract', () => {
  for (const source of [
    detailScreenSource,
    actionScreenSource,
    receiptScreenSource,
  ]) {
    assert.match(source, /MobileTaskFlowHeader/u)
  }
  for (const label of ['查看任务', '处理任务', '结果回执']) {
    assert.match(flowHeaderSource, new RegExp(label, 'u'))
  }
  assert.match(flowHeaderSource, /aria-current=\{current \? 'step'/u)
  assert.match(flowHeaderSource, /data-state=\{\s*current \? 'current'/u)
  assert.match(
    flowHeaderSource,
    /disabled=\{busy \|\| current \|\| !available\}/u
  )
  assert.match(
    flowStyleSource,
    /\.mobile-task-flow-back\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/u
  )
  assert.match(
    flowStyleSource,
    /\.mobile-task-flow-step\s*\{[\s\S]*?min-height:\s*64px;/u
  )
  assert.match(detailScreenSource, /data-testid="mobile-task-detail-screen"/u)
  assert.match(detailScreenSource, />\s*处理任务\s*</u)
  assert.doesNotMatch(
    detailScreenSource,
    />\s*发起催办\s*</u,
    '催办必须先进入独立处理步骤填写原因，不能在详情中伪装成直接提交'
  )
})

test('mobile task overview, list heading and loaded counts stay concise', () => {
  assert.match(listScreenSource, />\s*已加载任务分布\s*</u)
  assert.doesNotMatch(listScreenSource, /任务按页加载/u)
  assert.doesNotMatch(listScreenSource, /不代表岗位全量/u)
  assert.match(listScreenSource, /mobile-loaded-task-overview/u)
  assert.match(
    listScreenSource,
    /data-testid="mobile-task-list-status-heading"/u
  )
  assert.match(listScreenSource, />\s*状态 \/ 截止\s*</u)
  assert.match(listScreenSource, /whitespace-nowrap/u)
  assert.equal(
    (listScreenSource.match(/renderLoadedTaskOverview\(\)/gu) || []).length,
    1
  )
  const donePanelSource = listScreenSource.slice(
    listScreenSource.indexOf('const renderDonePanel'),
    listScreenSource.indexOf('const renderMessageTabs')
  )
  assert.ok(donePanelSource)
  assert.doesNotMatch(donePanelSource, /renderLoadedTaskOverview/u)
  assert.match(donePanelSource, /data-testid="mobile-role-done-count"/u)
  assert.match(
    listScreenSource,
    /mobile-role-count-tag mobile-role-task-filter__count">\s*\{item\.count\}/u
  )
  assert.match(
    listScreenSource,
    /mobile-role-count-tag mobile-role-message-tabs__count/u
  )
  assert.doesNotMatch(listScreenSource, /\(\{item\.count\}\)/u)
  assert.doesNotMatch(listScreenSource, /const renderTabSummary/u)
  assert.doesNotMatch(listScreenSource, /renderTabSummary\(\)/u)
  assert.doesNotMatch(listScreenSource, /\{roleLabel\}任务端/u)
  assert.match(
    flowStyleSource,
    /\.mobile-role-count-tag\s*\{[\s\S]*?border-radius:\s*999px;[\s\S]*?font-variant-numeric:\s*tabular-nums;/u
  )
  assert.match(
    flowStyleSource,
    /\[data-erp-theme='dark'\] \.mobile-role-count-tag\s*\{/u
  )
  assert.doesNotMatch(listScreenSource, /mobile-role-focus-card/u)
  assert.doesNotMatch(listScreenSource, /已加载任务优先事项/u)
  assert.doesNotMatch(listScreenSource, /progressPercent/u)
  assert.doesNotMatch(roleTaskPageSource, /progressPercent/u)
})

test('mobile task list keeps approval in the primary filter row and gates it by the effective capability set', () => {
  const filterKeySource = taskModelSource.slice(
    taskModelSource.indexOf('export const MOBILE_TASK_FILTER_KEYS'),
    taskModelSource.indexOf('export const MOBILE_LIST_KEYS')
  )
  assert.match(roleTaskPageSource, /canViewWorkflowApprovalInbox/u)
  assert.match(roleTaskPageSource, /MOBILE_ROLE_TASK_VIEW_KEYS\.APPROVAL/u)
  assert.match(roleTaskPageSource, /isWorkflowApprovalTask/u)
  assert.match(
    roleTaskPageSource,
    /canViewApprovalInbox[\s\S]*MOBILE_TASK_FILTER_KEYS\.APPROVAL[\s\S]*label: '审批'[\s\S]*ariaLabel: '待我审批'/u
  )
  assert.match(
    listScreenSource,
    /data-testid=\{`mobile-role-filter-\$\{item\.key\}`\}/u
  )
  assert.match(listScreenSource, /item\.ariaLabel \|\| item\.label/u)
  assert.match(
    listScreenSource,
    /filterCount=\{canViewApprovalInbox \? 4 : 3\}/u
  )
  assert.match(
    listSkeletonSource,
    /normalizedFilterCount = filterCount === 4 \? 4 : 3/u
  )
  assert.doesNotMatch(listScreenSource, /当前岗位的审批事项/u)
  assert.doesNotMatch(roleTaskPageSource, /isMobileTaskMine/u)
  assert.doesNotMatch(roleTaskPageSource, /label: '我负责'/u)
  assert.doesNotMatch(filterKeySource, /\bMINE:\s*'mine'/u)
  assert.equal(
    (listScreenSource.match(/MOBILE_MAIN_TAB_ITEMS/u) || []).length > 0,
    true
  )
  assert.doesNotMatch(
    listScreenSource,
    /MOBILE_MAIN_TAB_KEYS\.APPROVAL/u,
    '审批不能扩成第五个移动端底部导航'
  )
})

test('mobile task processing explains business boundaries before submit without repeating developer copy in the receipt', () => {
  assert.match(
    actionScreenSource,
    /这里仅提交本次办理说明；任务附件统一在详情页查看或管理。库存、质检、出货、开票和收付款仍需在对应单据中办理/u
  )
  assert.doesNotMatch(
    receiptScreenSource,
    /结果边界|流程锚点|未来分支|领域单据|业务事实|审计记录/u
  )
})

test('mobile task detail keeps canonical completion feedback visible after reload', () => {
  assert.match(detailScreenSource, /resolveMobileTaskCompletionFeedback/u)
  assert.match(detailScreenSource, />\s*完成反馈\s*</u)
  assert.match(detailScreenSource, /whitespace-pre-wrap/u)
})

test('mobile task detail loads formal process position and marks display-only tasks', () => {
  assert.match(detailScreenSource, /getWorkflowTaskProcessContext/u)
  assert.match(detailScreenSource, /mobile-task-process-context/u)
  assert.match(detailScreenSource, />\s*业务轨迹\s*</u)
  assert.match(detailScreenSource, /业务流程/u)
  assert.match(detailScreenSource, /流程发起/u)
  assert.match(detailScreenSource, /流程状态/u)
  assert.match(detailScreenSource, /WorkflowProcessStageTrack/u)
  assert.match(processStageSource, /data-testid="workflow-process-stage"/u)
  assert.match(processStageSource, /aria-current=\{item\.current \? 'step'/u)
  assert.match(processStageSource, /data-linked-task=/u)
  assert.match(detailScreenSource, /模拟展示数据/u)
  assert.match(detailScreenSource, /不计入流程闭环证据/u)
})

test('mobile task detail loads current-task records for every task and keeps the reading order', () => {
  assert.match(detailScreenSource, /listWorkflowTaskEvents\(selectedTask\.id/u)
  assert.match(detailScreenSource, /WorkflowTaskEventTrail/u)
  assert.match(taskEventTrailSource, /本任务处理记录/u)
  assert.match(taskEventTrailSource, /只代表当前任务/u)
  assert.match(taskEventTrailSource, /不是来源单据的完整审批链/u)
  assert.doesNotMatch(
    detailScreenSource,
    /!selectedTask\?\.id \|\| !approvalTask/u
  )
  assert.doesNotMatch(detailScreenSource, /mobile-approval-trajectory/u)

  const keyInformationIndex = detailScreenSource.indexOf('任务关键信息')
  const businessTrajectoryIndex = detailScreenSource.indexOf('>业务轨迹</h2>')
  const taskEventTrailIndex = detailScreenSource.indexOf(
    '<WorkflowTaskEventTrail'
  )
  const relatedSourceIndex = detailScreenSource.indexOf('关联来源（')
  assert.ok(keyInformationIndex >= 0)
  assert.ok(businessTrajectoryIndex > keyInformationIndex)
  assert.ok(taskEventTrailIndex > businessTrajectoryIndex)
  assert.ok(relatedSourceIndex > taskEventTrailIndex)
})

test('mobile task detail separates real attachments from historical text references', () => {
  assert.match(detailScreenSource, />\s*任务附件\s*</u)
  assert.match(detailScreenSource, />\s*历史处理线索\s*</u)
  assert.match(
    detailScreenSource,
    /data-testid="mobile-role-historical-evidence"/u
  )
  assert.match(detailScreenSource, /查看与补充附件/u)
  assert.match(detailScreenSource, /查看任务附件/u)
  assert.match(detailScreenSource, /canUpload=\{canManageAttachments\}/u)
  assert.doesNotMatch(detailScreenSource, /当前任务尚无可显示的处理证据/u)
  assert.match(
    roleTaskPageSource,
    /selectedCanOperate &&[\s\S]*hasActionPermission\(adminProfile, 'workflow\.task\.update'\)/u
  )
})

test('mobile task receipt has explicit outcomes without fabricated actor or timestamp', () => {
  assert.match(
    receiptScreenSource,
    /CONFIRMED:\s*'confirmed'[\s\S]*FAILED:\s*'failed'[\s\S]*UNKNOWN:\s*'unknown'/u
  )
  assert.match(receiptScreenSource, /重新确认结果/u)
  assert.match(receiptScreenSource, /返回列表/u)
  assert.match(receiptScreenSource, /查看任务/u)
  assert.match(receiptScreenSource, /完成反馈/u)
  assert.match(receiptScreenSource, /处理说明/u)
  assert.match(receiptScreenSource, /历史处理线索/u)
  assert.match(receiptScreenSource, /本次确认时的结果/u)
  assert.match(receiptScreenSource, /本次确认状态/u)
  assert.match(receiptScreenSource, /本次返回状态/u)
  assert.match(receiptScreenSource, /正在恢复可重试任务/u)
  assert.match(receiptScreenSource, /重新载入任务/u)
  assert.match(receiptScreenSource, /mobile-task-receipt-handoff/u)
  assert.match(receiptScreenSource, /const hasProcessAnchor = Boolean/u)
  assert.match(
    receiptScreenSource,
    /outcome === MOBILE_TASK_RECEIPT_OUTCOMES\.CONFIRMED &&[\s\S]*?hasProcessAnchor \? \(/u
  )
  assert.match(receiptScreenSource, />当前流程<\/h2>/u)
  assert.match(receiptScreenSource, /正在读取当前流程/u)
  assert.match(receiptScreenSource, /WorkflowProcessStageTrack/u)
  assert.match(receiptScreenSource, /task\?\.process_node_instance_id/u)
  assert.match(receiptScreenSource, /task\?\.version/u)
  assert.doesNotMatch(
    receiptScreenSource,
    /确认后的流程位置|本次办理已确认；这里重新读取|结果边界/u
  )
  assert.doesNotMatch(
    receiptScreenSource,
    /处理人|操作人|处理时间|Date\.now|new Date/u
  )
})

test('mobile task result step only reopens a receipt produced by the current trusted action flow', () => {
  assert.match(actionHookSource, /taskReceiptsByKey/u)
  assert.match(actionHookSource, /publishActionReceipt/u)
  assert.match(
    actionHookSource,
    /const receipt = key \? taskReceiptsByKey\[key\]/u
  )
  assert.ok(
    actionHookSource.includes(
      ['initialReceiptCandidate.scope_key', 'normalizedReceiptScopeKey'].join(
        ' === '
      )
    )
  )
  assert.match(
    actionHookSource,
    /normalized\.scope_key !== normalizedReceiptScopeKey/u
  )
  assert.doesNotMatch(
    actionHookSource,
    /taskStatusKey === 'done'[\s\S]*status: 'confirmed'/u
  )
})

test('mobile task page isolates history drafts and deep restore targets by exact access scope', () => {
  assert.match(
    roleTaskPageSource,
    /const initialHistoryState = canMountCustomerTasks[\s\S]*readMobileRoleTaskScopedHistoryState\([\s\S]*initialHistoryCandidate,[\s\S]*taskScopeKey/u
  )
  assert.match(
    roleTaskPageSource,
    /MOBILE_TASK_HISTORY_LOADED_COUNTS_KEY[\s\S]*readMobileRoleTaskLoadedCounts/u
  )
  assert.match(
    roleTaskPageSource,
    /resolveMobileRoleTaskRestoreLimit\(\{[\s\S]*loadedCounts:\s*historyLoadedTaskCountsRef\.current/u
  )
  assert.match(
    roleTaskPageSource,
    /if \(!isMobileRoleTaskHistoryScope\(historyState, taskScopeKey\)\)/u
  )
})

test('mobile task terminal receipt keeps a scoped read-only detail step', () => {
  assert.match(
    roleTaskPageSource,
    /resolveMobileRoleTaskReceiptDetailTask\(\{[\s\S]*receipt:\s*receiptDetailSnapshot[\s\S]*scopeKey:\s*taskScopeKey/u
  )
  assert.match(
    roleTaskPageSource,
    /const detailTask = selectedTask \|\| receiptDetailTask/u
  )
  assert.match(
    roleTaskPageSource,
    /onViewTask=\{actionReceipt\.task \? handleViewTaskFromReceipt : null\}/u
  )
  assert.match(
    roleTaskPageSource,
    /const receiptSnapshotOnly = Boolean\(receiptDetailTask && !selectedTask\)[\s\S]*selectedCanOperate=\{receiptSnapshotOnly \? false : selectedCanOperate\}/u
  )
})
