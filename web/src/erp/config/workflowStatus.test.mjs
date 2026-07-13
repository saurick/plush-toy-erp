import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  BUSINESS_STATUS_OPTIONS,
  getBusinessStatusLabel,
} from './workflowStatus.mjs'

const WORKFLOW_METADATA_PATH = new URL(
  '../../../../server/internal/biz/workflow_metadata.go',
  import.meta.url
)

async function readBackendWorkflowBusinessStatusKeys() {
  const source = await readFile(WORKFLOW_METADATA_PATH, 'utf8')
  const block = source.match(
    /var workflowBusinessStates = \[\]WorkflowStateOption\{([\s\S]*?)\n\}/
  )

  assert(block, 'workflowBusinessStates registry not found')
  return [...block[1].matchAll(/\{Key: "([^"]+)"/g)].map((match) => match[1])
}

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

test('workflowStatus: 前端展示 key 与后端业务状态登记表保持一致', async () => {
  const frontendKeys = BUSINESS_STATUS_OPTIONS.map((state) => state.key).sort()
  const backendKeys = (await readBackendWorkflowBusinessStatusKeys()).sort()

  assert.deepEqual(frontendKeys, backendKeys)
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
