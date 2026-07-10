import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BUSINESS_STATUS_OPTIONS,
  getBusinessStatusLabel,
} from './workflowStatus.mjs'

test('workflowStatus: 业务状态展示项 key 唯一且覆盖看板关键状态', () => {
  const keys = BUSINESS_STATUS_OPTIONS.map((state) => state.key)

  assert.equal(new Set(keys).size, keys.length)
  for (const key of [
    'project_pending',
    'material_preparing',
    'production_processing',
    'shipment_pending',
    'shipping_released',
    'shipped',
    'reconciling',
    'blocked',
    'closed',
  ]) {
    assert(keys.includes(key), `missing business status display option: ${key}`)
  }
})

test('workflowStatus: 业务状态展示文案不透出内部 key', () => {
  assert.equal(getBusinessStatusLabel('shipping_released'), '已放行待出库')
  assert.equal(
    getBusinessStatusLabel('unknown_business_status_key'),
    '未知业务状态'
  )
  assert.equal(getBusinessStatusLabel('', '-'), '-')
})

test('workflowStatus: 协同状态文案不冒充库存出货和财务事实', () => {
  assert.equal(getBusinessStatusLabel('inbound_done'), '入库协同已完成')
  assert.equal(getBusinessStatusLabel('shipped'), '出货协同已完成')
  assert.equal(getBusinessStatusLabel('settled'), '结算协同已完成')
})
