import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync(
  new URL('./V1ProductionOrdersPage.jsx', import.meta.url),
  'utf8'
)
const form = readFileSync(
  new URL(
    '../components/production-orders/ProductionOrderFormModal.jsx',
    import.meta.url
  ),
  'utf8'
)
const router = readFileSync(new URL('../router.jsx', import.meta.url), 'utf8')

test('production order page is an independent Source Document route', () => {
  assert.match(router, /path="production\/orders"/u)
  assert.match(router, /V1ProductionOrdersPage/u)
  assert.match(page, /生产计划源单/u)
  assert.doesNotMatch(
    page,
    /createProductionFact|postProductionFact|WorkflowTask/u
  )
})

test('production order page hides technical identity and uses readable remote references', () => {
  assert.match(form, /ProductionOrderReferenceSelect/u)
  assert.match(form, /sales_order_item/u)
  assert.match(form, /active_bom/u)
  for (const forbiddenCopy of [
    'product_id',
    'product_sku_id',
    'unit_id',
    'sales_order_item_id',
    'bom_header_id',
    'expected_version',
    'idempotency_key',
  ]) {
    assert.equal(page.includes(`>${forbiddenCopy}<`), false)
    assert.equal(form.includes(`>${forbiddenCopy}<`), false)
  }
})

test('production order lifecycle keeps backend authority and separates refresh errors', () => {
  assert.match(page, /生产数量尚未全部完成/u)
  assert.match(page, /已有生效生产记录的订单不能直接取消/u)
  assert.match(page, /isProductionOrderResultUnknown/u)
  assert.match(page, /操作已成功，但列表刷新失败/u)
  assert.match(page, /getActionErrorMessage/u)
})

test('production order forms initialize only after their modal is mounted', () => {
  assert.equal(page.match(/form\.setFieldsValue/gu)?.length, 1)
  assert.equal(page.match(/reasonForm\.resetFields/gu)?.length, 1)
  assert.match(page, /if \(!formMode \|\| !formValues\) return/u)
  assert.match(page, /if \(!reasonAction\) return/u)
})
