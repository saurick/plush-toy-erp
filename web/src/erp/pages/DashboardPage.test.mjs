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
const taskCenterStyleSource = readFileSync(
  fileURLToPath(new URL('../styles/app/task-center.css', import.meta.url)),
  'utf8'
)
const themeOverrideStyleSource = readFileSync(
  fileURLToPath(new URL('../styles/app/theme-overrides.css', import.meta.url)),
  'utf8'
)

test('desktop workbench uses its dedicated role-task read projection', () => {
  assert.match(source, /response:\s*await listAllWorkflowWorkbenchRoleTasks\(/u)
  assert.doesNotMatch(source, /<WorkflowTaskOverview/u)
  assert.doesNotMatch(source, /当前可见任务概览/u)
  assert.doesNotMatch(source, /\blistAllWorkflowRoleTasks\b/u)
  assert.doesNotMatch(source, /\blistWorkflowRoleTasks\b/u)
})

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
  assert.match(
    source,
    /<Text strong className="erp-task-board-card-title">[\s\S]{0,100}task\.task_name/u
  )
})

test('task board metrics keep category tones separate from the active filter state', () => {
  assert.match(
    source,
    /`erp-task-center-metric--tone-\$\{tone\}`[\s\S]{0,160}erp-task-center-metric--active/u
  )
  for (const tone of ['actionable', 'exception', 'due', 'finished']) {
    assert.match(source, new RegExp(`tone="${tone}"`, 'u'))
  }
  assert.match(source, /aria-pressed=\{active\}/u)
  assert.match(
    taskCenterStyleSource,
    /\.erp-task-center-metric::before\s*\{[\s\S]{0,240}background:\s*var\(--erp-task-center-metric-accent\)/u
  )
  assert.match(
    taskCenterStyleSource,
    /\.erp-task-center-metric\s*\{[\s\S]{0,160}--erp-task-center-metric-accent:\s*#2d64a7/u
  )
  for (const [tone, lightColor, darkColor] of [
    ['actionable', '#2d64a7', '#71a7e0'],
    ['exception', '#b42318', '#ff9aa3'],
    ['due', '#b86b16', '#f4b55e'],
    ['finished', '#667085', '#94a3b8'],
  ]) {
    if (tone !== 'actionable') {
      assert.match(
        taskCenterStyleSource,
        new RegExp(
          `\\.erp-task-center-metric--tone-${tone}\\s*\\{[^}]*--erp-task-center-metric-accent:\\s*${lightColor}`,
          'u'
        )
      )
    }
    assert.match(
      themeOverrideStyleSource,
      new RegExp(
        `\\.erp-task-center-metric--tone-${tone}\\s*\\{[^}]*--erp-task-center-metric-accent:\\s*${darkColor}`,
        'u'
      )
    )
  }
})

test('related document entry is gated by backend source access and menu projection on every path', () => {
  assert.match(
    source,
    /canOpenWorkflowTaskEntry\(\s*adminProfile,\s*selectedWorkbenchEntryPath,\s*selectedWorkbenchTaskAccess\.sourceAccess/u
  )
  assert.match(
    source,
    /canOpenWorkflowTaskEntry\(\s*adminProfile,\s*taskCenterCurrentEntryPath,\s*taskCenterCurrentTaskAccess\.sourceAccess/u
  )
  assert.match(
    source,
    /canOpenWorkflowTaskEntry\(\s*adminProfile,\s*entryPath,\s*access\?\.sourceAccess/u
  )
  assert.match(source, /canOpenEntry=\{actionDrawerCanOpenEntry\}/u)
  assert.match(source, /if \(access\.urgeOnly\) return '催办'/u)
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
