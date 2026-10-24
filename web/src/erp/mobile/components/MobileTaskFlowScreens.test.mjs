import assert from 'node:assert/strict'

import test from 'node:test'
import { act, createElement } from 'react'
import { registerJSXTestLoader, installTestDOM } from '../../../../scripts/test/reactRuntime.mjs'
import { readContractSource as readFileSync } from '../../../../scripts/test/publicContractSource.mjs'

const actionScreenSource = readFileSync(
  new URL('./MobileTaskActionScreen.jsx', import.meta.url),
  'utf8'
)

test('mobile detail always exposes three steps and keeps gated receipt navigation available', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { default: Header }] = await Promise.all([import('react-dom/client'), import('./MobileTaskFlowHeader.jsx')])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  t.after(async () => { await act(async () => root.unmount()); container.remove(); dom.restore() })
  const render = (props) => act(async () => root.render(createElement(Header, props)))
  await render({ currentStep: 'detail', canOpenProcess: true })
  assert.equal(container.querySelectorAll('[data-step-key]').length, 3)
  await render({ currentStep: 'process' })
  assert.equal(container.querySelectorAll('[data-step-key]').length, 3)
  assert.equal(container.querySelector('[data-step-key="result"]').disabled, true)
  await render({ currentStep: 'detail', canOpenReceipt: true, onOpenReceipt: () => {} })
  assert.equal(container.querySelector('[data-step-key="result"]').disabled, false)
})
const attachmentSource = readFileSync(new URL('./MobileTaskAttachments.jsx', import.meta.url), 'utf8')
const detailScreenSource = readFileSync(
  new URL('./MobileTaskDetailScreen.jsx', import.meta.url),
  'utf8'
)
const infoCardSource = readFileSync(
  new URL('../../components/workflow/WorkflowTaskInfoCard.jsx', import.meta.url),
  'utf8'
)
const handlingChainSource = readFileSync(new URL('../../components/workflow/WorkflowTaskHandlingChain.jsx', import.meta.url), 'utf8')
const listScreenSource = readFileSync(
  new URL('./MobileTaskListScreen.jsx', import.meta.url),
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
const draftHistorySource = readFileSync(new URL('../hooks/useMobileTaskDraftHistory.js', import.meta.url), 'utf8')
const taskHistorySource = readFileSync(new URL('../utils/mobileTaskHistory.mjs', import.meta.url), 'utf8')
const taskListViewSource = readFileSync(new URL('../utils/mobileRoleTaskListView.mjs', import.meta.url), 'utf8')

test('mobile task flow keeps document workspaces outside its detail, action and receipt entries', () => {
  const routerSource = readFileSync(new URL('../../router.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(roleTaskPageSource, /onOpenBusiness=|mobileTaskBusinessPath|workflowTaskEntryNavigation/u)
  assert.doesNotMatch(routerSource, /path="tasks\/:taskID\/handle"/u)
  assert.match(routerSource, /path="help-center" element=\{<HelpCenterPage \/>\}/u)
})

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
  assert.match(actionScreenSource, />\s*本次可执行操作\s*</u)
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
  assert.match(actionScreenSource, /未确认前不能提交/u)
  assert.match(actionScreenSource, /processDecisionRequired \? 255 : 500/u)
  assert.match(taskHistorySource, /mobileRoleTasksApprovedQuantity/u)
  assert.match(
    roleTaskPageSource,
    /approvedQuantity:\s*detailApprovedQuantityValue/u
  )
  assert.match(roleTaskPageSource, /useMobileTaskDraftHistory/u)
  assert.match(draftHistorySource, /persistMobileTaskDraftBackup/u)
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
  for (const label of ['任务信息', '任务办理', '结果回执']) {
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
    /\.mobile-task-flow-step\s*\{[\s\S]*?min-height:\s*44px;/u
  )
  assert.doesNotMatch(flowHeaderSource, /mobile-task-flow-step__subtitle/u)
  assert.doesNotMatch(flowHeaderSource, /subtitle:/u)
  assert.match(detailScreenSource, /data-testid="mobile-task-detail-screen"/u)
  assert.match(
    detailScreenSource,
    /selectedCanUrge && !selectedCanOperate[\s\S]*?\? '催办任务'[\s\S]*?: '选择处理方式'/u
  )
  assert.doesNotMatch(
    detailScreenSource,
    />\s*发起催办\s*</u,
    '催办必须先进入独立处理步骤填写原因，不能在详情中伪装成直接提交'
  )
})

test('mobile task overview, list heading and loaded counts stay concise', () => {
  assert.doesNotMatch(
    listScreenSource,
    /renderLoadedTaskOverview|mobile-role-total-count|当前岗位任务状态/u
  )
  assert.match(listScreenSource, /data-testid="mobile-task-list-range"/u)
  assert.match(listScreenSource, /搜索订单、产品、物料或款号/u)
  const donePanelSource = listScreenSource.slice(
    listScreenSource.indexOf('const renderDonePanel'),
    listScreenSource.indexOf('const renderRiskFilters')
  )
  assert.ok(donePanelSource)
  assert.doesNotMatch(donePanelSource, /renderLoadedTaskOverview/u)
  assert.match(donePanelSource, /data-testid="mobile-role-done-count"/u)
  assert.match(
    listScreenSource,
    /count=\{countAvailable \? item\.count : '—'\}/u
  )
  assert.match(listScreenSource, /countAvailable \? `共 \$\{item\.count\} 条`/u)
  assert.match(listScreenSource, /'数量暂不可用'/u)
  const riskFiltersSource = listScreenSource.slice(
    listScreenSource.indexOf('const renderRiskFilters'),
    listScreenSource.indexOf('const renderWarningMessages')
  )
  assert.match(riskFiltersSource, /count=\{countAvailable \? item\.count : '—'\}/u)
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
  assert.match(roleTaskPageSource, /countSummary: activeTaskSlot\.count_summary/u)
  assert.doesNotMatch(
    taskListViewSource,
    /count:\s*(?:activeTasks|approvalTasks|riskTasks|overdueTasks)\.length/u
  )
  assert.match(
    taskListViewSource,
    /canViewApprovalInbox[\s\S]*MOBILE_TASK_FILTER_KEYS\.APPROVAL[\s\S]*label: '审批'[\s\S]*ariaLabel: isAdminReview \? '待审批' : '待我审批'/u
  )
  assert.match(roleTaskPageSource, /isAdminReview: adminProfile\?\.is_super_admin === true/u)
  assert.match(
    listScreenSource,
    /data-testid=\{`mobile-role-filter-\$\{item\.key\}`\}/u
  )
  assert.match(listScreenSource, /item\.ariaLabel \|\| item\.label/u)
  assert.doesNotMatch(
    listScreenSource,
    /!initialLoading && renderTaskFilters\(\)/u,
    '首屏加载时保留真实筛选栏，权限仍由 filterItems 决定'
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
  assert.match(actionScreenSource, /getWorkflowTaskActionOutcomeHint/u)
  assert.match(actionScreenSource, /actionMode: effectiveAction/u)
  assert.doesNotMatch(
    receiptScreenSource,
    /结果边界|流程锚点|未来分支|领域单据|业务事实|审计记录/u
  )
})

test('mobile detail shares current responsibility and keeps feedback in the receipt', () => {
  assert.match(detailScreenSource, /WorkflowTaskCurrentSummary/u)
  assert.match(detailScreenSource, /roleLabel=\{ownerRoleLabel\}/u)
  assert.match(detailScreenSource, /assigneeLabel=\{assigneeLabel\}/u)
  assert.match(detailScreenSource, /getWorkflowTaskExceptionContactPresentation/u)
  assert.match(detailScreenSource, /reason=\{isTaskRisk\(selectedTask\) \? taskReason : ''\}/u)
  assert.match(detailScreenSource, /contact=\{exceptionContact\}/u)
  assert.doesNotMatch(detailScreenSource, /resolveMobileTaskCompletionFeedback/u)
  assert.doesNotMatch(detailScreenSource, />\s*完成反馈\s*</u)
  assert.match(detailScreenSource, /WorkflowTaskInfoCard/u)
  assert.match(infoCardSource, /aria-label="业务信息"/u)
  assert.match(infoCardSource, /\{businessInfo\}/u)
})

test('mobile task detail loads formal process position without QA-only banners', () => {
  assert.doesNotMatch(actionScreenSource, /WorkflowTaskIdentity/u)
  assert.match(detailScreenSource, /getWorkflowTaskProcessContext/u)
  assert.match(handlingChainSource, /mobile-task-process-context/u)
  assert.match(handlingChainSource, /本任务处理进度/u)
  assert.match(handlingChainSource, /查看订单全流程/u)
  assert.match(handlingChainSource, /业务流程/u)
  assert.match(handlingChainSource, /formatProcessStartedAt/u)
  assert.match(handlingChainSource, /流程状态/u)
  assert.match(detailScreenSource, /WorkflowTaskHandlingChain/u)
  assert.match(processStageSource, /data-testid="workflow-process-stage"/u)
  assert.match(processStageSource, /aria-current=\{item\.current \? 'step'/u)
  assert.match(processStageSource, /data-linked-task=/u)
  assert.doesNotMatch(detailScreenSource, /模拟任务|不计入业务流程/u)
  assert.doesNotMatch(detailScreenSource, /<dt[^>]*>来源单据<\/dt>/u)
})

test('mobile task detail loads current-task records for every task and keeps the reading order', () => {
  assert.match(detailScreenSource, /listWorkflowTaskEvents\(selectedTask\.id/u)
  assert.match(detailScreenSource, /WorkflowTaskEventTrail/u)
  assert.match(detailScreenSource, /showResponsibility=\{false\}/u)
  assert.match(taskEventTrailSource, /本任务处理记录/u)
  assert.match(taskEventTrailSource, /workflow-task-event-trail__actor-name/u)
  assert.match(taskEventTrailSource, /workflow-task-event-trail__actor-role/u)
  assert.match(taskEventTrailSource, /workflow-task-event-trail__meta-time/u)
  assert.doesNotMatch(taskEventTrailSource, /完整审批链/u)
  assert.match(detailScreenSource, /taskEventsTruncated/u)
  assert.match(detailScreenSource, /truncated=\{taskEventsTruncated\}/u)
  assert.match(taskEventTrailSource, /更早记录未加载/u)
  assert.doesNotMatch(
    detailScreenSource,
    /!selectedTask\?\.id \|\| !approvalTask/u
  )
  assert.doesNotMatch(detailScreenSource, /mobile-approval-trajectory/u)

  const keyInformationIndex = detailScreenSource.indexOf('<WorkflowTaskInfoCard')
  const businessTrajectoryIndex = detailScreenSource.indexOf('<WorkflowTaskHandlingChain')
  const taskEventTrailIndex = detailScreenSource.indexOf(
    '<WorkflowTaskEventTrail'
  )
  const relatedSourceIndex = detailScreenSource.indexOf('相关单据（')
  assert.ok(keyInformationIndex >= 0)
  assert.ok(businessTrajectoryIndex > keyInformationIndex)
  assert.ok(taskEventTrailIndex > businessTrajectoryIndex)
  assert.ok(relatedSourceIndex > taskEventTrailIndex)
})

test('mobile task detail separates real attachments from historical text references', () => {
  assert.match(
    attachmentSource,
    /'data-testid': 'mobile-task-attachment-action'/u
  )
  assert.match(detailScreenSource, />\s*历史处理线索\s*</u)
  assert.match(
    detailScreenSource,
    /data-testid="mobile-role-historical-evidence"/u
  )
  assert.match(attachmentSource, /buttonText="查看附件"/u)
  assert.match(attachmentSource, /panelTitle="附件内容"/u)
  assert.match(attachmentSource, /showAttachmentCount/u)
  assert.match(attachmentSource, /canUpload=\{canManage\}/u)
  assert.doesNotMatch(detailScreenSource, /PaperClipOutlined/u)
  assert.doesNotMatch(detailScreenSource, /查看与补充附件|查看任务附件/u)
  assert.doesNotMatch(detailScreenSource, /附件只记录任务办理情况/u)
  assert.doesNotMatch(detailScreenSource, /不会改变库存/u)
  assert.doesNotMatch(detailScreenSource, /当前任务尚无可显示的处理证据/u)
  assert.ok(
    detailScreenSource.indexOf('{taskAttachments}', detailScreenSource.indexOf('className="mobile-role-action-bar"')) >
      detailScreenSource.indexOf('<WorkflowTaskHandlingChain')
  )
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
  assert.match(receiptScreenSource, /办理说明/u)
  assert.match(receiptScreenSource, /approvalAction \? '审批意见' : '办理说明'/u)
  assert.match(
    receiptScreenSource,
    /isWorkflowApprovalTask\(task\)[\s\S]*candidateActionKey === 'done'[\s\S]*label: '审批通过'/u
  )
  assert.match(receiptScreenSource, /办理说明/u)
  assert.match(receiptScreenSource, /历史处理线索/u)
  assert.match(receiptScreenSource, /confirmed \? taskStatus : `已知状态：\$\{taskStatus\}`/u)
  assert.match(receiptScreenSource, /正在恢复可重试任务/u)
  assert.match(receiptScreenSource, /重新载入任务/u)
  assert.match(receiptScreenSource, /mobile-task-receipt-handoff/u)
  assert.match(receiptScreenSource, /const hasProcessAnchor = Boolean/u)
  assert.match(
    receiptScreenSource,
    /outcome === MOBILE_TASK_RECEIPT_OUTCOMES\.CONFIRMED &&[\s\S]*?hasProcessAnchor \? \(/u
  )
  assert.match(receiptScreenSource, /流程交接结果\s*<\/h2>/u)
  assert.match(receiptScreenSource, /正在读取流程交接结果/u)
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
  assert.doesNotMatch(receiptScreenSource, />\s*当前任务\s*</u)
  assert.doesNotMatch(receiptScreenSource, /aria-label="查看任务"/u)
  assert.doesNotMatch(receiptScreenSource, /RightOutlined/u)
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
