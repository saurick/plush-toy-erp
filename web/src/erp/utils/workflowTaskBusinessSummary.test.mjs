import assert from 'node:assert/strict'
import test from 'node:test'
import { workflowTaskBusinessSummary } from './workflowTaskBusinessSummary.mjs'

test('receipt copies confirmed business state, per-line units and server time without deriving task completion', () => {
  const record = { id: 3,
receipt_no: 'RC-3',
status: 'DRAFT',
updated_at: 1800000000,
    items: [{ material_name_snapshot: '面料', received_quantity: '2.50', unit_name: '米' }, { material_name: '填充棉', required_quantity: '0.125', unit_name: '公斤' }] }
  const summary = workflowTaskBusinessSummary(record, { actorLabel: '仓库 · 王芳' })
  assert.equal(summary.recordNo, 'RC-3')
  assert.equal(summary.actorLabel, '仓库 · 王芳')
  assert.ok(summary.timeLabel)
  assert.deepEqual(summary.fields, [{ label: '业务状态', value: '草稿' }])
  assert.deepEqual(summary.items, [{ label: '面料', quantity: '2.50', unit: '米' }, { label: '填充棉', quantity: '0.125', unit: '公斤' }])
  record.items[0].received_quantity = '900'
  assert.equal(summary.items[0].quantity, '2.50')
  assert.equal(Object.hasOwn(summary, 'task_status_key'), false)
})

test('material and BOM receipts retain their distinct states and missing values stay absent', () => {
  const material = workflowTaskBusinessSummary({ status: 'BOSS_APPROVED', boss_reviewed_at: '2026-10-27T10:00:00+08:00', items: [{ material_name: 'PP 棉', required_quantity: '1.25', unit_name: '公斤' }] })
  assert.equal(material.fields[0].value, '待财务审核')
  assert.ok(material.timeLabel)
  const bom = workflowTaskBusinessSummary({ product_id: 3, version: 'V2', status: 'DRAFT' })
  assert.equal(bom.recordType, 'BOM')
  assert.equal(bom.recordNo, 'V2')
  assert.equal(workflowTaskBusinessSummary({ packaging_version_snapshot: '彩盒 V3', status: 'CONFIRMED' }).fields.find((field) => field.label === '包装版本').value, '彩盒 V3')
  const empty = workflowTaskBusinessSummary({ access_token: 'must never copy', amount: 'NaN', updated_at: 'invalid', payload: { status: 'POSTED' } })
  assert.equal(empty.fields.length, 0)
  assert.equal(empty.timeLabel, '')
  assert.equal(empty.actorLabel, '')
  assert.equal(JSON.stringify(empty).includes('must never copy'), false)
})

test('long receipts bound their rendered rows without hiding the confirmed row count', () => {
  const summary = workflowTaskBusinessSummary({ items: Array.from({ length: 500 }, (_, i) => ({ line_no: i + 1, quantity: '1', unit_name: '个' })) })
  assert.equal(summary.items.length, 20)
  assert.equal(summary.itemCount, 500)
})
