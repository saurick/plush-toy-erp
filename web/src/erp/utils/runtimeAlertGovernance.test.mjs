import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const repoRoot = path.resolve(import.meta.dirname, '../../../..')

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

function listJSXFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return listJSXFiles(entryPath)
    return entry.isFile() && entry.name.endsWith('.jsx') ? [entryPath] : []
  })
}

function occurrenceCount(source, token) {
  return source.split(token).length - 1
}

test('employee runtime does not expose QA-only evidence banners', () => {
  const employeeSource = listJSXFiles(path.join(repoRoot, 'web/src/erp'))
    .map((filePath) => readFileSync(filePath, 'utf8'))
    .join('\n')

  for (const forbiddenCopy of [
    '模拟展示数据',
    '仅用于界面检查',
    '不计入业务流程',
    '不计入流程闭环证据',
    '系统按任务状态、可用操作和关联入口生成',
  ]) {
    assert.doesNotMatch(employeeSource, new RegExp(forbiddenCopy, 'u'))
  }
})

test('routine task and help guidance use compact content instead of alerts', () => {
  const drawer = read(
    'web/src/erp/components/workflow/WorkflowTaskActionDrawer.jsx'
  )
  const dashboard = read('web/src/erp/pages/DashboardPage.jsx')
  const helpCenter = read('web/src/erp/pages/HelpCenterPage.jsx')
  const pageHelp = read('web/src/erp/components/help/BusinessContextHelp.jsx')
  const taskDisplay = read('web/src/erp/utils/dashboardTaskDisplay.mjs')

  const processingHint = dashboard.slice(
    dashboard.indexOf('function TaskProcessingHint'),
    dashboard.indexOf('\nexport default function DashboardPage')
  )
  assert.doesNotMatch(processingHint, /<Alert|showIcon/u)
  assert.doesNotMatch(helpCenter, /<Alert|showIcon/u)
  assert.match(
    pageHelp,
    /<details className="erp-business-page-help__boundary">/u
  )
  assert.doesNotMatch(pageHelp, /<Alert|showIcon/u)
  assert.doesNotMatch(taskDisplay, /模拟任务批次/u)
  assert(occurrenceCount(drawer, '<Alert') <= 8)
  assert.match(drawer, /message="暂时无法读取业务进度"/u)
  assert.match(drawer, /message="当前只能查看任务"/u)
})

test('high-density business surfaces keep only action-relevant alert volume', () => {
  const production = read(
    'web/src/erp/components/production-orders/ProductionRouteExecutionModal.jsx'
  )
  const permissionCenter = read('web/src/erp/pages/PermissionCenterPage.jsx')
  const shipment = read(
    'web/src/erp/components/shipments/ShipmentBusinessModal.jsx'
  )
  const finance = read('web/src/erp/pages/FinancePaymentsPage.jsx')

  assert(occurrenceCount(production, '<Alert') <= 10)
  assert(occurrenceCount(permissionCenter, '<Alert') <= 15)
  assert(occurrenceCount(shipment, '<Alert') <= 2)
  assert(occurrenceCount(finance, '<Alert') <= 2)

  assert.match(production, /message="未找到发布时明确归属/u)
  assert.match(permissionCenter, /message="有菜单入口已不在当前最终权限中"/u)
  assert.match(shipment, /message="预计总净重暂不可计算"/u)
  assert.match(finance, /message="当前没有可核销的应收或应付记录"/u)
})

test('DEV passive information is compact while warnings and errors stay prominent', () => {
  const densityCSS = read(
    'web/src/dev-workbench/styles/dev-workbench-density.css'
  )
  assert.match(
    densityCSS,
    /\.erp-dev-workspace-page :is\(\.ant-alert-info, \.ant-alert-success\)/u
  )
  assert.match(densityCSS, /\.ant-alert-icon[\s\S]*display: none/u)
  assert.doesNotMatch(
    densityCSS,
    /:is\([^)]*\.ant-alert-warning[^)]*\)[\s\S]{0,120}display: none/u
  )
  assert.doesNotMatch(
    densityCSS,
    /:is\([^)]*\.ant-alert-error[^)]*\)[\s\S]{0,120}display: none/u
  )
})
