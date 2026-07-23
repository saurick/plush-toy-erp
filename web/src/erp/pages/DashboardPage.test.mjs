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

test('workbench keeps the explicit view button and opens plain rows on double-click', () => {
  assert.match(source, /openDashboardItemOnDoubleClick/u)
  assert.match(source, /erp-workbench-task-row--openable/u)
  assert.match(source, /data-open-on-double-click['"]?:\s*['"]true['"]/u)
  assert.match(
    source,
    /onDoubleClick:\s*\(event\)\s*=>[\s\S]{0,180}openDashboardItemOnDoubleClick\(event,[\s\S]{0,180}openTaskDrawer\(record\)/u
  )
  assert.match(source, />\s*查看\s*</u)
  assert.match(source, /电脑端双击可直接打开详情/u)
})

test('task board keeps selection on click and opens the same detail surface on double-click', () => {
  assert.match(source, /onClick=\{\(\) => onSelectTask\(task\)\}/u)
  assert.match(
    source,
    /onDoubleClick=\{\(event\)\s*=>[\s\S]{0,160}openDashboardItemOnDoubleClick\(event,[\s\S]{0,120}onOpenTask\(task\)/u
  )
  assert.match(source, /title="单击选中，双击查看任务详情"/u)
  assert.match(source, /电脑端可双击任务卡快速查看详情/u)
})

test('task surfaces expose the batch task code only as non-visible evidence metadata', () => {
  assert.equal(source.match(/data-task-code(?:=|['"]:)/gu)?.length, 3)
  assert.equal(source.match(/data-task-group(?:=|['"]:)/gu)?.length, 3)
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
  assert.match(source, /assignmentTargetSnapshot === 'pool'/u)
  assert.match(source, /assignee_id:/u)
  assert.match(source, /assignmentAccessSnapshot\.stale/u)
  assert.match(source, /assignmentAccess=\{assignmentAccess\}/u)
  assert.match(source, /onAssignmentTargetChange=\{setAssignmentTarget\}/u)
  assert.doesNotMatch(collaborationPanelSource, /assignmentAccess=/u)
  assert.doesNotMatch(collaborationPanelSource, /allowedActionModes=.*assign/u)
})
