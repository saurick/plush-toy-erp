import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const source = readFileSync(
  fileURLToPath(new URL('./WorkflowBusinessModulePage.jsx', import.meta.url)),
  'utf8'
)
const productionExceptionPanel = readFileSync(
  fileURLToPath(
    new URL(
      '../components/production-exceptions/ProductionExceptionDecisionPanel.jsx',
      import.meta.url
    )
  ),
  'utf8'
)

test('workflow business page consumes the dashboard source keyword without mutating business data', () => {
  assert.match(source, /useSearchParams/u)
  assert.match(source, /searchParams\.get\('link_keyword'\)/u)
  assert.match(source, /useState\(linkedKeyword\)/u)
  assert.match(source, /setKeyword\(linkedKeyword\)/u)
  assert.match(source, /formatWorkflowTaskSource/u)
  assert.doesNotMatch(
    source,
    /link_keyword[\s\S]{0,120}(create|update|complete)/u
  )
})

test('workflow business page delegates filters and pagination to list_tasks', () => {
  assert.match(source, /buildWorkflowBusinessTaskQuery/u)
  assert.match(source, /taskGroup:\s*config\.taskGroup/u)
  assert.match(source, /keyword,/u)
  assert.match(source, /status,/u)
  assert.match(source, /ownerRoleKey,/u)
  assert.match(source, /dueFrom:\s*toUnixStartSeconds\(dueFrom\)/u)
  assert.match(source, /dueTo:\s*toUnixSeconds\(dueTo\)/u)
  assert.match(source, /pagination,/u)
  assert.match(source, /setTotal\(page\.total\)/u)
  assert.match(source, /createBusinessTablePagination/u)
  assert.doesNotMatch(source, /limit:\s*200/u)
  assert.doesNotMatch(source, /const filteredTasks/u)
})

test('workflow business page resets page filters and recovers an emptied tail page', () => {
  assert.match(
    source,
    /reconcileWorkflowBusinessTaskPage\([\s\S]*pageState\.shouldRetreat[\s\S]*current:\s*pageState\.current/u
  )
  assert.match(
    source,
    /setKeyword\(event\.target\.value\)[\s\S]{0,120}resetBusinessPaginationCurrent\(setPagination\)/u
  )
  assert.match(
    source,
    /setStatus\(value\)[\s\S]{0,120}resetBusinessPaginationCurrent\(setPagination\)/u
  )
  assert.match(
    source,
    /setOwnerRoleKey\(value\)[\s\S]{0,120}resetBusinessPaginationCurrent\(setPagination\)/u
  )
  assert.match(
    source,
    /setDueFrom\(value\)[\s\S]{0,120}resetBusinessPaginationCurrent\(setPagination\)/u
  )
  assert.match(
    source,
    /setDueTo\(value\)[\s\S]{0,120}resetBusinessPaginationCurrent\(setPagination\)/u
  )
})

test('workflow business pages guard their initial task list with workflow task read', () => {
  assert.match(
    source,
    /hasActionPermission\(\s*adminProfile,\s*'workflow\.task\.read'\s*\)/u
  )
  assert.match(
    source,
    /if \(!config \|\| !canReadWorkflowTasks\) \{[\s\S]*setTasks\(\[\]\)[\s\S]*return false/u
  )
})

test('workflow business module keeps stable task actions while submitting exact process decisions', () => {
  assert.match(source, /SelectionClearAction/u)
  assert.match(source, /shouldShowWorkflowAction\('complete'\)/u)
  assert.match(source, /workflowActionDisabledReason/u)
  assert.match(source, /isWorkflowProcessDecisionTask/u)
  assert.match(source, /process_decision/u)
  assert.match(source, /getWorkflowTaskProcessContext/u)
  assert.match(source, /getWorkflowProcessDecisionApprovalForm/u)
  assert.match(source, /buildWorkflowProcessDecision/u)
  assert.match(source, /requireWorkflowProcessDecisionSubmission/u)
  assert.match(source, /taskReasonProcessDecisionReady/u)
  assert.match(source, /workflowProcessDecisionAllowsApprovedQuantity/u)
  assert.match(source, /系统不会按任务名称或页面入口猜测审批字段/u)
  assert.doesNotMatch(source, /workflowTaskAllowsApprovedQuantity/u)
  assert.doesNotMatch(source, /ProcessRecoveryWorkbench/u)
})

test('production exception decision reads expose only real decision-list permissions', () => {
  for (const permission of [
    'pmc.risk.read',
    'production.fact.read',
    'production.exception.submit',
    'production.exception.approve',
  ]) {
    assert.match(
      productionExceptionPanel,
      new RegExp(`['"]${permission.replaceAll('.', '\\.')}['"]`, 'u')
    )
  }
  assert.doesNotMatch(productionExceptionPanel, /quality\.inspection\.read/u)
  assert.match(
    productionExceptionPanel,
    /if \(!canRead\) \{\s*setRows\(\[\]\)\s*return \[\]\s*\}[\s\S]*listProductionExceptions/u
  )
  assert.match(productionExceptionPanel, /if \(!canRead\) return null/u)
})
