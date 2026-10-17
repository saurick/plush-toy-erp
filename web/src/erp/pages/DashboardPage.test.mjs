import { createElement } from 'react'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { BUSINESS_ROUTE_PATHS } from '../utils/masterDataOrderView.mjs'
import { createReactTestHarness } from '../../../scripts/test/reactRuntime.mjs'

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

test('product preview renders useful entries and delegates navigation without customer data', async (t) => {
  const view = await createReactTestHarness(t)
  const { ProductCoreDashboard } =
    await import('../components/workflow/WorkflowDashboardViews.jsx')
  const navigations = []
  await view.render(
    createElement(ProductCoreDashboard, {
      onNavigate: (path) => navigations.push(path),
    })
  )
  assert.ok(view.container.textContent.includes('尚未连接客户环境'))
  const entry = [...view.container.querySelectorAll('button')].find((button) =>
    button.textContent.includes('销售订单')
  )
  assert.ok(entry)
  await view.act(async () => entry.click())
  assert.deepEqual(navigations, [BUSINESS_ROUTE_PATHS.salesOrders])
})

test('task lanes expose visible business names and keep technical evidence outside the visible copy', async (t) => {
  const view = await createReactTestHarness(t)
  const { TaskLane } =
    await import('../components/workflow/WorkflowDashboardViews.jsx')
  const task = {
    id: 11,
    version: 1,
    task_status_key: 'ready',
    task_name: '工程资料核对',
    task_code: 'SIM-TASK-11',
    task_group: 'engineering_review',
    owner_role_key: 'engineering',
  }
  const opened = []
  await view.render(
    createElement(TaskLane, {
      lane: {
        key: 'actionable',
        title: '待处理',
        count: 1,
        total: 1,
        tasks: [task],
      },
      onOpenTask: (record) => opened.push(record),
    })
  )
  assert.ok(view.container.textContent.includes('工程资料核对'))
  assert.equal(view.container.textContent.includes('SIM-TASK-11'), false)
  assert.ok(view.container.querySelector('[data-task-code="SIM-TASK-11"]'))
  const entry = [...view.container.querySelectorAll('button')].find((button) =>
    button.textContent.includes('工程资料核对')
  )
  assert.ok(entry)
  await view.act(async () => entry.click())
  assert.deepEqual(opened, [task])
})
