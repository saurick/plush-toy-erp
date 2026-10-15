import assert from 'node:assert/strict'
import test from 'node:test'
import {
  arrivalDifference,
  arrivalItemErrors,
  arrivalItemHasInput,
  buildArrivalItems,
  initialIncomingChecks,
  validateIncomingChecks,
} from './incomingAcceptance.mjs'

test('blank arrival rows stay optional even with a recommended warehouse', () => {
  const blank = { warehouse_id: 2, quantity: '', declared_quantity: '', note: ' ' }
  assert.equal(arrivalItemHasInput(blank), false)
  assert.deepEqual(arrivalItemErrors(blank), {})
  const partial = { ...blank, lot_no: 'ROLL-A' }
  assert.equal(arrivalItemHasInput(partial), true)
  assert.ok(arrivalItemErrors(partial).quantity)
  assert.throws(() => buildArrivalItems([partial]))
})

test('arrival field validation preserves zero declarations and decimal precision', () => {
  const valid = { purchase_order_item_id: 1, warehouse_id: 2, quantity: '0.000001', declared_quantity: '0' }
  assert.deepEqual(arrivalItemErrors(valid), {})
  assert.equal(buildArrivalItems([valid])[0].declared_quantity, '0')
  assert.ok(arrivalItemErrors({ ...valid, quantity: '0' }).quantity)
  assert.ok(arrivalItemErrors({ ...valid, declared_quantity: '0.0000001' }).declared_quantity)
  assert.ok(arrivalItemErrors({ ...valid, warehouse_id: undefined }).warehouse_id)
})

test('clearing quantities cannot silently discard remaining arrival information', () => {
  for (const remaining of [{ declared_quantity: '10' }, { note: '需核对' }, { lot_no: 'ROLL-B' }]) {
    const row = { purchase_order_item_id: 1, warehouse_id: 2, quantity: '', ...remaining }
    assert.ok(arrivalItemErrors(row).quantity)
    assert.throws(() => buildArrivalItems([row]))
  }
})

test('arrival quantity uses explicit counted decimals; omitted rows and order remainder are not shortages', () => {
  const items = buildArrivalItems([
    {
      purchase_order_item_id: 1,
      warehouse_id: 2,
      quantity: '98.000001',
      declared_quantity: '100',
    },
    { purchase_order_item_id: 1, warehouse_id: 2, quantity: '0.000001' },
    { purchase_order_item_id: 3, warehouse_id: 2 },
  ])
  assert.equal(items.length, 2)
  assert.equal(items[0].quantity, '98.000001')
  assert.equal(items[1].purchase_order_item_id, 1)
  assert.equal(arrivalDifference('98.000001', '100'), '少 1.999999')
  assert.equal(arrivalDifference('100.000001', '100'), '多 0.000001')
  assert.equal(
    arrivalDifference('99999999999999.999999', '99999999999999.999998'),
    '多 0.000001'
  )
  assert.equal(arrivalDifference('98', undefined), '未比较')
  assert.equal(arrivalDifference('100', '100'), '一致')
})
test('incomplete and invalid counted rows cannot silently disappear', () => {
  for (const quantity of ['0', '-1', '0.0000001', '100000000000000'])
    { assert.throws(() =>
      buildArrivalItems([
        { purchase_order_item_id: 1, warehouse_id: 2, quantity },
      ])
    ) }
  assert.throws(() =>
    buildArrivalItems([
      { purchase_order_item_id: 1, warehouse_id: 2, declared_quantity: '100' },
    ])
  )
  assert.throws(() => buildArrivalItems([]))
})
test('checks start unchecked and allow custom names, sampling and explicit exclusions', () => {
  assert.match(validateIncomingChecks(initialIncomingChecks(), 'PASS'), /未检/)
  const items = [
    {
      name: '自定义：异味',
      requirement: '符合确认样',
      observation: '无异味',
      result: 'PASS',
      scope: 'SAMPLE',
      note: '首中尾各取一片',
    },
  ]
  assert.equal(validateIncomingChecks(items, 'PASS'), '')
  assert.equal(
    validateIncomingChecks(
      [
        ...items,
        { name: '针检', result: 'NOT_APPLICABLE', note: '本批次为布料' },
      ],
      'PASS'
    ),
    ''
  )
  assert.match(
    validateIncomingChecks([{ ...items[0], note: '' }], 'PASS'),
    /抽检/
  )
  assert.match(
    validateIncomingChecks([{ ...items[0], result: 'FAIL' }], 'PASS'),
    /异常/
  )
  assert.equal(
    validateIncomingChecks([{ ...items[0], result: 'FAIL' }], 'CONCESSION'),
    ''
  )
  assert.equal(
    validateIncomingChecks(
      [
        { ...items[0], result: 'FAIL' },
        { name: '后续项目', result: 'NOT_CHECKED' },
      ],
      'REJECT'
    ),
    ''
  )
})
