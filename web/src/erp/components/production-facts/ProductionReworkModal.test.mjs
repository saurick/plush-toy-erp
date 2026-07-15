import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./ProductionReworkModal.jsx', import.meta.url),
  'utf8'
)

test('production rework modal shows a read-only business source summary', () => {
  for (const copy of [
    '原完工记录',
    '当前状态',
    '原完工数量',
    '已过账返工',
    '剩余可返工',
    '原完工日期',
  ]) {
    assert.match(source, new RegExp(copy, 'u'))
  }
  assert.match(source, /返工产品、仓库、单位和批次由原完工记录确定/u)
  assert.doesNotMatch(source, /label="(?:来源|内部编号|批次编号)"/u)
})

test('production rework modal exposes only operator-owned business fields', () => {
  for (const field of ['fact_no', 'quantity', 'occurred_at', 'reason']) {
    assert.match(source, new RegExp(`name="${field}"`, 'u'))
  }
  for (const forbidden of [
    'source_completion_fact_id',
    'source_type',
    'source_id',
    'lot_id',
    'idempotency_key',
    'subject_id',
    'warehouse_id',
    'unit_id',
  ]) {
    assert.doesNotMatch(source, new RegExp(`name="${forbidden}"`, 'u'))
  }
  assert.match(source, /返工业务编号不能超过 64 个字符/u)
  assert.match(source, /本次返工数量不能超过剩余可返工数量/u)
  assert.match(source, /请填写返工原因/u)
  assert.match(source, /返工原因不能超过 255 个字符/u)
})

test('production rework modal resets closed form state and handles validation locally', () => {
  assert.match(source, /destroyOnHidden/u)
  assert.match(source, /forceRender/u)
  assert.match(source, /preserve=\{false\}/u)
  assert.match(source, /useEffect\(\(\) => \{/u)
  assert.match(source, /if \(!open\) return/u)
  assert.match(source, /form\.resetFields\(\)/u)
  assert.match(source, /if \(!error\?\.errorFields\) throw error/u)
})
