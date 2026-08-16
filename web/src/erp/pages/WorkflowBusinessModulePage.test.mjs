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
const businessListToolbarActions = readFileSync(
  fileURLToPath(
    new URL(
      '../components/business-list/BusinessListToolbarActions.jsx',
      import.meta.url
    )
  ),
  'utf8'
)

test('workflow business page consumes the dashboard source keyword without mutating business data', () => {
  assert.match(source, /useSearchParams/u)
  assert.match(source, /searchParams\.get\('link_keyword'\)/u)
  assert.match(source, /useState\(linkedKeyword\)/u)
  assert.match(source, /linkedKeywordRef\s*=\s*useRef\(linkedKeyword\)/u)
  assert.match(
    source,
    /if \(linkedKeywordRef\.current === linkedKeyword\) return/u
  )
  assert.match(source, /setKeyword\(linkedKeyword\)/u)
  assert.match(source, /formatWorkflowTaskSource/u)
  assert.doesNotMatch(
    source,
    /link_keyword[\s\S]{0,120}(create|update|complete)/u
  )
})

test('production exception disposition page separates applications and pending approvals into accessible tabs', () => {
  assert.match(source, /import \{[^}]*Tabs[^}]*\} from 'antd'/u)
  assert.match(source, /label: '处置申请'/u)
  assert.match(source, /label: '待审批'/u)
  assert.match(source, /aria-label="生产异常处置工作区"/u)
  assert.match(
    source,
    /'production-exceptions': \{[\s\S]*ownerRoleOptions: \[workflowRoleOption\('boss'\)\]/u
  )
  assert.match(source, /activeKey=\{effectiveProductionExceptionTab\}/u)
  assert.match(source, /onChange=\{handleProductionExceptionTabChange\}/u)
  assert.match(
    source,
    /<BusinessDataTable[\s\S]*tableHeader=\{[\s\S]*isProductionExceptionPage \? productionExceptionViewTabs : null[\s\S]*\}/u
  )
  assert.match(
    source,
    /<ProductionExceptionDecisionPanel[\s\S]*tableHeader=\{productionExceptionViewTabs\}/u
  )
  assert.match(
    productionExceptionPanel,
    /<Card className="erp-business-data-table-card erp-business-module-table-card">[\s\S]*\{tableHeader\}[\s\S]*<Alert[\s\S]*<Table/u
  )
  assert.match(
    source,
    /showingProductionExceptionDecisions[\s\S]*<BusinessPageLayout className="erp-workflow-business-page__tab-workspace">[\s\S]*\{workflowTaskWorkspace\}[\s\S]*<\/BusinessPageLayout>/u
  )
  assert.match(
    source,
    /linkedProductionExceptionID > 0[\s\S]*PRODUCTION_EXCEPTION_TAB_KEYS\.DECISIONS/u
  )
  assert.match(
    source,
    /linkedKeyword && canReadWorkflowTasks[\s\S]*PRODUCTION_EXCEPTION_TAB_KEYS\.TASKS/u
  )
})

test('ordinary workflow pages keep task language separate from exception approvals', () => {
  assert.match(
    source,
    /showingProductionExceptionDecisions[\s\S]*isProductionExceptionPage[\s\S]*'待审批'[\s\S]*'待办任务'/u
  )
})

