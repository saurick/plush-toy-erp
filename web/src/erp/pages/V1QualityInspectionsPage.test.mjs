import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./V1QualityInspectionsPage.jsx', import.meta.url),
  'utf8'
)

test('quality page uses exact purchase return permission and dedicated source command', () => {
  assert.match(source, /'purchase\.return\.create'/u)
  assert.match(source, /'purchase\.return\.read'/u)
  assert.match(source, /createPurchaseReturnFromQualityInspection/u)
  assert.match(source, /isRejectedIncomingInspection/u)
  assert.doesNotMatch(
    source,
    /warehouse\.adjustment\.create|purchase\.order\.update/u
  )
})

test('quality rejection return retries safely and validates the returned source trace', () => {
  const action = source.slice(
    source.indexOf('const submitPurchaseReturn'),
    source.indexOf('const runInspectionAction')
  )
  assert.match(action, /purchaseReturnInFlightRef\.current/u)
  assert.match(action, /purchaseReturnAttemptsRef\.current\.prepare/u)
  assert.match(action, /purchaseReturnAttemptsRef\.current\.settle/u)
  assert.match(action, /quality_inspection_id/u)
  assert.match(action, /created\?\.status/u)
  assert.match(action, /await loadRows\(\)/u)
  assert.match(action, /已保留本次请求，请使用相同内容重试/u)
})

test('incoming quality create submits only source selectors and customer context', () => {
  const createAction = source.slice(
    source.indexOf('const handleCreateInspection'),
    source.indexOf('const markInspectionReturned')
  )
  assert.match(createAction, /customer_key: activeCustomerKey/u)
  assert.match(createAction, /buildInspectionParams\(values\)/u)
  for (const forgedField of [
    'values.inventory_lot_id',
    'values.material_id',
    'values.warehouse_id',
    'values.source_type',
    'values.source_id',
  ]) {
    assert.equal(createAction.includes(forgedField), false)
  }
})

test('quality page mounts the return modal and marks a successful source once', () => {
  assert.match(source, /<QualityInspectionPurchaseReturnModal/u)
  assert.match(source, /markInspectionReturned\(inspection\.id\)/u)
  assert.match(source, /returnedInspectionIDs\.has\(selectedRow\.id\)/u)
  assert.match(source, /已生成退货/u)
})

test('quality page names and filters the shared read model by business inspection type', () => {
  assert.match(source, /title="质量检验"/u)
  assert.match(source, /QUALITY_INSPECTION_TYPE_FILTER_OPTIONS/u)
  assert.match(source, /inspection_type: inspectionTypeFilter/u)
  assert.match(source, /listProducts/u)
  assert.match(source, /productOptions/u)
  assert.match(source, /selectedSourceType === 'PURCHASE_RECEIPT'/u)
  assert.match(source, /source_type: selectedRow\.source_type/u)
  assert.doesNotMatch(source, /title="来料质检"/u)
})
