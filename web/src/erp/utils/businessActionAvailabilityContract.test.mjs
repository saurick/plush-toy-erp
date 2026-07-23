import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const readSource = (path) => readFileSync(resolve(__dirname, path), 'utf8')

const sources = {
  sales: readSource('../pages/V1SalesOrdersPage.jsx'),
  purchasePanel: readSource(
    '../components/purchase-orders/PurchaseOrderOperationPanel.jsx'
  ),
  outsourcing: readSource('../pages/V1OutsourcingOrdersPage.jsx'),
  shipments: readSource('../pages/ShipmentsPage.jsx'),
  receipts: readSource('../pages/V1PurchaseReceiptsPage.jsx'),
  quality: readSource('../pages/V1QualityInspectionsPage.jsx'),
  bom: readSource('../pages/BOMVersionsPage.jsx'),
  salesReturns: readSource('../pages/SalesReturnsPage.jsx'),
  production: readSource('../pages/V1ProductionOrdersPage.jsx'),
  facts: readSource('../pages/OperationalFactsPage.jsx'),
  workflow: readSource(
    '../components/workflow/WorkflowTaskActionDrawer.jsx'
  ),
}

test('核心业务动作条统一使用临时不可用原因提示', () => {
  for (const [name, source] of Object.entries(sources)) {
    if (name === 'workflow') continue
    assert.match(source, /BusinessActionTooltip/u, name)
  }
})

test('无权限动作由权限投影隐藏，不作为永久灰色按钮展示', () => {
  assert.match(sources.sales, /\{canUpdateOrder\s*&&/u)
  assert.match(sources.sales, /\{canCreateReservation\s*&&/u)
  assert.match(sources.purchasePanel, /canCreate\s*\?\s*\(/u)
  assert.match(sources.purchasePanel, /\{canUpdate\s*&&/u)
  assert.match(sources.purchasePanel, /\{canCreateInboundDraftAction\s*&&/u)
  assert.match(sources.outsourcing, /primaryAction=\{\s*canCreate\s*\?/u)
  assert.match(sources.shipments, /primaryAction=\{\s*canCreate\s*\?/u)
  assert.match(sources.shipments, /\{canShip\s*&&/u)
  assert.match(sources.shipments, /\{canCancel\s*&&/u)
  assert.match(sources.receipts, /\{canCreateReturn\s*&&/u)
  assert.match(sources.receipts, /\{canCreateAdjustment\s*&&/u)
  assert.match(sources.quality, /primaryAction=\{\s*canCreate\s*\?/u)
  assert.match(sources.quality, /\{canUpdate\s*&&/u)
  assert.match(sources.bom, /\{canPrint[\s\S]*?\.map\(/u)
  assert.match(sources.salesReturns, /\{canApprove\s*&&/u)
  assert.match(sources.production, /\{canUpdate\s*&&/u)
  assert.match(sources.facts, /canPostActive\s*&&/u)
  assert.match(sources.facts, /canCancelActive\s*&&/u)
})

test('没有次级动作时不显示空的更多操作入口', () => {
  for (const source of [
    sources.sales,
    sources.purchasePanel,
    sources.outsourcing,
  ]) {
    assert.match(source, /\{secondaryLifecycleActions\.length > 0 \? \(/u)
    assert.doesNotMatch(source, /secondaryLifecycleActions\.length === 0/u)
  }
})

test('任务抽屉只展示服务端投影允许的处理方式', () => {
  assert.match(
    sources.workflow,
    /visibleActionModes = allowedActionModes\.filter/u
  )
  assert.match(
    sources.workflow,
    /const canChooseActions = allowedActionModes\.length > 0/u
  )
  assert.match(
    sources.workflow,
    /\{activeStepKey === 'context' && canChooseActions \? \(/u
  )
})