test('production exception disposition tabs refresh and summarize only the active workspace', () => {
  assert.match(source, /生产异常处置申请已刷新/u)
  assert.match(source, /productionExceptionRefreshRef\.current/u)
  assert.match(source, /label: '异常记录'/u)
  assert.match(source, /label: '当前显示'/u)
  assert.match(
    source,
    /if \(!isWorkflowTaskWorkspaceActive\) \{[\s\S]*request\.finish\(\)[\s\S]*return false/u
  )
  assert.match(
    source,
    /selectedTask && canReadWorkflowTasks && isWorkflowTaskWorkspaceActive/u
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
  assert.match(source, /workflowActionDisabledReason/u)
  assert.doesNotMatch(source, /shouldShowWorkflowAction/u)
  for (const actionKey of [
    'workflow-task-details',
    'workflow-task-complete',
    'workflow-task-block',
    'workflow-task-reject',
    'workflow-task-resume',
    'workflow-task-urge',
    'workflow-task-attachments',
  ]) {
    assert.match(
      source,
      new RegExp(
        `['"]data-business-action-key['"]?:?\\s*['"]${actionKey}['"]|data-business-action-key="${actionKey}"`,
        'u'
      ),
      `${actionKey} must keep a stable task action slot`
    )
  }
  assert.match(source, /\{canCompleteOrApproveWorkflowTasks \? \(/u)
  assert.match(source, /\{canUpdateWorkflowTasks \? \(/u)
  assert.match(source, /\{canRejectWorkflowTasks \? \(/u)
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
    /if \(!canRead\) \{[\s\S]*setRows\(\[\]\)[\s\S]*return \[\][\s\S]*listProductionExceptions/u
  )
  assert.match(productionExceptionPanel, /if \(!canRead\) return null/u)
  assert.match(
    productionExceptionPanel,
    /listProductionExceptions\([\s\S]*signal: request\.signal/u
  )
  assert.match(productionExceptionPanel, /isRpcAbortError/u)
  assert.match(productionExceptionPanel, /onRefreshReady\?\.\(load\)/u)
})

test('production exception applications use server-backed filters and a selected-record action bar', () => {
  assert.match(productionExceptionPanel, /<BusinessOperationPanel/u)
  assert.match(productionExceptionPanel, /<SelectionActionBar/u)
  assert.match(productionExceptionPanel, /<SelectionClearAction/u)
  assert.match(productionExceptionPanel, /aria-label="异常类型"/u)
  assert.match(productionExceptionPanel, /aria-label="审批状态"/u)
  assert.match(productionExceptionPanel, /aria-label="业务状态"/u)
  assert.match(productionExceptionPanel, /decision_type:\s*decisionTypeFilter/u)
  assert.match(productionExceptionPanel, /status:\s*statusFilter/u)
  assert.match(
    productionExceptionPanel,
    /execution_status:\s*executionStatusFilter/u
  )
  for (const actionLabel of [
    '核对审批流',
    '去任务中心审批',
    '核对并撤回',
    '确认执行',
    '确认冲正',
    '撤销额度',
  ]) {
    assert.match(productionExceptionPanel, new RegExp(actionLabel, 'u'))
  }
  assert.doesNotMatch(productionExceptionPanel, /title:\s*'办理'/u)
  assert.doesNotMatch(productionExceptionPanel, /SearchInput|keyword/u)
})

test('production exception tabs keep column order controls without exposing data export', () => {
  assert.match(businessListToolbarActions, /showExport = true/u)
  assert.match(
    businessListToolbarActions,
    /\{showExport \? \([\s\S]*导出筛选结果[\s\S]*\) : null\}/u
  )
  assert.match(
    productionExceptionPanel,
    /moduleKey:\s*'production-exceptions-decisions'/u
  )
  assert.match(
    productionExceptionPanel,
    /<BusinessListToolbarActions[\s\S]{0,180}showExport=\{false\}[\s\S]{0,180}onOpenColumnOrder=\{openColumnOrder\}/u
  )
  assert.match(productionExceptionPanel, /columns=\{tableColumns\}/u)
  assert.match(productionExceptionPanel, /\{columnOrderModal\}/u)
  assert.match(
    source,
    /<BusinessListToolbarActions[\s\S]{0,180}showExport=\{!isProductionExceptionPage\}[\s\S]{0,240}onOpenColumnOrder=\{openColumnOrder\}/u
  )
  assert.match(
    source,
    /exportDisabledReason="当前页面只用于处理任务，暂不提供业务数据导出。"/u
  )
})
