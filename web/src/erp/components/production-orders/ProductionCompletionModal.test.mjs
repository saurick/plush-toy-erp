import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./ProductionCompletionModal.jsx', import.meta.url),
  'utf8'
)

test('production completion chooses an existing lot or a new lot number in business language', () => {
  for (const copy of [
    '入库批次方式',
    '选择已有批次',
    '填写新批次号',
    '已有入库批次',
    '新批次号',
  ]) {
    assert.match(source, new RegExp(copy, 'u'))
  }
  for (const technicalCopy of [
    '>lot_id<',
    '>new_lot_no<',
    '>idempotency_key<',
    '>source_id<',
  ]) {
    assert.equal(source.includes(technicalCopy), false, technicalCopy)
  }
})

test('production completion resets stale lot fields on open, line and mode changes', () => {
  assert.match(source, /destroyOnHidden/u)
  assert.match(source, /afterOpenChange=\{initializeOpenForm\}/u)
  assert.match(source, /form\.resetFields\(\)/u)
  assert.match(
    source,
    /lot_id:[\s\S]*new_lot_no: undefined,[\s\S]*occurred_at/u
  )
  assert.match(
    source,
    /onChange=\{\(event\)[\s\S]*lot_id:[\s\S]*new_lot_no: undefined/u
  )
})

test('production completion requires one bounded lot input and handles validation locally', () => {
  assert.match(source, /请选择已有入库批次/u)
  assert.match(source, /请填写本次完工的新批次号/u)
  assert.match(source, /max: 64/u)
  assert.match(source, /if \(!error\?\.errorFields\) throw error/u)
  assert.match(source, /disabled=\{loading\}/u)
})

test('production completion defaults and validates against the current completion cap', () => {
  assert.match(source, /quantity:\s*firstAvailable\?\.remaining/u)
  assert.match(source, /当前可完工上限/u)
  assert.match(source, /compareProductionCompletionQuantity/u)
  assert.match(source, /不能超过当前可完工上限/u)
  assert.doesNotMatch(source, /包装已合格/u)
  assert.match(source, /maxLength=\{21\}/u)
  assert.doesNotMatch(source, /const quantity = Number\(value\)/u)
})
