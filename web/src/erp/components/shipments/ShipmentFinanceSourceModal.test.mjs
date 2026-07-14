import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./ShipmentFinanceSourceModal.jsx', import.meta.url),
  'utf8'
)

test('shipment finance modal shows source context and only operator-owned fields', () => {
  assert.match(source, /label: '出货单'/u)
  assert.match(source, /label: '客户'/u)
  assert.match(source, /客户与明细由出货单确定，金额由系统核算/u)
  assert.match(source, /name="occurred_at" label="发生时间"/u)
  assert.match(source, /name="note" label="备注"/u)
  assert.equal(source.match(/<Form\.Item/gu)?.length, 2)
})

test('shipment finance modal hides technical and server-owned fields', () => {
  for (const forbiddenCopy of [
    'fact_type',
    'counterparty',
    'amount',
    'currency',
    'source_type',
    'source_id',
    'idempotency_key',
    '内部主键',
  ]) {
    assert.equal(source.includes(`>${forbiddenCopy}<`), false)
    assert.equal(source.includes(`label="${forbiddenCopy}"`), false)
  }
  assert.match(source, /disabled=\{loading\}/u)
  assert.match(source, /destroyOnHidden/u)
  assert.match(source, /form\.resetFields\(\)/u)
})
