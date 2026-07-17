import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./ShipmentsPage.jsx', import.meta.url),
  'utf8'
)

test('shipped shipment finance actions require their exact confirm projections', () => {
  assert.match(
    source,
    /canConfirmFinanceFact\(\s*adminProfile,\s*'RECEIVABLE'\s*\)/u
  )
  assert.match(source, /canConfirmFinanceFact\(adminProfile, 'INVOICE'\)/u)
  assert.match(source, /canCreateReceivable \|\| canCreateInvoice/u)
  assert.match(source, /action === 'receivable' \? canCreateReceivable/u)
  assert.match(source, />\s*生成应收\s*</u)
  assert.match(source, />\s*生成开票记录\s*</u)
  assert.match(source, /disabled=\{saving \|\| financeSourceLoading\}/u)
})

test('shipment finance submit uses source-owned APIs without frontend money fields', () => {
  assert.match(
    source,
    /buildShipmentFinanceSourcePayload\(values, selectedRow\)/u
  )
  assert.match(source, /createReceivableFromShipment/u)
  assert.match(source, /createInvoiceFromShipment/u)
  assert.match(source, /customer_key: activeCustomerKey \|\| undefined/u)
  assert.match(source, /sourceBusinessActionNo/u)
  assert.match(source, /result\.status !== 'DRAFT'/u)
  assert.match(source, /result\.fact_type !== config\.factType/u)
  assert.doesNotMatch(source, /postFinanceFact|settleFinanceFact/u)
})

test('shipment finance unknown results retain the request and success refreshes', () => {
  assert.match(source, /createSourceBusinessActionAttemptStore/u)
  assert.match(source, /financeSourceAttemptsRef\.current\.settle/u)
  assert.match(
    source,
    /暂时无法确认是否处理成功，请保持内容不变后重试，避免重复记录/u
  )
  assert.match(source, /setFinanceSourceAction\(null\)[\s\S]*message\.success/u)
  assert.match(
    source,
    /message\.success\(config\.successMessage\)[\s\S]*await loadRows\(\)/u
  )
})

test('shipment page mounts one reusable source finance modal', () => {
  assert.match(source, /<ShipmentFinanceSourceModal/u)
  assert.match(source, /action=\{financeSourceAction\}/u)
  assert.match(source, /shipment=\{selectedRow\}/u)
  assert.match(source, /onSubmit=\{submitShipmentFinanceSource\}/u)
})

test('shipment page exposes exact upstream and downstream record routes', () => {
  assert.match(source, />\s*相关单据\s*<DownOutlined \/>/u)
  assert.match(
    source,
    /businessRecordInventoryRouteFor\(\s*'shipments',\s*selectedRow\.id\s*\)/u
  )
  assert.match(source, /sales_order_id:\s*selectedRow\.sales_order_id/u)
  assert.match(source, /source_type:\s*'SHIPMENT'/u)
  assert.match(source, /source_id:\s*selectedRow\.id/u)
  assert.match(source, /V1_ROUTE_PATHS\.receivables/u)
  assert.match(source, /V1_ROUTE_PATHS\.invoices/u)
})

test('shipment related records are permission-filtered and fail closed without a selection', () => {
  for (const permission of [
    'sales.order.read',
    'warehouse.inventory.read',
    'finance.receivable.read',
    'finance.invoice.read',
  ]) {
    assert.equal(source.includes(`'${permission}'`), true, permission)
  }
  assert.match(source, /if \(!selectedRow\?\.id\) return \[\]/u)
  assert.match(source, /if \(!selectedRow\?\.id\) return/u)
  assert.match(
    source,
    /disabled=\{!selectedRow \|\| relatedMenuItems\.length === 0\}/u
  )
})

test('draft shipment can generate a source-bound finished-goods inspection', () => {
  assert.match(source, /createFinishedGoodsQualityInspectionDraft/u)
  assert.match(source, /listFinishedGoodsQualityInspections/u)
  assert.match(source, /buildShipmentQualityInspectionSources/u)
  assert.match(source, /buildShipmentQualityInspectionPayload/u)
  assert.match(source, /requireMatchingShipmentQualityInspectionDraft/u)
  assert.match(source, /selectedRow\?\.status === 'DRAFT'/u)
  assert.match(source, /canCreateFinishedGoodsQualityInspection/u)
  assert.match(source, />\s*发起出货前检验\s*</u)
  assert.match(source, /<ShipmentQualityInspectionModal/u)
  assert.match(source, /quality_inspection_id: result\.id/u)
})

test('draft shipment explicitly submits a strict source-bound release task', () => {
  assert.match(source, /submitShipmentRelease\(\{ id: selectedRow\.id \}\)/u)
  assert.match(source, /const canSubmitShipmentRelease = canRead && canCreate/u)
  assert.match(source, />\s*提交出货放行\s*</u)
  assert.match(source, /不会确认出货或扣减库存/u)
  assert.match(source, /result\.created/u)
  assert.match(source, /仓库待办已生成/u)
  assert.match(source, /已有放行任务，本次未重复生成/u)
})

test('shipment cancellation distinguishes draft exit from shipped reversal', () => {
  assert.match(
    source,
    /!\['DRAFT', 'SHIPPED'\]\.includes\(selectedRow\.status\)/u
  )
  assert.match(source, /草稿取消不会扣减或恢复库存/u)
  assert.match(source, /如已提交放行，需先完成或退回放行待办/u)
  assert.match(source, /\? '取消出货单'\s*: '撤销已出货'/u)
  assert.match(
    source,
    /hasActionPermission\(adminProfile, 'shipment\.cancel'\)/u
  )
})

test('shipment finished-goods inspection keeps exact lineage and unknown-result replay', () => {
  for (const permission of [
    'shipment.read',
    'quality.inspection.read',
    'quality.inspection.create',
  ]) {
    assert.equal(source.includes(`'${permission}'`), true, permission)
  }
  assert.match(source, /shipment_id: shipment\.id/u)
  assert.match(source, /source_type: 'SHIPMENT'/u)
  assert.match(source, /source_id: selectedRow\.id/u)
  assert.match(source, /V1_ROUTE_PATHS\.qualityInspections/u)
  assert.match(source, /isSourceBusinessActionResultUnknown/u)
  assert.match(source, /error\.isInvalidResponse = true/u)
  assert.match(source, /当前检验单号和送检批次已保留，请原样重试/u)
  assert.doesNotMatch(source, /start_finished_goods_delivery_process/u)
  assert.doesNotMatch(source, /execute_finished_goods_delivery_quality_decide/u)
})
