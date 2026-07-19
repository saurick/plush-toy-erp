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
const flowHeaderSource = readFileSync(
  new URL('./MobileTaskFlowHeader.jsx', import.meta.url),
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
    /if \(action === 'done'\) return '完成反馈'/u
  )
  assert.match(actionScreenSource, /actionChoiceRef\.current\?\.focus\(\)/u)
  assert.match(actionScreenSource, /reasonRef\.current\?\.focus\(\)/u)
  assert.doesNotMatch(actionScreenSource, /现场证据|onEvidenceChange/u)
  assert.match(
    actionScreenSource,
    /任务附件统一在详情页查看或管理/u
  )
  assert.match(actionScreenSource, /aria-invalid=/u)
  assert.match(actionScreenSource, /noValidate/u)
  assert.match(actionScreenSource, /min-h-\[48px\]/u)
  assert.match(actionScreenSource, /const \{ visualViewport \} = window/u)
  assert.match(actionScreenSource, /screen\.requestSubmit\(\)/u)
  assert.match(actionScreenSource, /event\.key === 'Escape'/u)
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

test('mobile task flow keeps Workflow and business Fact semantics separate', () => {
  assert.match(
    actionScreenSource,
    /这里仅提交本次办理说明；任务附件统一在详情页查看或管理。库存、质检、出货、开票和收付款仍需在对应单据中办理/u
  )
  assert.match(
    receiptScreenSource,
    /本页只展示这条任务的办理结果；库存、质检、出货、开票和收付款仍以对应单据的办理结果为准/u
  )
})

test('mobile task detail keeps canonical completion feedback visible after reload', () => {
  assert.match(detailScreenSource, /resolveMobileTaskCompletionFeedback/u)
  assert.match(detailScreenSource, />\s*完成反馈\s*</u)
  assert.match(detailScreenSource, /whitespace-pre-wrap/u)
})

test('mobile task detail separates real attachments from historical text references', () => {
  assert.match(detailScreenSource, />\s*任务附件\s*</u)
  assert.match(detailScreenSource, />\s*历史处理线索\s*</u)
  assert.match(detailScreenSource, /data-testid="mobile-role-historical-evidence"/u)
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
