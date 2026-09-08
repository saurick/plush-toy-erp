import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { transformWithEsbuild } from 'vite'

const source = readFileSync(
  fileURLToPath(new URL('./BusinessDashboardPage.jsx', import.meta.url)),
  'utf8'
)

test('business dashboard remains valid JSX', async () => {
  await transformWithEsbuild(source, 'BusinessDashboardPage.jsx', {
    loader: 'jsx',
    jsx: 'automatic',
  })
})

test('business dashboard loads business totals and account-visible collaboration independently', () => {
  assert.match(source, /Promise\.allSettled/u)
  assert.match(
    source,
    /getBusinessDashboardStats\(\{\}, \{ signal: request\.signal \}\)/u
  )
  assert.match(
    source,
    /getWorkflowTaskBoard\([\s\S]*?\{ limit: 1, offset: 0 \},[\s\S]*?\{ signal: request\.signal \}[\s\S]*?\)/u
  )
  assert.match(source, /dashboardResult\.status === 'fulfilled'/u)
  assert.match(source, /workflowResult\.status === 'fulfilled'/u)
  assert.match(
    source,
    /dashboardResult\.status === 'fulfilled'\s*&&\s*workflowResult\.status === 'fulfilled'/u
  )
  assert.doesNotMatch(source, /listWorkflowTasks/u)
  assert.doesNotMatch(source, /buildWorkflowDashboardStats/u)
})

test('business dashboard only applies the latest account-scoped response', () => {
  const loaderStart = source.indexOf(
    'const loadDashboardStats = useCallback(async () =>'
  )
  const loaderEnd = source.indexOf('useEffect(() => {', loaderStart)
  const loaderSource = source.slice(loaderStart, loaderEnd)
  const refreshSetupEnd = loaderSource.indexOf('try {')
  const refreshSetupSource = loaderSource.slice(0, refreshSetupEnd)

  assert.ok(refreshSetupEnd > 0, 'dashboard loader must keep its request body')
  assert.match(
    source,
    /import useLatestRequestCoordinator from ['"]\.\.\/hooks\/useLatestRequestCoordinator\.js['"]/u
  )
  assert.match(
    source,
    /const beginLatestRequest = useLatestRequestCoordinator\(\)/u
  )
  assert.match(
    source,
    /const request = beginLatestRequest\('business-dashboard'\)/u
  )
  assert.match(source, /if \(!adminProfile\?\.id\)/u)
  assert.match(source, /if \(!request\.isCurrent\(\)\) \{\s*return false/u)
  assert.match(
    source,
    /finally \{\s*if \(request\.isCurrent\(\)\) \{\s*setLoading\(false\)\s*request\.finish\(\)/u
  )
  assert.match(
    source,
    /useEffect\(\(\) => \{\s*setModuleStats\(\[\]\)[\s\S]*?setWorkflowLoadError\(false\)\s*\}, \[adminProfile\]\)/u
  )
  assert.doesNotMatch(refreshSetupSource, /setModuleStats\(\[\]\)/u)
  assert.doesNotMatch(source, /mountedRef|loadPromiseRef/u)
})

test('business dashboard prioritizes visible task problems without mixing unrelated object totals', () => {
  assert.doesNotMatch(
    source,
    /buildDashboardSummary|businessMetricCards|erp-business-board-summary-grid/u
  )
  assert.match(source, /BUSINESS_ATTENTION_LANES\.map/u)
  assert.match(source, /definition\.key === 'exception'/u)
  assert.match(source, /definition\.key === 'due'/u)
  assert.match(source, /getWorkflowTaskReasonMeta/u)
  assert.match(source, /每类预览一项/u)
})

test('business dashboard renders unavailable counts distinctly from true zero', () => {
  assert.match(
    source,
    /taskBoardReady \? taskBoard\.counts\[definition\.key\] : null/u
  )
  assert.match(source, /source\.available\s*\?\s*formatCount\(source\.total\)/u)
  assert.match(source, /暂不可用/u)
  assert.match(source, /业务统计暂不可用/u)
  assert.match(source, /待办概览暂不可用/u)
})

test('business dashboard avoids cross-boundary family totals and keeps every source visible', () => {
  assert.match(source, /各项独立统计/u)
  assert.match(source, /moduleRow\.sources\.map/u)
  assert.match(source, /effectiveSessionAllowsPage/u)
  assert.match(source, /allowedMenuPaths\.has\(source\.path\)/u)
  assert.match(source, /rbacAllowsPath\s*&&\s*effectiveSessionAllowsPage/u)
  assert.match(source, /isLocalDev:\s*false/u)
  assert.match(source, /source\.canOpen\s*\?\s*\(/u)
  assert.match(source, />\s*只读\s*</u)
  assert.match(source, /aria-label=\{`查看\$\{source\.label\}`\}/u)
  assert.doesNotMatch(source, /title: '记录合计'/u)
  assert.doesNotMatch(source, /erp-business-board-family-total/u)
  assert.doesNotMatch(source, /buildBusinessModuleQuery/u)
  assert.doesNotMatch(source, /dashboardStatusGroups/u)
})

test('business dashboard makes business data explanations available on demand', () => {
  assert.match(
    source,
    /<details className="erp-business-board-boundary-summary"/u
  )
  assert.match(source, /用于记录业务发起或约定，后续仍需按流程办理/u)
  assert.match(source, /完成任务不会自动产生库存、出货或财务记录/u)
  assert.doesNotMatch(source, />\s*数字说明\s*</u)
  assert.doesNotMatch(source, /业务源单|事实记录|对象族|数据口径|协同概览/u)
  assert.doesNotMatch(source, />\s*状态分布\s*</u)
  assert.doesNotMatch(source, />\s*当前风险\s*</u)
})

test('business dashboard keeps explicit entries and guards task shortcuts with source access', () => {
  assert.match(source, /openDashboardItemOnDoubleClick/u)
  assert.match(source, /erp-business-board-source-item--openable/u)
  assert.match(source, /erp-business-board-alert-item--openable/u)
  assert.match(source, /data-open-on-double-click/u)
  assert.match(
    source,
    /source\.canOpen[\s\S]*?'data-target-path': source\.path/u
  )
  assert.match(
    source,
    /source\.canOpen[\s\S]*?title: `双击进入\$\{source\.label\}`/u
  )
  assert.match(
    source,
    /openDashboardItemOnDoubleClick\(event,\s*\(\) =>[\s\S]*?navigate\(source\.path\)[\s\S]*?\)/u
  )
  assert.match(
    source,
    /useWorkflowTaskActionAccess\(\{[\s\S]*?task,[\s\S]*?enabled: Boolean\(task\)/u
  )
  assert.match(
    source,
    /canOpenWorkflowTaskEntry\(\s*adminProfile,\s*entryPath,\s*access\.sourceAccess/u
  )
  assert.match(
    source,
    /canOpenWorkflowTaskEntry\(\s*taskEntryAdminProfile,\s*entryPath,\s*access\?\.sourceAccess/u
  )
  assert.match(
    source,
    /openDashboardItemOnDoubleClick\(event,\s*\(\) =>[\s\S]*?onOpenEntry\(task, access\)/u
  )
  assert.match(source, /查看记录/u)
  assert.match(source, /aria-label=\{`查看\$\{source\.label\}`\}/u)
})
