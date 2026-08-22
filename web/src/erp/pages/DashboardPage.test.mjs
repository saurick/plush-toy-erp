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
  assert.match(source, /limit:\s*WORKBENCH_QUEUE_PAGE_SIZE/u)
  assert.match(
    source,
    /offset:\s*\(workbenchQueuePage - 1\) \* WORKBENCH_QUEUE_PAGE_SIZE/u
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

test('task board presents approval as a range filter instead of a title action', () => {
  const filtersStart = source.indexOf(
    '<div className="erp-task-board-filters">'
  )
  const scopeFilterStart = source.indexOf(
    'className="erp-task-board-scope-filter"',
    filtersStart
  )
  const searchStart = source.indexOf('<SearchInput', filtersStart)

  assert.ok(filtersStart >= 0)
  assert.ok(scopeFilterStart > filtersStart)
  assert.ok(searchStart > scopeFilterStart)
  assert.match(
    source,
    /<Title level=\{3\} className="erp-command-center-hero-title">\s*任务看板\s*<\/Title>/u
  )
  assert.match(source, /aria-label="任务范围筛选"/u)
  assert.match(
    source,
    /<Segmented[\s\S]{0,220}aria-label="任务范围"[\s\S]{0,220}value=\{filters\.mode\}[\s\S]{0,220}options=\{TASK_BOARD_SCOPE_OPTIONS\}/u
  )
  assert.match(source, /\{ label: '全部任务', value: 'all' \}/u)
  assert.match(source, /\{ label: '待我审批', value: 'approval' \}/u)
  assert.doesNotMatch(source, /返回全部任务/u)
  assert.match(
    taskCenterStyleSource,
    /\.erp-task-board-scope-filter\s*\{[\s\S]{0,180}flex:\s*1 0 100%/u
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
