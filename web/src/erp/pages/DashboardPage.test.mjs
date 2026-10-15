import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const source = readFileSync(
  fileURLToPath(new URL('./DashboardPage.jsx', import.meta.url)),
  'utf8'
)
const collaborationPanelSource = readFileSync(
  fileURLToPath(
    new URL(
      '../components/business-list/CollaborationTaskPanel.jsx',
      import.meta.url
    )
  ),
  'utf8'
)
const desktopTaskActionSource = readFileSync(
  fileURLToPath(
    new URL('../utils/desktopWorkflowTaskAction.mjs', import.meta.url)
  ),
  'utf8'
)
test('product core summary keeps status text outside numeric metric values', () => {
  const metricStart = source.indexOf('const PRODUCT_CORE_METRICS')
  const metricEnd = source.indexOf('const PRODUCT_CORE_REVIEW_ENTRIES')
  const metricSource = source.slice(metricStart, metricEnd)

  assert.ok(metricStart >= 0)
  assert.ok(metricEnd > metricStart)
  assert.match(metricSource, /label: '业务功能',\s*value: 11,/u)
  assert.match(metricSource, /label: '系统设置',\s*value: 4,/u)
  assert.doesNotMatch(metricSource, /value:\s*['"`]/u)
  assert.doesNotMatch(metricSource, /label: '业务数据'|value: '未连接'/u)
  assert.match(source, /<Tag>尚未连接客户环境<\/Tag>/u)
})

test('desktop workbench uses one bounded server projection for counts and the active page', () => {
  assert.match(
    source,
    /const workbenchResult = await getWorkflowWorkbench\(workbenchRequest,/u
  )
  assert.match(source, /queue_key:\s*workbenchQueueKey/u)
  assert.match(source, /limit:\s*workbenchQueuePageSize/u)
  assert.match(
    source,
    /offset:\s*\(workbenchQueuePage - 1\) \* workbenchQueuePageSize/u
  )
  assert.match(source, /counts:\s*workbenchResult\.counts/u)
  assert.doesNotMatch(source, /<WorkflowTaskOverview/u)
  assert.doesNotMatch(source, /当前可见任务概览/u)
  assert.doesNotMatch(source, /listAllWorkflowWorkbenchRoleTasks/u)
  assert.doesNotMatch(source, /\blistAllWorkflowRoleTasks\b/u)
  assert.doesNotMatch(source, /\blistWorkflowRoleTasks\b/u)
})

test('desktop workbench renders its page shell before the bounded task read finishes', () => {
  assert.match(
    source,
    /className="erp-dashboard-card erp-workbench-command-card"\s*variant="borderless"\s*>/u
  )
  assert.doesNotMatch(
    source,
    /erp-workbench-command-card"[\s\S]{0,120}loading=\{loading\}/u
  )
  assert.match(source, /aria-busy=\{loading\}/u)
  assert.match(source, /loading=\{\{ spinning: loading, delay: 120 \}\}/u)
  assert.match(source, /message="工作台任务加载失败"/u)
  assert.match(source, />\s*重新加载\s*</u)
})

test('workbench pagination keeps settled rows mounted while the next page loads', () => {
  assert.match(
    source,
    /current\?\.scopeKey === requestWorkbenchScopeKey\s*&&\s*current\?\.response\?\.queue_key === workbenchRequest\.queue_key\s*\? current\.response\s*:\s*null/u
  )
})

test('workbench opens task details directly without a permanent selection', () => {
  assert.doesNotMatch(
    source,
    /selectedWorkbench|erp-workbench-side-stack|aria-selected/u
  )
  assert.match(source, /onClick: \(event\) =>/u)
  assert.match(
    source,
    /<TaskTitleEntry task=\{record\} onOpenTask=\{openTaskDrawer\}/u
  )
  assert.doesNotMatch(source, /title: '操作'/u)
  assert.doesNotMatch(source, /onDoubleClick|openDashboardItemOnDoubleClick/u)
})

test('task board exposes server sorting only after focusing one lane', () => {
  assert.match(source, /TASK_BOARD_SORT_OPTIONS/u)
  assert.match(
    source,
    /taskBoardModel\.focused\s*\?\s*\([\s\S]{0,260}aria-label="任务排序"[\s\S]{0,260}updateFilter\('sort', value\)/u
  )
  assert.match(
    source,
    /const selectTaskBoardLane = \(lane\) => \{[\s\S]{0,180}sort: 'smart'/u
  )
})

test('related document entry is gated by backend source access and menu projection on every path', () => {
  assert.doesNotMatch(source, /selectedWorkbench|erp-workbench-side-stack/u)
  assert.match(
    source,
    /canOpenWorkflowTaskEntry\(\s*adminProfile,\s*actionDrawerEntryPath,\s*actionDrawerAccess\.sourceAccess/u
  )
  assert.match(
    source,
    /canOpenWorkflowTaskEntry\(\s*adminProfile,\s*entryPath,\s*access\?\.sourceAccess/u
  )
  assert.match(source, /canOpenEntry=\{actionDrawerCanOpenEntry\}/u)
})

test('task surfaces expose the batch task code only as non-visible evidence metadata', () => {
  assert.equal(source.match(/data-task-code(?:=|['"]:)/gu)?.length, 4)
  assert.equal(source.match(/data-task-group(?:=|['"]:)/gu)?.length, 4)
  assert.match(source, /data-task-code=\{task\.task_code \|\| undefined\}/u)
  assert.match(
    source,
    /['"]data-task-code['"]:\s*record\.task_code \|\| undefined/u
  )
  assert.match(source, /data-testid="dashboard-workflow-task-evidence"/u)
  assert.match(
    source,
    /data-task-terminal=\{String\(isTerminalWorkflowTask\(task\)\)\}/u
  )
  assert.doesNotMatch(source, />\s*\{task\.task_code\}\s*</u)
})

test('task board alone injects the controlled assignment action into the shared drawer', () => {
  assert.match(source, /useWorkflowTaskAssignmentAccess/u)
  assert.match(source, /assignmentAccess\.can_reassign/u)
  assert.match(source, /\[\.\.\.actionDrawerAccess\.allowedModes, 'assign'\]/u)
  assert.match(source, /reassignWorkflowTask/u)
  assert.match(desktopTaskActionSource, /assignmentTarget === 'pool'/u)
  assert.match(source, /assignmentTarget:\s*assignmentTargetSnapshot/u)
  assert.match(desktopTaskActionSource, /assignee_id:/u)
  assert.match(source, /assignmentAccessSnapshot\.stale/u)
  assert.match(source, /assignmentAccess=\{assignmentAccess\}/u)
  assert.match(source, /onAssignmentTargetChange=\{setAssignmentTarget\}/u)
  assert.doesNotMatch(collaborationPanelSource, /assignmentAccess=/u)
  assert.doesNotMatch(collaborationPanelSource, /allowedActionModes=.*assign/u)
})

test('desktop task board preserves the drawer decision and refuses to invent approval payloads', () => {
  assert.match(
    source,
    /submitTaskAction = async \(\{ processDecision = null \} = \{\}\)/u
  )
  assert.match(source, /buildDesktopWorkflowTaskActionParams/u)
  assert.match(source, /processDecision,/u)
  assert.match(source, /审批表单与当前流程节点不一致/u)
  assert.doesNotMatch(source, /process_decision:/u)
})

test('desktop task board preserves the canonical mutation result as the shared drawer receipt', () => {
  assert.match(
    source,
    /const \[actionReceipt, setActionReceipt\] = useState\(null\)/u
  )
  assert.match(
    source,
    /const confirmedTask = await mutationAttemptsRef\.current\.run/u
  )
  assert.match(
    source,
    /setSelectedTask\(\s*retainWorkflowTaskIdentity\(taskSnapshot, confirmedTask\)\s*\)/u
  )
  assert.match(source, /setActionReceipt\(\{/u)
  assert.match(source, /successMessage: actionMetaSnapshot\.successMessage/u)
  assert.match(source, /actionReceipt=\{actionReceipt\}/u)
  const confirmedMutationStart = source.indexOf(
    'const confirmedTask = await mutationAttemptsRef.current.run'
  )
  const successMessageIndex = source.indexOf(
    'message.success(actionMetaSnapshot.successMessage)',
    confirmedMutationStart
  )
  assert.ok(confirmedMutationStart >= 0)
  assert.ok(successMessageIndex > confirmedMutationStart)
  assert.doesNotMatch(
    source,
    /closeSubmittedTaskDrawer\(\)\s*message\.success\(actionMetaSnapshot\.successMessage\)/u
  )
})

test('embedded collaboration drawers preserve the canonical task while the result receipt is open', () => {
  assert.match(collaborationPanelSource, /actionDrawerReceipt/u)
  assert.match(
    collaborationPanelSource,
    /if \(!actionDrawerTask \|\| actionDrawerSaving \|\| actionDrawerReceipt\) return/u
  )
  assert.match(
    collaborationPanelSource,
    /const confirmedTask = await actionHandler/u
  )
  assert.match(
    collaborationPanelSource,
    /setActionDrawerTask\(confirmedTask\)/u
  )
  assert.match(collaborationPanelSource, /setActionDrawerReceipt\(\{/u)
  assert.match(
    collaborationPanelSource,
    /actionReceipt=\{actionDrawerReceipt\}/u
  )
})
